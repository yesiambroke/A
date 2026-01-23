const WebSocket = require('ws');
const http = require('http');
const https = require('https');
const fs = require('fs');
const { Pool } = require('pg');
const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } = require('@solana/spl-token');
const { OnlinePumpSdk, PumpSdk, getBuyTokenAmountFromSolAmount } = require('./PumpSDK/index.js');
const { OnlinePumpAmmSdk, PumpAmmSdk } = require('./PumpSDK/PumpSwap/index.js');
const BN = require('bn.js');
require('dotenv').config({ path: '../../.env.local' });

class WalletWSSServer {
  constructor(port = 4128) {
    this.port = process.env.LIGHT_WSS_PORT || port;
    this.clients = new Map();
    this.clientCounter = 0;
    this.userWallets = new Map();
    this.userConnections = new Map();
    this.userTokens = new Map(); // userId -> { mintAddress, programType }
    this.pendingSignRequests = new Map(); // requestId -> { userId, transactionData, timestamp }
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

    // Initialize Pump SDK instances
    this.onlinePumpSdk = new OnlinePumpSdk(this.solanaConnection);
    this.offlinePumpSdk = new PumpSdk();

    // Initialize Pump AMM SDK instances
    this.onlinePumpAmmSdk = new OnlinePumpAmmSdk(this.solanaConnection);
    this.offlinePumpAmmSdk = new PumpAmmSdk();

    // Create HTTP/HTTPS server for health check with SSL support
    const useSSL = process.env.NODE_ENV === 'production' || process.env.LIGHT_WSS_USE_SSL === 'true';
    let server = null;

    if (useSSL) {
      const sslDir = process.env.LIGHT_WSS_SSL_DIR || '/root/ssl';
      const keyPath = process.env.LIGHT_WSS_SSL_KEY || `${sslDir}/a-trade-key.pem`;
      const certPath = process.env.LIGHT_WSS_SSL_CERT || `${sslDir}/a-trade.pem`;

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

        case 'build_pump_buy':
          this.handleBuildPumpBuy(client, message);
          break;

        case 'build_pump_sell':
          this.handleBuildPumpSell(client, message);
          break;

        case 'sign_response':
          this.handleSignResponse(client, message);
          break;

        default:
          console.warn(`Unknown message type from ${client.id}:`, message.type);
      }
    } catch (error) {
      console.error(`Failed to parse message from ${client.id}:`, error);
    }
  }

  async handleBuildPumpBuy(client, message) {
    console.log(`📥 Build Pump V1 Buy request from ${client.id}:`, message);

    // Verify the client is authenticated and matches the requested user
    if (!client.authenticated || client.userId !== parseInt(message.userId)) {
      console.log(`❌ Unauthorized build pump buy request from ${client.id}`);
      client.ws.send(JSON.stringify({
        type: 'build_pump_buy_response',
        requestId: message.requestId,
        success: false,
        error: 'Unauthorized'
      }));
      return;
    }

    try {
      const { pairAddress, mintAddress, buyAmount, walletPublicKey, walletId, slippage = 1, protocol = 'v1' } = message;

      // For Pump V1, we only need mintAddress, buyAmount, walletPublicKey, walletId
      if (!mintAddress || !buyAmount || !walletPublicKey || !walletId) {
        throw new Error('Missing required parameters: mintAddress, buyAmount, walletPublicKey, walletId');
      }

      console.log(`🔄 Building Pump ${protocol.toUpperCase()} buy instructions for ${mintAddress}, amount: ${buyAmount} SOL`);

      // Convert buy amount to lamports (SOL in smallest unit)
      const solAmountLamports = Math.floor(parseFloat(buyAmount) * 10**9); // 1 SOL = 10^9 lamports
      const solAmountBN = new BN(solAmountLamports.toString());

      // Create PublicKey objects
      const mintPubKey = new PublicKey(mintAddress);
      const userPubKey = new PublicKey(walletPublicKey);

      console.log(`💰 SOL Amount: ${solAmountLamports} lamports (${parseFloat(buyAmount)} SOL)`);
      console.log(`🪙 Mint: ${mintPubKey.toBase58()}`);
      console.log(`👤 User: ${userPubKey.toBase58()}`);
      console.log(`🎯 Protocol: ${protocol.toUpperCase()}`);

      // Step 1: Fetch blockchain data
      console.log('🔄 Step 1: Fetching blockchain data...');

      let buyState, tokenProgramId, global, instructions, tokenAmount, instructionArray;

      if (protocol === 'v1') {
        // For Pump V1: SDK auto-discovers bonding curve from mint + user
        console.log('🔍 Using Pump V1 auto-discovery (no pair address needed)');

        // Step 1a: Fetch global state first (required for calculations)
        console.log('🌍 Fetching global state...');
        global = await this.onlinePumpSdk.fetchGlobal();
        if (!global) {
          throw new Error('Failed to fetch Pump global state');
        }
        console.log('✅ Global state fetched:', global ? 'global exists' : 'global is null');
        console.log('🔍 Global feeRecipient:', global.feeRecipient ? global.feeRecipient.toBase58() : 'undefined');

        // Step 1b: Fetch buy state for the specific token
        buyState = await this.onlinePumpSdk.fetchBuyState(mintPubKey, userPubKey);
        if (!buyState) {
          throw new Error('Failed to fetch Pump V1 buy state for the token');
        }

        // Get token program from the mint address (not bonding curve)
        const mintInfo = await this.solanaConnection.getAccountInfo(mintPubKey);
        if (!mintInfo) {
          throw new Error('Failed to fetch mint account info');
        }
        tokenProgramId = mintInfo.owner;
        console.log('✅ Pump V1 bonding curve data fetched, token program:', tokenProgramId.toBase58());

        // Store global separately since buyState might not include it
        buyState.global = global;

      } else if (protocol === 'amm' && pairAddress) {
        // For Pump AMM: use pair address as pool key
        console.log('🔍 Using Pump AMM with pool address');

        // Step 1a: Get AMM pool state
        console.log('🌍 Fetching AMM pool state...');
        const poolKey = new PublicKey(pairAddress);
        const swapSolanaState = await this.onlinePumpAmmSdk.swapSolanaState(poolKey, userPubKey);
        console.log('✅ AMM pool state retrieved');

        const { globalConfig, pool, poolBaseAmount, poolQuoteAmount } = swapSolanaState;

        console.log('📊 AMM Pool Information:');
        console.log(`- Base Reserve: ${poolBaseAmount.toString()} (raw)`);
        console.log(`- Base Reserve: ${(poolBaseAmount.toNumber() / 1_000_000).toLocaleString()} tokens (6 decimals)`);
        console.log(`- Quote Reserve: ${poolQuoteAmount.toString()} lamports`);
        console.log(`- Quote Reserve: ${(poolQuoteAmount.toNumber() / 1_000_000_000).toFixed(6)} SOL`);

        // Step 1b: Calculate token amount from SOL amount using AMM math
        console.log('🔄 Step 1b: Calculating token amount from SOL...');

        // For AMM buying: we want to spend solAmountLamports to buy some base tokens
        // Using AMM constant product formula with fee
        const feeNumerator = new BN(997); // 0.3% fee
        const feeDenominator = new BN(1000);

        const solAmountWithFee = new BN(solAmountLamports).mul(feeNumerator).div(feeDenominator);
        const numerator = poolBaseAmount.mul(solAmountWithFee);
        const denominator = poolQuoteAmount.add(solAmountWithFee);

        tokenAmount = numerator.div(denominator);

        console.log(`🧮 Calculated token amount: ${tokenAmount.toString()} (raw)`);
        console.log(`🧮 Calculated token amount: ${(tokenAmount.toNumber() / 1_000_000).toLocaleString()} tokens (6 decimals)`);

        // Step 2: Build AMM buy instructions
        console.log('🔄 Step 2: Building AMM buy instructions...');

        const instructions = await this.offlinePumpAmmSdk.buyBaseInput(swapSolanaState, tokenAmount, slippage);

        if (!instructions) {
          throw new Error('Failed to build AMM buy instructions - SDK returned undefined');
        }

        console.log(`✅ Built AMM buy instructions (type: ${typeof instructions})`);

        // Handle both single instruction and array of instructions
        instructionArray = Array.isArray(instructions) ? instructions : [instructions];
        console.log(`✅ Instruction count: ${instructionArray.length}`);

        // Set variables for response (mimicking V1 structure)
        buyState = { global: globalConfig }; // Simplified for AMM
        tokenProgramId = pool.tokenProgram; // From pool data
      } else {
        throw new Error('Invalid protocol or missing pairAddress for AMM');
      }

        if (protocol === 'v1') {
          const { bondingCurveAccountInfo, bondingCurve, associatedUserAccountInfo } = buyState;

          // Step 2: Calculate token amount from SOL amount
          console.log('🔄 Step 2: Calculating token amount...');
          tokenAmount = getBuyTokenAmountFromSolAmount({
            global,
            feeConfig: null,
            mintSupply: bondingCurve.tokenTotalSupply,
            bondingCurve,
            amount: solAmountBN,
          });
          console.log('🧮 Token amount calculation result:', tokenAmount ? tokenAmount.toString() : 'undefined');
          console.log(`🧮 Calculated token amount: ${tokenAmount} (raw value)`);

         // Step 3: Build V1 transaction instructions
         console.log('🔄 Step 3: Building V1 buy instructions...');
         console.log('📋 Parameters:', {
           global: global ? 'exists' : 'null',
           bondingCurveAccountInfo: bondingCurveAccountInfo ? 'exists' : 'null',
           bondingCurve: bondingCurve ? 'exists' : 'null',
           associatedUserAccountInfo: associatedUserAccountInfo ? 'exists' : 'null',
           mint: mintPubKey.toBase58(),
           user: userPubKey.toBase58(),
           amount: tokenAmount ? tokenAmount.toString() : 'null',
           solAmount: solAmountBN.toString(),
           slippage,
           tokenProgram: tokenProgramId.toBase58()
         });

         instructions = await this.offlinePumpSdk.buyInstructions({
           global,
           bondingCurveAccountInfo,
           bondingCurve,
           associatedUserAccountInfo,
           mint: mintPubKey,
           user: userPubKey,
           amount: tokenAmount,
           solAmount: solAmountBN,
           slippage,
           tokenProgram: tokenProgramId
         });

         console.log(`✅ Built ${instructions.length} V1 transaction instructions`);
         instructionArray = Array.isArray(instructions) ? instructions : [instructions];
       } else {
         // For AMM, instructions were already built above
         console.log(`✅ Using pre-built AMM instructions (${instructionArray.length} instructions)`);
       }

       // Step 4: Serialize instructions for transmission
       const serializedInstructions = instructionArray.map(ix => ({
         programId: ix.programId.toBase58(),
         keys: ix.keys.map(key => ({
           pubkey: key.pubkey.toBase58(),
           isSigner: key.isSigner,
           isWritable: key.isWritable
         })),
         data: ix.data ? Array.from(ix.data) : []
       }));

      console.log('📤 Sending build response to terminal client...');

       // Send success response with instructions to terminal client
       client.ws.send(JSON.stringify({
         type: 'build_pump_buy_response',
         requestId: message.requestId,
         success: true,
         data: {
           instructions: serializedInstructions,
           tokenAmount: tokenAmount.toString(),
           solAmount: solAmountLamports.toString(),
           slippage,
           protocol,
           accounts: {
             mint: mintPubKey.toBase58(),
             user: userPubKey.toBase58(),
             ...(protocol === 'amm' ? { pool: pairAddress } : {})
           }
         }
       }));

      // Now send sign request to connected wallet client
      console.log('📝 Sending sign request to wallet client...');
      await this.sendSignRequestToWallet(message.userId, {
        instructions: serializedInstructions,
        tokenAmount: tokenAmount.toString(),
        solAmount: solAmountLamports.toString(),
        mintAddress: mintPubKey.toBase58(),
        userAddress: userPubKey.toBase58(),
        walletId: walletId, // Pass the wallet ID for signing
        requestId: message.requestId
      });

    } catch (error) {
      console.error(`❌ Error building Pump buy instructions:`, error);
      client.ws.send(JSON.stringify({
        type: 'build_pump_buy_response',
        requestId: message.requestId,
        success: false,
        error: error.message
      }));
    }
  }

  async sendSignRequestToWallet(userId, transactionData) {
    const { walletId } = transactionData;
    const userConnections = this.userConnections.get(parseInt(userId));
    if (!userConnections?.wallet) {
      console.log(`❌ No wallet client connected for user ${userId}`);
      return;
    }

    const walletClient = userConnections.wallet;
    if (!walletClient.ws || walletClient.ws.readyState !== 1) {
      console.log(`❌ Wallet client WebSocket not ready for user ${userId}`);
      return;
    }

    const signRequestId = `sign_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create a proper Solana Transaction from the instructions
    const { Transaction, PublicKey } = require('@solana/web3.js');
    const transaction = new Transaction();

    // Add instructions to transaction
    transactionData.instructions.forEach(ixData => {
      const instruction = {
        programId: new PublicKey(ixData.programId),
        keys: ixData.keys.map(key => ({
          pubkey: new PublicKey(key.pubkey),
          isSigner: key.isSigner,
          isWritable: key.isWritable
        })),
        data: Buffer.from(ixData.data)
      };
      transaction.add(instruction);
    });

    // Set basic transaction properties
    const { blockhash, lastValidBlockHeight } = await this.solanaConnection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;
    transaction.feePayer = new PublicKey(transactionData.userAddress);

    // Serialize transaction to base64 (what wallet client expects)
    const serializedTx = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false
    });
    const serializedB64 = serializedTx.toString('base64');

    const signRequest = {
      type: 'sign_request',
      id: signRequestId,
      timestamp: Date.now(),
      walletIds: walletId ? [walletId] : [], // Use specific wallet ID if provided
      transaction: {
        serialized: serializedB64, // Base64 encoded serialized transaction
        metadata: {
          type: 'pump_buy',
          description: `Buy ${transactionData.tokenAmount} tokens for ${transactionData.solAmount} SOL`,
          tokenAddress: transactionData.mintAddress,
          amount: transactionData.solAmount,
          network: 'solana'
        }
      }
    };

    console.log(`📤 Sending sign request ${signRequestId} to wallet client for user ${userId}`);

    // Store the sign request for later response handling
    this.pendingSignRequests.set(signRequestId, {
      userId: parseInt(userId),
      transactionData,
      originalTransaction: transaction, // Store the original transaction object
      timestamp: Date.now(),
      signRequestId
    });

    walletClient.ws.send(JSON.stringify(signRequest));

    // Set timeout to clean up pending request
    setTimeout(() => {
      if (this.pendingSignRequests.has(signRequestId)) {
        console.log(`⏰ Sign request ${signRequestId} timed out`);
        this.pendingSignRequests.delete(signRequestId);
      }
    }, 30000); // 30 second timeout
  }

  async handleBuildPumpSell(client, message) {
    console.log(`📥 Build Pump V1 Sell request from ${client.id}:`, message);

    // Verify the client is authenticated and matches the requested user
    if (!client.authenticated || client.userId !== parseInt(message.userId)) {
      console.log(`❌ Unauthorized build pump sell request from ${client.id}`);
      client.ws.send(JSON.stringify({
        type: 'build_pump_sell_response',
        requestId: message.requestId,
        success: false,
        error: 'Unauthorized'
      }));
      return;
    }

    try {
      const { pairAddress, mintAddress, tokenAmount, walletPublicKey, walletId, slippage = 1, protocol = 'v1' } = message;

      // For Pump V1, we need mintAddress, tokenAmount, walletPublicKey, walletId
      if (!mintAddress || !tokenAmount || !walletPublicKey || !walletId) {
        throw new Error('Missing required parameters: mintAddress, tokenAmount, walletPublicKey, walletId');
      }

      console.log(`🔄 Building Pump ${protocol.toUpperCase()} sell instructions for ${mintAddress}, amount: ${tokenAmount} tokens`);

      // Convert token amount to smallest unit (assuming 6 decimals for Pump tokens)
      const decimals = 6;
      const tokenAmountSmallestUnit = Math.floor(parseFloat(tokenAmount) * Math.pow(10, decimals));
      const tokenAmountBN = new BN(tokenAmountSmallestUnit.toString());

      // Create PublicKey objects
      const mintPubKey = new PublicKey(mintAddress);
      const userPubKey = new PublicKey(walletPublicKey);

      console.log(`🪙 Token Amount: ${tokenAmountSmallestUnit} smallest units (${parseFloat(tokenAmount).toLocaleString()} tokens with ${decimals} decimals)`);
      console.log(`🪙 Mint: ${mintPubKey.toBase58()}`);
      console.log(`👤 User: ${userPubKey.toBase58()}`);
      console.log(`🎯 Protocol: ${protocol.toUpperCase()}`);

      // Step 1: Fetch blockchain data
      console.log('🔄 Step 1: Fetching blockchain data...');

      let global, bondingCurveAccountInfo, bondingCurve, tokenProgramId, instructions, expectedSolReceive, instructionArray, solAmountLamports, solAmount;

      if (protocol === 'v1') {
        // For Pump V1 sell: fetch sell state (checks if user has tokens)
        console.log('🔍 Using Pump V1 sell state (checks token balance)');

        // Step 1a: Fetch global state first (required for calculations)
        console.log('🌍 Fetching global state...');
        global = await this.onlinePumpSdk.fetchGlobal();
        if (!global) {
          throw new Error('Failed to fetch Pump global state');
        }
        console.log('✅ Global state fetched');
          // Get token program from the mint address
          const mintInfo = await this.solanaConnection.getAccountInfo(mintPubKey);
          if (!mintInfo) {
            throw new Error('Failed to fetch mint account info');
          }
          tokenProgramId = mintInfo.owner;
        // Step 1b: Fetch sell state for the specific token and user
        const sellState = await this.onlinePumpSdk.fetchSellState(mintPubKey, userPubKey, tokenProgramId);
        if (!sellState) {
          throw new Error('Failed to fetch Pump V1 sell state - user may not have tokens');
        }

        bondingCurveAccountInfo = sellState.bondingCurveAccountInfo;
        bondingCurve = sellState.bondingCurve;

        console.log('✅ Pump V1 sell state fetched, user has tokens!');

        console.log('✅ Token program fetched:', tokenProgramId.toBase58());

        // Step 1c: Calculate SOL amount from token amount
        console.log('🔄 Step 1c: Calculating SOL amount...');
        const { getSellSolAmountFromTokenAmount } = require('./PumpSDK/index.js');
        solAmount = getSellSolAmountFromTokenAmount({
          global,
          feeConfig: null,
          mintSupply: bondingCurve.tokenTotalSupply,
          bondingCurve,
          amount: tokenAmountBN,
        });

        console.log(`💰 SOL Amount calculation result: ${solAmount.div(new BN(10**9)).toString()}.${solAmount.mod(new BN(10**9)).toString().padStart(9, '0')} SOL`);

        // Step 2: Build V1 sell transaction instructions
        console.log('🔄 Step 2: Building V1 sell instructions...');
        console.log('📋 Parameters:', {
          global: global ? 'exists' : 'null',
          bondingCurveAccountInfo: bondingCurveAccountInfo ? 'exists' : 'null',
          bondingCurve: bondingCurve ? 'exists' : 'null',
          mint: mintPubKey.toBase58(),
          user: userPubKey.toBase58(),
          amount: tokenAmountBN.toString(),
          solAmount: solAmount.toString(),
          slippage,
          tokenProgram: tokenProgramId
        });

        instructions = await this.offlinePumpSdk.sellInstructions({
          global,
          bondingCurveAccountInfo,
          bondingCurve,
          mint: mintPubKey,
          user: userPubKey,
          amount: tokenAmountBN,
          solAmount,
          slippage,
          tokenProgram: tokenProgramId
        });

        console.log(`✅ Built ${instructions.length} V1 sell instructions`);
        instructionArray = Array.isArray(instructions) ? instructions : [instructions];

      } else if (protocol === 'amm' && pairAddress) {
        // For Pump AMM sell: use pair address as pool key
        console.log('🔍 Using Pump AMM sell with pool address');

        // Step 1a: Get AMM pool state
        console.log('🌍 Fetching AMM pool state for sell...');
        const poolKey = new PublicKey(pairAddress);
        const swapSolanaState = await this.onlinePumpAmmSdk.swapSolanaState(poolKey, userPubKey);
        console.log('✅ AMM pool state retrieved for sell');

        const { globalConfig, pool, poolBaseAmount, poolQuoteAmount } = swapSolanaState;

        console.log('📊 AMM Pool Information for sell:');
        console.log(`- Base Reserve: ${poolBaseAmount.toString()} (raw)`);
        console.log(`- Base Reserve: ${(poolBaseAmount.toNumber() / 1_000_000).toLocaleString()} tokens (6 decimals)`);

        // Step 1b: For AMM sell, we already have the token amount to sell
        // No additional calculation needed - we use the provided tokenAmountBN

        console.log(`🧮 Selling token amount: ${tokenAmountBN.toString()} (raw)`);
        console.log(`🧮 Selling token amount: ${(tokenAmountBN.toNumber() / 1_000_000).toLocaleString()} tokens (6 decimals)`);

        // Step 2: Build AMM sell instructions
        console.log('🔄 Step 2: Building AMM sell instructions...');

        const instructions = await this.offlinePumpAmmSdk.sellBaseInput(swapSolanaState, tokenAmountBN, slippage);

        if (!instructions) {
          throw new Error('Failed to build AMM sell instructions - SDK returned undefined');
        }

        console.log(`✅ Built AMM sell instructions (type: ${typeof instructions})`);

        // Handle both single instruction and array of instructions
        instructionArray = Array.isArray(instructions) ? instructions : [instructions];
        console.log(`✅ Instruction count: ${instructionArray.length}`);

        // For AMM sell, calculate expected SOL receive amount
        // Using AMM constant product formula with fee
        const feeNumerator = new BN(997); // 0.3% fee
        const feeDenominator = new BN(1000);

        const tokenAmountWithFee = tokenAmountBN.mul(feeNumerator).div(feeDenominator);
        const numerator = poolQuoteAmount.mul(tokenAmountWithFee);
        const denominator = poolBaseAmount.add(tokenAmountWithFee);

        expectedSolReceive = numerator.div(denominator);

        console.log(`💰 Expected SOL receive: ${expectedSolReceive.div(new BN(10**9)).toString()}.${expectedSolReceive.mod(new BN(10**9)).toString().padStart(9, '0')} SOL`);

        // Set variables for response (mimicking V1 structure)
        global = globalConfig;
        bondingCurveAccountInfo = null; // Not used in AMM
        bondingCurve = null; // Not used in AMM
        tokenProgramId = pool.tokenProgram; // From pool data
        solAmountLamports = expectedSolReceive.toNumber(); // Expected SOL receive
      } else {
        throw new Error('Invalid protocol or missing pairAddress for AMM');
      }

        // Calculations and logging are handled in the protocol conditional above
        // No additional processing needed here

      // Step 4: Serialize instructions for transmission
      const serializedInstructions = instructionArray.map(ix => ({
        programId: ix.programId.toBase58(),
        keys: ix.keys.map(key => ({
          pubkey: key.pubkey.toBase58(),
          isSigner: key.isSigner,
          isWritable: key.isWritable
        })),
        data: ix.data ? Array.from(ix.data) : []
      }));

      console.log('📤 Sending sell response to terminal client...');

       // Send success response with instructions to terminal client
       client.ws.send(JSON.stringify({
         type: 'build_pump_sell_response',
         requestId: message.requestId,
         success: true,
         data: {
           instructions: serializedInstructions,
           tokenAmount: tokenAmountSmallestUnit.toString(),
           solAmount: protocol === 'amm' ? expectedSolReceive.toString() : solAmount.toString(),
           slippage,
           protocol,
           accounts: {
             mint: mintPubKey.toBase58(),
             user: userPubKey.toBase58(),
             ...(protocol === 'amm' ? { pool: pairAddress } : {})
           }
         }
       }));

      // Now send sign request to connected wallet client
      console.log('📝 Sending sign request to wallet client...');
      await this.sendSignRequestToWallet(message.userId, {
        instructions: serializedInstructions,
        tokenAmount: tokenAmountSmallestUnit.toString(),
        solAmount: protocol === 'amm' ? expectedSolReceive.toString() : solAmount.toString(),
        mintAddress: mintPubKey.toBase58(),
        userAddress: userPubKey.toBase58(),
        walletId: walletId, // Pass the wallet ID for signing
        requestId: message.requestId
      });

    } catch (error) {
      console.error(`❌ Error building Pump sell instructions:`, error);
      client.ws.send(JSON.stringify({
        type: 'build_pump_sell_response',
        requestId: message.requestId,
        success: false,
        error: error.message
      }));
    }
  }

  async handleSignResponse(client, message) {
    const { requestId, status, signature, reason } = message;

    console.log(`📥 Received sign response for request ${requestId}: ${status}`);

    if (!this.pendingSignRequests?.has(requestId)) {
      console.log(`❌ No pending sign request found for ${requestId}`);
      return;
    }

    const pendingRequest = this.pendingSignRequests.get(requestId);
    this.pendingSignRequests.delete(requestId);

    if (status === 'approved' && signature) {
      console.log(`✅ Sign request ${requestId} approved, signature: ${signature.substring(0, 20)}...`);

      // Now send the signed transaction to Solana
      await this.sendSignedTransaction(pendingRequest, signature);

    } else {
      console.log(`❌ Sign request ${requestId} rejected: ${reason || 'No reason provided'}`);

      // Notify terminal client about rejection
      const userConnections = this.userConnections.get(pendingRequest.userId);
      if (userConnections?.terminal) {
        userConnections.terminal.ws.send(JSON.stringify({
          type: 'transaction_rejected',
          requestId,
          reason: reason || 'User rejected transaction'
        }));
      }
    }
  }

  async sendSignedTransaction(pendingRequest, signature) {
    try {
      console.log('🚀 Sending signed transaction to Solana...');

      const { originalTransaction, transactionData } = pendingRequest;

      // Add the signature from wallet client to the transaction
      const { PublicKey } = require('@solana/web3.js');
      const signatureBuffer = Buffer.from(signature, 'base64');
      originalTransaction.addSignature(new PublicKey(transactionData.userAddress), signatureBuffer);

      console.log('📡 Sending transaction to network...');
      const txSignature = await this.solanaConnection.sendRawTransaction(originalTransaction.serialize(), {
        skipPreflight: false,
        maxRetries: 3
      });

      console.log(`✅ Transaction sent! Signature: ${txSignature}`);

      // Notify terminal client about success
      const userConnections = this.userConnections.get(pendingRequest.userId);
      if (userConnections?.terminal) {
        userConnections.terminal.ws.send(JSON.stringify({
          type: 'transaction_sent',
          txSignature,
          description: `Buy ${transactionData.tokenAmount} tokens for ${transactionData.solAmount} SOL`
        }));
      }

    } catch (error) {
      console.error('❌ Failed to send signed transaction:', error);

      // Notify terminal client about failure
      const userConnections = this.userConnections.get(pendingRequest.userId);
      if (userConnections?.terminal) {
        userConnections.terminal.ws.send(JSON.stringify({
          type: 'transaction_failed',
          error: error.message
        }));
      }
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

  cleanupExpiredSignRequests() {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10 minutes

    if (this.pendingSignRequests) {
      for (const [requestId, request] of this.pendingSignRequests.entries()) {
        if (now - request.timestamp > maxAge) {
          this.pendingSignRequests.delete(requestId);
          console.log(`🗑️  Cleaned up expired sign request ${requestId}`);
        }
      }
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
      //console.log(`🔑 Converted ${pubKeys.length} pubkeys for user ${userId}`);

      // Batch fetch all account infos (includes SOL balance)
      const accountInfos = await this.solanaConnection.getMultipleAccountsInfo(pubKeys);
      //console.log(`📡 Got account infos for ${accountInfos.length} accounts`);

      // Extract SOL balances and prepare for SPL balances
      const currentBalances = new Map();
      const balanceUpdates = [];

      // If we have token info, get SPL balances
      let splBalances = new Map();
      if (tokenInfo) {
        //console.log(`🔍 Fetching SPL balances for token ${tokenInfo.mintAddress} (${tokenInfo.programType})`);
        splBalances = await this.getSplBalances(walletPubKeys, tokenInfo);
      } else {
        //console.log(`🔍 No token info available, skipping SPL balance check`);
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

      //console.log(`🎫 Generated ${ataAddresses.length} ATA addresses for token ${tokenInfo.mintAddress}`);

      // Batch fetch ATA account infos
      const ataInfos = await this.solanaConnection.getMultipleAccountsInfo(ataAddresses);
      //console.log(`📡 Got ${ataInfos.length} ATA account infos`);

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

      //console.log(`📊 SPL Balance Summary for ${tokenInfo.mintAddress}:`);
      splBalances.forEach((balance, wallet) => {
        //console.log(`   ${wallet}: ${balance}`);
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