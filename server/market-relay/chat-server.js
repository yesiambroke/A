const WebSocket = require('ws');
const { Pool } = require('pg');
require('dotenv').config({ path: '../.env.local' });

const { verifyWalletSignature, validateAuthTimestamp, createUsername } = require('./chat-auth');
const { ModerationManager } = require('./chat-moderation');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://dingdong:fuck_ofF!@$8@localhost:5432/m64_trading',
});

// Database query helper
async function query(text, params) {
  try {
    const client = await pool.connect();
    try {
      const result = await client.query(text, params);
      return result;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

// Initialize moderation manager
const moderationManager = new ModerationManager(query);

// Activity types for the activity feed
const ACTIVITY_TYPES = {
  BOT_DEPLOYED: 'bot_deployed',
  TRADE_EXECUTED: 'trade_executed', 
  PROFIT_MADE: 'profit_made',
  LOSS_TAKEN: 'loss_taken',
  USER_JOINED: 'user_joined',
  MARKET_UPDATE: 'market_update'
};

// WebSocket server configuration
const PORT = process.env.CHAT_WS_PORT || 8080;
const wss = new WebSocket.Server({ 
  port: PORT,
  perMessageDeflate: false // Disable compression for better performance
});

// Connected clients storage
const clients = new Map(); // websocket -> { wallet_address, username, is_moderator, authenticated }
const authenticatedUsers = new Set(); // Set of authenticated wallet addresses

console.log(`🚀 M64 Chat Server started on port ${PORT}`);
console.log(`📡 WebSocket URL: ws://localhost:${PORT}`);

// Mock activity generator for testing (remove in production)
function generateMockActivity() {
  const activities = [
    {
      type: ACTIVITY_TYPES.BOT_DEPLOYED,
      data: {
        user: `${Math.random().toString(36).substring(2, 8)}`,
        bot_name: `Bot${Math.floor(Math.random() * 1000)}`,
        strategy: 'Volume Breakout',
        fee: '0.02 SOL'
      }
    },
    {
      type: ACTIVITY_TYPES.PROFIT_MADE,
      data: {
        user: `${Math.random().toString(36).substring(2, 8)}`,
        amount: `${(Math.random() * 2).toFixed(2)} SOL`,
        token: `$${Math.random().toString(36).substring(2, 6).toUpperCase()}`
      }
    },
    {
      type: ACTIVITY_TYPES.LOSS_TAKEN,
      data: {
        user: `${Math.random().toString(36).substring(2, 8)}`,
        amount: `${(Math.random() * 0.5).toFixed(2)} SOL`,
        token: `$${Math.random().toString(36).substring(2, 6).toUpperCase()}`
      }
    }
  ];
  
  const activity = activities[Math.floor(Math.random() * activities.length)];
  broadcastActivity(activity.type, activity.data);
}

// Generate mock activities every 30-60 seconds for testing
setInterval(generateMockActivity, 30000 + Math.random() * 30000);

// Mock market stats generator
function generateMockMarketStats() {
  const stats = {
    sol_price: (180 + Math.random() * 40).toFixed(2), // $180-220
    btc_price: (95000 + Math.random() * 10000).toFixed(0), // $95k-105k
    market_cap_24h: (Math.random() * 50 + 50).toFixed(1) + 'B', // 50-100B
    volume_24h: (Math.random() * 20 + 10).toFixed(1) + 'B', // 10-30B
    coins_launched_today: Math.floor(Math.random() * 500 + 200), // 200-700
    active_bots: Math.floor(Math.random() * 50 + 25), // 25-75
    total_trades_24h: Math.floor(Math.random() * 1000 + 500), // 500-1500
    fear_greed_index: Math.floor(Math.random() * 100) // 0-100
  };
  
  broadcastMarketStats(stats);
}

// Broadcast market stats every 5 minutes
setInterval(generateMockMarketStats, 5 * 60 * 1000);

// Send initial market stats
setTimeout(generateMockMarketStats, 2000);

/**
 * Broadcast message to all connected clients (authenticated or not)
 * Everyone can see messages, but only authenticated users can send
 * @param {Object} message - Message object to broadcast
 * @param {WebSocket} excludeClient - Client to exclude from broadcast
 */
function broadcastToAll(message, excludeClient = null) {
  const messageStr = JSON.stringify(message);
  
  clients.forEach((clientInfo, ws) => {
    // Send to all connected clients - both authenticated and unauthenticated
    // This allows everyone to see messages, but only authenticated users can send
    if (ws !== excludeClient && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(messageStr);
      } catch (error) {
        console.error('Error broadcasting to client:', error);
        // Remove dead connection
        clients.delete(ws);
        if (clientInfo.wallet_address) {
          authenticatedUsers.delete(clientInfo.wallet_address);
        }
      }
    }
  });
}

// Broadcast activity updates to all clients
function broadcastActivity(activityType, data) {
  const activityMessage = {
    type: 'activity',
    data: {
      activity_type: activityType,
      timestamp: new Date().toISOString(),
      ...data
    }
  };
  
  broadcastToAll(activityMessage);
  console.log(`📢 Activity broadcasted: ${activityType}`, data);
}

// Broadcast market stats updates
function broadcastMarketStats(stats) {
  const statsMessage = {
    type: 'market_stats',
    data: {
      timestamp: new Date().toISOString(),
      ...stats
    }
  };
  
  broadcastToAll(statsMessage);
  console.log('📊 Market stats broadcasted:', stats);
}

/**
 * Send message to specific client
 * @param {WebSocket} ws - Target WebSocket client
 * @param {Object} message - Message to send
 */
function sendToClient(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(message));
    } catch (error) {
      console.error('Error sending to client:', error);
    }
  }
}

/**
 * Update user count for all clients
 */
function broadcastUserCount() {
  const count = authenticatedUsers.size;
  broadcastToAll({
    type: 'user_count',
    data: { count }
  });
}

/**
 * Handle user authentication
 * @param {WebSocket} ws - WebSocket client
 * @param {Object} data - Authentication data
 */
async function handleAuthentication(ws, data) {
  const { wallet_address, signed_message, message } = data;
  
  try {
    // Validate input
    if (!wallet_address || !signed_message || !message) {
      sendToClient(ws, {
        type: 'error',
        data: { message: 'Missing authentication data' }
      });
      return;
    }

    // Validate message timestamp
    if (!validateAuthTimestamp(message)) {
      sendToClient(ws, {
        type: 'error',
        data: { message: 'Authentication message expired or invalid' }
      });
      return;
    }

    // Verify wallet signature
    if (!verifyWalletSignature(wallet_address, message, signed_message)) {
      sendToClient(ws, {
        type: 'error',
        data: { message: 'Invalid wallet signature' }
      });
      return;
    }

    // Check if user is banned
    const isBanned = await moderationManager.isUserBanned(wallet_address);
    if (isBanned) {
      sendToClient(ws, {
        type: 'error',
        data: { message: 'You are banned from chat' }
      });
      ws.close();
      return;
    }

    // Get user info from database
    const userResult = await query(
      'SELECT username, is_moderator FROM users WHERE wallet_address = $1',
      [wallet_address]
    );

    let username, is_moderator = false;
    
    if (userResult.rows.length > 0) {
      username = userResult.rows[0].username || createUsername(wallet_address);
      is_moderator = userResult.rows[0].is_moderator || false;
      
      // Update last chat activity
      await query(
        'UPDATE users SET last_chat_activity = CURRENT_TIMESTAMP WHERE wallet_address = $1',
        [wallet_address]
      );
    } else {
      // Create new user if doesn't exist
      username = createUsername(wallet_address);
      await query(
        'INSERT INTO users (wallet_address, username) VALUES ($1, $2) ON CONFLICT (wallet_address) DO NOTHING',
        [wallet_address, username]
      );
    }

    // Store client info
    clients.set(ws, {
      wallet_address,
      username,
      is_moderator,
      authenticated: true,
      connected_at: Date.now()
    });

    authenticatedUsers.add(wallet_address);

    // Send authentication success
    sendToClient(ws, {
      type: 'auth_success',
      data: { 
        wallet_address, 
        username, 
        is_moderator,
        message: 'Successfully authenticated for chat' 
      }
    });

    // Broadcast user count update
    broadcastUserCount();

    console.log(`✅ User authenticated: ${username} (${wallet_address})`);

  } catch (error) {
    console.error('Authentication error:', error);
    sendToClient(ws, {
      type: 'error',
      data: { message: 'Authentication failed' }
    });
  }
}

/**
 * Handle chat message
 * @param {WebSocket} ws - WebSocket client
 * @param {Object} data - Message data
 */
async function handleChatMessage(ws, data) {
  const clientInfo = clients.get(ws);
  
  if (!clientInfo || !clientInfo.authenticated) {
    sendToClient(ws, {
      type: 'error',
      data: { message: 'Not authenticated' }
    });
    return;
  }

  const { message } = data;
  
  try {
    // Validate and sanitize message
    const validation = await moderationManager.validateMessage(clientInfo.wallet_address, message);
    
    if (!validation.allowed) {
      sendToClient(ws, {
        type: 'error',
        data: { message: validation.reason }
      });
      return;
    }

    // Record message for rate limiting
    moderationManager.recordMessageSent(clientInfo.wallet_address);

    // Broadcast sanitized message to all clients
    const chatMessage = {
      type: 'message',
      data: {
        wallet_address: clientInfo.wallet_address,
        username: clientInfo.username,
        message: validation.sanitizedMessage, // Use sanitized message
        timestamp: new Date().toISOString(),
        is_moderator: clientInfo.is_moderator
      }
    };

    broadcastToAll(chatMessage);
    
    console.log(`💬 ${clientInfo.username}: ${message}`);

  } catch (error) {
    console.error('Message handling error:', error);
    sendToClient(ws, {
      type: 'error',
      data: { message: 'Failed to send message' }
    });
  }
}

/**
 * Handle moderation action
 * @param {WebSocket} ws - WebSocket client
 * @param {Object} data - Moderation data
 */
async function handleModeration(ws, data) {
  const clientInfo = clients.get(ws);
  
  if (!clientInfo || !clientInfo.authenticated || !clientInfo.is_moderator) {
    sendToClient(ws, {
      type: 'error',
      data: { message: 'Insufficient permissions' }
    });
    return;
  }

  const { target_wallet, action, reason } = data;
  
  try {
    let success = false;
    
    switch (action) {
      case 'ban':
        success = await moderationManager.banUser(clientInfo.wallet_address, target_wallet, reason);
        if (success) {
          // Disconnect banned user if online
          clients.forEach((info, client) => {
            if (info.wallet_address === target_wallet) {
              sendToClient(client, {
                type: 'user_banned',
                data: { message: 'You have been banned from chat' }
              });
              client.close();
            }
          });
          
          broadcastToAll({
            type: 'moderation_action',
            data: { 
              action: 'ban', 
              target_wallet, 
              moderator: clientInfo.username,
              reason 
            }
          });
        }
        break;
        
      case 'unban':
        success = await moderationManager.unbanUser(clientInfo.wallet_address, target_wallet, reason);
        if (success) {
          broadcastToAll({
            type: 'moderation_action',
            data: { 
              action: 'unban', 
              target_wallet, 
              moderator: clientInfo.username,
              reason 
            }
          });
        }
        break;
        
      case 'kick':
        // Find and disconnect user
        clients.forEach((info, client) => {
          if (info.wallet_address === target_wallet) {
            sendToClient(client, {
              type: 'kicked',
              data: { message: `You were kicked by ${clientInfo.username}. Reason: ${reason}` }
            });
            client.close();
            success = true;
          }
        });
        break;
        
      default:
        sendToClient(ws, {
          type: 'error',
          data: { message: 'Invalid moderation action' }
        });
        return;
    }

    if (success) {
      sendToClient(ws, {
        type: 'moderation_success',
        data: { action, target_wallet, message: `${action} action completed successfully` }
      });
    } else {
      sendToClient(ws, {
        type: 'error',
        data: { message: `Failed to ${action} user` }
      });
    }

  } catch (error) {
    console.error('Moderation error:', error);
    sendToClient(ws, {
      type: 'error',
      data: { message: 'Moderation action failed' }
    });
  }
}

// WebSocket connection handler
wss.on('connection', (ws, req) => {
  const clientIP = req.socket.remoteAddress;
  console.log(`🔌 New connection from ${clientIP}`);

  // Initialize client
  clients.set(ws, {
    authenticated: false,
    connected_at: Date.now(),
    ip: clientIP
  });

  // Send welcome message
  sendToClient(ws, {
    type: 'welcome',
    data: { 
      message: 'Connected to M64 Chat Server. Please authenticate with your wallet.',
      server_time: new Date().toISOString()
    }
  });

  // Message handler
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'authenticate':
          await handleAuthentication(ws, message.data);
          break;
          
        case 'send_message':
          await handleChatMessage(ws, message.data);
          break;
          
        case 'moderate_user':
          await handleModeration(ws, message.data);
          break;
          
        case 'ping':
          sendToClient(ws, { type: 'pong', data: { timestamp: Date.now() } });
          break;
          
        default:
          sendToClient(ws, {
            type: 'error',
            data: { message: 'Unknown message type' }
          });
      }
    } catch (error) {
      console.error('Message parsing error:', error);
      sendToClient(ws, {
        type: 'error',
        data: { message: 'Invalid message format' }
      });
    }
  });

  // Connection close handler
  ws.on('close', (code, reason) => {
    const clientInfo = clients.get(ws);
    
    if (clientInfo && clientInfo.authenticated) {
      authenticatedUsers.delete(clientInfo.wallet_address);
      console.log(`❌ User disconnected: ${clientInfo.username} (${clientInfo.wallet_address})`);
      
      // Broadcast updated user count
      broadcastUserCount();
    } else {
      console.log(`❌ Unauthenticated client disconnected from ${clientInfo?.ip}`);
    }
    
    clients.delete(ws);
  });

  // Error handler
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    const clientInfo = clients.get(ws);
    if (clientInfo && clientInfo.authenticated) {
      authenticatedUsers.delete(clientInfo.wallet_address);
    }
    clients.delete(ws);
  });
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down chat server...');
  
  // Close all connections
  wss.clients.forEach((ws) => {
    ws.close();
  });
  
  // Close WebSocket server
  wss.close(() => {
    console.log('✅ Chat server closed');
    process.exit(0);
  });
});

// Error handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
