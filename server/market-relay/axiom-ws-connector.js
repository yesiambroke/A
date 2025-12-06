const WebSocket = require('ws');

class AxiomWebSocketConnector {
  constructor(authManager, logLevel = 'INFO') {
    this.wsUrl = "wss://cluster-asia2.axiom.trade/";
    this.authManager = authManager;
    this.ws = null;
    this.isConnected = false;
    this.pingInterval = null;
    this.reconnectTimeout = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 5000; // Start with 5 seconds
    
    if (!authManager) {
      throw new Error("authManager is required");
    }
    
    this.logger = {
      debug: (msg) => { if (logLevel === 'DEBUG') console.log(`[DEBUG] ${msg}`); },
      info: (msg) => console.info(`[INFO] ${msg}`),
      warning: (msg) => console.warn(`[WARNING] ${msg}`),
      error: (msg) => console.error(`[ERROR] ${msg}`)
    };
    
    this._callbacks = {};
    this.trackedTokens = new Map();
    this.solPrice = null;
    this.tradeSubscriptions = new Map(); // lpAddress -> Set of callbacks
  }

  // Parse update_pulse_v2 array messages
  // NOTE: Different formats may exist for migrated vs non-migrated tokens
  parseUpdatePulse(updateArray) {
    if (!Array.isArray(updateArray)) return null;
    
    // Log array length for debugging format differences
    if (updateArray.length !== 35 && updateArray.length > 0) {
      //console.log(`⚠️  Unexpected array length: ${updateArray.length} (expected ~35)`);
    }
    
    const createdAtIdx30 = updateArray[30];
    const createdAtIdx34 = updateArray[34];
    const createdAt = createdAtIdx30 || createdAtIdx34 || null;
    
    // Extract metadata - check multiple possible locations
    // Different formats may have metadata at different indices
    let metadata = null;
    let migratedFrom = null;
    let migratedTo = null;
    
    // Try index 33 first (most common)
    if (updateArray[33] && typeof updateArray[33] === 'object') {
      metadata = updateArray[33];
    }
    // Also check if metadata might be at a different index for migrated tokens
    // Check a range of indices that might contain metadata
    if (!metadata) {
      for (let i = 30; i < Math.min(40, updateArray.length); i++) {
        if (updateArray[i] && typeof updateArray[i] === 'object' && !Array.isArray(updateArray[i])) {
          const candidate = updateArray[i];
          // Check if this looks like metadata (has migration-related fields)
          if (candidate.migratedFrom || candidate.migrated_from || 
              candidate.migratedTo || candidate.migrated_to ||
              Object.keys(candidate).some(k => k.toLowerCase().includes('migrat'))) {
            metadata = candidate;
            break;
          }
        }
      }
    }
    
    // Also check if migratedFrom/migratedTo are directly in the array at known indices
    // Some formats might have them as separate array elements
    if (!metadata || (!migratedFrom && !migratedTo)) {
      // Check if there are string values that look like migration info
      for (let i = 30; i < Math.min(40, updateArray.length); i++) {
        const val = updateArray[i];
        if (typeof val === 'string' && val.includes('Pump V1')) {
          // This might be migratedFrom
          if (!migratedFrom && (val === 'Pump V1' || val.trim() === 'Pump V1')) {
            migratedFrom = 'Pump V1';
          }
        }
      }
    }
    
    // Extract from metadata object if found
    if (metadata && typeof metadata === 'object') {
      // Check for migratedFrom field (for tokens already on Pump AMM)
      migratedFrom = migratedFrom || metadata.migratedFrom || metadata.migrated_from || null;
      
      // Check for migratedTo field (for tokens on Pump V1 that have migrated)
      migratedTo = migratedTo || metadata.migratedTo || metadata.migrated_to || null;
      
      // Normalize string values
      if (migratedFrom && typeof migratedFrom === 'string') {
        migratedFrom = migratedFrom.trim();
      }
      if (migratedTo && typeof migratedTo === 'string') {
        migratedTo = migratedTo.trim();
      }
    }
    
    // Debug log for ALL tokens with migration info or Pump AMM protocol
    const protocol = updateArray[7];
    if (migratedFrom || migratedTo || protocol === 'Pump AMM') {
      //console.log(`🔍 Parsed token - protocol: ${protocol}, migratedFrom: ${migratedFrom || 'null'}, migratedTo: ${migratedTo || 'null'}, progress: ${updateArray[26] || 'null'}, token: ${updateArray[3] || updateArray[4] || 'unknown'}`);
      //console.log(`   Array length: ${updateArray.length}, protocol index [7]: ${protocol}`);

      // Log array structure for debugging format differences
      if (protocol === 'Pump AMM' || migratedFrom === 'Pump V1') {
        //console.log(`   📊 Array structure (indices 30-40):`);
        for (let i = 30; i < Math.min(40, updateArray.length); i++) {
          const val = updateArray[i];
          const valType = val === null ? 'null' : (Array.isArray(val) ? 'array' : typeof val);
          const valPreview = val === null ? 'null' :
                            (typeof val === 'string' ? `"${val.substring(0, 50)}"` :
                            (typeof val === 'object' && !Array.isArray(val) ? `{${Object.keys(val).join(', ')}}` :
                            JSON.stringify(val).substring(0, 50)));
          //console.log(`      [${i}]: ${valType} = ${valPreview}`);
        }
      }

      if (metadata) {
        //console.log(`   ✅ Metadata found at index ${updateArray.indexOf(metadata)}`);
        //console.log(`   Metadata type: ${typeof metadata}, isArray: ${Array.isArray(metadata)}`);
        if (typeof metadata === 'object' && !Array.isArray(metadata)) {
          //console.log(`   Metadata keys: ${Object.keys(metadata).join(', ')}`);
          // Log the actual migratedFrom value if it exists
          if (metadata.migratedFrom !== undefined) {
            //console.log(`   metadata.migratedFrom = "${metadata.migratedFrom}" (type: ${typeof metadata.migratedFrom})`);
          }
          if (metadata.migrated_from !== undefined) {
            //console.log(`   metadata.migrated_from = "${metadata.migrated_from}" (type: ${typeof metadata.migrated_from})`);
          }
        } else {
          //console.log(`   Metadata value: ${JSON.stringify(metadata).substring(0, 200)}`);
        }
      } else {
        //console.log(`   ⚠️  No metadata found - checked indices 30-40`);
      }
    }
    
    return {
      pairAddress: updateArray[0],
      tokenAddress: updateArray[1],
      creator: updateArray[2],
      tokenName: updateArray[3],
      tokenTicker: updateArray[4],
      imageUrl: updateArray[5],
      protocol: updateArray[7],
      twitter: updateArray[10],
      volumeSol: updateArray[18],
      marketCapSol: updateArray[19],
      globalFees: updateArray[20],
      virtualSolReserve: updateArray[21],
      virtualTokenReserve: updateArray[22],
      bondingCurveProgress: updateArray[26],
      totalSupply: updateArray[27],
      holdersCount: updateArray[28],
      createdAt: createdAt,
      migratedFrom: migratedFrom, // Add migratedFrom field
      migratedTo: migratedTo // Add migratedTo field (for tokens that have migrated)
    };
  }

  calculateTokenAgeFromTimestamp(createdAt) {
    if (!createdAt) return Infinity;
    try {
      const ts = new Date(createdAt);
      const now = new Date();
      return (now - ts) / (1000 * 60); // Age in minutes
    } catch {
      return Infinity;
    }
  }

  async connect() {
    if (!await this.authManager.ensureValidAuthentication()) {
      this.logger.error("WebSocket authentication failed - unable to obtain valid tokens");
      this.logger.error("Session may have expired. Please restart the application to login again.");
      return false;
    }
    
    const tokens = this.authManager.getTokens();
    if (!tokens || !tokens.access_token || !tokens.refresh_token) {
      this.logger.error("No authentication tokens available");
      return false;
    }
    
    const headers = {
      'Origin': 'https://axiom.trade',
      'Cache-Control': 'no-cache',
      'Accept-Language': 'en-US,en;q=0.9,es;q=0.8',
      'Pragma': 'no-cache',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36 OPR/120.0.0.0',
      'Cookie': `auth-access-token=${tokens.access_token}; auth-refresh-token=${tokens.refresh_token}`
    };
    
    try {
      this.logger.info(`🔌 Attempting to connect to WebSocket: ${this.wsUrl}`);
      this.ws = new WebSocket(this.wsUrl, { headers });
      
      await new Promise((resolve, reject) => {
        this.ws.on('open', () => {
          this.isConnected = true;
          this.reconnectAttempts = 0; // Reset reconnect attempts on successful connection
          this.logger.info("✅ Connected to Axiom WebSocket server");
          
          // Start ping interval (every 5 seconds)
          this.startPingInterval();
          
          resolve();
        });
        
        this.ws.on('error', (e) => {
          // Check if it's an authentication error
          if (e.message && e.message.includes('401')) {
            this.logger.error("❌ WebSocket authentication failed (401). Session may be expired.");
            this.authManager.clearSession();
            reject(new Error("WEBSOCKET_AUTH_FAILED"));
          } else {
            reject(e);
          }
        });
      });
      
      // Set up message handler
      this.setupMessageHandler();
      
      // Set up connection handlers
      this.setupConnectionHandlers();
      
      return true;
    } catch (e) {
      if (e.message === "WEBSOCKET_AUTH_FAILED") {
        this.logger.error("❌ WebSocket authentication failed. Please restart the application to login again.");
        return false;
      }
      
      this.logger.error(`❌ Failed to connect to WebSocket: ${e}`);
      
      // Try alternative URL
      if (this.wsUrl.includes('cluster-asia2')) {
        return await this.tryAlternativeConnection(headers);
      }
      
      return false;
    }
  }

  async tryAlternativeConnection(headers) {
    try {
      const alternativeUrl = "wss://cluster3.axiom.trade/";
      this.logger.info(`🔄 Trying alternative WebSocket URL: ${alternativeUrl}`);
      this.wsUrl = alternativeUrl;
      this.ws = new WebSocket(alternativeUrl, { headers });
      
      await new Promise((resolve, reject) => {
        this.ws.on('open', () => {
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.logger.info("✅ Connected to alternative WebSocket server");
          this.startPingInterval();
          resolve();
        });
        
        this.ws.on('error', (e2) => {
          if (e2.message && e2.message.includes('401')) {
            this.logger.error("❌ Alternative WebSocket also failed with 401. Session expired.");
            this.authManager.clearSession();
            reject(new Error("WEBSOCKET_AUTH_FAILED"));
          } else {
            reject(e2);
          }
        });
      });
      
      this.setupMessageHandler();
      this.setupConnectionHandlers();
      return true;
    } catch (e2) {
      if (e2.message === "WEBSOCKET_AUTH_FAILED") {
        this.logger.error("❌ Both WebSocket endpoints failed with authentication errors. Session expired.");
        return false;
      }
      this.logger.error(`❌ Alternative WebSocket connection also failed: ${e2}`);
      return false;
    }
  }

  setupMessageHandler() {
    this.ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        // Handle SOL price updates
        if (data.room === "sol_price") {
          this.solPrice = data.content;
          this.logger.debug(`💵 SOL price updated: $${this.solPrice}`);
          if (this._callbacks["sol_price"]) {
            this._callbacks["sol_price"](data);
          }
        }
        
        // Handle new pairs
        else if (data.room === "new_pairs") {
          const tokenData = data.content;
          if (this._callbacks["new_pairs"]) {
            this._callbacks["new_pairs"](tokenData);
          }
        }
        
        // Handle token updates
        else if (data.room === "update_pulse_v2") {
          const updates = data.content;
          for (const arr of updates) {
            const parsed = this.parseUpdatePulse(arr);
            if (!parsed) continue;

            if (this._callbacks["update_pulse_v2"]) {
              this._callbacks["update_pulse_v2"](parsed);
            }
          }
        }

        // Handle trending coins updates
        else if (data.room === "new-trending:1h") {
          const trendingData = data.content?.rankings || data.content;
          console.log(`📈 Received trending coins update (${trendingData?.length || 0} tokens)`);
          if (trendingData && trendingData.length > 0) {
            console.log(`📊 First trending token sample: ${JSON.stringify(trendingData[0]).substring(0, 200)}`);
          }
          if (this._callbacks["new-trending:1h"]) {
            this._callbacks["new-trending:1h"](trendingData);
          }
        }

        // Handle trade updates (f:lp_address rooms)
        else if (data.room && data.room.startsWith('f:')) {
          const lpAddress = data.room.replace('f:', '');
          const tradeData = data.content;

          // Notify all callbacks registered for this LP address
          const callbacks = this.tradeSubscriptions.get(lpAddress);
          if (callbacks) {
            for (const callback of callbacks) {
              try {
                callback(tradeData, lpAddress);
              } catch (error) {
                this.logger.error(`❌ Error in trade callback for ${lpAddress}: ${error.message}`);
              }
            }
          }
        }
      } catch (error) {
        this.logger.error(`❌ Error parsing WebSocket message: ${error.message}`);
      }
    });
  }

  setupConnectionHandlers() {
    // Handle pong responses
    this.ws.on('pong', () => {
      this.logger.debug('🏓 Received pong from Axiom');
    });
    
    // Handle connection close
    this.ws.on('close', (code, reason) => {
      this.isConnected = false;
      this.stopPingInterval();
      this.logger.warning(`⚠️  WebSocket closed (code: ${code}, reason: ${reason || 'none'})`);
      
      // Schedule reconnect if not intentional shutdown
      if (code !== 1000) { // 1000 = normal closure
        this.scheduleReconnect();
      }
    });
    
    // Handle errors
    this.ws.on('error', (error) => {
      this.logger.error(`❌ WebSocket error: ${error.message}`);
      this.isConnected = false;
      this.stopPingInterval();
    });
  }

  startPingInterval() {
    // Clear any existing interval
    this.stopPingInterval();
    
    // Send ping every 5 seconds
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          // WebSocket ping frame (not JSON message)
          this.ws.ping();
          this.logger.debug('📤 Sent ping to Axiom');
        } catch (error) {
          this.logger.error(`❌ Failed to send ping: ${error.message}`);
          this.handlePingFailure();
        }
      } else {
        this.logger.warning('⚠️  WebSocket not open, stopping ping interval');
        this.stopPingInterval();
      }
    }, 5000); // 5 seconds
    
    this.logger.info('🔄 Started ping interval (every 5 seconds)');
  }

  stopPingInterval() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
      this.logger.debug('⏹️  Stopped ping interval');
    }
  }

  handlePingFailure() {
    // If ping fails, connection might be dead
    this.logger.warning('⚠️  Ping failed, checking connection...');
    if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
      this.reconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.error(`❌ Max reconnect attempts (${this.maxReconnectAttempts}) reached. Stopping reconnection.`);
      return;
    }
    
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.min(this.reconnectAttempts, 5); // Exponential backoff, max 5x
    
    this.logger.info(`🔄 Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms...`);
    
    this.reconnectTimeout = setTimeout(() => {
      this.reconnect();
    }, delay);
  }

  async reconnect() {
    this.logger.info('🔄 Attempting to reconnect to Axiom...');
    this.stopPingInterval();
    
    // Clear reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    // Ensure tokens are fresh
    try {
      await this.authManager.ensureValidAuthentication();
    } catch (error) {
      this.logger.error(`❌ Failed to refresh authentication: ${error.message}`);
      this.logger.error('⚠️  Session may have expired. Please restart the application.');
      return;
    }
    
    // Reconnect
    const success = await this.connect();
    if (!success) {
      this.scheduleReconnect();
    }
  }

  async subscribeNewTokens(callback) {
    if (!this.ws || !this.isConnected) {
      if (!await this.connect()) {
        return false;
      }
    }
    
    this._callbacks["new_pairs"] = callback;
    
    try {
      this.ws.send(JSON.stringify({
        "action": "join",
        "room": "new_pairs"
      }));
      this.logger.info("✅ Subscribed to new token updates");
      return true;
    } catch (e) {
      this.logger.error(`❌ Failed to subscribe to new tokens: ${e}`);
      return false;
    }
  }

  async subscribeSolPrice(callback) {
    if (!this.ws || !this.isConnected) {
      if (!await this.connect()) {
        return false;
      }
    }
    
    this._callbacks["sol_price"] = callback;
    
    try {
      this.ws.send(JSON.stringify({
        "action": "join",
        "room": "sol_price"
      }));
      this.logger.info("✅ Subscribed to SOL price updates");
      return true;
    } catch (e) {
      this.logger.error(`❌ Failed to subscribe to SOL price: ${e}`);
      return false;
    }
  }

  async subscribeTokenUpdates(callback) {
    if (!this.ws || !this.isConnected) {
      if (!await this.connect()) {
        return false;
      }
    }

    this._callbacks["update_pulse_v2"] = callback;

    try {
      this.ws.send(JSON.stringify({
        "action": "join",
        "room": "update_pulse_v2"
      }));
      this.logger.info("✅ Subscribed to token updates");
      return true;
    } catch (e) {
      this.logger.error(`❌ Failed to subscribe to token updates: ${e}`);
      return false;
    }
  }

  async subscribeTrendingCoins(callback) {
    if (!this.ws || !this.isConnected) {
      if (!await this.connect()) {
        return false;
      }
    }

    this._callbacks["new-trending:1h"] = callback;

    try {
      this.ws.send(JSON.stringify({
        "action": "join",
        "room": "new-trending:1h"
      }));
      this.logger.info("✅ Subscribed to trending coins (new-trending:1h room)");
      return true;
    } catch (e) {
      this.logger.error(`❌ Failed to subscribe to trending coins: ${e}`);
      return false;
    }
  }

  async subscribeToTradeFeed(lpAddress, callback) {
    if (!this.ws || !this.isConnected) {
      if (!await this.connect()) {
        return false;
      }
    }

    // Initialize callback set for this LP address if not exists
    if (!this.tradeSubscriptions.has(lpAddress)) {
      this.tradeSubscriptions.set(lpAddress, new Set());
    }

    // Add callback to the set
    this.tradeSubscriptions.get(lpAddress).add(callback);

    // Only send join message if this is the first callback for this LP
    if (this.tradeSubscriptions.get(lpAddress).size === 1) {
      try {
        this.ws.send(JSON.stringify({
          "action": "join",
          "room": `f:${lpAddress}`
        }));
        this.logger.info(`✅ Subscribed to trade feed for LP: ${lpAddress}`);
        return true;
      } catch (e) {
        this.logger.error(`❌ Failed to subscribe to trade feed for ${lpAddress}: ${e}`);
        // Remove callback since subscription failed
        this.tradeSubscriptions.get(lpAddress).delete(callback);
        if (this.tradeSubscriptions.get(lpAddress).size === 0) {
          this.tradeSubscriptions.delete(lpAddress);
        }
        return false;
      }
    } else {
      this.logger.debug(`📡 Added callback to existing trade subscription for LP: ${lpAddress}`);
      return true;
    }
  }

  unsubscribeFromTradeFeed(lpAddress) {
    if (!this.tradeSubscriptions.has(lpAddress)) {
      return;
    }

    // Clear all callbacks for this LP
    this.tradeSubscriptions.delete(lpAddress);

    // Leave the room
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({
          "action": "leave",
          "room": `f:${lpAddress}`
        }));
        this.logger.info(`✅ Unsubscribed from trade feed for LP: ${lpAddress}`);
      } catch (e) {
        this.logger.error(`❌ Failed to unsubscribe from trade feed for ${lpAddress}: ${e}`);
      }
    }
  }

  disconnect() {
    this.logger.info('🔌 Disconnecting from Axiom WebSocket...');
    this.stopPingInterval();
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    if (this.ws) {
      this.ws.close(1000, 'Intentional disconnect');
      this.ws = null;
    }
    
    this.isConnected = false;
    this.logger.info('✅ Disconnected');
  }
}

module.exports = AxiomWebSocketConnector;
