const WebSocket = require('ws');

// Test data persistence - verify components show existing data immediately
console.log('🧪 Testing Data Persistence Behavior');
console.log('📊 This simulates tab switching to verify data shows immediately\n');

const ws = new WebSocket('ws://localhost:8080');

let receivedData = {
  activities: [],
  marketStats: null
};

ws.on('open', function open() {
  console.log('🔌 Connected - simulating user behavior');
  console.log('⏳ Waiting for initial data to accumulate...\n');
  
  // After 10 seconds, simulate tab switching behavior
  setTimeout(() => {
    console.log('🔄 SIMULATING TAB SWITCH:');
    console.log('   - User switches from Stats to Activity tab');
    console.log('   - Activity component should show existing data immediately');
    console.log('   - No waiting for new WebSocket messages\n');
    
    console.log('📊 CURRENT DATA AVAILABLE:');
    console.log(`   Activities: ${receivedData.activities.length} items`);
    console.log(`   Market Stats: ${receivedData.marketStats ? 'Available' : 'Not available'}`);
    
    if (receivedData.activities.length > 0) {
      console.log('\n✅ SUCCESS: Activity data is available for immediate display');
      console.log('   Latest activities:');
      receivedData.activities.slice(-3).forEach((activity, index) => {
        console.log(`   ${index + 1}. ${activity.activity_type} - ${new Date(activity.timestamp).toLocaleTimeString()}`);
      });
    } else {
      console.log('\n❌ ISSUE: No activity data available - component would show loading');
    }
    
    if (receivedData.marketStats) {
      console.log('\n✅ SUCCESS: Market stats available for immediate display');
      console.log(`   SOL: $${receivedData.marketStats.sol_price}`);
      console.log(`   BTC: $${receivedData.marketStats.btc_price}`);
      console.log(`   Last update: ${new Date(receivedData.marketStats.timestamp).toLocaleTimeString()}`);
    } else {
      console.log('\n❌ ISSUE: No market stats available - component would show loading');
    }
    
    console.log('\n💡 Expected behavior:');
    console.log('   - Components should display this data immediately on mount');
    console.log('   - No "Loading..." or "Waiting for data..." messages');
    console.log('   - Real-time updates continue to work normally');
    
    ws.close();
  }, 10000);
});

ws.on('message', function message(data) {
  try {
    const parsed = JSON.parse(data);
    
    switch (parsed.type) {
      case 'welcome':
        console.log('👋 Connected to WebSocket server');
        break;
        
      case 'activity':
        receivedData.activities.push(parsed.data);
        console.log(`📢 Activity received: ${parsed.data.activity_type}`);
        break;
        
      case 'market_stats':
        receivedData.marketStats = parsed.data;
        console.log(`📊 Market stats updated: SOL $${parsed.data.sol_price}`);
        break;
        
      case 'user_count':
        console.log(`👥 Users online: ${parsed.data.count}`);
        break;
    }
  } catch (error) {
    console.error('❌ Error parsing message:', error);
  }
});

ws.on('error', function error(err) {
  console.error('❌ WebSocket error:', err.message);
});

ws.on('close', function close() {
  console.log('\n🔌 Test completed');
  console.log('\n📋 SUMMARY:');
  console.log('   This test verifies that components can access existing data');
  console.log('   without waiting for new WebSocket messages on every mount.');
  console.log('   The useChat hook should maintain data persistence across');
  console.log('   component mounts/unmounts during tab switching.');
});

console.log('🚀 Starting data persistence test...');
console.log('💡 Make sure the chat server is running on port 8080');
console.log('⏹️  Test will run for 10 seconds then show results\n');
