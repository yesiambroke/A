const WebSocket = require('ws');

// Test WebSocket connection to activity feed
const ws = new WebSocket('ws://localhost:8080');

ws.on('open', function open() {
  console.log('🔌 Connected to M64 WebSocket server');
  console.log('📡 Listening for activity and market stats...\n');
});

ws.on('message', function message(data) {
  try {
    const parsed = JSON.parse(data);
    
    switch (parsed.type) {
      case 'welcome':
        console.log('👋 Welcome message:', parsed.data.message);
        break;
        
      case 'activity':
        console.log('📢 ACTIVITY:', parsed.data.activity_type);
        console.log('   Data:', parsed.data);
        console.log('   Time:', new Date(parsed.data.timestamp).toLocaleTimeString());
        console.log('');
        break;
        
      case 'market_stats':
        console.log('📊 MARKET STATS UPDATE:');
        console.log('   SOL: $' + parsed.data.sol_price);
        console.log('   BTC: $' + parsed.data.btc_price);
        console.log('   Coins Today:', parsed.data.coins_launched_today);
        console.log('   Active Bots:', parsed.data.active_bots);
        console.log('   Fear/Greed:', parsed.data.fear_greed_index);
        console.log('   Time:', new Date(parsed.data.timestamp).toLocaleTimeString());
        console.log('');
        break;
        
      case 'user_count':
        console.log('👥 Users online:', parsed.data.count);
        break;
        
      default:
        console.log('📨 Other message:', parsed.type, parsed.data);
    }
  } catch (error) {
    console.error('❌ Error parsing message:', error);
  }
});

ws.on('error', function error(err) {
  console.error('❌ WebSocket error:', err.message);
});

ws.on('close', function close() {
  console.log('🔌 Disconnected from WebSocket server');
});

// Keep the script running
console.log('🚀 Starting WebSocket test client...');
console.log('💡 Make sure the chat server is running on port 8080');
console.log('⏹️  Press Ctrl+C to stop\n');
