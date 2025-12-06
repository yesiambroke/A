/**
 * Test script for Market Relay Server
 * Tests OTP flow and WebSocket connection
 */

const AxiomAuthManager = require('./axiom-auth-manager');
const AxiomWebSocketConnector = require('./axiom-ws-connector');
require('dotenv').config({ path: '../.env.local' });

async function testAuthManager() {
  console.log('🧪 Testing AxiomAuthManager...\n');
  
  const authManager = new AxiomAuthManager('test_axiom_session.json');
  
  // Test session restore
  console.log('1. Testing session restore...');
  const restored = await authManager.tryRestoreSession();
  console.log(`   Result: ${restored ? '✅ Session restored' : '❌ No session found'}\n`);
  
  if (!restored) {
    console.log('2. Testing OTP flow...');
    const email = process.env.AXIOM_EMAIL;
    const password = process.env.AXIOM_PASSWORD_B64;
    
    if (!email || !password) {
      console.log('   ❌ AXIOM_EMAIL and AXIOM_PASSWORD_B64 not set in .env.local');
      console.log('   Skipping OTP test...\n');
      return;
    }
    
    try {
      console.log('   Step 1: Requesting OTP...');
      const otpJwtToken = await authManager.performFullLogin(email, password);
      console.log(`   ✅ OTP JWT token received: ${otpJwtToken.substring(0, 20)}...`);
      
      console.log('   Step 2: Please enter OTP code from email:');
      const otpCode = await authManager.promptOTP();
      
      console.log('   Completing login...');
      await authManager.completeLoginWithOTP(otpCode);
      console.log('   ✅ Login completed successfully!\n');
    } catch (error) {
      console.log(`   ❌ OTP flow failed: ${error.message}\n`);
    }
  }
  
  // Test token refresh
  console.log('3. Testing token refresh...');
  try {
    const isValid = await authManager.ensureValidAuthentication();
    console.log(`   Result: ${isValid ? '✅ Tokens valid' : '❌ Tokens invalid'}\n`);
  } catch (error) {
    console.log(`   ❌ Token refresh failed: ${error.message}\n`);
  }
}

async function testWebSocketConnector() {
  console.log('🧪 Testing AxiomWebSocketConnector...\n');
  
  const authManager = new AxiomAuthManager('test_axiom_session.json');
  
  // Ensure authenticated
  if (!await authManager.tryRestoreSession()) {
    console.log('❌ No valid session. Please run auth test first.\n');
    return;
  }
  
  const connector = new AxiomWebSocketConnector(authManager, 'DEBUG');
  
  // Test connection
  console.log('1. Testing WebSocket connection...');
  try {
    const connected = await connector.connect();
    if (!connected) {
      console.log('   ❌ Failed to connect\n');
      return;
    }
    console.log('   ✅ Connected successfully\n');
    
    // Test subscriptions
    console.log('2. Testing subscriptions...');
    
    await connector.subscribeSolPrice((data) => {
      console.log(`   ✅ SOL price received: $${data.content}`);
    });
    
    await connector.subscribeNewTokens((tokenData) => {
      console.log(`   ✅ New token received: ${tokenData.token_name} (${tokenData.token_ticker})`);
    });
    
    await connector.subscribeTokenUpdates((parsed) => {
      console.log(`   ✅ Token update received: ${parsed.tokenName || parsed.tokenTicker || 'Unknown'}`);
    });
    
    console.log('   ✅ All subscriptions active\n');
    
    // Wait for ping/pong
    console.log('3. Testing ping/pong (waiting 10 seconds)...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Disconnect
    console.log('\n4. Disconnecting...');
    connector.disconnect();
    console.log('   ✅ Disconnected\n');
    
  } catch (error) {
    console.log(`   ❌ Test failed: ${error.message}\n`);
  }
}

async function runTests() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  Market Relay Server - Test Suite');
  console.log('═══════════════════════════════════════════════════\n');
  
  try {
    await testAuthManager();
    await testWebSocketConnector();
    
    console.log('═══════════════════════════════════════════════════');
    console.log('  Tests completed!');
    console.log('═══════════════════════════════════════════════════\n');
  } catch (error) {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  }
}

// Run tests if executed directly
if (require.main === module) {
  runTests();
}

module.exports = { testAuthManager, testWebSocketConnector };
