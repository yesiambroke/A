const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

class AxiomAuthManager {
  constructor(sessionFile = 'axiom_session.json') {
    this.baseHeaders = {
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
    this.tokens = { access_token: null, refresh_token: null };
    this.sessionFile = path.join(__dirname, sessionFile);
    this.email = null;
    this.otpJwtToken = null; // Store OTP token during login flow
  }

  // Session management methods
  saveSession() {
    try {
      const sessionData = {
        tokens: this.tokens,
        email: this.email,
        savedAt: Date.now(),
        version: "1.0" // For future compatibility
      };
      fs.writeFileSync(this.sessionFile, JSON.stringify(sessionData, null, 2));
      console.log("✅ Session saved successfully (persistent mode)");
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

      // Handle version compatibility (for future updates)
      if (!sessionData.version) {
        console.log("🔄 Migrating legacy session format");
      }

      // Remove arbitrary time-based expiry - let refresh tokens handle natural expiry
      // Sessions will persist until refresh token fails (like browser behavior)
      this.tokens = sessionData.tokens || { access_token: null, refresh_token: null };
      this.email = sessionData.email;

      const ageHours = (Date.now() - sessionData.savedAt) / (1000 * 60 * 60);
      console.log(`✅ Session loaded successfully (${ageHours.toFixed(1)} hours old, persistent mode)`);
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
        console.log("🗑️  Session cleared");
      }
    } catch (error) {
      console.error("❌ Failed to clear session:", error.message);
    }
    this.tokens = { access_token: null, refresh_token: null };
    this.email = null;
    this.otpJwtToken = null;
  }

  // Bootstrap tokens from cookie string
  setTokensFromCookieString(cookieString, emailHint = null) {
    if (!cookieString || typeof cookieString !== 'string') return false;
    const parts = cookieString.split(/;\s*/);
    let access = null, refresh = null;
    for (const p of parts) {
      const [k, v] = p.split('=');
      const key = (k || '').trim();
      const val = (v || '').trim();
      if (key === 'auth-access-token') access = val;
      if (key === 'auth-refresh-token') refresh = val;
    }
    if (!refresh) {
      console.error('❌ No auth-refresh-token found in cookie string');
      return false;
    }
    this.tokens.refresh_token = refresh;
    if (access) this.tokens.access_token = access;
    if (emailHint) this.email = emailHint;
    this.saveSession();
    return true;
  }

  // Step 1: Request OTP
  async loginStep1(email, b64Password) {
    const url = 'https://api6.axiom.trade/login-password-v2';
    const headers = {
      ...this.baseHeaders,
      'Content-Type': 'application/json'
    };
    const data = { email, b64Password };
    
    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(data) });
    
    if (!response.ok) {
      let errorBody = 'No body';
      try {
        errorBody = await response.text();
      } catch {} // Ignore body read errors
      console.error(`❌ Step 1 failed - Status: ${response.status}`);
      console.error(`Response body: ${errorBody}`);
      throw new Error(`HTTP error! status: ${response.status}. Details: ${errorBody}`);
    }
    
    const result = await response.json();
    this.otpJwtToken = result.otpJwtToken;
    this.email = email;
    return result.otpJwtToken;
  }

  // Step 2: Complete login with OTP code
  async loginStep2(otpJwtToken, otpCode, email, b64Password) {
    const url = 'https://api10.axiom.trade/login-otp';
    const headers = {
      ...this.baseHeaders,
      'Content-Type': 'application/json',
      'Cookie': `auth-otp-login-token=${otpJwtToken}`
    };
    const data = { code: otpCode, email, b64Password };
    
    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(data) });
    
    if (!response.ok) {
      let errorBody = 'No body';
      try {
        errorBody = await response.text();
      } catch {} // Ignore body read errors
      console.error(`❌ Step 2 failed - Status: ${response.status}`);
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
    
    // Store tokens and save session
    this.email = email;
    this.tokens.access_token = result.access_token;
    this.tokens.refresh_token = result.refresh_token;
    this.otpJwtToken = null; // Clear OTP token after successful login
    this.saveSession();
    
    return result;
  }

  // Refresh access token using refresh token
  async refreshAccessToken(refreshToken = this.tokens.refresh_token) {
    if (!refreshToken) {
      throw new Error("No refresh token available");
    }

    const url = 'https://api9.axiom.trade/refresh-access-token';
    const headers = {
      ...this.baseHeaders,
      'Cookie': `auth-refresh-token=${refreshToken}`,
      'Content-Length': '0'
    };
    
    const response = await fetch(url, { method: 'POST', headers });
    if (!response.ok) {
      let errorBody = 'No body';
      try {
        errorBody = await response.text();
      } catch {}
      
      // If refresh token is invalid/expired, clear the session
      if (response.status === 401 || response.status === 403) {
        console.log("⚠️  Refresh token expired, clearing session");
        this.clearSession();
        throw new Error("SESSION_EXPIRED");
      }
      
      throw new Error(`HTTP error! status: ${response.status}. Details: ${errorBody}`);
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
    this.saveSession(); // Save updated tokens
    return newAccessToken;
  }

  getTokens() {
    return this.tokens;
  }

  getAccessTokenExpiry(accessToken) {
    if (!accessToken) return null;
    const parts = accessToken.split('.');
    if (parts.length < 2) return null;
    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
      if (!payload.exp) return null;
      return payload.exp * 1000; // convert seconds to ms
    } catch {
      return null;
    }
  }

  isAccessTokenExpiringSoon(accessToken, bufferSeconds = 60) {
    const expMs = this.getAccessTokenExpiry(accessToken);
    if (!expMs) return true; // Unknown expiry → refresh defensively
    const now = Date.now();
    return expMs <= now + bufferSeconds * 1000;
  }

  async ensureValidAuthentication() {
    if (!this.tokens.refresh_token) {
      return false;
    }
    const needsRefresh = !this.tokens.access_token || this.isAccessTokenExpiringSoon(this.tokens.access_token, 60);
    if (needsRefresh) {
      try {
        await this.refreshAccessToken();
      } catch (e) {
        console.error("❌ Failed to refresh access token:", e.message);
        if (e.message === "SESSION_EXPIRED") {
          console.log("⚠️  Session completely expired, will need fresh login");
          return false;
        }
        this.clearSession(); // Clear invalid session
        return false;
      }
    }
    return true;
  }

  async tryRestoreSession() {
    if (this.loadSession()) {
      console.log("🔄 Attempting to restore session...");
      if (await this.ensureValidAuthentication()) {
        console.log("✅ Session restored successfully!");
        return true;
      } else {
        console.log("⚠️  Session restoration failed, clearing session");
        this.clearSession();
      }
    }
    return false;
  }

  // Full login flow with OTP (Step 1 only - returns OTP JWT token)
  async performFullLogin(email, b64Password) {
    console.log("🔐 Performing full login with OTP...");
    
    // Retry loop for Step 1
    let otpJwtToken = null;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (!otpJwtToken && retryCount < maxRetries) {
      try {
        console.log(`📧 Step 1: Sending email and password (Attempt ${retryCount + 1}/${maxRetries})...`);
        otpJwtToken = await this.loginStep1(email, b64Password);
        console.log("✅ OTP JWT token received. Please check your email for the OTP code.");
        break;
      } catch (error) {
        retryCount++;
        if (retryCount >= maxRetries) {
          console.error("❌ Max retries reached for login step 1.");
          throw error;
        }
        console.log("⏳ Retrying in 5 seconds...");
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    if (!otpJwtToken) {
      throw new Error("Failed to get OTP token");
    }
    
    return otpJwtToken;
  }

  // Complete login with OTP code
  async completeLoginWithOTP(otpCode) {
    if (!this.otpJwtToken || !this.email) {
      throw new Error("OTP flow not started. Call performFullLogin first.");
    }

    // Get password from environment or prompt
    const b64Password = process.env.AXIOM_PASSWORD_B64;
    if (!b64Password) {
      throw new Error("AXIOM_PASSWORD_B64 environment variable not set");
    }

    console.log("🔐 Step 2: Completing login with OTP code...");
    const result = await this.loginStep2(this.otpJwtToken, otpCode, this.email, b64Password);
    console.log("✅ Login completed successfully!");
    return result;
  }

  // CLI prompt helper for OTP
  async promptOTP() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question("📧 Enter the OTP code from your email: ", (otpCode) => {
        rl.close();
        resolve(otpCode.trim());
      });
    });
  }

  // Ensure authentication - tries session restore, falls back to OTP if needed
  async ensureAuthenticated() {
    // Try to restore existing session
    if (await this.tryRestoreSession()) {
      return true;
    }

    // Session expired or missing - require OTP
    console.log("⚠️  Axiom session expired or missing");
    console.log("📧 OTP authentication required");

    const email = process.env.AXIOM_EMAIL;
    const b64Password = process.env.AXIOM_PASSWORD_B64;

    if (!email || !b64Password) {
      throw new Error("AXIOM_EMAIL and AXIOM_PASSWORD_B64 environment variables must be set");
    }

    // Step 1: Request OTP
    const otpJwtToken = await this.performFullLogin(email, b64Password);
    
    // Step 2: Get OTP code (from CLI prompt or API)
    const otpCode = await this.promptOTP();
    
    // Step 3: Complete login
    await this.completeLoginWithOTP(otpCode);
    
    return true;
  }
}

module.exports = AxiomAuthManager;
