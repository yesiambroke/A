const WebSocket = require('ws');
const msgpack = require('msgpack-lite');

// UserState payload copied from browser devtools to activate pulse streams
const PULSE_USER_STATE = {
  type: 'userState',
  state: {
    tables: { newPairs: true, finalStretch: true, migrated: true },
    filters: {
      newPairs: {
        protocols: {
          raydium: false,
          pumpAmm: false,
          pump: true,
          mayhem: true,
          moonshot: false,
          moonshotApp: false,
          daosFun: false,
          candle: false,
          heaven: false,
          sugar: false,
          launchLab: false,
          bonk: false,
          virtualCurve: false,
          launchACoin: false,
          boop: false,
          meteoraAmm: false,
          meteoraAmmV2: false,
          jupiterStudio: false,
          bags: false,
          orca: false,
          wavebreak: false
        },
        searchKeywords: [],
        excludeKeywords: [],
        dexPaid: false,
        mustEndInPump: false,
        age: { min: null, max: null, unit: 'minutes' },
        top10Holders: { min: null, max: null },
        devHolding: { min: null, max: null },
        snipers: { min: null, max: null },
        insiders: { min: null, max: null },
        bundle: { min: null, max: null },
        holders: { min: null, max: null },
        botUsers: { min: null, max: null },
        bondingCurve: { min: null, max: null },
        liquidity: { min: null, max: null },
        volume: { min: null, max: null },
        marketCap: { min: null, max: null },
        fees: { min: null, max: null },
        txns: { min: null, max: null },
        numBuys: { min: null, max: null },
        numSells: { min: null, max: null },
        numMigrations: { min: null, max: null },
        numDevPairs: { min: null, max: null },
        tweetAgeMins: { min: null, max: null, unit: 'minutes' },
        twitter: { min: null, max: null },
        twitterExists: false,
        website: false,
        telegram: false,
        atLeastOneSocial: false,
        isStreaming: false,
        showQuoteTokens: { sol: true, usdc: true, usd1: true },
        showPumpOffchain: false
      },
      finalStretch: {
        protocols: {
          raydium: false,
          pump: true,
          pumpAmm: false,
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
        mustEndInPump: true,
        age: { min: null, max: 1440 },
        top10Holders: { min: null, max: null },
        devHolding: { min: null, max: null },
        snipers: { min: null, max: null },
        insiders: { min: null, max: null },
        bundle: { min: null, max: null },
        holders: { min: null, max: null },
        botUsers: { min: null, max: null },
        bondingCurve: { min: null, max: null },
        liquidity: { min: null, max: null },
        volume: { min: null, max: null },
        marketCap: { min: null, max: null },
        txns: { min: null, max: null },
        numBuys: { min: null, max: null },
        numSells: { min: null, max: null },
        numMigrations: { min: null, max: null },
        twitter: { min: null, max: null },
        twitterExists: false,
        website: false,
        telegram: false,
        atLeastOneSocial: false,
        showQuoteTokens: { usdc: false, usd1: false }
      },
      migrated: {
        protocols: {
          raydium: false,
          pump: true,
          pumpAmm: false,
          launchLab: false,
          virtualCurve: false,
          launchACoin: false,
          bonk: true,
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
        top10Holders: { min: null, max: null },
        devHolding: { min: null, max: null },
        snipers: { min: null, max: null },
        insiders: { min: null, max: null },
        bundle: { min: null, max: null },
        holders: { min: 200, max: null },
        botUsers: { min: null, max: null },
        bondingCurve: { min: null, max: null },
        liquidity: { min: null, max: null },
        volume: { min: null, max: null },
        marketCap: { min: 50000, max: null },
        txns: { min: null, max: null },
        numBuys: { min: null, max: null },
        numSells: { min: null, max: null },
        numMigrations: { min: null, max: null },
        twitter: { min: null, max: null },
        twitterExists: false,
        website: false,
        telegram: false,
        atLeastOneSocial: false
      }
    },
    blacklist: {},
    showHiddenPulseTokens: false,
    unhideMigrated: false,
    pausedPairs: { newPairs: [], finalStretch: [], migrated: [] }
  }
};

class PulseWSConnector {
  constructor(authManager, logLevel = 'INFO') {
    this.wsUrl = process.env.PULSE_V2_WS_URL || 'wss://pulse.axiom.trade/ws';
    this.authManager = authManager;
    this.ws = null;
    this.isConnected = false;
    this.pingInterval = null;
    this.reconnectDelay = 5000;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;

    if (!authManager) {
      throw new Error('authManager is required');
    }

    this.logger = {
      debug: (msg) => { if (logLevel === 'DEBUG') console.log(`[DEBUG] ${msg}`); },
      info: (msg) => console.info(`[INFO] ${msg}`),
      warning: (msg) => console.warn(`[WARNING] ${msg}`),
      error: (msg) => console.error(`[ERROR] ${msg}`)
    };

    this._callbacks = {
      snapshot: null,
      delta: null
    };
  }

  decode(message) {
    if (Buffer.isBuffer(message)) {
      try {
        return msgpack.decode(message);
      } catch {
        // ignore and fall through
      }
    }
    try {
      return JSON.parse(message.toString());
    } catch {
      return null;
    }
  }

  startPing() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, 5000);
  }

  async connect() {
    if (!await this.authManager.ensureValidAuthentication()) {
      this.logger.error('Cannot connect to pulse v2: auth invalid');
      return false;
    }

    const tokens = this.authManager.getTokens();
    const headers = {
      Origin: 'https://axiom.trade',
      Host: 'pulse.axiom.trade',
      'Cache-Control': 'no-cache',
      'Accept-Language': 'en-US,en;q=0.9',
      Pragma: 'no-cache',
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 (KHTML, like Gecko) Safari/537.36'
    };

    if (tokens?.access_token && tokens?.refresh_token) {
      headers.Cookie = `auth-access-token=${tokens.access_token}; auth-refresh-token=${tokens.refresh_token}`;
    }

    return new Promise((resolve, reject) => {
      this.logger.info(`🔌 Connecting to Pulse v2 WS: ${this.wsUrl}`);
      this.ws = new WebSocket(this.wsUrl, { headers });

      this.ws.on('open', () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.logger.info('✅ Pulse v2 WS connected');
        this.startPing();

        // Send userState to activate streams
        try {
          this.ws.send(JSON.stringify(PULSE_USER_STATE));
          // Best-effort joins (if required by the server)
          this.ws.send(JSON.stringify({ action: 'join', room: 'update_pulse_v2' }));
        } catch (err) {
          this.logger.warning(`⚠️ Failed to send initial userState: ${err.message}`);
        }

        this.setupHandlers();
        resolve(true);
      });

      this.ws.on('error', (err) => {
        this.logger.error(`❌ Pulse v2 WS error: ${err.message}`);
        this.isConnected = false;
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          setTimeout(() => {
            this.reconnectAttempts += 1;
            this.connect();
          }, this.reconnectDelay);
        } else {
          reject(err);
        }
      });

      this.ws.on('close', () => {
        this.logger.warning('🔌 Pulse v2 WS closed');
        this.isConnected = false;
      });
    });
  }

  setupHandlers() {
    let sampleCount = 0;
    this.ws.on('message', (message) => {
      const decoded = this.decode(message);

      if (sampleCount < 5) {
        sampleCount += 1;
        const isBuffer = Buffer.isBuffer(message);
        const hexHead = isBuffer ? message.subarray(0, 32).toString('hex') : null;
        this.logger.info(`🔍 Pulse msg #${sampleCount} type=${Array.isArray(decoded) ? 'array' : typeof decoded} buf=${isBuffer} hexHead=${hexHead || 'n/a'}`);
        if (!Array.isArray(decoded)) {
          this.logger.info(`🔍 Pulse msg #${sampleCount} decoded preview: ${JSON.stringify(decoded).substring(0, 500)}${JSON.stringify(decoded || '').length > 500 ? '…' : ''}`);
        }
      }

      if (!decoded) return;

      if (Array.isArray(decoded)) {
        const [opcode, tokenKey, payload] = decoded;
        if (opcode === 0 && this._callbacks.snapshot) {
          this._callbacks.snapshot({ tokenKey, payload });
        } else if (opcode === 1 && this._callbacks.delta) {
          const mapped = {};
          if (Array.isArray(payload)) {
            for (const [idx, val] of payload) {
              mapped[idx] = val;
            }
          }
          this._callbacks.delta({ tokenKey, updates: mapped, rawUpdates: payload });
        }
       } else {
         // Handle JSON messages (e.g., snapshots)
         if (decoded.opcode === 0 && this._callbacks.snapshot) {
           this._callbacks.snapshot({ tokenKey: decoded.tokenKey, payload: null });
         } else if (decoded.opcode === 1 && this._callbacks.delta) {
           // Handle JSON deltas if any
           this._callbacks.delta({ tokenKey: decoded.tokenKey, updates: decoded.updates || {}, rawUpdates: decoded.payload || [] });
         } else {
           // Log first few non-array messages for diagnostics
           if (sampleCount < 3) {
             sampleCount += 1;
             this.logger.info(`🔍 Pulse message sample: ${JSON.stringify(decoded).substring(0, 500)}`);
           }
         }
       }
    });
  }

  onSnapshot(cb) {
    this._callbacks.snapshot = cb;
  }

  onDelta(cb) {
    this._callbacks.delta = cb;
  }

  refreshSnapshot() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.logger.info('🔄 Refreshing pulse snapshot...');
      this.ws.send(JSON.stringify(PULSE_USER_STATE));
    } else {
      this.logger.warning('⚠️ Cannot refresh snapshot: WebSocket not connected');
    }
  }
}

module.exports = PulseWSConnector;
