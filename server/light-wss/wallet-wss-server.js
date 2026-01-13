const WebSocket = require('ws');
const http = require('http');
const https = require('https');
const fs = require('fs');
const { Pool } = require('pg');
const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } = require('@solana/spl-token');
require('dotenv').config({ path: '../../.env.local' });

class WalletWSSServer {
  constructor(port = 4128) {
    this.port = process.env.LIGHT_WSS_PORT || port;
    this.clients = new Map();
    this.clientCounter = 0;
    this.userWallets = new Map();
    this.userConnections = new Map();
    this.userTokens = new Map(); // userId -> { mintAddress, programType }
    this.httpServer = null; // HTTP/HTTPS server instance

    // Initialize Solana connection
    this.solanaConnection = new Connection(
      'https://mainnet.helius-rpc.com/?api-key=0a9623d2-dc37-4918-ac67-534e81ba893a',
      'confirmed'
    );

    // Initialize balance poller
    this.balancePoller = new SolBalancePoller(this.solanaConnection);
    this.balancePoller.setBalanceUpdateCallback((userId, updates) => {
      this.broadcastBalanceUpdates(userId, updates);
    });

    // Initialize database connection
    this.dbPool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'ace_trade_auth',
      user: process.env.DB_USER || 'ace_trade_user',
      password: process.env.DB_PASSWORD || 'change_me',
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    // Create HTTP/HTTPS server for health check with SSL support
    const useSSL = process.env.NODE_ENV === 'production' || process.env.LIGHT_WSS_USE_SSL === 'true';
    let server = null;

    if (useSSL) {
      const sslDir = process.env.LIGHT_WSS_SSL_DIR || '/root/ssl';
      const keyPath = process.env.LIGHT_WSS_SSL_KEY || `${sslDir}/a-trade.pem`;
      const certPath = process.env.LIGHT_WSS_SSL_CERT || `${sslDir}/a-trade-key.pem`;

      try {
        const key = fs.readFileSync(keyPath);
        const cert = fs.readFileSync(certPath);
        this.httpServer = https.createServer({ key, cert }, (req, res) => {
          if (req.url === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              status: 'ok',
              clients: this.clients.size,
              uptime: process.uptime()
            }));
          } else {
            res.writeHead(404);
            res.end();
          }
        });
        this.httpServer.listen(this.port, () => {
          console.log(`🔒 Secure Wallet WSS Server (wss) listening on port ${this.port}`);
          console.log(`Health check: https://localhost:${this.port}/health`);
        });
        server = this.httpServer;
      } catch (err) {
        console.error('❌ Failed to load SSL certificates for Light WSS:', err);
        console.log('⚠️ Falling back to HTTP server...');
        this.httpServer = http.createServer((req, res) => {
          if (req.url === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              status: 'ok',
              clients: this.clients.size,
              uptime: process.uptime()
            }));
          } else {
            res.writeHead(404);
            res.end();
          }
        });
        this.httpServer.listen(this.port, () => {
          console.log(`⚠️ Wallet WSS Server running on port ${this.port} (HTTP fallback)`);
          console.log(`Health check: http://localhost:${this.port}/health`);
        });
        server = this.httpServer;
      }
    } else {
      this.httpServer = http.createServer((req, res) => {
        if (req.url === '/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'ok',
            clients: this.clients.size,
            uptime: process.uptime()
          }));
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      this.httpServer.listen(this.port, () => {
        console.log(`Wallet WSS Server running on port ${this.port}`);
        console.log(`Health check: http://localhost:${this.port}/health`);
      });
      server = this.httpServer;
    }

    this.wss = new WebSocket.Server({ server });

    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });
  }

  async handleConnection(ws, req) {
    // Get session ID from query parameters (passed from trading terminal)
    const url = new URL(req.url || '', 'http://localhost');
    const sessionId = url.searchParams.get('sessionId');
    const authKey = req.headers['x-auth-key'];

    const clientId = `client_${++this.clientCounter}`;
    const clientType = sessionId ? 'terminal' : authKey ? 'wallet' : 'unknown';

    const client = {
      ws,
      id: clientId,
      connectedAt: Date.now(),
      authenticated: false,
      userId: null,
      userTier: null,
      telegramChatId: null,
      type: clientType
    };

    this.clients.set(clientId, client);
    console.log(`Client connected: ${clientId} (${clientType}) - Total clients: ${this.clients.size}`);

    // Send connection ack
    ws.send(JSON.stringify({
      type: 'connection_ack',
      clientId,
      clientType,
      serverTime: Date.now()
    }));

    // Authenticate based on client type
    if (sessionId) {
      await this.authenticateTerminalClient(client, sessionId);
    } else if (authKey) {
      await this.authenticateWalletClient(client, authKey);
    } else {
      console.log(`⚠️ Client ${clientId} connected without authentication`);
    }

    ws.on('message', (data) => {
      this.handleMessage(client, data);
    });

    ws.on('close', () => {
      console.log(`Client disconnected: ${clientId}`);
      this.removeUserConnection(client);
      this.clients.delete(clientId);
    });

    ws.on('error', (error) => {
      console.error(`Client error ${clientId}:`, error);
      this.removeUserConnection(client);
      this.clients.delete(clientId);
    });
  }

  async authenticateTerminalClient(client, sessionId) {
    console.log(`🔐 Authenticating terminal client ${client.id} with session ID: ${sessionId}`);

    try {
      // Validate session ID against database
      const query = `
        SELECT as2.user_id, u.user_tier, u.telegram_chat_id
        FROM active_sessions as2
        JOIN users u ON as2.user_id = u.user_id
        WHERE as2.active_session_id = $1
        AND as2.expires_at > NOW()
      `;

      const result = await this.dbPool.query(query, [sessionId]);

      if (result.rows.length === 0) {
        console.log(`❌ Terminal authentication failed for client ${client.id}: Invalid or expired session`);
        client.ws.send(JSON.stringify({
          type: 'auth_failed',
          reason: 'Invalid or expired session'
        }));
        return;
      }

      const user = result.rows[0];
      client.authenticated = true;
      client.userId = user.user_id;
      client.userTier = user.user_tier;
      client.telegramChatId = user.telegram_chat_id;

      // Update user connection tracking
      this.updateUserConnection(client);

      console.log(`✅ Terminal client ${client.id} authenticated successfully for user ${client.userId} (tier: ${client.userTier})`);

      client.ws.send(JSON.stringify({
        type: 'auth_success',
        userId: client.userId,
        userTier: client.userTier,
        clientType: 'terminal'
      }));

    } catch (error) {
      console.error(`Terminal authentication error for client ${client.id}:`, error);
      client.ws.send(JSON.stringify({
        type: 'auth_failed',
        reason: 'Authentication service error'
      }));
    }
  }

  async authenticateWalletClient(client, authKey) {
    console.log(`🔐 Authenticating wallet client ${client.id} with auth key`);

    try {
      // Validate auth key against database
      const query = `
        SELECT wak.user_id, u.user_tier, u.telegram_chat_id
        FROM wallet_auth_keys wak
        JOIN users u ON wak.user_id = u.user_id
        WHERE wak.auth_key = $1
        AND wak.revoked = false
        AND wak.expires_at > NOW()
      `;

      const result = await this.dbPool.query(query, [authKey]);

      if (result.rows.length === 0) {
        console.log(`❌ Wallet authentication failed for client ${client.id}: Invalid or expired auth key`);
        client.ws.send(JSON.stringify({
          type: 'auth_failed',
          reason: 'Invalid or expired auth key'
        }));
        return;
      }

      const user = result.rows[0];
      client.authenticated = true;
      client.userId = user.user_id;
      client.userTier = user.user_tier;
      client.telegramChatId = user.telegram_chat_id;

      // Update last used timestamp
      await this.dbPool.query(
        'UPDATE wallet_auth_keys SET last_used = NOW() WHERE auth_key = $1',
        [authKey]
      );

      // Update user connection tracking
      this.updateUserConnection(client);

      console.log(`✅ Wallet client ${client.id} authenticated successfully for user ${client.userId} (tier: ${client.userTier})`);

      client.ws.send(JSON.stringify({
        type: 'auth_success',
        userId: client.userId,
        userTier: client.userTier,
        clientType: 'wallet'
      }));

    } catch (error) {
      console.error(`Wallet authentication error for client ${client.id}:`, error);
      client.ws.send(JSON.stringify({
        type: 'auth_failed',
        reason: 'Authentication service error'
      }));
    }
  }

  updateUserConnection(client) {
    if (!client.userId) return;

    const userConnections = this.userConnections.get(client.userId) || { terminal: null, wallet: null };
    const wasWalletConnected = !!userConnections.wallet;
    const wasTerminalConnected = !!userConnections.terminal;

    if (client.type === 'terminal') {
      userConnections.terminal = client;
    } else if (client.type === 'wallet') {
      userConnections.wallet = client;

      // Notify terminal client that wallet connected (if terminal is already connected)
      if (userConnections.terminal && userConnections.terminal.ws && userConnections.terminal.ws.readyState === 1) {
        userConnections.terminal.ws.send(JSON.stringify({
          type: 'wallet_client_connected',
          userId: client.userId,
          timestamp: Date.now()
        }));
        console.log(`📤 Notified terminal client ${userConnections.terminal.id} that wallet connected`);
      }
    }

    this.userConnections.set(client.userId, userConnections);

    // Check if both terminal and wallet are connected
    const hasTerminal = !!userConnections.terminal;
    const hasWallet = !!userConnections.wallet;

    // Start/stop balance polling based on connection status
    if (hasTerminal && hasWallet) {
      // Both connected - start polling
      const userWallets = this.userWallets.get(client.userId) || [];
      const walletPubKeys = userWallets.map(wallet => wallet.publicKey);

      if (walletPubKeys.length > 0) {
        const userToken = this.userTokens.get(client.userId);
        console.log(`🔄 Starting polling for user ${client.userId}, userTokens has:`, Array.from(this.userTokens.keys()));
        console.log(`🔄 Token info for user ${client.userId}:`, userToken);
        this.balancePoller.startPollingForUser(client.userId, walletPubKeys, userToken);
      }
    } else {
      // Either disconnected - stop polling
      this.balancePoller.stopPollingForUser(client.userId);
    }

    // Log connection status
    const status = hasTerminal && hasWallet ? 'FULLY_CONNECTED' :
                   hasTerminal ? 'TERMINAL_ONLY' :
                   hasWallet ? 'WALLET_ONLY' : 'DISCONNECTED';

    console.log(`👤 User ${client.userId} connection status: ${status}`);
  }

  removeUserConnection(client) {
    if (!client.userId) return;

    const userConnections = this.userConnections.get(client.userId);
    if (!userConnections) return;

    const wasWalletConnected = !!userConnections.wallet;
    const wasTerminalConnected = !!userConnections.terminal;

    if (client.type === 'terminal') {
      userConnections.terminal = null;
      console.log(`🔌 Terminal client disconnected for user ${client.userId}`);
    } else if (client.type === 'wallet') {
      userConnections.wallet = null;
      console.log(`🔌 Wallet client disconnected for user ${client.userId}`);

      // Notify terminal client that wallet disconnected
      if (userConnections.terminal && userConnections.terminal.ws && userConnections.terminal.ws.readyState === 1) {
        userConnections.terminal.ws.send(JSON.stringify({
          type: 'wallet_client_disconnected',
          userId: client.userId,
          timestamp: Date.now()
        }));
        console.log(`📤 Notified terminal client ${userConnections.terminal.id} that wallet disconnected`);
      }
    }

    // Stop balance polling if either client disconnects
    this.balancePoller.stopPollingForUser(client.userId);

    // Remove user entry if no connections left
    if (!userConnections.terminal && !userConnections.wallet) {
      this.userConnections.delete(client.userId);
      this.userWallets.delete(client.userId);
    } else {
      this.userConnections.set(client.userId, userConnections);
    }
  }

  handleMessage(client, data) {
    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case 'wallet_data_request':
          this.handleWalletDataRequest(client, message);
          break;

        case 'wallet_list':
          this.handleWalletList(client, message);
          break;

        case 'wallet_update':
          this.handleWalletUpdate(client, message);
          break;

        case 'heartbeat':
          // Echo back heartbeat
          client.ws.send(JSON.stringify({
            type: 'heartbeat_ack',
            timestamp: message.timestamp,
            serverTime: Date.now()
          }));
          break;

        default:
          console.warn(`Unknown message type from ${client.id}:`, message.type);
      }
    } catch (error) {
      console.error(`Failed to parse message from ${client.id}:`, error);
    }
  }

  async handleWalletDataRequest(client, request) {
    //console.log(`📥 Wallet data request from ${client.id} for user ${request.userId}, token: ${request.currentCoin}`);
    //console.log(`🔍 Token is SOL: ${request.currentCoin === 'So11111111111111111111111111111112'}`);
    //console.log(`🔍 Token length: ${request.currentCoin?.length} (should be 44 for valid mint)`);

    // Verify the client is authenticated and matches the requested user
    if (!client.authenticated || client.userId !== parseInt(request.userId)) {
      console.log(`❌ Unauthorized wallet data request from ${client.id}`);
      client.ws.send(JSON.stringify({
        type: 'wallet_data_response',
        requestId: request.requestId,
        success: false,
        error: 'Unauthorized'
      }));
      return;
    }

    // Store token information for this user
    if (request.currentCoin && request.currentCoin !== 'So11111111111111111111111111111112') {
      try {
        const programType = await this.detectTokenProgram(request.currentCoin);
        this.userTokens.set(client.userId, {
          mintAddress: request.currentCoin,
          programType: programType
        });
        console.log(`🔍 Detected ${programType} for token ${request.currentCoin} for user ${client.userId}`);
        console.log(`💾 Stored token info for user ${client.userId}:`, { mintAddress: request.currentCoin, programType });
      } catch (error) {
        console.error(`Failed to detect program for token ${request.currentCoin}:`, error);
        // Default to TOKEN_PROGRAM
        this.userTokens.set(client.userId, {
          mintAddress: request.currentCoin,
          programType: 'TOKEN_PROGRAM'
        });
      }
    } else {
      // Clear token info for SOL
      console.log(`🧹 Clearing token info for user ${client.userId} (SOL selected)`);
      this.userTokens.delete(client.userId);
    }

    // Get wallets from stored user wallet data
    const userWallets = this.userWallets.get(client.userId) || [];

    if (userWallets.length === 0) {
      // No wallets registered yet
      client.ws.send(JSON.stringify({
        type: 'wallet_data_response',
        requestId: request.requestId,
        success: true,
        wallets: []
      }));
      return;
    }

    // Return the stored wallet data with balances
    client.ws.send(JSON.stringify({
      type: 'wallet_data_response',
      requestId: request.requestId,
      success: true,
      wallets: userWallets,
      userTier: client.userTier
    }));

    console.log(`📤 Sent ${userWallets.length} wallets to authenticated client ${client.id}`);
  }

  async handleWalletList(client, message) {
    console.log(`📥 Received wallet list from ${client.id} for user ${client.userId}: ${message.wallets.length} wallets`);

    if (!client.authenticated || !client.userId) {
      console.log(`❌ Unauthorized wallet list from ${client.id}`);
      return;
    }

    try {
      // Store wallet list for this user
      this.userWallets.set(client.userId, message.wallets);

      // Fetch balance information for each wallet
      const enrichedWallets = await this.enrichWalletsWithBalances(message.wallets);

      // Update stored wallets with balance info
      this.userWallets.set(client.userId, enrichedWallets);

      console.log(`✅ Stored ${enrichedWallets.length} wallets for user ${client.userId}`);

      // Send confirmation back to client
      client.ws.send(JSON.stringify({
        type: 'wallet_list_ack',
        walletCount: enrichedWallets.length,
        timestamp: Date.now()
      }));

      // Check if we should start polling (if both clients are connected)
      const userConnections = this.userConnections.get(client.userId);
      if (userConnections && userConnections.terminal && userConnections.wallet) {
        const walletPubKeys = enrichedWallets.map(wallet => wallet.publicKey);
        if (walletPubKeys.length > 0) {
          const userToken = this.userTokens.get(client.userId);
          this.balancePoller.startPollingForUser(client.userId, walletPubKeys, userToken);
        }
      }

    } catch (error) {
      console.error(`Failed to process wallet list for user ${client.userId}:`, error);
      client.ws.send(JSON.stringify({
        type: 'wallet_list_error',
        error: 'Failed to process wallet list',
        timestamp: Date.now()
      }));
    }
  }

  async handleWalletUpdate(client, message) {
    console.log(`📥 Received wallet update from ${client.id} for user ${client.userId}: ${message.action} ${message.wallet.id}`);

    if (!client.authenticated || !client.userId) {
      console.log(`❌ Unauthorized wallet update from ${client.id}`);
      return;
    }

    try {
      const userWallets = this.userWallets.get(client.userId) || [];
      let updatedWallets = [...userWallets];
      const walletId = message.wallet.id;

      if (message.action === 'add') {
        // Add wallet if it doesn't exist
        const existingIndex = updatedWallets.findIndex(w => w.id === walletId);
        if (existingIndex === -1) {
          updatedWallets.push({
            id: message.wallet.id,
            publicKey: message.wallet.publicKey,
            name: message.wallet.name || `Wallet ${walletId.slice(-4)}`,
            solBalance: 0,
            splBalance: 0,
            lastUpdated: Date.now()
          });
          console.log(`➕ Added wallet ${walletId} for user ${client.userId}`);
        } else {
          console.log(`⚠️ Wallet ${walletId} already exists for user ${client.userId}, skipping add`);
        }
      } else if (message.action === 'remove') {
        // Remove wallet
        const initialLength = updatedWallets.length;
        updatedWallets = updatedWallets.filter(w => w.id !== walletId);
        if (updatedWallets.length < initialLength) {
          console.log(`➖ Removed wallet ${walletId} for user ${client.userId}`);
        } else {
          console.log(`⚠️ Wallet ${walletId} not found for user ${client.userId}, nothing to remove`);
        }
      } else if (message.action === 'update') {
        // Update existing wallet
        const walletIndex = updatedWallets.findIndex(w => w.id === walletId);
        if (walletIndex !== -1) {
          updatedWallets[walletIndex] = {
            ...updatedWallets[walletIndex],
            ...message.wallet,
            lastUpdated: Date.now()
          };
          console.log(`🔄 Updated wallet ${walletId} for user ${client.userId}`);
        } else {
          console.log(`⚠️ Wallet ${walletId} not found for user ${client.userId}, cannot update`);
        }
      }

      // Update stored wallets
      this.userWallets.set(client.userId, updatedWallets);

      // Send acknowledgment
      client.ws.send(JSON.stringify({
        type: 'wallet_update_ack',
        action: message.action,
        walletId: walletId,
        totalWallets: updatedWallets.length,
        timestamp: Date.now()
      }));

      // Broadcast wallet update to terminal client if connected
      const userConnections = this.userConnections.get(client.userId);
      if (userConnections?.terminal) {
        const terminalClient = userConnections.terminal;
        if (terminalClient.ws && terminalClient.ws.readyState === 1) { // OPEN
          terminalClient.ws.send(JSON.stringify({
            type: 'wallet_update',
            wallets: updatedWallets,
            timestamp: Date.now()
          }));
          console.log(`📤 Broadcast wallet update to terminal client ${terminalClient.id} (${updatedWallets.length} wallets)`);
        }
      }

    } catch (error) {
      console.error(`Failed to process wallet update for user ${client.userId}:`, error);
      client.ws.send(JSON.stringify({
        type: 'wallet_update_error',
        action: message.action,
        walletId: message.wallet.id,
        error: 'Failed to process wallet update',
        timestamp: Date.now()
      }));
    }
  }

  async enrichWalletsWithBalances(wallets) {
    // Initialize wallets with zero balances - real balances will be updated by polling
    return wallets.map(wallet => ({
      ...wallet,
      solBalance: 0,
      splBalance: 0,
      lastUpdated: Date.now()
    }));
  }

  broadcastBalanceUpdates(userId, balanceUpdates) {
    //console.log(`📡 Broadcasting balance updates for user ${userId}:`, balanceUpdates);

    const userConnections = this.userConnections.get(userId);
    if (!userConnections?.terminal) {
      console.log(`❌ No terminal connection for user ${userId}`);
      return;
    }

    const terminalClient = userConnections.terminal;
    if (terminalClient.ws && terminalClient.ws.readyState === 1) { // OPEN
      const message = JSON.stringify({
        type: 'balance_update',
        wallets: balanceUpdates,
        timestamp: Date.now()
      });

      terminalClient.ws.send(message);
      //console.log(`✅ Sent balance update message to terminal client ${terminalClient.id}`);
    } else {
      console.log(`❌ Terminal client not connected or not ready (state: ${terminalClient.ws?.readyState})`);
    }
  }

  // Token Program Detection Utility
  async detectTokenProgram(mintAddress) {
    try {
      const mintPubKey = new PublicKey(mintAddress);
      const accountInfo = await this.solanaConnection.getAccountInfo(mintPubKey);

      if (!accountInfo) {
        throw new Error('Mint account not found');
      }

      if (accountInfo.owner.equals(TOKEN_PROGRAM_ID)) {
        return 'TOKEN_PROGRAM';
      } else if (accountInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
        return 'TOKEN_2022';
      } else {
        throw new Error('Unknown token program');
      }
    } catch (error) {
      console.error(`Failed to detect token program for ${mintAddress}:`, error);
      // Default to TOKEN_PROGRAM if detection fails
      return 'TOKEN_PROGRAM';
    }
  }

  // Get Associated Token Account
  getAssociatedTokenAddress(walletPubKey, mintAddress, programType) {
    const programId = programType === 'TOKEN_2022' ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
    return getAssociatedTokenAddressSync(
      new PublicKey(mintAddress),
      new PublicKey(walletPubKey),
      false, // allowOwnerOffCurve
      programId,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
  }
}

// SOL Balance Polling Service
class SolBalancePoller {
  constructor(solanaConnection) {
    this.solanaConnection = solanaConnection;
    this.pollingIntervals = new Map(); // userId -> interval
    this.userWallets = new Map(); // userId -> [pubKeys]
    this.userTokens = new Map(); // userId -> { mintAddress, programType }
    this.lastBalances = new Map(); // userId -> Map<pubKey, balance>
  }

  startPollingForUser(userId, walletPubKeys, tokenInfo = null) {
    // Stop any existing polling for this user
    this.stopPollingForUser(userId);

    if (walletPubKeys.length === 0) {
      //console.log(`⚠️ No wallets to poll for user ${userId}`);
      return;
    }

    // Store wallet pubkeys and token info for this user
    this.userWallets.set(userId, walletPubKeys);
    this.userTokens.set(userId, tokenInfo);

    // Initialize last balances
    this.lastBalances.set(userId, new Map());

    const tokenDesc = tokenInfo ? `${tokenInfo.programType} token ${tokenInfo.mintAddress}` : 'SOL only';
    console.log(`🚀 Started balance polling for user ${userId} (${walletPubKeys.length} wallets, ${tokenDesc})`);

    // Start polling immediately, then every 3 seconds
    this.pollBalancesForUser(userId);

    const interval = setInterval(() => {
      this.pollBalancesForUser(userId);
    }, 3000);

    this.pollingIntervals.set(userId, interval);
  }

  stopPollingForUser(userId) {
    const interval = this.pollingIntervals.get(userId);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(userId);
      this.userWallets.delete(userId);
      this.userTokens.delete(userId);
      this.lastBalances.delete(userId);
      console.log(`⏹️ Stopped balance polling for user ${userId}`);
    }
  }

  async pollBalancesForUser(userId) {
    const walletPubKeys = this.userWallets.get(userId);
    const tokenInfo = this.userTokens.get(userId);

    if (!walletPubKeys || walletPubKeys.length === 0) {
      console.log(`⚠️ No wallets to poll for user ${userId}`);
      return;
    }

    const pollType = tokenInfo ? 'SOL + SPL' : 'SOL only';
    //console.log(`🔍 Polling ${pollType} balances for user ${userId} (${walletPubKeys.length} wallets)`);

    try {
      // Convert string pubkeys to PublicKey objects
      const pubKeys = walletPubKeys.map(pk => new PublicKey(pk));
      console.log(`🔑 Converted ${pubKeys.length} pubkeys for user ${userId}`);

      // Batch fetch all account infos (includes SOL balance)
      const accountInfos = await this.solanaConnection.getMultipleAccountsInfo(pubKeys);
      console.log(`📡 Got account infos for ${accountInfos.length} accounts`);

      // Extract SOL balances and prepare for SPL balances
      const currentBalances = new Map();
      const balanceUpdates = [];

      // If we have token info, get SPL balances
      let splBalances = new Map();
      if (tokenInfo) {
        //console.log(`🔍 Fetching SPL balances for token ${tokenInfo.mintAddress} (${tokenInfo.programType})`);
        splBalances = await this.getSplBalances(walletPubKeys, tokenInfo);
      } else {
        console.log(`🔍 No token info available, skipping SPL balance check`);
      }

      accountInfos.forEach((info, index) => {
        const pubKey = walletPubKeys[index];
        const solBalance = info ? info.lamports / LAMPORTS_PER_SOL : 0;
        const splBalance = splBalances.get(pubKey) || 0;

        currentBalances.set(pubKey, { solBalance, splBalance });

        //console.log(`💰 ${pubKey.substring(0, 8)}...${pubKey.substring(pubKey.length - 8)}: ${solBalance} SOL, ${splBalance} SPL`);

        // Always send updates on first poll, or when balance actually changes
        const lastBalances = this.lastBalances.get(userId) || new Map();
        const lastBalance = lastBalances.get(pubKey) || { solBalance: 0, splBalance: 0 };
        const isFirstPoll = !lastBalance.solBalance && lastBalance.solBalance !== 0;
        const solChanged = isFirstPoll || Math.abs(solBalance - lastBalance.solBalance) > 0.000001;
        const splChanged = isFirstPoll || Math.abs(splBalance - lastBalance.splBalance) > 0.000001;
        const changed = solChanged || splChanged;

        if (changed) {
          console.log(`📈 ${isFirstPoll ? 'Initial' : 'Changed'} balance for ${pubKey}: SOL ${lastBalance.solBalance || 0} → ${solBalance}, SPL ${lastBalance.splBalance || 0} → ${splBalance}`);
          balanceUpdates.push({
            publicKey: pubKey,
            solBalance: solBalance,
            splBalance: splBalance,
            lastUpdated: Date.now()
          });
        }
      });

      // Update last balances
      this.lastBalances.set(userId, currentBalances);

      //console.log(`📊 Balance check complete for user ${userId}: ${balanceUpdates.length} updates`);

      // Broadcast balance updates every poll (always send current balances)
      const updatesToSend = Array.from(currentBalances.entries()).map(([pubKey, balances]) => ({
        publicKey: pubKey,
        solBalance: balances.solBalance,
        splBalance: balances.splBalance,
        lastUpdated: Date.now()
      }));

      //console.log(`📤 Broadcasting ${updatesToSend.length} balance updates for user ${userId} (${balanceUpdates.length > 0 ? 'with changes' : 'no changes'})`);

      // This will be called by the WSS server
      if (this.onBalanceUpdate) {
        this.onBalanceUpdate(userId, updatesToSend);
      }

    } catch (error) {
      console.error(`❌ Failed to poll balances for user ${userId}:`, error);
    }
  }

  async getSplBalances(walletPubKeys, tokenInfo) {
    const splBalances = new Map();

    try {
      // Use fixed 6 decimals as requested
      const decimals = 6;
      console.log(`📏 Using fixed 6 decimals for token ${tokenInfo.mintAddress}`);

      // Get ATA addresses for all wallets
      const ataAddresses = walletPubKeys.map(walletPubKey => {
        const programId = tokenInfo.programType === 'TOKEN_2022' ?
          require('@solana/spl-token').TOKEN_2022_PROGRAM_ID :
          require('@solana/spl-token').TOKEN_PROGRAM_ID;

        return require('@solana/spl-token').getAssociatedTokenAddressSync(
          new PublicKey(tokenInfo.mintAddress),
          new PublicKey(walletPubKey),
          false,
          programId,
          ASSOCIATED_TOKEN_PROGRAM_ID
        );
      });

      console.log(`🎫 Generated ${ataAddresses.length} ATA addresses for token ${tokenInfo.mintAddress}`);

      // Batch fetch ATA account infos
      const ataInfos = await this.solanaConnection.getMultipleAccountsInfo(ataAddresses);
      console.log(`📡 Got ${ataInfos.length} ATA account infos`);

      // Parse token balances
      ataInfos.forEach((info, index) => {
        const walletPubKey = walletPubKeys[index];
        let balance = 0;

        if (info && info.data) {
          // Parse token account data
          // For both Token Program and Token-2022, the balance is at the same offset
          const balanceBytes = info.data.slice(64, 72); // Balance is 8 bytes starting at offset 64
          const rawBalance = Number(balanceBytes.readBigUInt64LE());
          balance = rawBalance / Math.pow(10, decimals);

          console.log(`🪙 ${walletPubKey.substring(0, 8)}...: ${balance} ${tokenInfo.mintAddress.substring(0, 8)}...`);
        }

        splBalances.set(walletPubKey, balance);
      });

      console.log(`📊 SPL Balance Summary for ${tokenInfo.mintAddress}:`);
      splBalances.forEach((balance, wallet) => {
        console.log(`   ${wallet}: ${balance}`);
      });

    } catch (error) {
      console.error(`❌ Failed to get SPL balances for token ${tokenInfo.mintAddress}:`, error);
    }

    return splBalances;
  }

  setBalanceUpdateCallback(callback) {
    this.onBalanceUpdate = callback;
  }
}

// Start server
if (require.main === module) {
  new WalletWSSServer();
}

module.exports = WalletWSSServer;