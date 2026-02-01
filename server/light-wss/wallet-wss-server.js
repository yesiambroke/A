const WebSocket = require('ws');
const http = require('http');
const https = require('https');
const fs = require('fs');
const { Pool } = require('pg');
const { Connection, PublicKey, LAMPORTS_PER_SOL, Keypair, Transaction, SystemProgram, sendAndConfirmTransaction } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, createTransferInstruction, AccountLayout, createAssociatedTokenAccountInstruction, createSyncNativeInstruction, createCloseAccountInstruction, NATIVE_MINT } = require('@solana/spl-token');
const { OnlinePumpSdk, PumpSdk, getBuyTokenAmountFromSolAmount } = require('./PumpSDK/index.js');
const { OnlinePumpAmmSdk, PumpAmmSdk } = require('./PumpSDK/PumpSwap/index.js');
const BN = require('bn.js');
const bs58 = require('bs58');
const axios = require('axios');
require('dotenv').config({ path: '../../.env.local' });

// Jito Configuration
const JITO_PROXY_URL = process.env.JITO_PROXY_URL || 'https://sendtransaction.apteka.wtf';
const JITO_ENDPOINTS = [
  'amsterdam',
  'mainnet',
  'frankfurt',
  'tokyo'
];

const WALLET_LIMITS = {
  basic: 15,
  pro: 100
};

const TRADING_FEES = {
  basic: 0.00444, // 0.444%
  pro: 0.00222    // 0.222%
};

const FEE_RECIPIENT = process.env.FEE_RECIPIENT || 'A1zZVRgsJxopzezzsfrB45QQzMW4Tf9HiYWUbx6qzZ3W';
const JITO_TIP_ADDRESS = process.env.JITO_TIP_ADDRESS || '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5';

class WalletWSSServer {
  constructor(port = 4128) {
    this.port = process.env.LIGHT_WSS_PORT || port;
    this.clients = new Map();
    this.clientCounter = 0;
    this.userWallets = new Map();
    this.userConnections = new Map();
    this.userTokens = new Map(); // userId -> { mintAddress, programType }
    this.pendingSignRequests = new Map(); // requestId -> { userId, transactionData, timestamp }
    this.pendingBundleRequests = new Map(); // bundleId -> { userId, bundleData, timestamp }
    this.pendingSignResolvers = new Map(); // bundleId -> { resolve, reject, timestamp }
    this.httpServer = null; // HTTP/HTTPS server instance

    // Nuke configuration
    this.JITO_TIP_AMOUNT = 0.0002 * LAMPORTS_PER_SOL; // 0.0011 SOL in lamports
    this.WALLETS_PER_TRANSACTION = 7;
    this.TRANSACTIONS_PER_BUNDLE = 5;
    this.MAX_WALLETS_PER_BUNDLE = this.WALLETS_PER_TRANSACTION * this.TRANSACTIONS_PER_BUNDLE; // 35

    // Initialize Solana connection
    this.solanaConnection = new Connection(
      process.env.SOLANA_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=0a9623d2-dc37-4918-ac67-534e81ba893a',
      'confirmed'
    );

    // Initialize balance poller
    this.balancePoller = new SolBalancePoller(this.solanaConnection);
    this.balancePoller.setBalanceUpdateCallback((userId, updates) => {
      this.broadcastBalanceUpdates(userId, updates);
    });

    // Initialize Jito Tip Poller
    this.jitoTipPoller = new JitoTipPoller();
    this.jitoTipPoller.onUpdate((tip) => {
      this.broadcastJitoTip(tip);
    });
    this.jitoTipPoller.start();

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
        // Terminate connection after a short delay to allow the message to be sent
        setTimeout(() => {
          if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.close(4001, 'Invalid or expired session');
          }
        }, 500);
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
        userTier: client.userTier,
        clientType: 'terminal',
        jitoTip: this.jitoTipPoller.getCurrentTip() // Send current tip on connect
      }));

    } catch (error) {
      console.error(`Terminal authentication error for client ${client.id}:`, error);
      client.ws.send(JSON.stringify({
        type: 'auth_failed',
        reason: 'Authentication service error'
      }));
      setTimeout(() => {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.close(4002, 'Authentication service error');
        }
      }, 500);
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
        // Terminate connection after a short delay
        setTimeout(() => {
          if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.close(4003, 'Invalid or expired auth key');
          }
        }, 500);
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
        userTier: client.userTier,
        clientType: 'wallet'
      }));

    } catch (error) {
      console.error(`Wallet authentication error for client ${client.id}:`, error);
      client.ws.send(JSON.stringify({
        type: 'auth_failed',
        reason: 'Authentication service error'
      }));
      setTimeout(() => {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.close(4004, 'Authentication service error');
        }
      }, 500);
    }
  }

  updateUserConnection(client) {
    if (!client.userId) return;

    const userConnections = this.userConnections.get(client.userId) || { terminal: null, wallet: null };
    const wasWalletConnected = !!userConnections.wallet;
    const wasTerminalConnected = !!userConnections.terminal;

    if (client.type === 'terminal') {
      userConnections.terminal = client;

      // Notify new terminal client if wallet is already connected
      if (userConnections.wallet && userConnections.wallet.ws && userConnections.wallet.ws.readyState === 1) {
        userConnections.terminal.ws.send(JSON.stringify({
          type: 'wallet_client_connected',
          timestamp: Date.now()
        }));
        console.log(`📤 Notified new terminal client ${userConnections.terminal.id} that wallet is already present`);
      }
    } else if (client.type === 'wallet') {
      userConnections.wallet = client;

      // Notify terminal client that wallet connected (if terminal is already connected)
      if (userConnections.terminal && userConnections.terminal.ws && userConnections.terminal.ws.readyState === 1) {
        userConnections.terminal.ws.send(JSON.stringify({
          type: 'wallet_client_connected',
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

      // Clear stored wallets since the signing ability is gone
      this.userWallets.delete(client.userId);

      // Notify terminal client that wallet disconnected
      if (userConnections.terminal && userConnections.terminal.ws && userConnections.terminal.ws.readyState === 1) {
        userConnections.terminal.ws.send(JSON.stringify({
          type: 'wallet_client_disconnected',
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

        case 'nuke_request':
          this.handleNukeRequest(client, message);
          break;

        case 'sign_bundle_response':
          this.handleSignBundleResponse(client, message);
          break;

        case 'bundle_buy_request':
          this.handleBundleBuyRequest(client, message);
          break;

        case 'gather_sol_request':
          this.handleGatherSolRequest(client, message);
          break;

        case 'distribute_sol_request':
          this.handleDistributeSolRequest(client, message);
          break;

        default:
          console.warn(`Unknown message type from ${client.id}: "${message.type}"`);
          console.log(`📄 Raw message data from ${client.id}:`, data.toString());
      }
    } catch (error) {
      console.error(`Failed to parse message from ${client.id}:`, error);
    }
  }

  async handleBuildPumpBuy(client, message) {
    console.log(`📥 Build Pump V1 Buy request from ${client.id}:`, message);

    // Verify the client is authenticated
    if (!client.authenticated) {
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
      const { pairAddress, mintAddress, buyAmount, walletPublicKey, walletId, slippage = 1, protocol = 'v1', useJito = false } = message;

      // For Pump V1, we only need mintAddress, buyAmount, walletPublicKey, walletId
      if (!mintAddress || !buyAmount || !walletPublicKey || !walletId) {
        throw new Error('Missing required parameters: mintAddress, buyAmount, walletPublicKey, walletId');
      }

      console.log(`🔄 Building Pump ${protocol.toUpperCase()} buy instructions for ${mintAddress}, amount: ${buyAmount} SOL (Jito: ${useJito})`);

      // Convert buy amount to lamports (SOL in smallest unit)
      const solAmountLamports = Math.floor(parseFloat(buyAmount) * 10 ** 9); // 1 SOL = 10^9 lamports
      const solAmountBN = new BN(solAmountLamports.toString());

      // Create PublicKey objects
      const mintPubKey = new PublicKey(mintAddress);
      const userPubKey = new PublicKey(walletPublicKey);

      console.log(`💰 SOL Amount: ${solAmountLamports} lamports (${parseFloat(buyAmount)} SOL)`);
      console.log(`🪙 Mint: ${mintPubKey.toBase58()}`);
      console.log(`👤 User: ${userPubKey.toBase58()}`);
      console.log(`🎯 Protocol: ${protocol.toUpperCase()}`);

      // Calculate Trading Fee
      const feeRate = client.userTier === 'pro' ? TRADING_FEES.pro : TRADING_FEES.basic;
      const feeLamports = Math.floor(solAmountLamports * feeRate);
      console.log(`💸 Trading Fee (${client.userTier}): ${feeLamports} lamports (${(feeLamports / 10 ** 9).toFixed(6)} SOL)`);

      // Step 1: Fetch blockchain data
      console.log('🔄 Step 1: Fetching blockchain data...');

      let buyState, tokenProgramId, global, instructions, tokenAmount, instructionArray;

      if (protocol === 'v1') {
        // ... (V1 logic remains same)
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
        // ... (AMM logic remains same)
        console.log('🔍 Using Pump AMM with pool address');

        // Step 1a: Get AMM pool state
        console.log('🌍 Fetching AMM pool state...');
        const poolKey = new PublicKey(pairAddress);
        const swapSolanaState = await this.onlinePumpAmmSdk.swapSolanaState(poolKey, userPubKey);
        console.log('✅ AMM pool state retrieved');

        const { globalConfig, pool, poolBaseAmount, poolQuoteAmount } = swapSolanaState;
        console.log('📊 AMM Pool Information:');
        console.log(`- Base Reserve: ${(poolBaseAmount.toNumber() / 1_000_000).toLocaleString()} tokens (6 decimals)`);
        console.log(`- Quote Reserve: ${(poolQuoteAmount.toNumber() / 1_000_000_000).toFixed(6)} SOL`);

        // Step 1b: Calculate token amount from SOL amount using AMM math
        console.log('🔄 Step 1b: Calculating token amount from SOL...');

        // For AMM buying: we want to spend solAmountLamports to buy some base tokens
        const feeNumerator = new BN(997); // 0.3% fee
        const feeDenominator = new BN(1000);

        const solAmountWithFee = new BN(solAmountLamports).mul(feeNumerator).div(feeDenominator);
        const numerator = poolBaseAmount.mul(solAmountWithFee);
        const denominator = poolQuoteAmount.add(solAmountWithFee);

        tokenAmount = numerator.div(denominator);

        console.log(`🧮 Calculated token amount: ${(tokenAmount.toNumber() / 1_000_000).toLocaleString()} tokens (6 decimals)`);

        // Step 2: Build AMM buy instructions
        console.log('🔄 Step 2: Building AMM buy instructions...');

        instructions = await this.offlinePumpAmmSdk.buyBaseInput(swapSolanaState, tokenAmount, slippage);
        if (!instructions) {
          throw new Error('Failed to build AMM buy instructions - SDK returned undefined');
        }

        instructionArray = Array.isArray(instructions) ? instructions : [instructions];
        buyState = { global: globalConfig };
        tokenProgramId = pool.tokenProgram;
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
        console.log(`🧮 Calculated token amount: ${tokenAmount} (raw value)`);

        // Step 3: Build V1 transaction instructions
        console.log('🔄 Step 3: Building V1 buy instructions...');
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
      }

      // Step 4: Add Trading Fee Instruction
      if (feeLamports > 0) {
        const feeIx = SystemProgram.transfer({
          fromPubkey: userPubKey,
          toPubkey: new PublicKey(FEE_RECIPIENT),
          lamports: feeLamports
        });
        instructionArray.push(feeIx);
        console.log(`💸 Added trading fee instruction (${feeLamports} lamports)`);
      }

      // Step 5: Add Jito Tip Instruction
      if (useJito) {
        // Use server's polled tip or default to 0.001 SOL (fallback)
        const currentTip = this.jitoTipPoller ? this.jitoTipPoller.tipFloor : 0;
        const tipStart = currentTip > 0 ? currentTip : 0.001;

        const tipLamports = Math.floor(tipStart * LAMPORTS_PER_SOL);

        const jitoTipAccount = new PublicKey(JITO_TIP_ADDRESS);
        const tipIx = SystemProgram.transfer({
          fromPubkey: userPubKey,
          toPubkey: jitoTipAccount,
          lamports: tipLamports
        });
        instructionArray.push(tipIx);
        console.log(`💡 Added Jito tip instruction (${tipLamports} lamports, ${tipStart} SOL)`);
      }

      // Step 6: Serialize instructions for transmission
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
          useJito,
          accounts: {
            mint: mintPubKey.toBase58(),
            user: userPubKey.toBase58(),
            ...(protocol === 'amm' ? { pool: pairAddress } : {})
          }
        }
      }));

      // Now send sign request to connected wallet client
      console.log('📝 Sending sign request to wallet client...');
      await this.sendSignRequestToWallet(client.userId, {
        instructions: serializedInstructions,
        tokenAmount: tokenAmount.toString(),
        solAmount: solAmountLamports.toString(),
        mintAddress: mintPubKey.toBase58(),
        userAddress: userPubKey.toBase58(),
        walletId: walletId, // Pass the wallet ID for signing
        requestId: message.requestId,
        useJito: useJito // Pass Jito flag to final submission
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

    // Verify the client is authenticated
    if (!client.authenticated) {
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
      const { pairAddress, mintAddress, tokenAmount, walletPublicKey, walletId, slippage = 1, protocol = 'v1', useJito = false, jitoTipAmount } = message;

      // For Pump V1, we need mintAddress, tokenAmount, walletPublicKey, walletId
      if (!mintAddress || !tokenAmount || !walletPublicKey || !walletId) {
        throw new Error('Missing required parameters: mintAddress, tokenAmount, walletPublicKey, walletId');
      }

      console.log(`🔄 Building Pump ${protocol.toUpperCase()} sell instructions for ${mintAddress}, amount: ${tokenAmount} tokens (Jito: ${useJito})`);

      // Convert token amount to smallest unit (assuming 6 decimals for Pump tokens)
      const decimals = 6;
      const tokenAmountSmallestUnit = Math.floor(parseFloat(tokenAmount) * Math.pow(10, decimals));
      const tokenAmountBN = new BN(tokenAmountSmallestUnit.toString());

      // Create PublicKey objects
      const mintPubKey = new PublicKey(mintAddress);
      const userPubKey = new PublicKey(walletPublicKey);

      console.log(`🪙 Token Amount: ${tokenAmountSmallestUnit} smallest units (${parseFloat(tokenAmount).toLocaleString()} tokens)`);
      console.log(`🪙 Mint: ${mintPubKey.toBase58()}`);
      console.log(`👤 User: ${userPubKey.toBase58()}`);
      console.log(`🎯 Protocol: ${protocol.toUpperCase()}`);

      // Step 1: Fetch blockchain data
      console.log('🔄 Step 1: Fetching blockchain data...');

      let global, bondingCurveAccountInfo, bondingCurve, tokenProgramId, instructions, expectedSolReceive, instructionArray, solAmountLamports, solAmount;

      if (protocol === 'v1') {
        // ... (V1 logic remains same)
        console.log('🔍 Using Pump V1 sell state (checks token balance)');

        // Step 1a: Fetch global state first
        global = await this.onlinePumpSdk.fetchGlobal();
        if (!global) {
          throw new Error('Failed to fetch Pump global state');
        }

        // Get token program
        const mintInfo = await this.solanaConnection.getAccountInfo(mintPubKey);
        if (!mintInfo) {
          throw new Error('Failed to fetch mint account info');
        }
        tokenProgramId = mintInfo.owner;

        // Step 1b: Fetch sell state
        const sellState = await this.onlinePumpSdk.fetchSellState(mintPubKey, userPubKey, tokenProgramId);
        if (!sellState) {
          throw new Error('Failed to fetch Pump V1 sell state - user may not have tokens');
        }

        bondingCurveAccountInfo = sellState.bondingCurveAccountInfo;
        bondingCurve = sellState.bondingCurve;

        // Step 1c: Calculate SOL amount
        const { getSellSolAmountFromTokenAmount } = require('./PumpSDK/index.js');
        solAmount = getSellSolAmountFromTokenAmount({
          global,
          feeConfig: null,
          mintSupply: bondingCurve.tokenTotalSupply,
          bondingCurve,
          amount: tokenAmountBN,
        });

        solAmountLamports = solAmount.toNumber();

        // Step 2: Build V1 sell instructions
        console.log('🔄 Step 2: Building V1 sell instructions...');
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

        instructionArray = Array.isArray(instructions) ? instructions : [instructions];

      } else if (protocol === 'amm' && pairAddress) {
        // ... (AMM logic remains same)
        const poolKey = new PublicKey(pairAddress);
        const swapSolanaState = await this.onlinePumpAmmSdk.swapSolanaState(poolKey, userPubKey);

        const { globalConfig, pool, poolBaseAmount, poolQuoteAmount } = swapSolanaState;

        // Calculate expected SOL receive (for fee calculation)
        const feeNumerator = new BN(997); // 0.3% fee
        const feeDenominator = new BN(1000);

        const tokenAmountWithFee = tokenAmountBN.mul(feeNumerator).div(feeDenominator);
        const numerator = poolQuoteAmount.mul(tokenAmountWithFee);
        const denominator = poolBaseAmount.add(tokenAmountWithFee);

        expectedSolReceive = numerator.div(denominator);
        solAmountLamports = expectedSolReceive.toNumber();

        // Step 2: Build AMM sell instructions
        console.log('🔄 Step 2: Building AMM sell instructions...');
        instructions = await this.offlinePumpAmmSdk.sellBaseInput(swapSolanaState, tokenAmountBN, slippage);
        if (!instructions) {
          throw new Error('Failed to build AMM sell instructions');
        }

        instructionArray = Array.isArray(instructions) ? instructions : [instructions];
        tokenProgramId = pool.tokenProgram;
        solAmount = expectedSolReceive;
      } else {
        throw new Error('Invalid protocol or missing pairAddress for AMM');
      }

      // Calculate Trading Fee (on estimated SOL proceeds)
      const feeRate = client.userTier === 'pro' ? TRADING_FEES.pro : TRADING_FEES.basic;
      const feeLamports = Math.floor(solAmountLamports * feeRate);
      console.log(`💸 Trading Fee (${client.userTier}): ${feeLamports} lamports (${(feeLamports / 10 ** 9).toFixed(6)} SOL)`);

      // Step 3: Add Trading Fee Instruction
      if (feeLamports > 0) {
        const feeIx = SystemProgram.transfer({
          fromPubkey: userPubKey,
          toPubkey: new PublicKey(FEE_RECIPIENT),
          lamports: feeLamports
        });
        instructionArray.push(feeIx);
        console.log(`💸 Added trading fee instruction (${feeLamports} lamports)`);
      }

      // Step 4: Add Jito Tip Instruction
      if (useJito) {
        // Use server's polled tip or default to 0.001 SOL (fallback)
        const currentTip = this.jitoTipPoller ? this.jitoTipPoller.tipFloor : 0;
        const tipStart = currentTip > 0 ? currentTip : 0.001;

        const tipLamports = Math.floor(tipStart * LAMPORTS_PER_SOL);

        const jitoTipAccount = new PublicKey(JITO_TIP_ADDRESS);
        const tipIx = SystemProgram.transfer({
          fromPubkey: userPubKey,
          toPubkey: jitoTipAccount,
          lamports: tipLamports
        });
        instructionArray.push(tipIx);
        console.log(`💡 Added Jito tip instruction (${tipLamports} lamports, ${tipStart} SOL)`);
      }

      // Step 5: Serialize instructions
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

      // Send success response
      client.ws.send(JSON.stringify({
        type: 'build_pump_sell_response',
        requestId: message.requestId,
        success: true,
        data: {
          instructions: serializedInstructions,
          tokenAmount: tokenAmountSmallestUnit.toString(),
          solAmount: solAmount.toString(),
          slippage,
          protocol,
          useJito,
          accounts: {
            mint: mintPubKey.toBase58(),
            user: userPubKey.toBase58(),
            ...(protocol === 'amm' ? { pool: pairAddress } : {})
          }
        }
      }));

      // Send sign request
      console.log('📝 Sending sign request to wallet client...');
      await this.sendSignRequestToWallet(client.userId, {
        instructions: serializedInstructions,
        tokenAmount: tokenAmountSmallestUnit.toString(),
        solAmount: solAmount.toString(),
        mintAddress: mintPubKey.toBase58(),
        userAddress: userPubKey.toBase58(),
        walletId: walletId,
        requestId: message.requestId,
        useJito: useJito
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
      const { originalTransaction, transactionData } = pendingRequest;
      const useJito = transactionData.useJito || false;

      console.log(`🚀 ${useJito ? 'Sending JITO transaction' : 'Sending standard transaction'} to Solana...`);

      // Add the signature from wallet client to the transaction
      const signatureBuffer = Buffer.from(signature, 'base64');
      originalTransaction.addSignature(new PublicKey(transactionData.userAddress), signatureBuffer);

      let txSignature;

      if (useJito) {
        console.log('📡 Submitting via Jito (Spam Strategy)...');
        const serializedTx = originalTransaction.serialize();
        const txBase58 = bs58.default.encode(serializedTx);

        // Prepare Jito payload for sendTransaction
        const jitoPayload = [
          txBase58,
          { "encoding": "base58" }
        ];

        // Spam across all endpoints
        const sendPromises = JITO_ENDPOINTS.map(endpoint =>
          this.sendJitoTransaction(jitoPayload, endpoint)
            .then(id => ({ success: true, id, endpoint }))
            .catch(err => ({ success: false, error: err.message, endpoint }))
        );

        const results = await Promise.all(sendPromises);
        const successes = results.filter(r => r.success);

        if (successes.length > 0) {
          txSignature = successes[0].id;
          console.log(`✅ Jito Transaction Submitted! ID: ${txSignature} (Success rate: ${successes.length}/${JITO_ENDPOINTS.length})`);
        } else {
          // If all Jito attempts failed, fallback or error out
          console.error('❌ All Jito submission attempts failed:', results.map(r => r.error));
          throw new Error('All Jito submission attempts failed');
        }
      } else {
        console.log('📡 Sending transaction to network...');
        txSignature = await this.solanaConnection.sendRawTransaction(originalTransaction.serialize(), {
          skipPreflight: false,
          maxRetries: 3
        });
        console.log(`✅ Standard Transaction sent! Signature: ${txSignature}`);
      }

      // Notify terminal client about success
      const userConnections = this.userConnections.get(pendingRequest.userId);
      if (userConnections?.terminal) {
        userConnections.terminal.ws.send(JSON.stringify({
          type: 'transaction_sent',
          txSignature,
          description: `Trade ${transactionData.tokenAmount} tokens for ${transactionData.solAmount} SOL ${useJito ? '(via Jito)' : ''}`
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

    // Verify the client is authenticated
    if (!client.authenticated) {
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
    // Only return wallets if the wallet client is actually connected
    const userConnections = this.userConnections.get(client.userId);
    const isWalletConnected = !!(userConnections && userConnections.wallet && userConnections.wallet.ws && userConnections.wallet.ws.readyState === 1);

    const userWallets = isWalletConnected ? (this.userWallets.get(client.userId) || []) : [];

    if (!isWalletConnected) {
      console.log(`⚠️ Returning empty wallet list for user ${client.userId} (wallet client disconnected)`);
    }

    if (userWallets.length === 0) {
      // No wallets registered yet
      client.ws.send(JSON.stringify({
        type: 'wallet_data_response',
        requestId: request.requestId,
        success: true,
        isWalletConnected,
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
      // Enforce tier-based wallet limits
      const limit = client.userTier === 'pro' ? WALLET_LIMITS.pro : WALLET_LIMITS.basic;
      const limitedWalletsData = message.wallets.slice(0, limit);

      if (message.wallets.length > limit) {
        console.log(`⚠️ User ${client.userId} (${client.userTier}) exceeded wallet limit of ${limit}. Incoming: ${message.wallets.length}. Sliced to ${limitedWalletsData.length}.`);
      }

      // Store initial limited wallet list
      this.userWallets.set(client.userId, limitedWalletsData);

      // Fetch balance information for each wallet (only for the limited set)
      const enrichedWallets = await this.enrichWalletsWithBalances(limitedWalletsData);

      // Update stored wallets with balance info
      this.userWallets.set(client.userId, enrichedWallets);

      console.log(`✅ Stored ${enrichedWallets.length} limited wallets for user ${client.userId}`);

      // Send confirmation back to wallet client
      client.ws.send(JSON.stringify({
        type: 'wallet_list_ack',
        walletCount: enrichedWallets.length,
        timestamp: Date.now()
      }));

      // Notify terminal client about the wallet update
      const userConnections = this.userConnections.get(client.userId);
      if (userConnections && userConnections.terminal && userConnections.terminal.ws && userConnections.terminal.ws.readyState === 1) {
        userConnections.terminal.ws.send(JSON.stringify({
          type: 'wallet_update',
          wallets: enrichedWallets,
          timestamp: Date.now()
        }));
        console.log(`📤 Notified terminal client ${userConnections.terminal.id} about ${enrichedWallets.length} wallets`);
      }

      // Check if we should start polling (if both clients are connected)
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
  broadcastJitoTip(tip) {
    //console.log(`📤 Broadcasting Jito tip update: ${tip} SOL`);

    this.userConnections.forEach((connections, userId) => {
      if (connections.terminal && connections.terminal.ws && connections.terminal.ws.readyState === WebSocket.OPEN) {
        connections.terminal.ws.send(JSON.stringify({
          type: 'jito_tip_update',
          jitoTip: tip,
          timestamp: Date.now()
        }));
      }
    });
  }

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

  // ============================================================================
  // NUKE FEATURE - Gather tokens from multiple wallets
  // ============================================================================

  async handleNukeRequest(client, message) {
    console.log(`☢️ Nuke request from ${client.id}:`, message);

    // Verify the client is authenticated
    if (!client.authenticated) {
      console.log(`❌ Unauthorized nuke request from ${client.id}`);
      client.ws.send(JSON.stringify({
        type: 'nuke_response',
        requestId: message.requestId,
        success: false,
        error: 'Unauthorized'
      }));
      return;
    }

    try {
      const { currentCoin, mintAddress, protocol, pairAddress, slippage, requestId } = message;
      const userId = client.userId;
      const mint = mintAddress || currentCoin; // Support both field names

      console.log(`☢️ NUKE Request:`);
      console.log(`   - Mint: ${mint}`);
      console.log(`   - Protocol: ${protocol || 'v1'}`);
      console.log(`   - Pair Address: ${pairAddress || 'N/A'}`);
      console.log(`   - Slippage: ${slippage || 5}%`);

      // Get user's wallets
      const userWallets = this.userWallets.get(userId) || [];
      if (userWallets.length === 0) {
        throw new Error('No wallets found for user');
      }

      console.log(`🔍 Checking SPL balances for ${userWallets.length} wallets...`);

      // Get token program ID
      const mintPubKey = new PublicKey(mint);
      const mintInfo = await this.solanaConnection.getAccountInfo(mintPubKey);
      if (!mintInfo) {
        throw new Error('Failed to fetch mint account info');
      }
      const tokenProgramId = mintInfo.owner;

      // Get all associated token addresses
      const walletPublicKeys = userWallets.map(w => new PublicKey(w.publicKey));
      const associatedTokenAddresses = walletPublicKeys.map(pubkey =>
        getAssociatedTokenAddressSync(
          mintPubKey,
          pubkey,
          false,
          tokenProgramId,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );

      // Batch check SPL balances
      const splBalances = await this.getSPLBalancesBatch(associatedTokenAddresses);

      // Filter wallets with balance > 0
      const walletsWithBalance = [];
      for (let i = 0; i < userWallets.length; i++) {
        if (splBalances[i] > 0) {
          walletsWithBalance.push({
            wallet: userWallets[i],
            splBalance: splBalances[i],
            ataAddress: associatedTokenAddresses[i].toBase58()
          });
          console.log(`✅ Wallet ${userWallets[i].name} has ${(splBalances[i] / 1_000_000).toFixed(2)} SPL tokens`);
        }
      }

      if (walletsWithBalance.length === 0) {
        throw new Error('No wallets have SPL token balance');
      }

      // Select destination wallet (first wallet with balance)
      const destinationWallet = walletsWithBalance[0];
      console.log(`📍 Destination wallet: ${destinationWallet.wallet.name}`);

      // Remove destination from senders list
      const senderWallets = walletsWithBalance.slice(1);
      if (senderWallets.length === 0) {
        throw new Error('Only one wallet has tokens, nothing to gather');
      }

      console.log(`📦 Building gather transactions for ${senderWallets.length} sender wallets...`);

      // Build gather transactions
      const bundleData = await this.buildGatherTransactions(
        senderWallets,
        destinationWallet,
        mintPubKey,
        tokenProgramId
      );

      console.log(`✅ Built ${bundleData.transactions.length} transactions in ${bundleData.bundles.length} bundle(s)`);

      // Add protocol data for sell phase
      bundleData.protocol = protocol || 'v1';
      bundleData.pairAddress = pairAddress;
      bundleData.mintAddress = mint;
      bundleData.slippage = slippage || 5;
      // Send to wallet client for signing
      await this.sendBundleSignRequest(userId, bundleData, requestId);

    } catch (error) {
      console.error(`❌ Error in nuke request:`, error);
      client.ws.send(JSON.stringify({
        type: 'nuke_response',
        requestId: message.requestId,
        success: false,
        error: error.message
      }));
    }
  }

  async handleBundleBuyRequest(client, message) {
    console.log('📦 Processing Bundle Buy Request...');

    try {
      const { mintAddress, wallets, slippage = 5, useJito, protocol = 'v1', pairAddress } = message;
      const userId = client.userId;

      if (!wallets || wallets.length === 0) {
        throw new Error('No wallets specified for bundle buy');
      }

      console.log(`   - Protocol: ${protocol}`);
      console.log(`   - Mint: ${mintAddress}`);
      console.log(`   - Wallets: ${wallets.length}`);
      if (protocol === 'amm') console.log(`   - Pair: ${pairAddress}`);

      const mintPubKey = new PublicKey(mintAddress);

      // Fetch initial state
      const firstWalletId = wallets[0].walletId;
      const userWallets = this.userWallets.get(userId) || [];
      const firstWallet = userWallets.find(w => w.id === firstWalletId);

      if (!firstWallet) {
        throw new Error(`Wallet ${firstWalletId} not found`);
      }

      const firstWalletPubKey = new PublicKey(firstWallet.publicKey);

      let global, buyState, tokenProgramId;
      let swapSolanaState, currentPoolBaseAmount, currentPoolQuoteAmount; // For AMM
      let currentBondingCurve; // For V1

      const { getBuyTokenAmountFromSolAmount } = require('./PumpSDK/index.js');
      const { Transaction, SystemProgram } = require('@solana/web3.js');

      if (protocol === 'v1' || !protocol) {
        const mintInfo = await this.solanaConnection.getAccountInfo(mintPubKey);
        tokenProgramId = mintInfo.owner;

        // Fetch global and curve
        global = await this.onlinePumpSdk.fetchGlobal();
        buyState = await this.onlinePumpSdk.fetchBuyState(mintPubKey, firstWalletPubKey);

        currentBondingCurve = {
          ...buyState.bondingCurve,
          virtualSolReserves: buyState.bondingCurve.virtualSolReserves.clone(),
          virtualTokenReserves: buyState.bondingCurve.virtualTokenReserves.clone(),
          realSolReserves: buyState.bondingCurve.realSolReserves.clone(),
          realTokenReserves: buyState.bondingCurve.realTokenReserves.clone(),
        };
      } else if (protocol === 'amm' && pairAddress) {
        const poolKey = new PublicKey(pairAddress);
        swapSolanaState = await this.onlinePumpAmmSdk.swapSolanaState(poolKey, firstWalletPubKey);
        const { globalConfig, pool, poolBaseAmount, poolQuoteAmount } = swapSolanaState;

        tokenProgramId = pool.tokenProgram;
        currentPoolBaseAmount = poolBaseAmount.clone();
        currentPoolQuoteAmount = poolQuoteAmount.clone();
      } else {
        throw new Error(`Unsupported protocol or missing pair address: ${protocol}`);
      }

      const bundleTransactions = [];
      const { blockhash } = await this.solanaConnection.getLatestBlockhash('confirmed');

      // Iterate through wallets securely
      for (let i = 0; i < wallets.length; i++) {
        const entry = wallets[i];
        const walletData = userWallets.find(w => w.id === entry.walletId);
        if (!walletData) throw new Error(`Wallet ${entry.walletId} not found`);
        const walletPubKey = new PublicKey(walletData.publicKey);
        console.log(`   🔄 Wallet: ${walletData.name} (${walletPubKey.toBase58()})`);

        console.log(`   🔄 Simulating Tx ${i + 1}/${wallets.length} for ${walletData.name}`);

        const solAmountStr = entry.amount.toString();
        // Convert SOL to lamports (BN)
        const lamports = Math.floor(parseFloat(solAmountStr) * 1_000_000_000);
        const solAmountBN = new BN(lamports.toString());

        // Calculate Trading Fee
        const feeRate = client.userTier === 'pro' ? TRADING_FEES.pro : TRADING_FEES.basic;
        const feeLamports = Math.floor(lamports * feeRate);
        console.log(`      💸 Trading Fee (${client.userTier}): ${feeLamports} lamports (${(feeLamports / 10 ** 9).toFixed(6)} SOL)`);

        let tokenAmount, instructions;

        if (protocol === 'v1' || !protocol) {
          // 1. Calculate EXPECTED tokens using SIMULATED state
          tokenAmount = getBuyTokenAmountFromSolAmount({
            global,
            feeConfig: null,
            mintSupply: currentBondingCurve.tokenTotalSupply,
            bondingCurve: currentBondingCurve, // Use simulated state
            amount: solAmountBN
          });

          // 2. Build Instructions using SIMULATED state
          instructions = await this.offlinePumpSdk.buyInstructions({
            global,
            bondingCurveAccountInfo: buyState.bondingCurveAccountInfo,
            bondingCurve: currentBondingCurve, // critical!
            mint: mintPubKey,
            user: walletPubKey,
            amount: tokenAmount,
            solAmount: solAmountBN,
            tokenAmount: tokenAmount,
            slippage: slippage,
            tokenProgram: tokenProgramId
          });

          // 3. Update Simulation State manually
          currentBondingCurve.virtualSolReserves = currentBondingCurve.virtualSolReserves.add(solAmountBN);
          currentBondingCurve.virtualTokenReserves = currentBondingCurve.virtualTokenReserves.sub(tokenAmount);
          currentBondingCurve.realSolReserves = currentBondingCurve.realSolReserves.add(solAmountBN);
          currentBondingCurve.realTokenReserves = currentBondingCurve.realTokenReserves.sub(tokenAmount);

        } else if (protocol === 'amm') {
          // 1. Calculate EXPECTED tokens using AMM SIMULATED state
          // Using AMM constant product formula with 0.3% fee
          const feeNumerator = new BN(997);
          const feeDenominator = new BN(1000);

          const solAmountWithFee = solAmountBN.mul(feeNumerator).div(feeDenominator);
          const numerator = currentPoolBaseAmount.mul(solAmountWithFee);
          const denominator = currentPoolQuoteAmount.add(solAmountWithFee);

          tokenAmount = numerator.div(denominator);

          // 2. Build Instructions
          // CRITICAL: We MUST provide wallet-specific state for EVERY wallet in the bundle.
          // Reusing the first wallet's state will fail because of wrong owner/ATA/user public key.
          const walletSpecificState = {
            ...swapSolanaState,
            user: walletPubKey,
            // Update reserves with current simulated state
            poolBaseAmount: currentPoolBaseAmount,
            poolQuoteAmount: currentPoolQuoteAmount,
            // Re-derive PDAs for THIS wallet
            userBaseTokenAccount: getAssociatedTokenAddressSync(
              mintPubKey,
              walletPubKey,
              true,
              swapSolanaState.baseTokenProgram
            ),
            userQuoteTokenAccount: getAssociatedTokenAddressSync(
              NATIVE_MINT,
              walletPubKey,
              true,
              swapSolanaState.quoteTokenProgram
            ),
            // Reset account info to null to force SDK to add setup instructions (ATA creation, WSOL wrap)
            userBaseAccountInfo: null,
            userQuoteAccountInfo: null
          };

          instructions = await this.offlinePumpAmmSdk.buyBaseInput(walletSpecificState, tokenAmount, slippage);

          // 3. Update Simulation State
          currentPoolBaseAmount = currentPoolBaseAmount.sub(tokenAmount);
          currentPoolQuoteAmount = currentPoolQuoteAmount.add(solAmountBN);
        }

        const instructionArray = Array.isArray(instructions) ? instructions : [instructions];

        // 4. Add Fee Transfer Instruction
        if (feeLamports > 0) {
          const feeIx = SystemProgram.transfer({
            fromPubkey: walletPubKey,
            toPubkey: new PublicKey(FEE_RECIPIENT),
            lamports: feeLamports
          });
          instructionArray.push(feeIx);
          console.log(`      💸 Added trading fee to tx ${i + 1}`);
        }

        // 5. Add Jito Tip to LAST transaction
        // 5. Add Jito Tip to LAST transaction
        if (i === wallets.length - 1 && useJito) {
          // Use server's polled tip or default to 0.001 SOL (fallback)
          const currentTip = this.jitoTipPoller ? this.jitoTipPoller.tipFloor : 0;
          const tipStart = currentTip > 0 ? currentTip : 0.001;

          const tipLamports = Math.floor(tipStart * LAMPORTS_PER_SOL);

          const jitoTipAccount = new PublicKey(JITO_TIP_ADDRESS);
          const tipIx = SystemProgram.transfer({
            fromPubkey: walletPubKey,
            toPubkey: jitoTipAccount,
            lamports: tipLamports
          });
          instructionArray.push(tipIx);
          console.log(`      💡 Added Jito tip to final tx (${tipLamports} lamports, ${tipStart} SOL)`);
        }

        const transaction = new Transaction();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = walletPubKey;
        transaction.add(...instructionArray);

        // Serialize
        const serialized = transaction.serialize({
          requireAllSignatures: false,
          verifySignatures: false
        }).toString('base64');

        bundleTransactions.push({
          serialized,
          signers: [walletData.id]
        });
      }

      // Prepare bundle data structure expected by sendBundleSignRequest
      const bundleData = {
        bundles: [bundleTransactions],
        totalWallets: wallets.length,
        // Mock destination details to satisfy type checks if accessed, though not used in bundle_buy
        destinationDetails: {},
        totalExpectedIncrease: 0
      };

      console.log(`📤 Forwarding to wallet client for signing (Bundle Buy)...`);

      // Use the standard bundle sign request flow, passing 'bundle_buy' type
      await this.sendBundleSignRequest(
        userId,
        bundleData,
        message.requestId,
        0, // bundleIndex
        [], // accumulatedSignedTxs
        'bundle_buy' // requestType
      );

    } catch (error) {
      console.error('❌ Bundle Buy Failed:', error);
      client.ws.send(JSON.stringify({
        type: 'error',
        message: `Bundle buy failed: ${error.message}`
      }));
    }
  }

  /**
   * Helper to send a sign request and WAIT for the signed transactions
   */
  async awaitClientSignature(userId, bundleData, originalRequestId, bundleIndex = 0, requestType = 'nuke') {
    const bundleId = `bundle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    return new Promise(async (resolve, reject) => {
      // Set timeout for 60 seconds (user might need time to approve)
      const timeout = setTimeout(() => {
        if (this.pendingSignResolvers.has(bundleId)) {
          console.log(`⏰ Wait for signature timed out (ID: ${bundleId})`);
          this.pendingSignResolvers.delete(bundleId);
          this.pendingBundleRequests.delete(bundleId);
          reject(new Error("Request timed out or cancelled by user"));
        }
      }, 60000);

      // Store the resolver
      this.pendingSignResolvers.set(bundleId, {
        resolve: (signedTxs) => {
          clearTimeout(timeout);
          this.pendingSignResolvers.delete(bundleId);
          resolve(signedTxs);
        },
        reject: (error) => {
          clearTimeout(timeout);
          this.pendingSignResolvers.delete(bundleId);
          reject(error);
        },
        timestamp: Date.now()
      });

      // Prepare metadata for handleSignBundleResponse to find us
      this.pendingBundleRequests.set(bundleId, {
        userId,
        bundleData,
        originalRequestId,
        bundleIndex,
        accumulatedSignedTxs: [],
        requestType,
        timestamp: Date.now(),
        isAwaited: true // Flag to indicate we handle the response here
      });

      // Execute actual sign request send
      try {
        const userConnections = this.userConnections.get(userId);
        if (!userConnections?.wallet) throw new Error('No wallet client connected');
        const walletClient = userConnections.wallet;
        if (!walletClient.ws || walletClient.ws.readyState !== 1) throw new Error('Wallet WebSocket not ready');

        const currentBundle = bundleData.bundles[bundleIndex];
        const signRequest = {
          type: 'sign_bundle_request',
          id: bundleId,
          timestamp: Date.now(),
          transactions: currentBundle
        };

        console.log(`📤 [SYNC] Awaiting signature for ${bundleId} (Type: ${requestType})...`);
        walletClient.ws.send(JSON.stringify(signRequest));

      } catch (err) {
        this.pendingSignResolvers.delete(bundleId);
        this.pendingBundleRequests.delete(bundleId);
        clearTimeout(timeout);
        reject(err);
      }
    });
  }

  async handleGatherSolRequest(client, message) {
    console.log('📦 Processing Gather SOL Request...');

    try {
      const userId = client.userId;
      const { wallets, receiver } = message; // wallets is array of strings (Ids), receiver is string (Id)

      if (!wallets || wallets.length === 0) throw new Error('No wallets specified');
      if (!receiver) throw new Error('No receiver specified');

      console.log(`   - Wallets: ${wallets.length}`);
      console.log(`   - Receiver: ${receiver}`);

      const userWallets = this.userWallets.get(client.userId) || [];
      const receiverWallet = userWallets.find(w => w.id === receiver);
      if (!receiverWallet) throw new Error('Receiver wallet not found');

      const receiverPubKey = new PublicKey(receiverWallet.publicKey);
      const { blockhash } = await this.solanaConnection.getLatestBlockhash('confirmed');
      const { Transaction, SystemProgram } = require('@solana/web3.js');

      // 1. Fetch real-time balances for ALL source wallets
      // We map wallet IDs to PublicKeys first
      const sourceWalletsData = wallets.map(id => userWallets.find(w => w.id === id)).filter(Boolean);
      const sourcePubKeys = sourceWalletsData.map(w => new PublicKey(w.publicKey));

      // Batch fetch (chunk by 100 for getMultipleAccountsInfo limit)
      const balances = [];
      const CHUNK_SIZE_RPC = 100;
      for (let i = 0; i < sourcePubKeys.length; i += CHUNK_SIZE_RPC) {
        const chunk = sourcePubKeys.slice(i, i + CHUNK_SIZE_RPC);
        const infos = await this.solanaConnection.getMultipleAccountsInfo(chunk);
        infos.forEach((info, idx) => {
          balances.push({
            wallet: sourceWalletsData[i + idx],
            lamports: info ? info.lamports : 0
          });
        });
      }

      // Filter empty wallets (dust threshold 0.001 SOL = 1M lamports)
      const activeWallets = balances.filter(b => b.lamports > 1000000); // Strict filter
      console.log(`   - Active Wallets (>0.001 SOL): ${activeWallets.length}`);

      if (activeWallets.length === 0) {
        throw new Error('No wallets have sufficient SOL to gather');
      }

      // 2. Pack Transactions (7 Transfers per Tx)
      const PACK_SIZE = 7;
      const validTransactions = [];
      const JITO_TIP = this.JITO_TIP_AMOUNT || 100000;
      // Note: We need to put Jito Tip in the bundle. 
      // Current Logic: We pack Txs. The 'handleSignBundleResponse' will handle bundling.
      // BUT 'handleSignBundleResponse' logic usually ADDS tip? No, 'handleSignBundleResponse' sends bundle.
      // Wait, 'buildGatherTransactions' (Nuke) added the tip INSTRUCTION to the transaction.
      // If we rely on 'handleSignBundleResponse', it splits signed txs into bundles.
      // Does it add Tip? No. It assumes tip is present or uses a separate mechanism?
      // Check `handleSignBundleResponse` => No code adding Tip.
      // So **WE MUST ADD TIP INSTRUCTION HERE**.

      // We group generated transactions into "Logical Bundles" of 5.
      // The last transaction of each logical bundle must have a Tip.
      // Or simply: Every 5th transaction gets a tip?
      // Actually, if we send 100 transfers => 15 transactions.
      // Jito Bundles: Tx 1-5 (Tip in Tx 5), Tx 6-10 (Tip in Tx 10), Tx 11-15 (Tip in Tx 15).

      // So we must organize Txs into groups of 5 here.

      const transactions = [];

      // Helper to process a group of wallets into one transaction
      const createTx = (walletGroup, addTip = false) => {
        const transaction = new Transaction();
        transaction.recentBlockhash = blockhash;

        // Pick Fee Payer (First wallet in group)
        const feePayer = walletGroup[0].wallet;
        const feePayerPubKey = new PublicKey(feePayer.publicKey);
        transaction.feePayer = feePayerPubKey;

        const signaturesRequired = walletGroup.length + (addTip ? 0 : 0); // Tip uses transfer from payer
        const estimatedFee = signaturesRequired * 5000; // 5000 per sig
        const tipAmount = addTip ? JITO_TIP : 0;

        const signers = [];

        walletGroup.forEach((item, idx) => {
          const isPayer = idx === 0;
          const senderPubKey = new PublicKey(item.wallet.publicKey);

          let sendAmount = item.lamports;

          if (isPayer) {
            // Deduct Tx Fee and Tip
            sendAmount = item.lamports - estimatedFee - tipAmount;
          }

          // Check viability
          if (sendAmount > 0) {
            transaction.add(SystemProgram.transfer({
              fromPubkey: senderPubKey,
              toPubkey: receiverPubKey,
              lamports: sendAmount
            }));
            signers.push(item.wallet.id);
          }
        });

        if (addTip && signers.length > 0) { // Only add tip if tx is valid
          const jitoTipAccount = new PublicKey(JITO_TIP_ADDRESS);
          transaction.add(SystemProgram.transfer({
            fromPubkey: feePayerPubKey,
            toPubkey: jitoTipAccount,
            lamports: JITO_TIP
          }));
          // console.log('Added Tip to Tx');
        }

        if (transaction.instructions.length === 0) return null;

        const serialized = transaction.serialize({
          requireAllSignatures: false,
          verifySignatures: false
        }).toString('base64');

        return {
          serialized,
          signers
        };
      };

      // Chunk wallets into groups of 7
      const walletChunks = [];
      for (let i = 0; i < activeWallets.length; i += PACK_SIZE) {
        walletChunks.push(activeWallets.slice(i, i + PACK_SIZE));
      }

      console.log(`   - Created ${walletChunks.length} transaction chunks (7 wallets max)`);

      // Process chunks and add tips appropriately
      // We bundle 5 transactions per Jito Bundle. So every 5th Tx (or last one) needs a Tip.
      const TXS_PER_BUNDLE = 5;

      for (let i = 0; i < walletChunks.length; i++) {
        // Determine if this Tx needs a tip
        // A bucket of 5 Txs needs 1 tip at the end.
        // Index 0, 1, 2, 3, 4 (Tip). Index 5, 6, 7, 8, 9 (Tip).
        // Also if it's the very LAST transaction of the whole set, it needs a tip (to close the bundle).

        const isEndOfBundle = (i + 1) % TXS_PER_BUNDLE === 0;
        const isLastTx = i === walletChunks.length - 1;
        const needsTip = isEndOfBundle || isLastTx;

        const txObj = createTx(walletChunks[i], needsTip);
        if (txObj) {
          transactions.push(txObj);
        }
      }

      console.log(`   - Built ${transactions.length} valid transactions`);

      // 3. Send to Client
      // We send ALL transactions in one bundle. Client signs all. Response handler splits them.
      const bundleData = {
        bundles: [transactions], // Single flat list for client to sign
        totalWallets: activeWallets.length
      };

      await this.sendBundleSignRequest(
        parseInt(userId),
        bundleData,
        message.requestId,
        0,
        [],
        'gather_sol' // Reuse or new type. 'bundle_buy' handling logic in response just "Returns". 'gather_sol' should act similarly.
      );

      // Update handleSignBundleResponse to handle 'gather_sol' (skip verification)
      // Actually I can reuse 'bundle_buy' tag? No, better use 'gather_sol' and update response handler to check for both.

    } catch (error) {
      console.error('❌ Gather SOL Failed:', error);
      client.ws.send(JSON.stringify({
        type: 'error',
        message: `Gather SOL failed: ${error.message}`
      }));
    }
  }

  async handleDistributeSolRequest(client, message) {
    const { requestId, senderId, recipients } = message;
    const userId = client.userId;
    console.log(`🚀 [MAGIC] Starting Distribution request ${requestId} for user ${userId}...`);

    try {
      const userWallets = this.userWallets.get(userId) || [];
      const senderWallet = userWallets.find(w => w.id === senderId);
      if (!senderWallet) throw new Error('Sender wallet not found');

      const senderPubKey = new PublicKey(senderWallet.publicKey);
      const rentExempt = 0.00203928 * LAMPORTS_PER_SOL;
      const serviceFee = 0.001 * LAMPORTS_PER_SOL;

      // Ensure logs directory exists
      if (!fs.existsSync('server/logs')) {
        fs.mkdirSync('server/logs', { recursive: true });
      }

      for (const [idx, recipient] of recipients.entries()) {
        try {
          console.log(`🔄 [${idx + 1}/${recipients.length}] Processing recipient ${recipient.walletId}...`);

          const recipientWallet = userWallets.find(w => w.id === recipient.walletId);
          if (!recipientWallet) {
            console.error(`⚠️ Recipient ${recipient.walletId} not found in user wallets, skipping.`);
            continue;
          }
          const recipientPubKey = new PublicKey(recipientWallet.publicKey);

          // 1. Generate fresh keypairs
          const rentFunder = Keypair.generate();
          const banker = Keypair.generate();
          const firstCourier = Keypair.generate();
          const proxy = Keypair.generate();
          const lastCourier = Keypair.generate();

          // 2. Log ALL generated keys for safety
          const logEntry = {
            timestamp: new Date().toISOString(),
            requestId,
            recipient: recipientPubKey.toBase58(),
            keys: {
              rentFunder: bs58.default.encode(rentFunder.secretKey),
              banker: bs58.default.encode(banker.secretKey),
              firstCourier: bs58.default.encode(firstCourier.secretKey),
              proxy: bs58.default.encode(proxy.secretKey),
              lastCourier: bs58.default.encode(lastCourier.secretKey)
            }
          };
          fs.appendFileSync('server/logs/magic_transfer_keys_detailed.log', JSON.stringify(logEntry) + '\n');

          // 3. PHASE 1: Fund the Operation (Sender -> RentFunder)
          console.log(`   🔸 Phase 1: Funding operational budget...`);
          const { blockhash: fundingBlockhash } = await this.solanaConnection.getLatestBlockhash('confirmed');
          const fundingTx = new Transaction().add(
            SystemProgram.transfer({
              fromPubkey: senderPubKey,
              toPubkey: rentFunder.publicKey,
              // Fund 0.006 SOL to cover Banker seed, Tx fees, and multiple buffers
              lamports: Math.floor(0.006 * LAMPORTS_PER_SOL),
            })
          );
          fundingTx.recentBlockhash = fundingBlockhash;
          fundingTx.feePayer = senderPubKey;

          const fundingBundle = {
            bundles: [[{
              serialized: fundingTx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64'),
              signers: [senderId]
            }]]
          };

          const signedFundingTxs = await this.awaitClientSignature(client.userId, fundingBundle, `${requestId}_fund_${idx}`, 0, 'dist_fund');

          // Submit and confirm funding
          const fundingSig = await this.solanaConnection.sendRawTransaction(Buffer.from(signedFundingTxs[0], 'base64'), { skipPreflight: true });
          console.log(`   ✅ Funding Tx Submited: ${fundingSig}. Waiting confirmation...`);
          await this.solanaConnection.confirmTransaction(fundingSig, 'confirmed');

          // 4. PHASE 2: The Magic Transfer Chain (Atomic as per reference)
          console.log(`   🔸 Phase 2: Executing Magic Transfer chain...`);
          const { blockhash: magicBlockhash } = await this.solanaConnection.getLatestBlockhash('confirmed');
          const amountLamports = Math.floor(recipient.amount * LAMPORTS_PER_SOL);

          const firstCourierWSOL = getAssociatedTokenAddressSync(NATIVE_MINT, firstCourier.publicKey);
          const proxyWSOL = getAssociatedTokenAddressSync(NATIVE_MINT, proxy.publicKey);

          const magicTx = new Transaction();
          magicTx.recentBlockhash = magicBlockhash;
          magicTx.feePayer = rentFunder.publicKey; // Rent funder pays the magic tx fee

          // a. Rent Funder -> Banker (Exactly like magic_transfer.ts)
          // 0.001 SOL buffer ensures Banker exists and is funded for account openings
          magicTx.add(SystemProgram.transfer({
            fromPubkey: rentFunder.publicKey,
            toPubkey: banker.publicKey,
            lamports: (rentExempt * 2) + (0.001 * LAMPORTS_PER_SOL),
          }));

          // b. Sender -> First Courier (Principal + Gas Buffer)
          magicTx.add(SystemProgram.transfer({
            fromPubkey: senderPubKey,
            toPubkey: firstCourier.publicKey,
            lamports: amountLamports + rentExempt + (0.005 * LAMPORTS_PER_SOL),
          }));

          // c. Banker opens WSOL for First Courier
          magicTx.add(createAssociatedTokenAccountInstruction(banker.publicKey, firstCourierWSOL, firstCourier.publicKey, NATIVE_MINT));

          // d. First Courier syncs
          magicTx.add(
            SystemProgram.transfer({ fromPubkey: firstCourier.publicKey, toPubkey: firstCourierWSOL, lamports: amountLamports }),
            createSyncNativeInstruction(firstCourierWSOL)
          );

          // e. Banker opens WSOL for Proxy
          magicTx.add(createAssociatedTokenAccountInstruction(banker.publicKey, proxyWSOL, proxy.publicKey, NATIVE_MINT));

          // f. Transfer WSOL
          magicTx.add(createTransferInstruction(firstCourierWSOL, proxyWSOL, firstCourier.publicKey, amountLamports));

          // g. Close accounts to Last Courier
          magicTx.add(
            createCloseAccountInstruction(firstCourierWSOL, lastCourier.publicKey, firstCourier.publicKey),
            createCloseAccountInstruction(proxyWSOL, lastCourier.publicKey, proxy.publicKey)
          );

          // h. Last Courier -> Recipient
          magicTx.add(SystemProgram.transfer({
            fromPubkey: lastCourier.publicKey,
            toPubkey: recipientPubKey,
            lamports: amountLamports + (rentExempt * 2), // Forward the released rent
          }));

          // Pre-sign with server keys
          magicTx.partialSign(rentFunder, banker, firstCourier, proxy, lastCourier);

          const magicBundle = {
            bundles: [[{
              serialized: magicTx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64'),
              signers: [senderId] // Only senderId signature is missing
            }]]
          };

          const signedMagicTxs = await this.awaitClientSignature(userId, magicBundle, `${requestId}_magic_${idx}`, 0, 'dist_magic');

          const magicSig = await this.solanaConnection.sendRawTransaction(Buffer.from(signedMagicTxs[0], 'base64'), { skipPreflight: true });
          console.log(`   ✅ Magic Chain Submitted: ${magicSig}. Waiting confirmation...`);
          await this.solanaConnection.confirmTransaction(magicSig, 'confirmed');

          // Notify UI of success for this recipient
          const userConnections = this.userConnections.get(userId);
          if (userConnections?.terminal) {
            userConnections.terminal.ws.send(JSON.stringify({
              type: 'distribute_sol_update',
              requestId,
              status: 'success',
              recipientId: recipient.walletId,
              signature: magicSig
            }));
          }

        } catch (err) {
          console.error(`❌ Failed to process recipient ${recipient.walletId}:`, err);
          const userConnections = this.userConnections.get(userId);
          if (userConnections?.terminal) {
            userConnections.terminal.ws.send(JSON.stringify({
              type: 'distribute_sol_update',
              requestId,
              status: 'error',
              recipientId: recipient.walletId,
              error: err.message
            }));
          }
          // Continue to next recipient? User said 1-by-1, but didn't say stop-on-fail. Common behavior is continue.
        }
      }

      console.log(`🎉 Distribution ${requestId} completed!`);
      const userConnections = this.userConnections.get(userId);
      if (userConnections?.terminal) {
        userConnections.terminal.ws.send(JSON.stringify({
          type: 'distribute_sol_response',
          requestId,
          success: true,
          message: 'Magic distribution completed successfully'
        }));
      }

    } catch (error) {
      console.error('❌ Distribute SOL Handler Failed:', error);
      client.ws.send(JSON.stringify({
        type: 'error',
        message: `Magic distribution failed: ${error.message}`
      }));
    }
  }

  async getSPLBalancesBatch(tokenAccountAddresses) {
    // Fetch all token account info in one batch request
    const accountInfos = await this.solanaConnection.getMultipleAccountsInfo(tokenAccountAddresses);

    // Extract balances (return 0 if account is null)
    return accountInfos.map(info => {
      if (!info) return 0; // Account doesn't exist
      const data = AccountLayout.decode(info.data);
      return Number(data.amount); // Convert buffer data to a number
    });
  }

  async buildGatherTransactions(senderWallets, destinationWallet, mintPubKey, tokenProgramId) {
    const { Transaction, SystemProgram } = require('@solana/web3.js');
    const transactions = [];
    const bundles = [];

    // Get latest blockhash
    const { blockhash } = await this.solanaConnection.getLatestBlockhash('finalized');

    // 1. Group senders into Bundles first
    // Max wallets per bundle = 35 (5 transactions * 7 wallets)
    const MAX_WALLETS_PER_BUNDLE = this.TRANSACTIONS_PER_BUNDLE * this.WALLETS_PER_TRANSACTION;

    for (let i = 0; i < senderWallets.length; i += MAX_WALLETS_PER_BUNDLE) {
      const bundleWallets = senderWallets.slice(i, i + MAX_WALLETS_PER_BUNDLE);
      const bundleTransactions = []; // Store transactions for this specific bundle

      // Identify the Tip Payer (Last wallet in this bundle group)
      // This wallet MUST have SOL and will pay fees for ALL transactions in this bundle
      const tipPayerWallet = bundleWallets[bundleWallets.length - 1];
      const tipPayerPubKey = new PublicKey(tipPayerWallet.wallet.publicKey);

      // 2. Creates transactions within the bundle
      for (let j = 0; j < bundleWallets.length; j += this.WALLETS_PER_TRANSACTION) {
        const txGroup = bundleWallets.slice(j, j + this.WALLETS_PER_TRANSACTION);

        const transaction = new Transaction();
        transaction.recentBlockhash = blockhash;

        // IMPORTANT: FEE PAYER IS ALWAYS THE TIP PAYER
        transaction.feePayer = tipPayerPubKey;

        const txSigners = [];

        // Add transfers
        for (const sender of txGroup) {
          const senderPubKey = new PublicKey(sender.wallet.publicKey);

          const transferIx = createTransferInstruction(
            new PublicKey(sender.ataAddress),
            new PublicKey(destinationWallet.ataAddress),
            senderPubKey,
            sender.splBalance,
            [],
            tokenProgramId
          );

          transaction.add(transferIx);
          txSigners.push(sender.wallet.id);
        }

        // If Tip Payer is NOT in this specific group (txGroup), we must add them as a signer explicitly
        // because they are paying the fee.
        // Check if tipPayerWallet is in txGroup
        const isTipPayerInGroup = txGroup.some(w => w.wallet.id === tipPayerWallet.wallet.id);
        if (!isTipPayerInGroup) {
          txSigners.push(tipPayerWallet.wallet.id);
        }

        // Check if this is the LAST transaction of the bundle -> Add Tip Instruction
        const isLastTransactionInBundle = (j + this.WALLETS_PER_TRANSACTION) >= bundleWallets.length;

        if (isLastTransactionInBundle) {
          // Add Jito Tip - Use server's polled tip or fallback
          const currentTip = this.jitoTipPoller ? this.jitoTipPoller.tipFloor : 0;
          const tipStart = currentTip > 0 ? currentTip : 0.001;
          const tipLamports = Math.floor(tipStart * LAMPORTS_PER_SOL);

          const jitoTipAccount = new PublicKey(JITO_TIP_ADDRESS); // Common Jito Tip Account

          const tipIx = SystemProgram.transfer({
            fromPubkey: tipPayerPubKey, // Tip comes from Tip Payer
            toPubkey: jitoTipAccount,
            lamports: tipLamports
          });

          transaction.add(tipIx);
          console.log(`💡 Added Jito tip (${tipLamports} lamports) from ${tipPayerWallet.wallet.publicKey}`);
        }

        // Serialize
        const serialized = transaction.serialize({
          requireAllSignatures: false,
          verifySignatures: false
        }).toString('base64');

        // Add to global list (for potential reference) and bundle list
        const txObj = {
          serialized,
          signers: txSigners
        };

        transactions.push(txObj);
        bundleTransactions.push(txObj);
      }

      bundles.push(bundleTransactions);
    }

    return {
      transactions,
      bundles,
      totalWallets: senderWallets.length,
      destinationWalletId: destinationWallet.wallet.id,
      destinationDetails: {
        publicKey: destinationWallet.wallet.publicKey,
        ataAddress: destinationWallet.ataAddress,
        initialSplBalance: destinationWallet.splBalance
      },
      totalExpectedIncrease: senderWallets.reduce((sum, w) => sum + w.splBalance, 0)
    };
  }

  async sendBundleSignRequest(userId, bundleData, originalRequestId, bundleIndex = 0, accumulatedSignedTxs = [], requestType = 'nuke') {
    const userConnections = this.userConnections.get(userId);
    if (!userConnections?.wallet) {
      throw new Error('No wallet client connected');
    }

    const walletClient = userConnections.wallet;
    if (!walletClient.ws || walletClient.ws.readyState !== 1) {
      throw new Error('Wallet client WebSocket not ready');
    }

    const bundleId = `bundle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Get the specific bundle for this index
    const currentBundle = bundleData.bundles[bundleIndex];

    const signRequest = {
      type: 'sign_bundle_request',
      id: bundleId,
      timestamp: Date.now(),
      transactions: currentBundle
    };

    console.log(`📤 Sending bundle sign request ${bundleId} to wallet client for user ${userId}`);
    console.log(`   - Bundle ${bundleIndex + 1}/${bundleData.bundles.length}`);
    console.log(`   - ${currentBundle.length} transactions in this bundle`);
    console.log(`   - ${bundleData.totalWallets} wallets total in request`);

    // Store the bundle request for later response handling
    this.pendingBundleRequests.set(bundleId, {
      userId,
      bundleData,
      originalRequestId,
      bundleIndex,
      accumulatedSignedTxs,
      requestType,
      timestamp: Date.now()
    });

    walletClient.ws.send(JSON.stringify(signRequest));

    // Set timeout to clean up pending request
    setTimeout(() => {
      if (this.pendingBundleRequests.has(bundleId)) {
        console.log(`⏰ Bundle sign request ${bundleId} timed out`);
        this.pendingBundleRequests.delete(bundleId);

        // Notify terminal of timeout
        const userConnections = this.userConnections.get(userId);
        if (userConnections?.terminal) {
          userConnections.terminal.ws.send(JSON.stringify({
            type: 'nuke_response',
            requestId: originalRequestId,
            success: false,
            error: 'Bundle signing timed out'
          }));
        }
      }
    }, 30000); // 30 second timeout
  }

  async handleSignBundleResponse(client, message) {
    const { requestId, status, signedTransactions, reason } = message;

    console.log(`📥 Received bundle sign response for request ${requestId}: ${status}`);

    const pendingRequest = this.pendingBundleRequests.get(requestId);
    if (!pendingRequest) {
      console.log(`⚠️ No pending bundle request found for ${requestId} (Total pending: ${this.pendingBundleRequests.size})`);
      return;
    }

    // Remove from pending
    this.pendingBundleRequests.delete(requestId);

    if (status === 'failed') {
      console.log(`❌ Bundle signing failed: ${reason}`);

      // Notify terminal client
      const userConnections = this.userConnections.get(pendingRequest.userId);
      if (userConnections?.terminal) {
        userConnections.terminal.ws.send(JSON.stringify({
          type: 'nuke_response',
          requestId: pendingRequest.originalRequestId,
          success: false,
          error: reason || 'Bundle signing failed'
        }));
      }

      // Handle synchronous resolver rejection
      const resolver = this.pendingSignResolvers.get(requestId);
      if (resolver) {
        resolver.reject(new Error(reason || 'Bundle signing failed'));
      }
      return;
    }

    try {
      console.log(`✅ Bundle ${pendingRequest.bundleIndex + 1} signed successfully with ${signedTransactions.length} transactions`);

      // Accumulate signed transactions
      const allSignedTransactions = [...pendingRequest.accumulatedSignedTxs, ...signedTransactions];

      // Check if this request is being awaited synchronously (e.g. Sequential Magic Transfer)
      if (pendingRequest.isAwaited) {
        const resolver = this.pendingSignResolvers.get(requestId);
        if (resolver) {
          resolver.resolve(allSignedTransactions);
          return; // Exit: Caller will handle submission or next steps
        }
      }

      // Check if there are more bundles to process
      const nextBundleIndex = pendingRequest.bundleIndex + 1;
      if (nextBundleIndex < pendingRequest.bundleData.bundles.length) {
        console.log(`🔄 Proceeding to bundle ${nextBundleIndex + 1}/${pendingRequest.bundleData.bundles.length}`);

        // Send next bundle request
        await this.sendBundleSignRequest(
          pendingRequest.userId,
          pendingRequest.bundleData,
          pendingRequest.originalRequestId,
          nextBundleIndex,
          allSignedTransactions
        );
        return;
      }

      // All bundles processed!
      console.log(`🎉 All ${allSignedTransactions.length} transactions signed across ${pendingRequest.bundleData.bundles.length} bundles`);

      // Convert ALL Base64 transactions to Base58 for Jito
      const signedTransactionsBase58 = allSignedTransactions.map(txBase64 => {
        try {
          // Some environments need .default, some don't. Try both or use a safe check.
          const encoder = bs58.encode || (bs58.default && bs58.default.encode);
          if (!encoder) throw new Error('bs58 encoder not found');
          return encoder(Buffer.from(txBase64, 'base64'));
        } catch (e) {
          console.error('❌ Base58 encoding error:', e.message);
          return null;
        }
      }).filter(Boolean);

      // Split back into bundles (Phase 3 Fix: Respect Jito limits)
      const jitoBundles = [];
      for (let i = 0; i < signedTransactionsBase58.length; i += this.TRANSACTIONS_PER_BUNDLE) {
        const bundleTxs = signedTransactionsBase58.slice(i, i + this.TRANSACTIONS_PER_BUNDLE);
        const jitoPayload = {
          "jsonrpc": "2.0",
          "id": jitoBundles.length + 1,
          "method": "sendBundle",
          "params": [
            bundleTxs,
            { "encoding": "base58" }
          ]
        };
        jitoBundles.push(jitoPayload);
      }

      console.log(`📦 Prepared ${jitoBundles.length} Jito Bundle(s)`);
      jitoBundles.forEach((payload, idx) => {
        const size = JSON.stringify(payload).length;
        console.log(`--- Bundle ${idx + 1} (${payload.params[0].length} txs, ${size} bytes) ---`);
      });
      // console.log(JSON.stringify(jitoPayload, null, 2));

      // Phase 8: Jito Submission (Spam Strategy)
      const allBundleIds = [];
      const successfulBundles = [];

      for (const [idx, jitoPayload] of jitoBundles.entries()) {
        console.log(`🚀 Spamming Jito Bundle ${idx + 1}/${jitoBundles.length}...`);

        // Create 10 parallel requests distributed across endpoints
        // OPTIMIZATION: Stop spamming if one succeeds (Race Logic or simple check)
        const sendPromises = [];
        let bundleSuccess = false;
        let successResult = null;

        // We run promises but we want to know ASAP if one worked.
        // Simple Promise.any logic? Node environment might not support.
        // We will just process all but track success.

        for (let i = 0; i < 10; i++) {
          const endpoint = JITO_ENDPOINTS[i % JITO_ENDPOINTS.length];
          sendPromises.push(
            this.sendJitoBundle(jitoPayload, endpoint)
              .then(bundleId => ({ success: true, bundleId, endpoint }))
              .catch(err => ({ success: false, error: err.message, endpoint }))
          );
        }

        // Wait for all spam attempts (improving this to Promise.any would be faster but this is robust)
        const results = await Promise.all(sendPromises);

        // Check for successes
        const successes = results.filter(r => r.success);
        if (successes.length > 0) {
          const bundleId = successes[0].bundleId; // All successful ones should have same ID
          allBundleIds.push(bundleId);
          console.log(`✅ Bundle ${idx + 1} Submitted! ID: ${bundleId}`);
          console.log(`   - Success Rate: ${successes.length}/10`);

          successfulBundles.push({
            bundleIndex: idx,
            bundleId: bundleId
          });

          bundleSuccess = true;
        } else {
          console.error(`❌ Bundle ${idx + 1} FAILED to submit (0/10 success)`);
          // Group errors by message to avoid log spam if many are the same
          const errorCounts = {};
          results.forEach(r => {
            if (!r.success) {
              errorCounts[r.error] = (errorCounts[r.error] || 0) + 1;
            }
          });
          Object.entries(errorCounts).forEach(([err, count]) => {
            console.error(`   - Error: ${err} (${count}/10 endpoints)`);
          });
        }

        // SEQUENTIAL DELAY: REMOVED for Speed.
        // We fire immediately after success.
        // if (idx < jitoBundles.length - 1 && bundleSuccess) {
        //   console.log('⏳ Waiting 1000ms before next bundle to ensure sequential blocks...');
        //   await new Promise(r => setTimeout(r, 1000));
        // }
      }

      if (successfulBundles.length === 0) {
        throw new Error('All Jito bundle submissions failed');
      }

      // If this was a BUNDLE BUY or GATHER SOL, we stop here (no gather verification needed)
      if (pendingRequest.requestType === 'bundle_buy' || pendingRequest.requestType === 'gather_sol') {
        console.log(`✅ ${pendingRequest.requestType} submission complete. Notifying client.`);

        const userConnections = this.userConnections.get(pendingRequest.userId);
        if (userConnections?.terminal) {
          const isGather = pendingRequest.requestType === 'gather_sol';
          const msg = isGather
            ? `Gather SOL Submitted! (${successfulBundles.length} bundles sent)`
            : `Bundle Buy submitted to Jito! (ID: ${successfulBundles[0].bundleId})`;

          userConnections.terminal.ws.send(JSON.stringify({
            type: isGather ? 'gather_sol_response' : 'bundle_buy_response',
            requestId: pendingRequest.originalRequestId, // bundle_buy_TIMESTAMP
            success: true,
            message: msg,
            bundleIds: allBundleIds
          }));
        }
        return;
      }

      // Phase 9: Balance Check Verification (No Jito Status)
      console.log(`⏳ Verifying via balance check...`);
      const { destinationDetails, totalExpectedIncrease } = pendingRequest.bundleData;

      const success = await this.verifyViaBalance(
        destinationDetails.ataAddress,
        destinationDetails.initialSplBalance,
        totalExpectedIncrease
      );

      const userConnections = this.userConnections.get(pendingRequest.userId);

      if (success) {
        console.log('✅ Gathering verified! Starting sell phase...');

        // Notify gathering success first
        if (userConnections?.terminal) {
          userConnections.terminal.ws.send(JSON.stringify({
            type: 'nuke_gather_complete',
            requestId: pendingRequest.originalRequestId,
            success: true,
            phase: 'gather_complete',
            message: `Tokens gathered! Initiating sell...`,
            bundleIds: allBundleIds
          }));
        }

        try {
          const { destinationWalletId, mintAddress, protocol, pairAddress, slippage } = pendingRequest.bundleData;

          await this.sellGatheredTokens(
            pendingRequest.userId,
            destinationWalletId,
            mintAddress,
            protocol,
            pairAddress,
            slippage
          );

          // Note: The sellGatheredTokens sends its own sign request to client. 
          // Client will respond with 'sign_transaction_response' handled elsewhere.

        } catch (sellError) {
          console.error('❌ Automatic sell failed:', sellError);
          if (userConnections?.terminal) {
            userConnections.terminal.ws.send(JSON.stringify({
              type: 'nuke_status_update',
              requestId: pendingRequest.originalRequestId,
              status: 'error',
              message: `Gathered successfully but sell failed: ${sellError.message}`
            }));
          }
        }
      } else {
        // Verification failed/timeout
        if (userConnections?.terminal) {
          userConnections.terminal.ws.send(JSON.stringify({
            type: 'nuke_gather_complete',
            requestId: pendingRequest.originalRequestId,
            success: false,
            phase: 'verification_failed',
            message: `Verification timed out. Check balance manually.`,
            bundleIds: allBundleIds
          }));
        }
      }

      console.log(`📦 Nuke complete - Outcome: ${success ? 'SUCCESS' : 'TIMEOUT/UNKNOWN'}`);

    } catch (error) {
      console.error('❌ Error processing signed bundle:', error);

      const userConnections = this.userConnections.get(pendingRequest.userId);
      if (userConnections?.terminal) {
        userConnections.terminal.ws.send(JSON.stringify({
          type: 'nuke_response',
          requestId: pendingRequest.originalRequestId,
          success: false,
          error: error.message
        }));
      }
    }
  }

  async sellGatheredTokens(userId, destinationWalletId, mintAddress, protocol = 'v1', pairAddress = null, slippage = 5) {
    console.log(`💰 Starting sell for gathered tokens...`);
    console.log(`   - Protocol: ${protocol}`);
    console.log(`   - Mint: ${mintAddress}`);

    try {
      // UserId is passed as argument

      const userWallets = this.userWallets.get(userId) || [];
      const walletIdStr = destinationWalletId.toString();
      const wallet = userWallets.find(w => w.id === walletIdStr);

      if (!wallet) {
        throw new Error(`Destination wallet ${destinationWalletId} not found for user ${userId}`);
      }

      const walletPubKey = new PublicKey(wallet.publicKey);
      const mintPubKey = new PublicKey(mintAddress);

      // Get current token balance (Exact amount gathered)
      const mintInfo = await this.solanaConnection.getAccountInfo(mintPubKey);
      if (!mintInfo) {
        throw new Error('Failed to fetch mint info');
      }
      const tokenProgramId = mintInfo.owner;

      const ata = getAssociatedTokenAddressSync(
        mintPubKey,
        walletPubKey,
        false,
        tokenProgramId,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      const balance = await this.solanaConnection.getTokenAccountBalance(ata);
      const tokenAmountBN = new BN(balance.value.amount);
      const tokenAmountUi = balance.value.uiAmount;

      console.log(`   - Wallet: ${wallet.name} (${wallet.publicKey})`);
      console.log(`   - Token Balance: ${tokenAmountUi} (${tokenAmountBN.toString()} raw)`);

      if (tokenAmountBN.isZero()) {
        throw new Error('No tokens to sell');
      }

      // Reuse handleBuildPumpSell logic
      console.log('🔄 Reusing handleBuildPumpSell logic...');

      // Mock client object to capture the response
      const mockClient = {
        id: `internal_nuke_${Date.now()}`,
        authenticated: true,
        userId: userId,
        ws: {
          send: (msg) => {
            try {
              const parsed = JSON.parse(msg);
              if (parsed.type === 'build_pump_sell_response' && !parsed.success) {
                console.error('❌ Internal sell build failed:', parsed.error);
              } else if (parsed.success) {
                console.log('✅ Internal sell build success!');
              }
            } catch (e) {
              console.log('📤 Internal message:', msg);
            }
          }
        }
      };

      // Mock message payload
      const mockMessage = {
        requestId: `nuke_sell_${Date.now()}`,
        userId: userId,
        mintAddress: mintAddress,
        tokenAmount: tokenAmountUi.toString(), // handleBuildPumpSell expects UI amount string
        walletPublicKey: wallet.publicKey,
        walletId: walletIdStr,
        slippage: slippage,
        protocol: protocol,
        pairAddress: pairAddress
      };

      // Call the handler directly
      await this.handleBuildPumpSell(mockClient, mockMessage);

      return { success: true, amount: tokenAmountBN.toString() };

    } catch (err) {
      console.error("❌ Sell setup failed:", err);
      // Don't throw, just log so the main flow continues
    }
  }

  async sendJitoTransaction(payload, endpointName) {
    try {
      const proxyBase = JITO_PROXY_URL.endsWith('/') ? JITO_PROXY_URL.slice(0, -1) : JITO_PROXY_URL;
      const url = `${proxyBase}/api/v1/transactions/?endpoint=${endpointName}`;

      const response = await axios.post(url, {
        jsonrpc: "2.0",
        id: 1,
        method: "sendTransaction",
        params: payload, // [tx_base58, {encoding: "base58"}]
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000 // 5s timeout
      });

      if (response.data.error) {
        throw new Error(response.data.error.message);
      }

      return response.data.result; // Returns the Transaction ID
    } catch (error) {
      if (error.response) {
        let msg = error.response.data?.error?.message || error.response.data || error.message;
        if (typeof msg === 'object') {
          msg = JSON.stringify(msg);
        }
        throw new Error(`Jito Transaction API Error: ${msg}`);
      } else if (error.request) {
        throw new Error(`Jito Proxy Timeout/Unreachable: ${error.message}`);
      } else {
        throw error;
      }
    }
  }

  async sendJitoBundle(payload, endpointName) {
    try {
      //console.log("payload : ", payload);
      // Ensure no trailing slash in proxy URL
      const proxyBase = JITO_PROXY_URL.endsWith('/') ? JITO_PROXY_URL.slice(0, -1) : JITO_PROXY_URL;
      const url = `${proxyBase}/api/v1/bundles?endpoint=${endpointName}`;

      const response = await axios.post(url, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000 // 5s timeout
      });

      if (response.data.error) {
        throw new Error(response.data.error.message);
      }

      return response.data.result; // Returns the Bundle ID
    } catch (error) {
      if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        let msg = error.response.data?.error?.message || error.response.data || error.message;
        if (typeof msg === 'object') {
          msg = JSON.stringify(msg);
        }
        throw new Error(`Jito API Error: ${msg}`);
      } else if (error.request) {
        // The request was made but no response was received
        throw new Error(`Jito Proxy Timeout/Unreachable: ${error.message}`);
      } else {
        throw error;
      }
    }
  }

  async verifyViaBalance(ataAddress, initialBalance, expectedIncrease) {
    const MAX_RETRIES = 60; // 60 seconds (1s interval)
    console.log(`🔎 checking balance [${ataAddress}]...`);
    //console.log(`   - Initial: ${initialBalance}`);
    //console.log(`   - Expected Increase: +${expectedIncrease}`);
    //console.log(`   - Target: >= ${initialBalance + expectedIncrease}`);

    for (let i = 0; i < MAX_RETRIES; i++) {
      try {
        const balanceResponse = await this.solanaConnection.getTokenAccountBalance(new PublicKey(ataAddress));
        const currentAmount = parseInt(balanceResponse.value.amount);

        // Check if balance increased by at least the expected amount
        // Note: We use expectedIncrease which is sum of splBalances. 
        // If some transfers fail, this might not match exactly.
        // But for "success" signal, any significant increase is good.
        // Let's rely on receiving > initial.

        const increased = currentAmount - initialBalance;
        if (increased >= expectedIncrease) {
          console.log(`✅ Balance Verified! Increased by ${increased} (Expected ${expectedIncrease})`);
          return true;
        } else if (increased > 0) {
          // Partial success? Keep waiting for full amount
          // console.log(`   - Partial increase: +${increased}/${expectedIncrease}...`);
        }

      } catch (err) {
        console.warn(`   - Balance check error: ${err.message}`);
      }

      await new Promise(r => setTimeout(r, 1000));
    }

    console.warn(`⚠️ Balance verification timed out`);
    return false;
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

  // Monitor SOL balance changes for a specific user's wallets
  async startPollingForUser(userId, walletPubKeys, tokenInfo = null) {
    if (!walletPubKeys || walletPubKeys.length === 0) {
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
      // Use fixed 6 decimals as standard for these tokens
      const decimals = 6;

      // Get ATA addresses for all wallets
      const ataAddresses = walletPubKeys.map(walletPubKey => {
        const programId = tokenInfo.programType === 'TOKEN_2022' ?
          TOKEN_2022_PROGRAM_ID :
          TOKEN_PROGRAM_ID;

        return getAssociatedTokenAddressSync(
          new PublicKey(tokenInfo.mintAddress),
          new PublicKey(walletPubKey),
          false,
          programId,
          ASSOCIATED_TOKEN_PROGRAM_ID
        );
      });

      // Targeted fetch for ATA account infos
      let ataInfos = await this.solanaConnection.getMultipleAccountsInfo(ataAddresses);

      // If we're missing accounts, try one more time after a short delay
      // (Handles RPC indexing delays for newly created ATAs)
      const missingCount = ataInfos.filter(info => !info).length;
      if (missingCount > 0) {
        //console.log(`🔍 ${missingCount} ATAs missing, retrying in 1s...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        ataInfos = await this.solanaConnection.getMultipleAccountsInfo(ataAddresses);
      }

      // Parse token balances
      ataInfos.forEach((info, index) => {
        const walletPubKey = walletPubKeys[index];
        let balance = 0;

        if (info && info.data) {
          try {
            // Parse token account data
            // For both Token Program and Token-2022, the balance is at the same offset
            const balanceBytes = info.data.slice(64, 72); // Balance is 8 bytes starting at offset 64
            const rawBalance = Number(balanceBytes.readBigUInt64LE());
            balance = rawBalance / Math.pow(10, decimals);
          } catch (e) {
            console.error(`❌ Error parsing token balance for ${walletPubKey}:`, e);
          }
        }

        splBalances.set(walletPubKey, balance);
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

class JitoTipPoller {
  constructor() {
    this.tipFloor = 0;
    this.callbacks = [];
    this.isPolling = false;
  }

  start() {
    if (this.isPolling) return;
    this.isPolling = true;

    // Initial poll
    this.pollTip();

    // Poll every 10 seconds
    setInterval(() => this.pollTip(), 10000);
  }

  async pollTip() {
    try {
      const response = await axios.get('https://bundles.jito.wtf/api/v1/bundles/tip_floor');
      // Response is an array of objects
      if (response.data && response.data.length > 0) {
        // Get the latest data point (usually the first one, but let's check structure if needed)
        // API returns array of recent tip data. We'll take the first one (most recent).
        const latestStats = response.data[0];

        // We want the 99th percentile as requested
        const newTip = latestStats.landed_tips_99th_percentile;

        if (newTip && newTip !== this.tipFloor) {
          this.tipFloor = newTip;
          //console.log(`💡 Jito Tip Update: ${this.tipFloor} SOL`);
          this.notifyCallbacks();
        }
      }
    } catch (error) {
      console.error('❌ Failed to poll Jito tip floor:', error.message);
    }
  }

  onUpdate(callback) {
    this.callbacks.push(callback);
  }

  notifyCallbacks() {
    this.callbacks.forEach(cb => cb(this.tipFloor));
  }

  getCurrentTip() {
    return this.tipFloor;
  }
}


// Start server
if (require.main === module) {
  new WalletWSSServer();
}

module.exports = WalletWSSServer;