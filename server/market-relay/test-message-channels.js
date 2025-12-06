const WebSocket = require('ws');

// Test message channeling - verify different message types are handled separately
const ws = new WebSocket('ws://localhost:8080');

let messageCount = {
  chat: 0,
  activity: 0,
  market_stats: 0,
  other: 0
};

ws.on('open', function open() {
  console.log('🔌 Connected to test message channels');
  console.log('📊 Monitoring message types...\n');
});

ws.on('message', function message(data) {
  try {
    const parsed = JSON.parse(data);
    
    switch (parsed.type) {
      case 'welcome':
        console.log('👋 Welcome:', parsed.data.message);
        break;
        
      case 'message':
        messageCount.chat++;
        console.log(`💬 CHAT MESSAGE #${messageCount.chat}:`);
        console.log(`   From: ${parsed.data.username}`);
        console.log(`   Message: ${parsed.data.message}`);
        console.log(`   Time: ${new Date(parsed.data.timestamp).toLocaleTimeString()}`);
        break;
        
      case 'activity':
        messageCount.activity++;
        console.log(`📢 ACTIVITY MESSAGE #${messageCount.activity}:`);
        console.log(`   Type: ${parsed.data.activity_type}`);
        console.log(`   Data:`, parsed.data);
        break;
        
      case 'market_stats':
        messageCount.market_stats++;
        console.log(`📊 MARKET STATS MESSAGE #${messageCount.market_stats}:`);
        console.log(`   SOL: $${parsed.data.sol_price}`);
        console.log(`   BTC: $${parsed.data.btc_price}`);
        console.log(`   Active Bots: ${parsed.data.active_bots}`);
        break;
        
      case 'user_count':
        console.log(`👥 User count: ${parsed.data.count}`);
        break;
        
      default:
        messageCount.other++;
        console.log(`❓ OTHER MESSAGE #${messageCount.other}:`, parsed.type);
    }
    
    // Show summary every 10 messages
    const total = messageCount.chat + messageCount.activity + messageCount.market_stats + messageCount.other;
    if (total > 0 && total % 10 === 0) {
      console.log('\n📈 MESSAGE SUMMARY:');
      console.log(`   Chat: ${messageCount.chat}`);
      console.log(`   Activity: ${messageCount.activity}`);
      console.log(`   Market Stats: ${messageCount.market_stats}`);
      console.log(`   Other: ${messageCount.other}`);
      console.log(`   Total: ${total}\n`);
    }
    
  } catch (error) {
    console.error('❌ Error parsing message:', error);
  }
});

ws.on('error', function error(err) {
  console.error('❌ WebSocket error:', err.message);
});

ws.on('close', function close() {
  console.log('\n🔌 Disconnected from WebSocket server');
  console.log('\n📊 FINAL MESSAGE COUNT:');
  console.log(`   Chat: ${messageCount.chat}`);
  console.log(`   Activity: ${messageCount.activity}`);
  console.log(`   Market Stats: ${messageCount.market_stats}`);
  console.log(`   Other: ${messageCount.other}`);
  console.log(`   Total: ${messageCount.chat + messageCount.activity + messageCount.market_stats + messageCount.other}`);
});

// Keep the script running
console.log('🚀 Testing message channel separation...');
console.log('💡 This will show how different message types are handled');
console.log('⏹️  Press Ctrl+C to stop\n');
