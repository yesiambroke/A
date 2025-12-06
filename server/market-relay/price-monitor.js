const WebSocket = require('ws');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// Create a simple logger
const logFile = path.join(__dirname, 'cunts.log');
function logToFile(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    fs.appendFileSync(logFile, logMessage);
}
const readline = require('readline');

class PriceMonitor {
    constructor(sessionFile = 'axiom_session.json') {
        this.sessionFile = path.join(__dirname, sessionFile);
        this.tokens = { access_token: null, refresh_token: null, lastRefresh: null };
        this.ws = null;
        this.solPrice = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 5000; // 5 seconds

        // Token refresh settings
        this.tokenRefreshInterval = 30 * 1000; // 30 seconds
        this.tokenExpiryBuffer = 5 * 1000; // 5 seconds buffer before expiry
        this.refreshTimer = null;

        // WebSocket ping settings
        this.pingInterval = 5 * 1000; // 5 seconds
        this.pingTimer = null;
        this.lastPongTime = Date.now();

        // Price history for analysis
        this.priceHistory = [];
        this.maxHistorySize = 100;

        // Token price tracking
        this.tokenPrices = new Map(); // tokenMint -> { price: number, timestamp: number, volume24h: number, marketCap: number }
        this.trackedTokens = new Set(); // Set of token mints we're tracking
        this.tokenTradeFeeds = new Map(); // pairId -> tokenMint (for f: room subscriptions)

        // Callbacks
        this.onPriceUpdate = null;
        this.onConnectionChange = null;
        this.onTokenPriceUpdate = null;
    }

    // Session management (similar to axiom.js)
    saveSession() {
        try {
            const sessionData = {
                tokens: {
                    ...this.tokens,
                    lastRefresh: this.tokens.lastRefresh
                },
                savedAt: Date.now()
            };
            fs.writeFileSync(this.sessionFile, JSON.stringify(sessionData, null, 2));
            console.log("📁 Price monitor session saved");
        } catch (error) {
            console.error("❌ Failed to save session:", error.message);
        }
    }

    loadSession() {
        try {
            if (!fs.existsSync(this.sessionFile)) {
                return false;
            }

            const sessionData = JSON.parse(fs.readFileSync(this.sessionFile, 'utf8'));

            // Check if session is not too old (24 hours)
            const maxAge = 24 * 60 * 60 * 1000;
            if (Date.now() - sessionData.savedAt > maxAge) {
                console.log("⏰ Session expired, removing old session file");
                this.clearSession();
                return false;
            }

            this.tokens = {
                access_token: sessionData.tokens?.access_token || null,
                refresh_token: sessionData.tokens?.refresh_token || null,
                lastRefresh: sessionData.tokens?.lastRefresh || null
            };
            console.log("📁 Price monitor session loaded");
            return true;
        } catch (error) {
            console.error("❌ Failed to load session:", error.message);
            this.clearSession();
            return false;
        }
    }

    clearSession() {
        try {
            if (fs.existsSync(this.sessionFile)) {
                fs.unlinkSync(this.sessionFile);
                console.log("🗑️  Price monitor session cleared");
            }
        } catch (error) {
            console.error("❌ Failed to clear session:", error.message);
        }
        this.tokens = { access_token: null, refresh_token: null, lastRefresh: null };
    }

    // Authentication methods (from axiom.js)
    async loginStep1(email, b64Password) {
        const url = 'https://api6.axiom.trade/login-password-v2';
        const headers = {
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br, zstd',
            'Origin': 'https://axiom.trade',
            'Connection': 'keep-alive',
            'Referer': 'https://axiom.trade/',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-site',
            'TE': 'trailers'
        };
        const data = { email, b64Password };

        const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(data) });

        if (!response.ok) {
            let errorBody = 'No body';
            try {
                errorBody = await response.text();
            } catch {} // Ignore body read errors
            console.error(`❌ Login Step 1 failed - Status: ${response.status}`);
            console.error(`Response body: ${errorBody}`);
            throw new Error(`HTTP error! status: ${response.status}. Details: ${errorBody}`);
        }

        const result = await response.json();
        return result.otpJwtToken;
    }

    async loginStep2(otpJwtToken, otpCode, email, b64Password) {
        const url = 'https://api10.axiom.trade/login-otp';
        const headers = {
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br, zstd',
            'Origin': 'https://axiom.trade',
            'Connection': 'keep-alive',
            'Referer': 'https://axiom.trade/',
            'Cookie': `auth-otp-login-token=${otpJwtToken}`,
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-site',
            'TE': 'trailers'
        };
        const data = { code: otpCode, email, b64Password };

        const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(data) });

        if (!response.ok) {
            let errorBody = 'No body';
            try {
                errorBody = await response.text();
            } catch {} // Ignore body read errors
            console.error(`❌ Login Step 2 failed - Status: ${response.status}`);
            console.error(`Response body: ${errorBody}`);
            throw new Error(`HTTP error! status: ${response.status}. Details: ${errorBody}`);
        }

        const result = await response.json();

        const rawHeaders = response.headers.raw();
        const setCookies = rawHeaders['set-cookie'] || [];
        let access_token = null;
        let refresh_token = null;

        for (let cookieStr of setCookies) {
            const [cookiePart] = cookieStr.split(';');
            const [key, value] = cookiePart.split('=');
            const trimmedKey = key.trim();
            if (trimmedKey === 'auth-access-token') {
                access_token = value.trim();
            } else if (trimmedKey === 'auth-refresh-token') {
                refresh_token = value.trim();
            }
        }

        if (access_token) result.access_token = access_token;
        if (refresh_token) result.refresh_token = refresh_token;

        return result;
    }

    async performFullLogin(email, b64Password) {
        console.log("🔐 Performing full login with OTP...");

        // Step 1: Send email and password
        console.log("📧 Step 1: Sending email and password...");
        const otpJwtToken = await this.loginStep1(email, b64Password);
        console.log("✅ OTP JWT token received. Please check your email for the OTP code.");

        // Step 2: Get OTP and complete login
        const otpCode = await this.question("📱 Enter the OTP code from your email: ");

        console.log("🔄 Step 2: Sending OTP code...");
        const credentials = await this.loginStep2(otpJwtToken, otpCode, email, b64Password);
        console.log("✅ Login completed successfully!");

        // Store tokens
        this.tokens.access_token = credentials.access_token;
        this.tokens.refresh_token = credentials.refresh_token;
        this.tokens.lastRefresh = Date.now();
        this.saveSession();

        return credentials;
    }

    async tryRefreshFromExistingSession() {
        try {
            // Check if axiom_session.json exists
            const axiomSessionPath = path.join(__dirname, 'axiom_session.json');
            if (!fs.existsSync(axiomSessionPath)) {
                console.log("📄 No axiom_session.json found");
                return false;
            }

            // Load the session
            const axiomSession = JSON.parse(fs.readFileSync(axiomSessionPath, 'utf8'));
            const refreshToken = axiomSession.tokens?.refresh_token;

            if (!refreshToken) {
                console.log("🔑 No refresh_token found in axiom_session.json");
                return false;
            }

            console.log("🔄 Attempting to refresh token using existing refresh_token...");

            // Build cookie and refresh
            const url = 'https://api9.axiom.trade/refresh-access-token';
            const headers = {
                'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br, zstd',
                'Origin': 'https://axiom.trade',
                'Connection': 'keep-alive',
                'Referer': 'https://axiom.trade/',
                'Cookie': `auth-refresh-token=${refreshToken}`,
                'Content-Length': '0'
            };

            const response = await fetch(url, { method: 'POST', headers });

            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    console.log("🔐 Refresh token expired, need full login");
                    return false;
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const rawHeaders = response.headers.raw();
            const setCookies = rawHeaders['set-cookie'] || [];
            let newAccessToken = null;

            for (let cookieStr of setCookies) {
                const [cookiePart] = cookieStr.split(';');
                const [key, value] = cookiePart.split('=');
                const trimmedKey = key.trim();
                if (trimmedKey === 'auth-access-token') {
                    newAccessToken = value.trim();
                    break;
                }
            }

            if (!newAccessToken) {
                const jsonResponse = await response.json();
                newAccessToken = jsonResponse['auth-access-token'] || jsonResponse.access_token;
            }

            if (!newAccessToken) {
                console.log("❌ No access token received from refresh");
                return false;
            }

            // Update our tokens
            this.tokens.access_token = newAccessToken;
            this.tokens.refresh_token = refreshToken; // Keep the same refresh token
            this.tokens.lastRefresh = Date.now();
            this.saveSession();

            console.log("✅ Successfully refreshed access token from existing session");
            return true;

        } catch (error) {
            console.log("❌ Failed to refresh from existing session:", error.message);
            return false;
        }
    }

    async question(prompt) {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        return new Promise((resolve) => {
            rl.question(prompt, (answer) => {
                rl.close();
                resolve(answer);
            });
        });
    }

    async ensureValidAuthentication() {
        if (!this.tokens.refresh_token) {
            return false;
        }
        if (!this.tokens.access_token) {
            try {
                await this.refreshAccessToken();
            } catch (e) {
                console.error("❌ Failed to refresh access token:", e.message);
                if (e.message === "SESSION_EXPIRED") {
                    return false;
                }
                this.clearSession();
                return false;
            }
        }
        return true;
    }

    // Authentication methods (simplified from axiom.js)
    async refreshAccessToken(refreshToken = this.tokens.refresh_token) {
        const url = 'https://api9.axiom.trade/refresh-access-token';
        const headers = {
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br, zstd',
            'Origin': 'https://axiom.trade',
            'Connection': 'keep-alive',
            'Referer': 'https://axiom.trade/',
            'Cookie': `auth-refresh-token=${refreshToken}`,
            'Content-Length': '0'
        };

        const response = await fetch(url, { method: 'POST', headers });

        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                console.log("🔐 Session expired for price monitor");
                this.clearSession();
                throw new Error("SESSION_EXPIRED");
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const rawHeaders = response.headers.raw();
        const setCookies = rawHeaders['set-cookie'] || [];
        let newAccessToken = null;

        for (let cookieStr of setCookies) {
            const [cookiePart] = cookieStr.split(';');
            const [key, value] = cookiePart.split('=');
            const trimmedKey = key.trim();
            if (trimmedKey === 'auth-access-token') {
                newAccessToken = value.trim();
                break;
            }
        }

        if (!newAccessToken) {
            const jsonResponse = await response.json();
            newAccessToken = jsonResponse['auth-access-token'] || jsonResponse.access_token;
        }

        if (!newAccessToken) {
            throw new Error("No access token found in refresh response");
        }

        this.tokens.access_token = newAccessToken;
        this.tokens.lastRefresh = Date.now();
        this.saveSession();
        console.log("🔄 Access token refreshed successfully");
        return newAccessToken;
    }

    async ensureValidAuthentication() {
        if (!this.tokens.refresh_token) {
            return false;
        }
        if (!this.tokens.access_token) {
            try {
                await this.refreshAccessToken();
            } catch (e) {
                console.error("❌ Failed to refresh access token:", e.message);
                if (e.message === "SESSION_EXPIRED") {
                    return false;
                }
                this.clearSession();
                return false;
            }
        }
        return true;
    }

    // Token refresh management
    needsTokenRefresh() {
        if (!this.tokens.access_token || !this.tokens.lastRefresh) {
            return true; // Need refresh if no token or no timestamp
        }

        const timeSinceRefresh = Date.now() - this.tokens.lastRefresh;
        return timeSinceRefresh >= (this.tokenRefreshInterval - this.tokenExpiryBuffer);
    }

    async ensureFreshToken() {
        if (this.needsTokenRefresh()) {
            console.log("🔄 Token refresh needed, refreshing access token...");
            try {
                await this.refreshAccessToken();
                console.log("✅ Token refreshed successfully");
            } catch (error) {
                console.error("❌ Failed to refresh token:", error.message);
                // If refresh fails, we'll need to re-authenticate
                throw error;
            }
        } else {
            const timeUntilRefresh = this.tokenRefreshInterval - (Date.now() - this.tokens.lastRefresh);
            const secondsUntilRefresh = Math.ceil(timeUntilRefresh / 1000);
            console.log(`🔑 Token is fresh (${secondsUntilRefresh} seconds until next refresh)`);
        }
    }

    startPeriodicRefresh() {
        // Clear any existing timer
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
        }

        // Set up periodic refresh
        this.refreshTimer = setInterval(async () => {
            try {
                await this.ensureFreshToken();
            } catch (error) {
                console.error("❌ Periodic token refresh failed:", error.message);
                // Don't clear the session here, just log the error
                // The connection logic will handle re-auth if needed
            }
        }, this.tokenRefreshInterval);

        console.log(`⏰ Started periodic token refresh (every ${this.tokenRefreshInterval / 1000} seconds)`);
    }

    stopPeriodicRefresh() {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
            console.log("⏰ Stopped periodic token refresh");
        }
    }

    startPingTimer() {
        this.stopPingTimer(); // Clear any existing timer

        this.pingTimer = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                // Send ping to keep connection alive
                this.ws.ping();

                // Check if we've received a pong recently (within 30 seconds - more lenient)
                const timeSinceLastPong = Date.now() - this.lastPongTime;
                if (timeSinceLastPong > 30000) {
                    console.log(`⚠️ No pong received in ${timeSinceLastPong / 1000}s, connection might be stale`);
                    // Force reconnection
                    this.ws.close(1000, "No pong received");
                }
            }
        }, this.pingInterval);

        console.log(`🏓 Started WebSocket ping timer (every ${this.pingInterval / 1000} seconds)`);
    }

    stopPingTimer() {
        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
            console.log("🏓 Stopped WebSocket ping timer");
        }
    }

    // WebSocket connection with full auth flow
    async connectWithAuth() {
        console.log("🔌 Attempting to connect price monitor with authentication...");

        // First, check if we have any tokens at all
        let hasValidAuth = await this.ensureValidAuthentication();

        if (!hasValidAuth) {
            console.log("🔄 No valid authentication found. Attempting token refresh from existing session...");

            // Try to refresh using existing refresh_token first
            const refreshSuccess = await this.tryRefreshFromExistingSession();
            if (refreshSuccess) {
                console.log("✅ Token refreshed from existing session!");
                hasValidAuth = true;
            } else {
                console.log("⚠️  Token refresh failed. Starting full login process...");

                // Use hardcoded credentials (same as axiom.js)
                const email = "axiejcs1@gmail.com";
                const b64Password = "d32HUeIJ2XFxxRKYSUZ/53ocP3uRLbhLSY9syWMwPnI=";

                try {
                    await this.performFullLogin(email, b64Password);
                    console.log("✅ Authentication completed successfully!");
                    hasValidAuth = true;
                } catch (error) {
                    console.error("❌ Authentication failed:", error.message);
                    return false;
                }
            }
        }

        if (!hasValidAuth) {
            console.error("❌ Unable to establish authentication");
            return false;
        }

        // Always check if tokens need refresh before connecting to WebSocket
        console.log("🔍 Checking token freshness before WebSocket connection...");
        try {
            await this.ensureFreshToken();
        } catch (error) {
            console.error("❌ Failed to ensure fresh token before connection:", error.message);
            // Try re-authentication
            console.log("🔄 Attempting re-authentication...");
            try {
                const email = "axiejcs1@gmail.com";
                const b64Password = "d32HUeIJ2XFxxRKYSUZ/53ocP3uRLbhLSY9syWMwPnI=";
                await this.performFullLogin(email, b64Password);
            } catch (retryError) {
                console.error("❌ Re-authentication also failed:", retryError.message);
                return false;
            }
        }

        return await this.connect();
    }

    // WebSocket connection
    async connect() {
        if (!this.tokens.access_token || !this.tokens.refresh_token) {
            console.error("❌ No authentication tokens available");
            return false;
        }

        const wsUrl = "wss://cluster-asia2.axiom.trade/";
        const headers = {
            'Origin': 'https://axiom.trade',
            'Cache-Control': 'no-cache',
            'Accept-Language': 'en-US,en;q=0.9,es;q=0.8',
            'Pragma': 'no-cache',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36 OPR/120.0.0.0',
            'Cookie': `auth-access-token=${this.tokens.access_token}; auth-refresh-token=${this.tokens.refresh_token}`
        };

        try {
            console.log("🔌 Connecting price monitor to Axiom WebSocket...");
            this.ws = new WebSocket(wsUrl, { headers });

            return new Promise((resolve, reject) => {
                this.ws.on('open', () => {
                    console.log("✅ Price monitor WebSocket connected");
                    this.isConnected = true;
                    this.reconnectAttempts = 0;

                    // Subscribe to SOL price updates
                    this.subscribeToSolPrice();

                    if (this.onConnectionChange) {
                        this.onConnectionChange(true);
                    }

                    // Start ping timer to keep connection alive
                    this.startPingTimer();

                    // Subscribe to any queued token feeds (with small delay to ensure WS is ready)
                    setTimeout(() => {
                        this.retryQueuedSubscriptions();
                    }, 1000);

                    resolve(true);
                });

                this.ws.on('error', (error) => {
                    console.error("❌ Price monitor WebSocket error:", error.message);
                    this.isConnected = false;
                    this.stopPingTimer();

                    if (error.message && error.message.includes('401')) {
                        console.log("🔐 Price monitor auth failed (401)");
                        this.clearSession();
                        reject(new Error("WEBSOCKET_AUTH_FAILED"));
                    } else {
                        reject(error);
                    }
                });

                this.ws.on('pong', () => {
                    this.lastPongTime = Date.now();
                });
            });

        } catch (error) {
            console.error("❌ Failed to connect price monitor:", error);
            this.isConnected = false;
            return false;
        }
    }

    subscribeToSolPrice() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.error("❌ Cannot subscribe to SOL price - WebSocket not connected");
            return;
        }

        try {
            this.ws.send(JSON.stringify({
                "action": "join",
                "room": "sol_price"
            }));
            console.log("📡 Price monitor subscribed to SOL price updates");
        } catch (error) {
            console.error("❌ Failed to subscribe to SOL price:", error.message);
        }
    }

    async start() {
        console.log('🔧 Starting price monitor initialization...');
        if (!this.ws) {
            console.log('🔌 No existing WebSocket, establishing connection...');
            const connected = await this.connectWithAuth();
            if (!connected) {
                console.error("❌ Failed to establish WebSocket connection - authentication or connection failed");
                return false;
            }
            console.log('✅ WebSocket connection established');
        } else {
            console.log('🔌 Using existing WebSocket connection');
        }

        // Start periodic token refresh
        this.startPeriodicRefresh();
        console.log('✅ Price monitor fully initialized');

        // Set up message handlers if WebSocket exists
        if (this.ws) {
            this.ws.on('message', (message) => {
                try {
                    const data = JSON.parse(message.toString());

                    if (data.room === "sol_price") {
                        const newPrice = data.content;

                        // Store price history
                        this.priceHistory.push({
                            price: newPrice,
                            timestamp: Date.now()
                        });

                        // Keep history size manageable
                        if (this.priceHistory.length > this.maxHistorySize) {
                            this.priceHistory.shift();
                        }

                        // Update current price (quietly, just for reference)
                        const oldPrice = this.solPrice;
                        this.solPrice = newPrice;

                        // Only show significant changes (>0.1%) or first update
                        if (!oldPrice || Math.abs((newPrice - oldPrice) / oldPrice) > 0.001) {
                            console.log(`💰 SOL Price: $${newPrice.toFixed(2)} ${oldPrice ? `(${newPrice > oldPrice ? '+' : ''}${(newPrice - oldPrice).toFixed(2)})` : '(reference)'}`);
                        }

                        // Notify callback
                        if (this.onPriceUpdate) {
                            this.onPriceUpdate(newPrice, oldPrice);
                        }
                    }
                    else if (data.room && data.room.startsWith('f:')) {
                        // Handle token trade feed messages
                        this.handleTokenTradeUpdate(data.content, data.room);
                    }

                } catch (error) {
                    console.error("❌ Error parsing price monitor message:", error.message);
                }
            });

            this.ws.on('close', (code, reason) => {
                console.log(`🔌 Price monitor WebSocket closed. Code: ${code}, Reason: ${reason}`);
                this.isConnected = false;
                this.stopPingTimer();

                if (this.onConnectionChange) {
                    this.onConnectionChange(false);
                }

                // Auto-reconnect logic with subscription restoration
                if (this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.reconnectAttempts++;
                    console.log(`🔄 Price monitor reconnecting in ${this.reconnectDelay / 1000}s... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

                    setTimeout(async () => {
                        try {
                            // Reconnect and restore all subscriptions
                            console.log("🔄 Restoring WebSocket connection and subscriptions...");
                            const connected = await this.connectWithAuth();

                            if (connected) {
                                console.log("✅ WebSocket reconnected successfully, subscriptions restored");
                            } else {
                                console.error("❌ WebSocket reconnection failed");
                            }
                        } catch (error) {
                            console.error("❌ Price monitor reconnection failed:", error.message);
                        }
                    }, this.reconnectDelay);
                } else {
                    console.error("❌ Price monitor max reconnection attempts reached");
                }
            });

            this.ws.on('error', (error) => {
                console.error("❌ Price monitor WebSocket error:", error.message);
                this.isConnected = false;
            });
        }

        return true; // Successfully started
    }

    // Set session tokens from external source (like axiom.js session)
    setTokens(accessToken, refreshToken) {
        this.tokens.access_token = accessToken;
        this.tokens.refresh_token = refreshToken;
        this.tokens.lastRefresh = Date.now(); // Assume tokens are fresh when set externally
        this.saveSession();
        console.log("🔑 Price monitor tokens set from external source");
    }

    // Get current SOL price
    getCurrentPrice() {
        return this.solPrice;
    }

    // Get price history
    getPriceHistory() {
        return this.priceHistory;
    }

    // Check if connected
    isWebSocketConnected() {
        const connected = this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN;
        console.log(`🔌 WebSocket connection check: isConnected=${this.isConnected}, ws exists=${!!this.ws}, readyState=${this.ws?.readyState}, result=${connected}`);
        return connected;
    }

    // Token price tracking methods
    async getPumpFunTokenInfo(tokenMint) {
        try {
            const url = `https://frontend-api-v3.pump.fun/coins/${tokenMint}`;
            const response = await fetch(url);

            if (!response.ok) {
                console.log(`❌ Failed to fetch Pump.fun info for ${tokenMint}: ${response.status}`);
                return null;
            }

            const data = await response.json();
            return {
                mint: data.mint,
                name: data.name || data.token_name || 'Unknown',
                symbol: data.symbol || data.token_ticker || data.mint?.substring(0, 6) + '...' || 'UNK',
                bondingCurve: data.bonding_curve,
                associatedBondingCurve: data.associated_bonding_curve,
                pumpSwapPool: data.pump_swap_pool,
                isMigrated: data.pump_swap_pool !== null,
                virtualSolReserves: data.virtual_sol_reserves,
                virtualTokenReserves: data.virtual_token_reserves,
                marketCap: data.market_cap,
                usdMarketCap: data.usd_market_cap
            };
        } catch (error) {
            console.log(`❌ Error fetching Pump.fun info for ${tokenMint}:`, error.message);
            return null;
        }
    }

    async trackToken(tokenMint) {
        console.log(`🔍 Price Monitor: Starting to track token ${tokenMint}`);
        logToFile(`Starting to track token ${tokenMint}`);

        if (this.trackedTokens.has(tokenMint)) {
            console.log(`📊 Price Monitor: Already tracking token: ${tokenMint}`);
            logToFile(`Already tracking token: ${tokenMint}`);
            return true;
        }

        console.log(`🔍 Price Monitor: Getting Pump.fun info for token: ${tokenMint}`);
        logToFile(`Getting Pump.fun info for token: ${tokenMint}`);

        const tokenInfo = await this.getPumpFunTokenInfo(tokenMint);

        if (!tokenInfo) {
            console.log(`❌ Price Monitor: Token ${tokenMint} is not a valid Pump.fun token`);
            logToFile(`Token ${tokenMint} is not a valid Pump.fun token`);
            return false;
        }

        // Determine which address to use for trade feed subscription
        const pairId = tokenInfo.isMigrated ? tokenInfo.pumpSwapPool : tokenInfo.bondingCurve;
        console.log(`🎯 Price Monitor: Token ${tokenMint}: ${tokenInfo.isMigrated ? 'MIGRATED to AMM' : 'BONDING CURVE'}, Pair ID: ${pairId}`);
        logToFile(`Token ${tokenMint}: ${tokenInfo.isMigrated ? 'MIGRATED to AMM' : 'BONDING CURVE'}, Pair ID: ${pairId}`);

        if (!pairId) {
            console.log(`❌ Price Monitor: No pair ID found for token ${tokenMint}`);
            logToFile(`No pair ID found for token ${tokenMint}`);
            return false;
        }

        // Check if WebSocket is connected before subscribing
        if (!this.isWebSocketConnected()) {
            console.log(`⚠️  WebSocket not connected, cannot subscribe to token trades yet`);
            // Still add to tracking list for later subscription
            this.trackedTokens.add(tokenMint);
            this.tokenTradeFeeds.set(pairId, tokenMint);

            // Initialize price data
            const spotPriceSol = tokenInfo.virtualSolReserves && tokenInfo.virtualTokenReserves ?
                tokenInfo.virtualSolReserves / tokenInfo.virtualTokenReserves : 0;

            this.tokenPrices.set(tokenMint, {
                price: spotPriceSol,
                timestamp: Date.now(),
                marketCap: tokenInfo.marketCap || 0,
                usdMarketCap: tokenInfo.usdMarketCap || 0,
                pairId: pairId,
                isMigrated: tokenInfo.isMigrated
            });

            console.log(`📋 Token queued for tracking: ${tokenMint} (will subscribe when connected)`);
            return true;
        }

        // Subscribe to trade feed
        console.log(`📡 Subscribing to trade feed for ${tokenMint}...`);
        this.subscribeToTokenTrades(pairId, tokenMint);

        // Add to tracked tokens
        this.trackedTokens.add(tokenMint);
        this.tokenTradeFeeds.set(pairId, tokenMint);

        // Initialize price data
        const spotPriceSol = tokenInfo.virtualSolReserves && tokenInfo.virtualTokenReserves ?
            tokenInfo.virtualSolReserves / tokenInfo.virtualTokenReserves : 0;

        this.tokenPrices.set(tokenMint, {
            price: spotPriceSol,
            timestamp: Date.now(),
            marketCap: tokenInfo.marketCap || 0,
            usdMarketCap: tokenInfo.usdMarketCap || 0,
            pairId: pairId,
            isMigrated: tokenInfo.isMigrated
        });

        console.log(`✅ Now tracking token: ${tokenMint} (pair: ${pairId}, migrated: ${tokenInfo.isMigrated})`);
        return true;
    }

    subscribeToTokenTrades(pairId, tokenMint) {
        console.log(`🔌 Checking WebSocket status for subscription: readyState=${this.ws?.readyState}`);
        logToFile(`Checking WebSocket status for subscription: readyState=${this.ws?.readyState}`);

        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.log(`❌ Cannot subscribe to token trades - WebSocket not connected (readyState: ${this.ws?.readyState})`);
            logToFile(`Cannot subscribe to token trades - WebSocket not connected (readyState: ${this.ws?.readyState})`);
            return;
        }

        try {
            const message = JSON.stringify({
                "action": "join",
                "room": `f:${pairId}`
            });
            console.log(`📤 Sending subscription message: ${message}`);
            logToFile(`Sending subscription message: ${message}`);

            this.ws.send(message);
            console.log(`✅ Subscribed to trade feed for ${tokenMint} (f:${pairId})`);
            logToFile(`Subscribed to trade feed for ${tokenMint} (f:${pairId})`);
        } catch (error) {
            console.log(`❌ Failed to subscribe to token trades for ${tokenMint}:`, error.message);
            logToFile(`Failed to subscribe to token trades for ${tokenMint}: ${error.message}`);
        }
    }

    handleTokenTradeUpdate(data, room) {
        // data is the content array from the f: room message
        const [
            txId,              // content[0] - tx signature
            wallet,            // content[1] - trader wallet
            timestamp,         // content[2] - timestamp (ms)
            type,              // content[3] - 0 = buy, 1 = sell
            spotPriceSol,      // content[4] - spot price in SOL
            usdPricePerToken,  // content[5] - execution price in USD per token
            solAmount,         // content[6] - SOL amount
            usdAmount,         // content[7] - USD amount
            tokenAmount,       // content[8] - token amount
            virtualSol,        // content[9] - virtual SOL reserves
            virtualToken       // content[10] - virtual token reserves
        ] = data;

        // Extract pairId from room name (f:pairId)
        const pairId = room.replace('f:', '');
        const tokenMint = this.tokenTradeFeeds.get(pairId);

        if (!tokenMint) {
            console.log(`⚠️ Received trade update for unknown pair: ${pairId} (room: ${room})`);
            return;
        }

        // Update token price data
        const currentPriceData = this.tokenPrices.get(tokenMint) || {};
        this.tokenPrices.set(tokenMint, {
            ...currentPriceData,
            price: spotPriceSol,
            timestamp: timestamp,
            lastTradeType: type === 0 ? 'buy' : 'sell',
            lastTradeAmount: tokenAmount,
            lastTradeSolAmount: solAmount,
            lastTradeUsdAmount: usdAmount,
            lastTradeTx: txId,
            virtualSolReserves: virtualSol,
            virtualTokenReserves: virtualToken
        });

        // Calculate USD price if we have SOL price
        const usdPrice = this.solPrice && spotPriceSol ? spotPriceSol * this.solPrice : usdPricePerToken;

        console.log(`💰 ${tokenMint.slice(0, 8)}... | ${type === 0 ? '🟢 BUY' : '🔴 SELL'} | ${tokenAmount.toFixed(2)} tokens | ${solAmount.toFixed(4)} SOL | $${usdPrice?.toFixed(6) || 'N/A'} | Price: ${spotPriceSol.toFixed(10)} SOL/token`);
        logToFile(`${tokenMint.slice(0, 8)} | ${type === 0 ? 'BUY' : 'SELL'} | ${tokenAmount.toFixed(2)} tokens | ${solAmount.toFixed(4)} SOL | Price: ${spotPriceSol.toFixed(10)} SOL/token`);

        // Notify callback if set
        if (this.onTokenPriceUpdate) {
            this.onTokenPriceUpdate(tokenMint, {
                price: spotPriceSol,
                usdPrice: usdPrice,
                timestamp: timestamp,
                type: type === 0 ? 'buy' : 'sell',
                tokenAmount: tokenAmount,
                solAmount: solAmount,
                usdAmount: usdAmount,
                txId: txId
            });
        }
    }

    getTokenPrice(tokenMint) {
        return this.tokenPrices.get(tokenMint);
    }

    stopTrackingToken(tokenMint) {
        console.log(`🛑 Stopping tracking for token: ${tokenMint}`);
        logToFile(`Stopping tracking for token: ${tokenMint}`);

        // Send leave message to WebSocket if connected
        if (this.ws && this.ws.readyState === 1) {
            const tokenData = this.trackedTokens.get(tokenMint);
            if (tokenData && tokenData.pairId) {
                const leaveMessage = {
                    "action": "leave",
                    "room": `f:${tokenData.pairId}`
                };

                try {
                    this.ws.send(JSON.stringify(leaveMessage));
                    console.log(`📤 Sent leave message for token ${tokenMint} (room: f:${tokenData.pairId})`);
                    logToFile(`Sent leave message for token ${tokenMint}`);
                } catch (error) {
                    console.error(`❌ Failed to send leave message for token ${tokenMint}:`, error.message);
                    logToFile(`Failed to send leave message for token ${tokenMint}: ${error.message}`);
                }
            }
        }

        // Remove from tracked tokens
        this.trackedTokens.delete(tokenMint);

        // Remove from token prices
        this.tokenPrices.delete(tokenMint);

        // Remove from queued subscriptions if present
        if (this.tokenTrackingQueue) {
            this.tokenTrackingQueue = this.tokenTrackingQueue.filter(item => item.tokenMint !== tokenMint);
        }

        console.log(`✅ Stopped tracking token: ${tokenMint}`);
        logToFile(`Stopped tracking token: ${tokenMint}`);
    }

    retryQueuedSubscriptions() {
        if (!this.isWebSocketConnected()) {
            console.log('⚠️  Cannot retry subscriptions - WebSocket not connected');
            return;
        }

        let retryCount = 0;
        for (const [pairId, tokenMint] of this.tokenTradeFeeds.entries()) {
            console.log(`🔄 Retrying subscription for ${tokenMint} (f:${pairId})`);
            try {
                this.subscribeToTokenTrades(pairId, tokenMint);
                retryCount++;
            } catch (error) {
                console.log(`❌ Failed to retry subscription for ${tokenMint}:`, error.message);
            }
        }

        if (retryCount > 0) {
            console.log(`✅ Retried subscriptions for ${retryCount} tokens`);
        } else if (this.tokenTradeFeeds.size > 0) {
            console.log(`⚠️  No subscriptions retried, but ${this.tokenTradeFeeds.size} tokens in queue`);
        }
    }

    getAllTokenPrices() {
        return Object.fromEntries(this.tokenPrices);
    }

    // Close connection
    close() {
        if (this.ws) {
            this.ws.close();
            console.log("🔌 Price monitor WebSocket closed");
        }
        this.isConnected = false;

        // Stop timers
        this.stopPeriodicRefresh();
        this.stopPingTimer();

        // Clear token tracking
        this.tokenPrices.clear();
        this.trackedTokens.clear();
        this.tokenTradeFeeds.clear();
    }
}

module.exports = PriceMonitor;
