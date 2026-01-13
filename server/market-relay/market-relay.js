const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const axios = require('axios');
const https = require('https');
const fetch = require('node-fetch');
require('dotenv').config({ path: '../.env.local' });

const AxiomAuthManager = require('./axiom-auth-manager');
const AxiomWebSocketConnector = require('./axiom-ws-connector');
const MarketDataNormalizer = require('./market-data-normalizer');

class MarketRelayServer {
  constructor() {
    this.port = process.env.MARKET_RELAY_PORT || 8081;
    this.app = express();
    this.httpServer = null; // HTTP server instance
    this.wsHttpServer = null; // Underlying server for WS (http/https)
    this.wss = null;
    this.clients = new Set(); // Connected WebSocket clients
    
    // Axiom components
    this.authManager = new AxiomAuthManager('axiom_session.json');
    this.wsConnector = null;
    this.normalizer = new MarketDataNormalizer();
    
    // OTP flow state (in-memory, cleared on restart)
    this.otpState = new Map(); // email -> { otpJwtToken, timestamp }
    
    // Market data cache (trending separate, pulse categories use registry)
    this.marketData = {
      trending: [],
      solPrice: null,
      lastUpdate: null
    };

    // Raw sample logging (keeps only a few samples per room)
    this.sampleLogCounts = { new_pairs: 0, update_pulse_v2: 0, pulse_v2_snapshot: 0, pulse_v2_delta: 0 };
    this.sampleLogPath = 'axiom-raw-samples.log';

    // Trade subscriptions: client -> Set of tokenMints
    this.clientTradeSubscriptions = new Map();
    // LP cache: tokenMint -> lpAddress
    this.lpCache = new Map();
    // Active trade subscriptions: lpAddress -> Set of clients
    this.activeTradeSubscriptions = new Map();
    // Pulse v2 connector (primary feed)
    this.pulseConnector = null;
    this.pulseData = { snapshot: null, lastDelta: null };
    this.pulseBaseMap = new Map(); // pairAddress -> base metadata from snapshot
    this.pulseSnapshotPath = 'pulse-v2-last-snapshot.json';
    
    // Setup Express app
    this.setupExpress();

    // WebSocket server will be started after Axiom connection is established
    // this.setupWebSocketServer();
    
    // Clean up expired OTP states every 10 minutes
    setInterval(() => {
      this.cleanupOTPStates();
    }, 10 * 60 * 1000);
  }
  
  cleanupOTPStates() {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10 minutes
    
    for (const [email, state] of this.otpState.entries()) {
      if (now - state.timestamp > maxAge) {
        this.otpState.delete(email);
        console.log(`🗑️  Cleaned up expired OTP state for ${email}`);
      }
    }
  }

  logRawSample(room, payload) {
    if (!(room in this.sampleLogCounts)) return;
    if (this.sampleLogCounts[room] >= 5) return; // cap to avoid runaway file growth

    const entry = {
      ts: new Date().toISOString(),
      room,
      payload
    };

    try {
      fs.appendFileSync(this.sampleLogPath, JSON.stringify(entry) + '\n');
      this.sampleLogCounts[room] += 1;
    } catch (err) {
      console.error('⚠️  Failed to write raw sample log:', err.message);
    }
  }

  setupExpress() {
    this.app.use(cors());
    this.app.use(express.json());
    
    // Simple proxy to bypass CORS for pump.fun coin lookup
    this.app.get('/api/pumpfun/coins/:tokenAddress', async (req, res) => {
      const { tokenAddress } = req.params;
      if (!tokenAddress) {
        return res.status(400).json({ success: false, error: 'tokenAddress is required' });
      }
       try {
         const upstream = await fetch(`https://frontend-api-v3.pump.fun/coins/${tokenAddress}`);
         if (!upstream.ok) {
           const body = await upstream.text();
           return res.status(upstream.status).json({ success: false, error: body.substring(0, 200) });
         }
         const data = await upstream.json();
         return res.json({ success: true, data });
       } catch (err) {
         console.error('❌ pump.fun proxy error:', err.message);
         return res.status(500).json({ success: false, error: 'Proxy request failed' });
       }
    });
    
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        connected: this.wsConnector?.isConnected || false,
        clients: this.clients.size,
        solPrice: this.marketData.solPrice
      });
    });
    
    // Admin endpoint for OTP initialization
    this.app.post('/admin/axiom/init', async (req, res) => {
      try {
        const { email, password_b64, otp_code } = req.body;
        
        if (!email || !password_b64) {
          return res.status(400).json({ 
            success: false, 
            error: 'email and password_b64 are required' 
          });
        }
        
        if (!otp_code) {
          // Step 1: Request OTP
          try {
            const otpJwtToken = await this.authManager.performFullLogin(email, password_b64);
            
            // Store OTP state
            this.otpState.set(email, {
              otpJwtToken,
              timestamp: Date.now()
            });
            
            return res.json({ 
              success: true, 
              requires_otp: true,
              message: 'OTP sent to email. Provide otp_code to complete login.'
            });
          } catch (error) {
            return res.status(500).json({ 
              success: false, 
              error: error.message 
            });
          }
        }
        
        // Step 2: Complete login with OTP
        try {
          // Get OTP JWT token from stored state
          const otpState = this.otpState.get(email);
          if (!otpState) {
            return res.status(400).json({ 
              success: false, 
              error: 'OTP flow not started. Call without otp_code first.' 
            });
          }
          
          await this.authManager.loginStep2(otpState.otpJwtToken, otp_code, email, password_b64);
          this.authManager.saveSession();
          
          // Clear OTP state
          this.otpState.delete(email);
          
          // Initialize WebSocket connection after successful auth
          await this.initializeAxiomConnection();
          
          return res.json({ 
            success: true, 
            message: 'Axiom authentication complete' 
          });
        } catch (error) {
          return res.status(500).json({ 
            success: false, 
            error: error.message 
          });
        }
      } catch (error) {
        console.error('Admin endpoint error:', error);
        return res.status(500).json({ 
          success: false, 
          error: 'Internal server error' 
        });
      }
    });
    
    // Get current market data (REST API) - Trending, Final Stretch, Migrated and New Mint, top 20 each
    this.app.get('/api/market-data', (req, res) => {
      res.json({
        success: true,
        data: {
          trending: this.marketData.trending.slice(0, 20),
          finalStretch: this.marketData.finalStretch.slice(0, 20),
          migrated: this.marketData.migrated.slice(0, 20),
          newMint: this.marketData.newMint.slice(0, 20),
          solPrice: this.marketData.solPrice,
          lastUpdate: this.marketData.lastUpdate
        }
      });
    });
    
    // REST API for trending coins - returns cached WebSocket data (no longer fetches from API)
    this.app.get('/api/trending', (req, res) => {
      //console.log('🔥 Returning cached trending data from WebSocket...');

      res.json({
        success: true,
        data: this.marketData.trending.slice(0, 20),
        lastUpdate: this.marketData.lastUpdate
      });

      //console.log(`📤 Returned ${this.marketData.trending.length} cached trending tokens`);
    });

    // Fetch recent trades for a mint (initial load)
    this.app.get('/api/trades', async (req, res) => {
      const tokenMint = req.query.mint;
      if (!tokenMint) {
        return res.status(400).json({ success: false, error: 'mint is required' });
      }

      try {
        const result = await this.fetchRecentTrades(tokenMint);
        return res.json({ success: true, trades: result.trades, lpAddress: result.lpAddress });
      } catch (error) {
        console.error('❌ Failed to fetch recent trades:', error.message);
        return res.status(500).json({ success: false, error: error.message });
      }
    });

    // Fetch holder data for a token
    this.app.get('/api/holders', async (req, res) => {
      const pairAddress = req.query.pairAddress;
      if (!pairAddress) {
        return res.status(400).json({ success: false, error: 'pairAddress is required' });
      }

      try {
        const holders = await this.fetchHolderData(pairAddress);
        return res.json({ success: true, holders });
      } catch (error) {
        console.error('❌ Failed to fetch holder data:', error.message);
        return res.status(500).json({ success: false, error: error.message });
      }
    });

    // Fetch detailed token info for deeper analysis
    this.app.get('/api/token-info', async (req, res) => {
      const pairAddress = req.query.pairAddress;
      if (!pairAddress) {
        return res.status(400).json({ success: false, error: 'pairAddress is required' });
      }

      try {
        const tokenInfo = await this.fetchTokenInfo(pairAddress);
        return res.json({ success: true, tokenInfo });
      } catch (error) {
        console.error('❌ Failed to fetch token info:', error.message);
        return res.status(500).json({ success: false, error: error.message });
      }
    });

    // Fetch pair/token info for a token
    this.app.get('/api/pair-info', async (req, res) => {
      const tokenAddress = req.query.tokenAddress;
      if (!tokenAddress) {
        return res.status(400).json({ success: false, error: 'tokenAddress is required' });
      }

      try {
        const pairInfo = await this.fetchPairInfo(tokenAddress);
        return res.json({ success: true, pairInfo });
      } catch (error) {
        console.error('❌ Failed to fetch pair info:', error.message);
        return res.status(500).json({ success: false, error: error.message });
      }
    });

    // Fetch detailed token info for deeper analysis (duplicate route kept for compatibility)
    this.app.get('/api/token-info', async (req, res) => {
      const pairAddress = req.query.pairAddress;
      if (!pairAddress) {
        return res.status(400).json({ success: false, error: 'pairAddress is required' });
      }

      try {
        const tokenInfo = await this.fetchTokenInfo(pairAddress);
        return res.json({ success: true, tokenInfo });
      } catch (error) {
        console.error('❌ Failed to fetch token info:', error.message);
        return res.status(500).json({ success: false, error: error.message });
      }
    });

    // Fetch pair/token info for a token
    this.app.get('/api/pair-info', async (req, res) => {
      const pairAddress = req.query.pairAddress;
      if (!pairAddress) {
        return res.status(400).json({ success: false, error: 'pairAddress is required' });
      }

      try {
        const pairInfo = await this.fetchPairInfo(pairAddress);
        return res.json({ success: true, pairInfo });
      } catch (error) {
        console.error('❌ Failed to fetch pair info:', error.message);
        return res.status(500).json({ success: false, error: error.message });
      }
    });

    // Fetch top traders for a token
    this.app.get('/api/top-traders', async (req, res) => {
      const pairAddress = req.query.pairAddress;
      if (!pairAddress) {
        return res.status(400).json({ success: false, error: 'pairAddress is required' });
      }

      try {
        const traders = await this.fetchTopTraders(pairAddress);
        return res.json({ success: true, traders });
      } catch (error) {
        console.error('❌ Failed to fetch top traders:', error.message);
        return res.status(500).json({ success: false, error: error.message });
      }
    });

    // Debug endpoint to manually fetch trending tokens
    this.app.post('/debug/fetch-trending', async (req, res) => {
      try {
        console.log('🔧 [DEBUG] Manual trending fetch triggered via API');
        const result = await this.fetchInitialTrendingTokens();
        res.json({
          success: result,
          trendingCount: this.marketData.trending.length,
          message: result ? 'Trending tokens fetched successfully' : 'Failed to fetch trending tokens'
        });
      } catch (error) {
        console.error('🔧 [ERROR] Manual trending fetch failed:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Debug endpoint to check auth status
    this.app.get('/debug/auth-status', (req, res) => {
      const tokens = this.authManager.getTokens();
      const hasValidTokens = tokens && tokens.access_token && tokens.refresh_token;
      res.json({
        hasTokens: !!tokens,
        hasAccessToken: !!tokens?.access_token,
        hasRefreshToken: !!tokens?.refresh_token,
        tokensValid: hasValidTokens,
        email: this.authManager.email
      });
    });
  }

  setupWebSocketServer() {
    const useSSL = process.env.NODE_ENV === 'production' || process.env.MARKET_RELAY_USE_SSL === 'true';
    let serverForWs = null;

    if (useSSL) {
      const sslDir = process.env.MARKET_RELAY_SSL_DIR || '/root/ssl';
      const keyPath = process.env.MARKET_RELAY_SSL_KEY || `${sslDir}/a-trade.pem`;
      const certPath = process.env.MARKET_RELAY_SSL_CERT || `${sslDir}/a-trade-key.pem`;

      try {
        const key = fs.readFileSync(keyPath);
        const cert = fs.readFileSync(certPath);
        this.wsHttpServer = https.createServer({ key, cert }, this.app);
        this.wsHttpServer.listen(this.port, () => {
          console.log(`🔒 Secure WebSocket server (wss) listening on port ${this.port}`);
        });
        serverForWs = this.wsHttpServer;
      } catch (err) {
        console.error(`❌ Failed to load SSL certs (${keyPath}, ${certPath}). Falling back to ws://`, err.message);
      }
    }

    if (!serverForWs) {
      // Plain WS server
      this.wss = new WebSocket.Server({
        port: this.port,
        perMessageDeflate: false
      });
      console.log(`🔌 WebSocket server (ws) listening on port ${this.port}`);
    } else {
      // Bind WS to HTTPS server
      this.wss = new WebSocket.Server({
        server: serverForWs,
        perMessageDeflate: false
      });
    }

    this.wss.on('connection', (ws, req) => {
      const clientIP = req.socket.remoteAddress;
      console.log(`🔌 New market data client connected from ${clientIP}`);
      
      this.clients.add(ws);
      
      // Send initial market data (Trending, Final Stretch, Migrated and New Mint, top 50 each)
      ws.send(JSON.stringify({
        type: 'market_data',
        data: {
          trending: this.marketData.trending.slice(0, 50),
          finalStretch: this.normalizer.tokenRegistry.getTopCategoryTokens('finalStretch', 50),
          migrated: this.normalizer.tokenRegistry.getTopCategoryTokens('migrated', 50),
          newMint: this.normalizer.tokenRegistry.getTopCategoryTokens('newMint', 50),
          solPrice: this.marketData.solPrice,
          lastUpdate: this.marketData.lastUpdate
        }
      }));
      
      // Handle client messages (subscriptions, etc.)
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());
          
          switch (data.type) {
            case 'ping':
              ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
              break;
              
            case 'subscribe':
              // Handle topic subscriptions if needed
              ws.send(JSON.stringify({
                type: 'subscribed',
                topics: data.topics || []
              }));
              break;

            case 'join':
              if (data.room === 'trades' && data.mint) {
                console.log(`📡 Received trade subscription request for mint: ${data.mint}`);
                // Handle trade subscription for a specific token mint
                this.handleTradeSubscription(ws, data.mint).catch(error => {
                  console.error(`Error handling trade subscription for ${data.mint}:`, error.message);
                });
              }
              break;

            case 'leave':
              if (data.room === 'trades' && data.mint) {
                // Handle trade unsubscription
                this.handleTradeUnsubscription(ws, data.mint);
              }
              break;
              
            default:
              console.log(`Unknown message type: ${data.type}`);
          }
        } catch (error) {
          console.error('Error handling client message:', error);
        }
      });
      
      ws.on('close', () => {
        this.clients.delete(ws);

        // Clean up trade subscriptions for this client
        if (this.clientTradeSubscriptions.has(ws)) {
          const clientSubs = this.clientTradeSubscriptions.get(ws);
          for (const tokenMint of clientSubs) {
            this.handleTradeUnsubscription(ws, tokenMint);
          }
          this.clientTradeSubscriptions.delete(ws);
        }

        console.log(`❌ Market data client disconnected`);
      });
      
      ws.on('error', (error) => {
        console.error('WebSocket client error:', error);
        this.clients.delete(ws);
      });
    });
    
    console.log(`🚀 Market Relay WebSocket server started on port ${this.port}`);
  }

  /**
   * Fetch initial trending tokens from Axiom REST API
   */
  async fetchInitialTrendingTokens() {
    try {
      const debugLog = (msg) => {
        console.log(msg);
        fs.appendFileSync('trending_debug.log', new Date().toISOString() + ': ' + msg + '\n');
      };

      debugLog('📡 [DEBUG] fetchInitialTrendingTokens called');

      // Refresh/validate tokens before hitting Axiom API
      if (!await this.authManager.ensureValidAuthentication()) {
        debugLog('⚠️  [ERROR] Cannot fetch trending tokens - authentication required');
        return false;
      }

      // Ensure we have valid authentication
      const url = 'https://api-asia.axiom.trade/meme-trending?timePeriod=24h';
      debugLog('🔗 [DEBUG] API URL: ' + url);

      // Use existing auth session
      debugLog('🔑 [DEBUG] Getting tokens from auth manager...');
      const tokens = this.authManager.getTokens();
      debugLog('🔑 [DEBUG] Auth tokens available: access=' + !!tokens?.access_token + ', refresh=' + !!tokens?.refresh_token);
      if (tokens?.access_token) {
        debugLog('🔑 [DEBUG] Access token preview: ' + tokens.access_token.substring(0, 20) + '...');
      }
      if (!tokens || !tokens.access_token) {
        debugLog('⚠️  [ERROR] No access token available for trending API request');
        return false;
      }
      debugLog('✅ [DEBUG] Tokens validated, proceeding with API call');

      const headers = {
        'accept': 'application/json, text/plain, */*',
        'accept-language': 'en-US,en;q=0.9',
        'cache-control': 'no-cache',
        'cookie': `auth-refresh-token=${tokens.refresh_token}; auth-access-token=${tokens.access_token}`,
        'pragma': 'no-cache',
        'referer': 'https://axiom.trade/',
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36 OPR/120.0.0.0'
      };

      debugLog('🌐 [DEBUG] Making API request...');

      // Add timeout to fetch request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        debugLog('⏰ [DEBUG] Request timeout triggered');
        controller.abort();
      }, 10000); // 10 second timeout

      debugLog('🌐 [DEBUG] Headers being sent: accept=' + headers.accept + ', cookie=' + headers.cookie.substring(0, 50) + '...');

      let fetchStartTime;
      try {
        fetchStartTime = Date.now();
        debugLog('🚀 [DEBUG] Starting fetch request at ' + new Date().toISOString());

        const response = await fetch(url, {
          headers,
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        console.log('📡 [DEBUG] API response status:', response.status, response.statusText);
        console.log('📡 [DEBUG] Response headers:', Object.fromEntries(response.headers.entries()));

        if (!response.ok) {
        console.error(`❌ [ERROR] Failed to fetch trending tokens: ${response.status} ${response.statusText}`);
        const errorText = await response.text();
        console.error('❌ [ERROR] Error response:', errorText.substring(0, 200));
        return false;
        }

        console.log('📦 [DEBUG] Parsing JSON response...');
        const trendingData = await response.json();
        console.log('📦 [DEBUG] Response parsed successfully');
        console.log('📦 [DEBUG] Response type:', typeof trendingData, Array.isArray(trendingData) ? 'array' : 'not array');
        console.log('📦 [DEBUG] Response length/size:', Array.isArray(trendingData) ? trendingData.length : 'N/A');

        if (!Array.isArray(trendingData)) {
          console.log('⚠️  [ERROR] Invalid response format from trending API:', trendingData);
          return false;
        }

        //console.log(`📥 [DEBUG] Received ${trendingData.length} trending tokens from API`);
        if (trendingData.length > 0) {
          //console.log('📥 [DEBUG] First token sample:', JSON.stringify(trendingData[0]).substring(0, 200));
        }
      } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          console.error('❌ [ERROR] API request timed out after 10 seconds');
        } else {
          console.error('❌ [ERROR] API request failed:', error.message);
          console.error('❌ [ERROR] Error stack:', error.stack);
        }
        return false;
      }

      // Normalize trending data
      console.log('🔄 [DEBUG] Normalizing trending data...');
      console.log('🔄 [DEBUG] Raw trending data type:', typeof trendingData, 'isArray:', Array.isArray(trendingData));
      console.log('🔄 [DEBUG] Raw trending data length:', Array.isArray(trendingData) ? trendingData.length : 'N/A');

      try {
        const normalizedTrending = this.normalizer.normalizeTrendingTokens(trendingData);
        console.log(`🔄 [DEBUG] Normalized ${normalizedTrending.length} trending tokens`);

        if (normalizedTrending.length > 0) {
          console.log('🔄 [DEBUG] First normalized token sample:', JSON.stringify(normalizedTrending[0]).substring(0, 200));
        } else {
          console.log('🔄 [ERROR] Normalization returned empty array!');
          console.log('🔄 [DEBUG] First raw token sample:', JSON.stringify(trendingData[0]).substring(0, 200));
        }
      } catch (normalizationError) {
        console.error('🔄 [ERROR] Normalization failed:', normalizationError.message);
        console.error('🔄 [ERROR] Normalization stack:', normalizationError.stack);
        return false;
      }

      // Store trending tokens (keep top 20)
      this.marketData.trending = normalizedTrending.slice(0, 20);
      this.marketData.lastUpdate = new Date().toISOString();

      console.log(`✅ [DEBUG] Stored ${this.marketData.trending.length} trending tokens`);
      console.log(`✅ [DEBUG] Current market data state: trending=${this.marketData.trending.length}, finalStretch=${this.marketData.finalStretch.length}, migrated=${this.marketData.migrated.length}`);

      // Broadcast updated trending list to all connected clients
      console.log(`📡 [DEBUG] Broadcasting updated market data to ${this.clients.size} clients`);
      this.broadcast({
        type: 'market_data',
        data: {
          trending: this.marketData.trending.slice(0, 20),
          finalStretch: this.marketData.finalStretch.slice(0, 20),
          migrated: this.marketData.migrated.slice(0, 20),
          solPrice: this.marketData.solPrice,
          lastUpdate: this.marketData.lastUpdate
        }
      });

      console.log('✅ [SUCCESS] fetchInitialTrendingTokens completed successfully');
      return true;

    } catch (error) {
      console.error('❌ Error fetching initial trending tokens:', error.message);
      return false;
    }
  }

  mapAxiomTradeToClient(tradeItem) {
    if (!tradeItem) return null;
    const timestamp = tradeItem.createdAt ? new Date(tradeItem.createdAt).getTime() : Date.now();
    return {
      txId: tradeItem.signature,
      wallet: tradeItem.makerAddress,
      timestamp,
      type: tradeItem.type === 'buy' ? 'buy' : 'sell',
      spotPriceSol: tradeItem.priceSol ?? 0,
      usdPricePerToken: tradeItem.priceUsd ?? null,
      solAmount: tradeItem.totalSol ?? 0,
      usdAmount: tradeItem.totalUsd ?? 0,
      tokenAmount: tradeItem.tokenAmount ?? 0,
      virtualSolReserves: tradeItem.liquiditySol ?? null,
      virtualTokenReserves: tradeItem.liquidityToken ?? null
    };
  }

  async fetchRecentTrades(tokenMint) {
    // Resolve LP/pair address first
    const lpAddress = await this.resolveLpAddress(tokenMint);
    if (!lpAddress) {
      throw new Error('Could not resolve LP address for mint');
    }

    if (!await this.authManager.ensureValidAuthentication()) {
      throw new Error('Authentication required to fetch trades');
    }

    const tokens = this.authManager.getTokens();
    const url = `https://api-asia.axiom.trade/transactions-feed?pairAddress=${lpAddress}&orderBy=DESC&makerAddress=&v=2`;
    const headers = {
      'accept': 'application/json, text/plain, */*',
      'accept-language': 'en-US,en;q=0.9',
      'cache-control': 'no-cache',
      'cookie': `auth-refresh-token=${tokens.refresh_token}; auth-access-token=${tokens.access_token}`,
      'origin': 'https://axiom.trade',
      'pragma': 'no-cache',
      'referer': 'https://axiom.trade/',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
      'x-target-host': 'api.axiom.trade'
    };

    const response = await fetch(url, { headers });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Trades HTTP ${response.status}: ${body.substring(0, 200)}`);
    }

    const data = await response.json();
    const tradesArray = Array.isArray(data) ? data : [];
    const trades = tradesArray
      .map((item) => this.mapAxiomTradeToClient(item))
      .filter(Boolean)
      .slice(0, 50); // cap initial load

    return { trades, lpAddress };
  }

  async fetchHolderData(pairAddress) {
    try {
      await this.authManager.refreshAccessToken();
    } catch (e) {
      console.error('❌ Failed to refresh access token for holder data:', e.message);
      throw new Error('Authentication failed');
    }

    const tokens = this.authManager.getTokens();
    const url = `https://api-asia.axiom.trade/holder-data-v3?pairAddress=${pairAddress}`;
    const headers = {
      'accept': 'application/json, text/plain, */*',
      'accept-language': 'en-US,en;q=0.9',
      'cache-control': 'no-cache',
      'cookie': `auth-refresh-token=${tokens.refresh_token}; auth-access-token=${tokens.access_token}`,
      'origin': 'https://axiom.trade',
      'pragma': 'no-cache',
      'referer': 'https://axiom.trade/',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
      'x-target-host': 'api.axiom.trade'
    };

    const response = await fetch(url, { headers });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Holders HTTP ${response.status}: ${body.substring(0, 200)}`);
    }

    const data = await response.json();
    const holdersArray = Array.isArray(data) ? data : [];

    // Map and filter holder data
    const holders = holdersArray
      .map((holder) => ({
        walletAddress: holder.walletAddress,
        tokenBalance: holder.tokenBalance || 0,
        isInsider: holder.isInsider || false,
        isBundler: holder.isBundler || false,
        createdAt: holder.createdAt,
        solBalance: holder.solBalance || 0,
        lastUpdatedSlot: holder.lastUpdatedSlot,
        buyTransactions: holder.buyTransactions || 0,
        sellTransactions: holder.sellTransactions || 0,
        tokensBought: holder.tokensBought || 0,
        tokensSold: holder.tokensSold || 0,
        solInvested: holder.solInvested || 0,
        solSold: holder.solSold || 0,
        usdInvested: holder.usdInvested || 0,
        usdSold: holder.usdSold || 0,
        isProUser: holder.isProUser || false,
        lastActiveTimestamp: holder.lastActiveTimestamp,
        isSniper: holder.isSniper || false,
        walletFunding: holder.walletFunding
      }))
      .filter(Boolean)
      .slice(0, 50); // cap to top 50 holders

    return holders;
  }

  async fetchTokenInfo(pairAddress) {
    try {
      await this.authManager.refreshAccessToken();
    } catch (e) {
      console.error('❌ Failed to refresh access token for token info:', e.message);
      throw new Error('Authentication failed');
    }

    const tokens = this.authManager.getTokens();
    const url = `https://api-asia.axiom.trade/token-info?pairAddress=${pairAddress}&v=2`;
    const headers = {
      'accept': 'application/json, text/plain, */*',
      'accept-language': 'en-US,en;q=0.9',
      'cache-control': 'no-cache',
      'cookie': `auth-refresh-token=${tokens.refresh_token}; auth-access-token=${tokens.access_token}`,
      'origin': 'https://axiom.trade',
      'pragma': 'no-cache',
      'referer': 'https://axiom.trade/',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
      'x-target-host': 'api.axiom.trade'
    };

    const response = await fetch(url, { headers });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Token Info HTTP ${response.status}: ${body.substring(0, 200)}`);
    }

    const data = await response.json();
    const normalized = {
      pairAddress: data.pairAddress || data.pair_address || pairAddress,
      tokenAddress: data.tokenAddress || data.token_address || null,
      totalSupply: data.totalSupply ?? data.total_supply ?? null,
      holdersCount: data.holdersCount ?? data.holders_count ?? data.numHolders ?? null,
      top10HoldersPercent: data.top10HoldersPercent ?? data.top_10_holders ?? null,
      devHoldsPercent: data.devHoldsPercent ?? data.dev_holds_percent ?? null,
      insidersHoldPercent: data.insidersHoldPercent ?? data.insiders_hold_percent ?? null,
      bundlersHoldPercent: data.bundlersHoldPercent ?? data.bundlers_hold_percent ?? null,
      snipersHoldPercent: data.snipersHoldPercent ?? data.snipers_hold_percent ?? null,
      botTradesPercent: data.botTradesPercent ?? data.bot_trades_percent ?? null,
      lastUpdated: data.updatedAt || data.updated_at || null
    };

    return { normalized, raw: data };
  }

  async fetchPairInfo(tokenAddress) {
    // Use pump.fun API instead of axiom for pair info (no auth required)
    const url = `https://frontend-api-v3.pump.fun/coins/${tokenAddress}`;
    console.log('🌐 Fetching pair info from pump.fun:', url);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    console.log('📦 Pump.fun pair info:', data);

    // Normalize to match expected format
    return {
      tokenName: data.name,
      tokenTicker: data.symbol,
      tokenImage: data.image_uri,
      tokenDecimals: data.decimals || 6,
      marketCapSol: data.market_cap || 0,
      supply: data.total_supply/1000000 || 0,
      dexPaid: data.dex_paid || false,
      feeVolumeSol: data.fee_volume || 0,
      pairAddress: data.bonding_curve || data.pump_swap_pool || tokenAddress
    };
  }

  async fetchTopTraders(pairAddress) {
    try {
      await this.authManager.refreshAccessToken();
    } catch (e) {
      console.error('❌ Failed to refresh access token for top traders:', e.message);
      throw new Error('Authentication failed');
    }

    const tokens = this.authManager.getTokens();
    const url = `https://api-asia.axiom.trade/top-traders-v3?pairAddress=${pairAddress}&onlyTrackedWallets=false&v=2`;
    const headers = {
      'accept': 'application/json, text/plain, */*',
      'accept-language': 'en-US,en;q=0.9',
      'cache-control': 'no-cache',
      'cookie': `auth-refresh-token=${tokens.refresh_token}; auth-access-token=${tokens.access_token}`,
      'origin': 'https://axiom.trade',
      'pragma': 'no-cache',
      'referer': 'https://axiom.trade/',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
      'x-target-host': 'api.axiom.trade'
    };

    const response = await fetch(url, { headers });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Top Traders HTTP ${response.status}: ${body.substring(0, 200)}`);
    }

    const data = await response.json();
    const tradersArray = Array.isArray(data) ? data : [];

    // Map and filter trader data
    const traders = tradersArray
      .map((trader) => ({
        walletAddress: trader.walletAddress || trader.makerAddress,
        buyTransactions: trader.buyTransactions || 0,
        sellTransactions: trader.sellTransactions || 0,
        tokensBought: trader.tokensBought || 0,
        tokensSold: trader.tokensSold || 0,
        solInvested: trader.solInvested || 0,
        solSold: trader.solSold || 0,
        usdInvested: trader.usdInvested || 0,
        usdSold: trader.usdSold || 0,
        tokenBalance: trader.tokenBalance || 0,
        solBalance: trader.solBalance || 0,
        isInsider: trader.isInsider || false,
        isBundler: trader.isBundler || false,
        isSniper: trader.isSniper || false,
        isProUser: trader.isProUser || false,
        lastActiveTimestamp: trader.lastActiveTimestamp,
        walletFunding: trader.walletFunding
      }))
      .filter(Boolean)
      .slice(0, 50); // cap to top 50 traders

    return traders;
  }

  /**
   * Fetch initial migrated tokens from Axiom REST API
   * Only tokens that migrated from Pump V1 to Pump AMM
   */
  // Resolve LP address for a token mint
  async resolveLpAddress(tokenMint) {
    console.log(`🔍 Resolving LP address for token: ${tokenMint}`);

    // Check cache first
    if (this.lpCache.has(tokenMint)) {
      //console.log(`✅ Found cached LP address: ${this.lpCache.get(tokenMint)}`);
      return this.lpCache.get(tokenMint);
    }

    // Check existing market data for the token (with proper null checks)
    const allTokens = [
      ...(this.marketData.trending ?? []),
      ...(this.marketData.finalStretch ?? []),
      ...(this.marketData.migrated ?? []),
      ...(this.marketData.newMint ?? [])
    ];

    const tokenData = allTokens.find(t => t.tokenAddress === tokenMint);
    if (tokenData) {
      let lpAddress = null;

      // Prefer direct pairAddress if present
      if (tokenData.pairAddress) {
        lpAddress = tokenData.pairAddress;
        console.log(`✅ Using pairAddress from token cache: ${lpAddress}`);
      }

      // For migrated tokens, migratedTo contains the LP address
      if (tokenData.status === 'migrated' && tokenData.migratedTo) {
        lpAddress = tokenData.migratedTo;
        console.log(`🔄 Using migratedTo: ${lpAddress}`);
      }

      if (lpAddress) {
        this.registerLpMapping(tokenMint, lpAddress);
        return lpAddress;
      }
    }

    // Fallback: fetch from direct pump.fun API (same as frontend)
    try {
      const url = `https://frontend-api-v3.pump.fun/coins/${tokenMint}`;
      console.log('🌐 Fetching pair info from pump.fun:', url);

      const response = await fetch(url);
      console.log('📡 Pumpfun response status:', response.status);
      if (response.ok) {
        const data = await response.json();
        console.log('📦 Pumpfun data:', data);

        // Priority: pump_swap_pool first (migrated tokens), then bonding_curve
        let pairAddress = null;
        if (data.pump_swap_pool) {
          pairAddress = data.pump_swap_pool;
          console.log('🔄 Using pump_swap_pool (migrated):', pairAddress);
        } else if (data.bonding_curve) {
          pairAddress = data.bonding_curve;
          console.log('📈 Using bonding_curve:', pairAddress);
        }

        if (pairAddress) {
          this.registerLpMapping(tokenMint, pairAddress);
          return pairAddress;
        }
      } else {
        console.warn('❌ Pump.fun API returned status:', response.status);
      }
    } catch (error) {
      console.warn('Failed to resolve pair address:', error);
    }

    console.log('❌ Could not resolve pair address');
    return null;
  }

  registerLpMapping(tokenMint, lpAddress) {
    if (!lpAddress || !tokenMint) return;
    const cached = this.lpCache.get(tokenMint);
    if (cached === lpAddress) return;
    this.lpCache.set(tokenMint, lpAddress);
    //console.log(`🗺️ Cached LP mapping ${tokenMint} -> ${lpAddress}`);
  }

  async fetchInitialMigratedTokens() {
    try {
      // Refresh/validate tokens before hitting Axiom API
      if (!await this.authManager.ensureValidAuthentication()) {
        console.log('⚠️  Cannot fetch initial tokens - authentication required');
        return false;
      }

      const tokens = this.authManager.getTokens();
      if (!tokens || !tokens.access_token) {
        console.log('⚠️  No access token available for API request');
        return false;
      }

      console.log('📡 Fetching initial migrated tokens from Axiom API...');

      const url = 'https://api-asia.axiom.trade/pulse';
      const headers = {
        'accept': 'application/json, text/plain, */*',
        'accept-language': 'en-US,en;q=0.9',
        'cache-control': 'no-cache',
        'content-type': 'application/json',
        'cookie': `auth-refresh-token=${tokens.refresh_token}; auth-access-token=${tokens.access_token}`,
        'origin': 'https://axiom.trade',
        'pragma': 'no-cache',
        'referer': 'https://axiom.trade/',
        'x-target-host': 'api.axiom.trade',
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
      };

      // Filter for migrated tokens on Pump AMM (we'll filter by migratedFrom on our side)
      const body = {
        table: 'migrated',
        filters: {
          protocols: {
            raydium: false,
            pump: false, // Not Pump V1
            pumpAmm: true, // Currently on Pump AMM
            launchLab: false,
            virtualCurve: false,
            launchACoin: false,
            bonk: false,
            boop: false,
            meteoraAmm: false,
            meteoraAmmV2: false,
            moonshot: false
          },
          searchKeywords: [],
          excludeKeywords: [],
          dexPaid: false,
          mustEndInPump: false,
          age: { min: null, max: null },
          holders: { min: null, max: null },
          marketCap: { min: null, max: null }
        },
        usdPerSol: this.marketData.solPrice || 195
      };

      const fetch = require('node-fetch');
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        console.error(`❌ Failed to fetch initial tokens: ${response.status} ${response.statusText}`);
        return false;
      }

      const data = await response.json();

      // API might return data in different formats - handle both array and object with data property
      let tokenList = null;
      if (Array.isArray(data)) {
        tokenList = data;
      } else if (data && Array.isArray(data.data)) {
        tokenList = data.data;
      } else if (data && Array.isArray(data.content)) {
        tokenList = data.content;
      } else {
        console.log('⚠️  Invalid response format from API:', JSON.stringify(data).substring(0, 200));
        return;
      }

      console.log(`📥 Received ${tokenList.length} migrated tokens from API`);

      // Process and filter tokens
      let addedCount = 0;
      for (const tokenData of tokenList) {
        // Handle both object format and array format (like update_pulse_v2)
        let parsedToken;

        if (Array.isArray(tokenData)) {
          // Array format (same as update_pulse_v2)
          const metadata = tokenData[33];
          parsedToken = {
            tokenAddress: tokenData[1],
            tokenName: tokenData[3],
            tokenTicker: tokenData[4],
            imageUrl: tokenData[5],
            protocol: tokenData[7],
            twitter: tokenData[10],
            volumeSol: tokenData[18] || 0,
            marketCapSol: tokenData[19] || 0,
            globalFees: tokenData[20] || 0,
            virtualSolReserve: tokenData[21] || 0,
            virtualTokenReserve: tokenData[22] || 0,
            bondingCurveProgress: tokenData[26] || null,
            totalSupply: tokenData[27] || 0,
            holdersCount: tokenData[28] || 0,
            createdAt: tokenData[30] || tokenData[34] || null,
            migratedFrom: (metadata && metadata.migratedFrom) || null,
            migratedTo: (metadata && metadata.migratedTo) || null, // Extract migratedTo from metadata
            creator: tokenData[2] || null
          };
        } else {
          // Object format
          const metadata = tokenData.metadata || tokenData[33];
          parsedToken = {
            tokenAddress: tokenData.token_address || tokenData.tokenAddress,
            tokenName: tokenData.token_name || tokenData.tokenName,
            tokenTicker: tokenData.token_ticker || tokenData.tokenTicker,
            imageUrl: tokenData.image_url || tokenData.imageUrl,
            protocol: tokenData.protocol,
            twitter: tokenData.twitter,
            volumeSol: tokenData.volume_sol || tokenData.volumeSol || 0,
            marketCapSol: tokenData.market_cap_sol || tokenData.marketCapSol || 0,
            holdersCount: tokenData.holders_count || tokenData.holdersCount || 0,
            createdAt: tokenData.created_at || tokenData.createdAt,
            migratedFrom: tokenData.migrated_from || (metadata && metadata.migratedFrom) || null,
            migratedTo: tokenData.migrated_to || (metadata && metadata.migratedTo) || null, // Extract migratedTo
            creator: tokenData.creator,
            bondingCurveProgress: tokenData.bonding_curve_progress || tokenData.bondingCurveProgress || null
          };
        }

        // Normalize migratedFrom for comparison
        const normalizedMigratedFrom = parsedToken.migratedFrom && typeof parsedToken.migratedFrom === 'string'
          ? parsedToken.migratedFrom.trim()
          : null;

        // PRIMARY CHECK: If migratedFrom === 'Pump V1', it's a migrated token (regardless of current protocol)
        // This is the main indicator that a token originated from Pump V1
        const hasMigratedFromPumpV1 = normalizedMigratedFrom === 'Pump V1';

        // SECONDARY CHECK: Pump AMM protocol (should also have migratedFrom, but check anyway)
        const isPumpAmm = parsedToken.protocol === 'Pump AMM';

        // TERTIARY CHECK: Pump V1 with bondingCurveProgress >= 100 AND migratedTo exists
        const isPumpV1Migrated = parsedToken.protocol === 'Pump V1' &&
                                  parsedToken.bondingCurveProgress !== null &&
                                  parsedToken.bondingCurveProgress >= 100 &&
                                  parsedToken.migratedTo;

        // Normalize the token and let determineStatus decide
        const normalized = this.normalizer.normalizeTokenUpdate(parsedToken);

        if (normalized && normalized.status === 'migrated') {
          this.normalizer.tokenRegistry.addOrUpdate(normalized);
          addedCount++;
          const caseType = hasMigratedFromPumpV1 ? 'PRIMARY (migratedFrom)' : (isPumpAmm ? 'SECONDARY (Pump AMM)' : 'TERTIARY (Pump V1 + migratedTo)');
          console.log(`  ✅ Added migrated token: ${normalized.tokenName || normalized.tokenTicker} (MC: $${(normalized.marketCapUSD || 0).toFixed(0)}, Case: ${caseType})`);
          console.log(`     Details: protocol=${parsedToken.protocol}, migratedFrom=${normalizedMigratedFrom || 'null'}, migratedTo=${parsedToken.migratedTo || 'null'}`);
        } else {
          // Log why it was skipped
          if (parsedToken.protocol === 'Pump AMM') {
            //console.log(`  ⚠️  Skipped Pump AMM (not migrated from Pump V1): ${parsedToken.tokenName || parsedToken.tokenTicker}, migratedFrom=${normalizedMigratedFrom || 'null'}, status=${normalized?.status || 'null'}`);
          } else if (parsedToken.protocol === 'Pump V1' && parsedToken.bondingCurveProgress >= 100) {
            //console.log(`  ⚠️  Skipped Pump V1 at 100% (no migratedTo): ${parsedToken.tokenName || parsedToken.tokenTicker}, migratedTo=${parsedToken.migratedTo || 'null'}, status=${normalized?.status || 'null'}`);
          } else if (hasMigratedFromPumpV1) {
            //console.log(`  ⚠️  Has migratedFrom but status not migrated: ${parsedToken.tokenName || parsedToken.tokenTicker}, protocol=${parsedToken.protocol}, status=${normalized?.status || 'null'}`);
          }
        }
      }

      console.log(`✅ Added ${addedCount} migrated tokens from Pump V1 to initial list`);

      // Broadcast updated list to all connected clients
      console.log(`📡 [DEBUG] Broadcasting updated market data to ${this.clients.size} clients`);
      this.broadcast({
        type: 'market_data',
        data: {
          trending: this.marketData.trending.slice(0, 50),
          finalStretch: this.normalizer.tokenRegistry.getTopCategoryTokens('finalStretch', 50),
          migrated: this.normalizer.tokenRegistry.getTopCategoryTokens('migrated', 50),
          newMint: this.normalizer.tokenRegistry.getTopCategoryTokens('newMint', 50),
          solPrice: this.marketData.solPrice,
          lastUpdate: this.marketData.lastUpdate
        }
      });

      return true;

    } catch (error) {
      console.error('❌ Error fetching initial migrated tokens:', error.message);
      return false;
    }
   }

  async initializeAxiomConnection() {
    try {
      console.log('🔌 Initializing Axiom WebSocket connection...');

      // Ensure tokens are fresh before opening WS
      const authOk = await this.authManager.ensureValidAuthentication();
      if (!authOk) {
        throw new Error('Authentication invalid; cannot start Axiom WS');
      }

      // Create WebSocket connector FIRST
      this.wsConnector = new AxiomWebSocketConnector(this.authManager);

      // Subscribe to SOL price FIRST
      await this.wsConnector.subscribeSolPrice((data) => {
        const price = data.content;
        this.normalizer.setSolPrice(price);
        this.marketData.solPrice = price;
        this.marketData.lastUpdate = new Date().toISOString();

        // Broadcast SOL price update
        this.broadcast({
          type: 'sol_price',
          data: { price, timestamp: new Date().toISOString() }
        });
      });

      // Subscribe to trending coins
      console.log('🎯 Attempting to subscribe to trending coins...');
      await this.wsConnector.subscribeTrendingCoins((trendingData) => {
        //console.log(`📈 Received trending coins update (${trendingData?.length || 0} tokens)`);

        // Only update if we received actual data with content
        if (trendingData && Array.isArray(trendingData) && trendingData.length > 0) {
          //console.log('📈 Processing non-empty trending update...');
          const normalizedTrending = this.normalizer.normalizeTrendingTokens(trendingData);
          //console.log(`📊 Normalized trending tokens: ${normalizedTrending.length}`);

          // Only update if we got valid normalized data
          if (normalizedTrending.length > 0) {
            // Update trending list (keep top 20)
            this.marketData.trending = normalizedTrending.slice(0, 20);
            this.marketData.lastUpdate = new Date().toISOString();
            //console.log(`💾 Stored ${this.marketData.trending.length} trending tokens in cache`);

            // Broadcast trending update
            this.broadcast({
              type: 'trending_update',
              data: this.marketData.trending.slice(0, 20)
            });
            //console.log(`📡 Broadcasted trending update to ${this.clients.size} clients`);
          } else {
            //console.log('📈 Skipping trending update - no valid tokens after normalization');
          }
        } else {
          //console.log(`📈 Skipping empty trending update (type: ${typeof trendingData}, isArray: ${Array.isArray(trendingData)}, length: ${trendingData?.length || 0})`);
        }
      });

      // Subscribe to new tokens (handles final stretch, migrated, and new mint)
      await this.wsConnector.subscribeNewTokens((tokenData) => {
        this.logRawSample('new_pairs', tokenData);
        const normalized = this.normalizer.normalizeNewToken(tokenData);
        if (!normalized) return;

        if (normalized.pairAddress) {
          this.registerLpMapping(normalized.tokenAddress, normalized.pairAddress);
        }

        // Add to registry
        this.normalizer.tokenRegistry.addOrUpdate(normalized);

        // Broadcast new token
        this.broadcast({
          type: 'new_token',
          data: normalized
        });

        // Broadcast updated lists
        this.broadcast({
          type: 'market_data',
          data: {
            trending: this.marketData.trending.slice(0, 50),
            finalStretch: this.normalizer.tokenRegistry.getTopCategoryTokens('finalStretch', 50),
            migrated: this.normalizer.tokenRegistry.getTopCategoryTokens('migrated', 50),
            newMint: this.normalizer.tokenRegistry.getTopCategoryTokens('newMint', 50),
            solPrice: this.marketData.solPrice,
            lastUpdate: this.marketData.lastUpdate
          }
        });
      });

      // Subscribe to token updates
      await this.wsConnector.subscribeTokenUpdates((parsedUpdate) => {
        this.logRawSample('update_pulse_v2', parsedUpdate);
        // Debug: log ALL tokens with migration info or 100% progress
        const hasMigrationInfo = parsedUpdate.migratedFrom || parsedUpdate.migratedTo;
        const is100Percent = parsedUpdate.bondingCurveProgress !== null && parsedUpdate.bondingCurveProgress >= 100;

        if (parsedUpdate.protocol === 'Pump AMM' ||
            parsedUpdate.protocol === 'Pump V1' && (hasMigrationInfo || is100Percent)) {
          console.log(`🔍 Token update - Protocol: ${parsedUpdate.protocol}, Progress: ${parsedUpdate.bondingCurveProgress || 'null'}%, migratedFrom: ${parsedUpdate.migratedFrom || 'null'}, migratedTo: ${parsedUpdate.migratedTo || 'null'}, Token: ${parsedUpdate.tokenName || parsedUpdate.tokenTicker}`);
        }

        const normalized = this.normalizer.normalizeTokenUpdate(parsedUpdate);
        if (!normalized) {
          //console.log(`⚠️  Failed to normalize token: ${parsedUpdate.tokenName || parsedUpdate.tokenTicker}`);
          return;
        }

        if (normalized.pairAddress) {
          this.registerLpMapping(normalized.tokenAddress, normalized.pairAddress);
        }

        // Debug: log normalized status for migration-related tokens
        if (normalized.status === 'migrated' ||
            (normalized.protocol === 'Pump V1' && normalized.bondingCurveProgress >= 100) ||
            normalized.protocol === 'Pump AMM') {
          //console.log(`🔍 Normalized - Status: ${normalized.status}, Protocol: ${normalized.protocol}, Progress: ${normalized.bondingCurveProgress || 'null'}%, migratedFrom: ${normalized.migratedFrom || 'null'}, migratedTo: ${normalized.migratedTo || 'null'}, Token: ${normalized.tokenName || normalized.tokenTicker}`);
        }

        // Update token in appropriate list
        this.updateTokenInCategory(normalized);

        // Broadcast token update
        this.broadcast({
          type: 'token_update',
          data: normalized
        });
      });



      console.log('✅ Axiom WebSocket connection initialized');

      // Always start Pulse v2 socket (feeds new mint/final stretch/migrated)
      await this.initializePulseV2Connection();

      // Fetch initial tokens after WebSocket is connected
      // Wait a bit for SOL price to be set first
      console.log('⏳ [DEBUG] Scheduling initial data fetch in 2 seconds...');
      const timeoutId = setTimeout(async () => {
        try {
          console.log('🚀 [DEBUG] Starting initial trending tokens fetch...');
          const trendingResult = await this.fetchInitialTrendingTokens();
          console.log(`📊 [DEBUG] Initial trending fetch result: ${trendingResult ? 'success' : 'failed'}`);

          console.log('🚀 Starting initial migrated tokens fetch...');
          const migratedResult = await this.fetchInitialMigratedTokens();
          console.log(`📊 Initial migrated fetch result: ${migratedResult ? 'success' : 'failed'}`);

          console.log('✅ Initial data fetch complete');
          console.log(`📈 Current trending tokens in cache: ${this.marketData.trending.length}`);

          // Now start WebSocket server so clients get the complete initial data
          console.log('🚀 Starting WebSocket server...');
          this.setupWebSocketServer();
          console.log(`✅ WebSocket server started on port ${this.port}`);

        } catch (error) {
          console.error('❌ Error in initial data fetch:', error);
          console.error('❌ Error stack:', error.stack);

          // Start WebSocket server anyway to avoid hanging
          console.log('🚀 Starting WebSocket server despite error...');
          this.setupWebSocketServer();
          console.log(`✅ WebSocket server started on port ${this.port} (with errors)`);
        }
      }, 2000);
      console.log('⏰ setTimeout scheduled with ID:', timeoutId);

    } catch (error) {
      console.error('❌ Failed to initialize Axiom connection:', error);
      console.error('❌ Error stack:', error.stack);
      throw error;
    }
  }

  async initializePulseV2Connection() {
    try {
      // Ensure tokens are fresh before opening pulse WS
      const authOk = await this.authManager.ensureValidAuthentication();
      if (!authOk) {
        throw new Error('Authentication invalid; cannot start Pulse v2 WS');
      }

      const PulseWSConnector = require('./pulse-ws-connector');
      this.pulseConnector = new PulseWSConnector(this.authManager, 'INFO');

       this.pulseConnector.onSnapshot((payload) => {
         // Pulse connector passes { tokenKey, payload }; unwrap tokenKey which contains the data
         const snap = payload?.tokenKey || payload;

         this.pulseData.snapshot = snap;
         this.logRawSample('pulse_v2_snapshot', { ts: Date.now(), length: Array.isArray(snap?.newPairs) ? snap.newPairs.length : 0 });
         const npLen = Array.isArray(snap?.newPairs) ? snap.newPairs.length : 0;
         const fsLen = Array.isArray(snap?.finalStretch) ? snap.finalStretch.length : 0;
         const migLen = Array.isArray(snap?.migrated) ? snap.migrated.length : 0;
         console.log(`📦 Pulse snapshot received newPairs=${npLen} finalStretch=${fsLen} migrated=${migLen}`);
         if (npLen === 0 && fsLen === 0 && migLen === 0) {
           console.log('⚠️  Pulse snapshot is empty, payload structure:', JSON.stringify(payload).substring(0, 500));
         }
         this.processPulseSnapshot(snap);
       });

       this.pulseConnector.onDelta((delta) => {
         this.applyPulseDelta(delta);
       });

      await this.pulseConnector.connect();
      console.log('✅ Pulse v2 connector initialized (live feed)');
    } catch (err) {
      console.error('⚠️ Pulse v2 connector failed to start:', err.message);
    }
  }

  processPulseSnapshot(snap) {
    if (!snap || typeof snap !== 'object') return;
    const { newPairs = [], finalStretch = [], migrated = [] } = snap;

    this.pulseBaseMap.clear();

    const toNormalized = (entry, status) => {
      if (!Array.isArray(entry) || entry.length < 12) return null;

      const protocolDetails = entry[8] || null;
      const base = {
        pairAddress: entry[0],
        tokenAddress: entry[1],
        creator: entry[2],
        tokenName: entry[3],
        tokenTicker: entry[4],
        imageUrl: entry[5],
        protocol: entry[7],
        protocolDetails,
        website: entry[9] || null,
        twitter: entry[10] || null,
        telegram: entry[11] || null,
        status,
        createdAt: entry[33] || entry[34] || entry[30] || null,
        migratedFrom: protocolDetails?.migratedFrom || protocolDetails?.migrated_from || null,
        migratedTo: protocolDetails?.migratedTo || protocolDetails?.migrated_to || null,
        bondingCurveProgress: entry[26] ?? null,
        // Initial metrics from snapshot
        volumeSol: entry[18] ?? 0,
        marketCapSol: entry[19] ?? 0,
        totalFeesSol: entry[20] ?? null,
        txCount: entry[23] ?? null,
        buyCount: entry[24] ?? null,
        sellCount: entry[25] ?? null,
        holders: entry[28] ?? null,
        numHolders: entry[28] ?? null
      };

      if (!base.pairAddress) return null;

      this.pulseBaseMap.set(base.pairAddress, base);

      // Check if token already exists in registry
      const existing = this.normalizer.tokenRegistry.get(base.tokenAddress);
      if (existing) {
        // Token exists, don't update metrics from snapshot to preserve delta updates
        return null;
      }

      const updates = {}; // Empty for snapshot
      return this.normalizer.normalizePulseV2Update({ tokenKey: base.pairAddress, updates }, base);
    };

    const normalizedNew = newPairs.map((e) => toNormalized(e, 'new')).filter(Boolean);
    const normalizedFs = finalStretch.map((e) => toNormalized(e, 'final_stretch')).filter(Boolean);
    const normalizedMig = migrated.map((e) => toNormalized(e, 'migrated')).filter(Boolean);

    const createdAtMs = (token) => {
      const ts = new Date(token.createdAt || 0).getTime();
      return Number.isFinite(ts) ? ts : 0;
    };

    // Add to registry (only new tokens, preserve existing metrics)
    normalizedFs.forEach(token => { if (token) this.normalizer.tokenRegistry.addOrUpdate(token); });
    normalizedMig.forEach(token => { if (token) this.normalizer.tokenRegistry.addOrUpdate(token); });

    this.marketData.lastUpdate = new Date().toISOString();
    console.log(`✅ Pulse snapshot applied to registry: newMint=${this.normalizer.tokenRegistry.getCategoryView('newMint').length}, finalStretch=${this.normalizer.tokenRegistry.getCategoryView('finalStretch').length}, migrated=${this.normalizer.tokenRegistry.getCategoryView('migrated').length}`);
    this.persistPulseSnapshot();

    this.broadcast({
      type: 'market_data',
      data: {
        trending: this.marketData.trending.slice(0, 50),
        finalStretch: this.normalizer.tokenRegistry.getTopCategoryTokens('finalStretch', 50),
        migrated: this.normalizer.tokenRegistry.getTopCategoryTokens('migrated', 50),
        newMint: this.normalizer.tokenRegistry.getTopCategoryTokens('newMint', 50),
        solPrice: this.marketData.solPrice,
        lastUpdate: this.marketData.lastUpdate
      }
    });
  }

  persistPulseSnapshot() {
    try {
      const snapshot = {
        ts: new Date().toISOString(),
        counts: {
          newMint: this.marketData.newMint.length,
          finalStretch: this.marketData.finalStretch.length,
          migrated: this.marketData.migrated.length
        },
        data: {
          newMint: this.marketData.newMint.slice(0, 50),
          finalStretch: this.marketData.finalStretch.slice(0, 50),
          migrated: this.marketData.migrated.slice(0, 50)
        }
      };
      fs.writeFileSync(this.pulseSnapshotPath, JSON.stringify(snapshot, null, 2));
      console.log(`📝 Pulse snapshot persisted to ${this.pulseSnapshotPath}`);
    } catch (err) {
      console.error('⚠️ Failed to persist pulse snapshot:', err.message);
    }
  }

  applyPulseDelta(delta) {
    if (!delta || !delta.tokenKey) return;

    // Apply delta to registry
    let base = this.pulseBaseMap.get(delta.tokenKey);
    if (!base) {
      // Try to reconstruct base
      let tokenMint = null;
      for (const [mint, lp] of this.lpCache.entries()) {
        if (lp === delta.tokenKey) {
          tokenMint = mint;
          break;
        }
      }

      const searchPool = [
        ...this.normalizer.tokenRegistry.getCategoryView('newMint'),
        ...this.normalizer.tokenRegistry.getCategoryView('finalStretch'),
        ...this.normalizer.tokenRegistry.getCategoryView('migrated')
      ];

      const fallback = tokenMint
        ? searchPool.find((t) => t.tokenAddress === tokenMint)
        : searchPool.find((t) => t.pairAddress === delta.tokenKey || t.tokenAddress === delta.tokenKey);
      if (fallback) {
        this.pulseBaseMap.set(delta.tokenKey, fallback);
        base = fallback;
      }
    }

    if (!base) {
      console.log(`⚠️ Pulse delta received without base for ${delta.tokenKey}`);
      return;
    }

    const normalized = this.normalizer.normalizePulseV2Update(delta, base);
    if (!normalized) return;

    this.updateTokenInCategory(normalized);
  }

  persistPulseSnapshot() {
    try {
      const snapshot = {
        ts: new Date().toISOString(),
        counts: {
          newMint: this.normalizer.tokenRegistry.getCategoryView('newMint').length,
          finalStretch: this.normalizer.tokenRegistry.getCategoryView('finalStretch').length,
          migrated: this.normalizer.tokenRegistry.getCategoryView('migrated').length
        },
        data: {
          newMint: this.normalizer.tokenRegistry.getTopCategoryTokens('newMint', 50),
          finalStretch: this.normalizer.tokenRegistry.getTopCategoryTokens('finalStretch', 50),
          migrated: this.normalizer.tokenRegistry.getTopCategoryTokens('migrated', 50)
        }
      };
      fs.writeFileSync(this.pulseSnapshotPath, JSON.stringify(snapshot, null, 2));
      console.log(`📝 Pulse snapshot persisted to ${this.pulseSnapshotPath}`);
    } catch (err) {
      console.error('⚠️ Failed to persist pulse snapshot:', err.message);
    }
  }





  updateTokenInCategory(token) {
    if (token.pairAddress) {
      this.registerLpMapping(token.tokenAddress, token.pairAddress);
    } else if (token.migratedTo) {
      this.registerLpMapping(token.tokenAddress, token.migratedTo);
    }

    // Update in registry - views will be recomputed on demand
    this.normalizer.tokenRegistry.addOrUpdate(token);
    this.marketData.lastUpdate = new Date().toISOString();
  }

  async handleTradeSubscription(ws, tokenMint) {
    try {
      console.log(`📡 Client subscribing to trades for token: ${tokenMint}`);
      console.log(`🔍 Checking if already subscribed...`);

      // Initialize client subscriptions if not exists
      if (!this.clientTradeSubscriptions.has(ws)) {
        this.clientTradeSubscriptions.set(ws, new Set());
      }

      const clientSubs = this.clientTradeSubscriptions.get(ws);

      // Check if already subscribed
      if (clientSubs.has(tokenMint)) {
        ws.send(JSON.stringify({
          type: 'trade_subscribed',
          mint: tokenMint,
          status: 'already_subscribed'
        }));
        return;
      }

      // Resolve LP address
      const lpAddress = await this.resolveLpAddress(tokenMint);
      if (!lpAddress) {
        ws.send(JSON.stringify({
          type: 'trade_error',
          mint: tokenMint,
          error: 'Could not resolve LP address'
        }));
        return;
      }

      // Add to client's subscriptions
      clientSubs.add(tokenMint);

      // Initialize active subscriptions for this LP if not exists
      if (!this.activeTradeSubscriptions.has(lpAddress)) {
        this.activeTradeSubscriptions.set(lpAddress, new Set());
      }

      const lpSubs = this.activeTradeSubscriptions.get(lpAddress);
      const wasEmpty = lpSubs.size === 0;

      // Add client to LP subscriptions
      lpSubs.add(ws);

      // If this is the first client for this LP, subscribe to axiom
      if (wasEmpty && this.wsConnector) {
        console.log(`🔌 Subscribing to axiom trade feed for LP: ${lpAddress}`);
        const subscribed = await this.wsConnector.subscribeToTradeFeed(lpAddress, (tradeData, lpAddr) => {
          this.handleTradeUpdate(lpAddr, tradeData);
        });

        if (!subscribed) {
          lpSubs.delete(ws);
          if (lpSubs.size === 0) {
            this.activeTradeSubscriptions.delete(lpAddress);
          }
          ws.send(JSON.stringify({
            type: 'trade_error',
            mint: tokenMint,
            error: 'Upstream trade feed subscription failed'
          }));
          return;
        }
      }

      this.registerLpMapping(tokenMint, lpAddress);

      ws.send(JSON.stringify({
        type: 'trade_subscribed',
        mint: tokenMint,
        lpAddress: lpAddress
      }));

      console.log(`✅ Client subscribed to trades for ${tokenMint} (LP: ${lpAddress})`);
    } catch (error) {
      console.error(`❌ Error handling trade subscription for ${tokenMint}:`, error.message);
      ws.send(JSON.stringify({
        type: 'trade_error',
        mint: tokenMint,
        error: error.message
      }));
    }
  }

  handleTradeUnsubscription(ws, tokenMint) {
    console.log(`📡 Client unsubscribing from trades for token: ${tokenMint}`);

    // Remove from client subscriptions
    if (this.clientTradeSubscriptions.has(ws)) {
      const clientSubs = this.clientTradeSubscriptions.get(ws);
      clientSubs.delete(tokenMint);

      // Clean up empty client subscriptions
      if (clientSubs.size === 0) {
        this.clientTradeSubscriptions.delete(ws);
      }
    }

    // Find and remove from active subscriptions
    for (const [lpAddress, clients] of this.activeTradeSubscriptions.entries()) {
      if (clients.has(ws)) {
        clients.delete(ws);

        // If no more clients for this LP, unsubscribe from axiom
        if (clients.size === 0) {
          this.activeTradeSubscriptions.delete(lpAddress);
          if (this.wsConnector) {
            console.log(`🔌 Unsubscribing from axiom trade feed for LP: ${lpAddress}`);
            this.wsConnector.unsubscribeFromTradeFeed(lpAddress);
          }
        }
        break;
      }
    }

    ws.send(JSON.stringify({
      type: 'trade_unsubscribed',
      mint: tokenMint
    }));

    console.log(`✅ Client unsubscribed from trades for ${tokenMint}`);
  }

  handleTradeUpdate(lpAddress, tradeData) {
    // Parse trade data (same format as price-monitor.js)
    const [
      txId,
      wallet,
      timestamp,
      type, // 0 = buy, 1 = sell
      spotPriceSol,
      usdPricePerToken,
      solAmount,
      usdAmount,
      tokenAmount,
      virtualSol,
      virtualToken
    ] = tradeData;

    // Find all clients subscribed to this LP
    const clients = this.activeTradeSubscriptions.get(lpAddress);
    if (!clients || clients.size === 0) {
      return;
    }

    // Find token mint for this LP (reverse lookup)
    let tokenMint = null;
    for (const [mint, cachedLp] of this.lpCache.entries()) {
      if (cachedLp === lpAddress) {
        tokenMint = mint;
        break;
      }
    }

    if (!tokenMint) {
      console.log(`⚠️ Received trade for unknown LP: ${lpAddress}`);
      return;
    }

    // Format trade data for clients
    const tradeMessage = {
      type: 'trade_update',
      mint: tokenMint,
      lpAddress: lpAddress,
      trade: {
        txId: txId,
        wallet: wallet,
        timestamp: timestamp,
        type: type === 0 ? 'buy' : 'sell',
        spotPriceSol: spotPriceSol,
        usdPricePerToken: usdPricePerToken,
        solAmount: solAmount,
        usdAmount: usdAmount,
        tokenAmount: tokenAmount,
        virtualSolReserves: virtualSol,
        virtualTokenReserves: virtualToken
      }
    };

    // Send to all subscribed clients
    let sentCount = 0;
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(JSON.stringify(tradeMessage));
          sentCount++;
        } catch (error) {
          console.error('Error sending trade update to client:', error);
          clients.delete(client);
        }
      } else {
        clients.delete(client);
      }
    }

    console.log(`📡 Broadcasted trade update for ${tokenMint} to ${sentCount} clients (${type === 0 ? 'BUY' : 'SELL'} ${tokenAmount.toFixed(2)} tokens)`);

    // Clean up empty subscriptions
    if (clients.size === 0) {
      this.activeTradeSubscriptions.delete(lpAddress);
    }
  }

  broadcast(message) {
    const messageStr = JSON.stringify(message);
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(messageStr);
        } catch (error) {
          console.error('Error broadcasting to client:', error);
          this.clients.delete(client);
        }
      }
    });
  }

  async start() {
    // Start Express server (for admin API endpoints)
    const expressPort = process.env.MARKET_RELAY_HTTP_PORT || 8082; // Use different port for HTTP
    this.httpServer = this.app.listen(expressPort, () => {
      console.log(`🌐 Market Relay HTTP server started on port ${expressPort}`);
    });
    
    // Try to restore session and connect
    try {
      if (this.authManager.loadSession()) {
        console.log('✅ Session file found, attempting to refresh tokens...');
        try {
          await this.authManager.ensureValidAuthentication();
          console.log('✅ Tokens refreshed successfully, initializing Axiom connection...');
          await this.initializeAxiomConnection();
        } catch (refreshError) {
          console.log('⚠️  Token refresh failed:', refreshError.message);
          console.log('⚠️  Falling back to OTP authentication. Use POST /admin/axiom/init to authenticate.');
          console.log('   Example:');
          console.log('   Step 1: POST /admin/axiom/init with { email, password_b64 }');
          console.log('   Step 2: POST /admin/axiom/init with { email, password_b64, otp_code }');
        }
      } else {
        console.log('⚠️  No valid session found. Use POST /admin/axiom/init to authenticate.');
        console.log('   Example:');
        console.log('   Step 1: POST /admin/axiom/init with { email, password_b64 }');
        console.log('   Step 2: POST /admin/axiom/init with { email, password_b64, otp_code }');
      }
    } catch (error) {
      console.error('❌ Failed to start Axiom connection:', error);
      console.log('⚠️  Use POST /admin/axiom/init to authenticate.');
    }
  }

  async shutdown() {
    console.log('\n🛑 Shutting down Market Relay server...');

    // Disconnect Axiom WebSocket
    if (this.wsConnector) {
      this.wsConnector.disconnect();
    }

    // Close all client connections
    this.clients.forEach((client) => {
      client.close();
    });

    // Close HTTP server
    if (this.httpServer) {
      this.httpServer.close(() => {
        console.log('✅ HTTP server closed');
      });
    }

    // Close WS HTTP/HTTPS server
    if (this.wsHttpServer) {
      this.wsHttpServer.close(() => {
        console.log('✅ WS underlying server closed');
      });
    }

    // Close WebSocket server
    if (this.wss) {
      this.wss.close(() => {
        console.log('✅ WebSocket server closed');
        process.exit(0);
      });
    } else {
      // If no WebSocket server, exit anyway
      setTimeout(() => {
        console.log('✅ Shutdown complete');
        process.exit(0);
      }, 1000);
    }
  }
}

// Start server if run directly
if (require.main === module) {
  const server = new MarketRelayServer();
  server.start();
  
  // Graceful shutdown
  process.on('SIGINT', () => {
    server.shutdown();
  });
  
  process.on('SIGTERM', () => {
    server.shutdown();
  });
}

module.exports = MarketRelayServer;
