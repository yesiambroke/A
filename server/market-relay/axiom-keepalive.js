const AxiomAuthManager = require('./axiom-auth-manager');
const AxiomWebSocketConnector = require('./axiom-ws-connector');

// Lightweight keep-alive script that:
// 1) Refreshes/validates Axiom auth tokens.
// 2) Ensures the WS connection is up, reconnecting when needed.
// Runs every 5 seconds.

const authManager = new AxiomAuthManager('axiom_session.json');
const wsConnector = new AxiomWebSocketConnector(authManager, 'INFO');

let connecting = false;

async function connectWs() {
  if (connecting) return;
  connecting = true;
  try {
    const connected = await wsConnector.connect();
    if (connected) {
      console.log('✅ [keepalive] WebSocket connected');
    } else {
      console.log('⚠️  [keepalive] WebSocket connect attempt failed');
    }
  } catch (error) {
    console.error('❌ [keepalive] WebSocket connect error:', error.message);
  } finally {
    connecting = false;
  }
}

async function tick() {
  try {
    const authOk = await authManager.ensureValidAuthentication();
    if (!authOk) {
      console.warn('⚠️  [keepalive] Auth invalid; awaiting manual re-login');
      return;
    }

    if (!wsConnector.isConnected) {
      await connectWs();
    }
  } catch (error) {
    console.error('❌ [keepalive] Tick error:', error.message);
  }
}

// Kick off immediately, then every 5s
tick();
const interval = setInterval(tick, 5000);

// Graceful shutdown
process.on('SIGINT', () => {
  clearInterval(interval);
  wsConnector.disconnect();
  process.exit(0);
});

process.on('SIGTERM', () => {
  clearInterval(interval);
  wsConnector.disconnect();
  process.exit(0);
});

