const WebSocket = require('ws');

// Test WebSocket connection to chat server
const WS_URL = 'ws://localhost:8080';

console.log('🧪 Testing WebSocket connection to chat server...');
console.log(`📡 Connecting to: ${WS_URL}`);

const ws = new WebSocket(WS_URL);

ws.on('open', () => {
  console.log('✅ Connected to chat server');
  
  // Send ping
  ws.send(JSON.stringify({
    type: 'ping',
    data: {}
  }));
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());
    console.log('📨 Received:', message);
    
    if (message.type === 'welcome') {
      console.log('🎉 Welcome message received');
    }
    
    if (message.type === 'pong') {
      console.log('🏓 Pong received - connection is working!');
      
      // Close connection after successful test
      setTimeout(() => {
        ws.close();
      }, 1000);
    }
  } catch (error) {
    console.error('❌ Error parsing message:', error);
  }
});

ws.on('close', (code, reason) => {
  console.log(`🔌 Connection closed: ${code} - ${reason}`);
  process.exit(0);
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error);
  console.log('\n💡 Make sure the chat server is running:');
  console.log('   cd backend && npm start');
  process.exit(1);
});

// Timeout after 10 seconds
setTimeout(() => {
  console.log('⏰ Connection timeout');
  ws.close();
  process.exit(1);
}, 10000);
