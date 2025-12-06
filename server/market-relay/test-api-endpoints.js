const http = require('http');

// Test API endpoints for initial data loading
console.log('🧪 Testing API Endpoints for Initial Data Loading');
console.log('📊 This verifies components can load data instantly without WebSocket\n');

async function testEndpoint(path, description) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        const endTime = Date.now();
        const responseTime = endTime - startTime;
        
        try {
          const parsed = JSON.parse(data);
          resolve({
            success: true,
            status: res.statusCode,
            responseTime,
            data: parsed
          });
        } catch (error) {
          resolve({
            success: false,
            status: res.statusCode,
            responseTime,
            error: 'Invalid JSON response'
          });
        }
      });
    });

    req.on('error', (error) => {
      reject({
        success: false,
        error: error.message
      });
    });

    req.setTimeout(5000, () => {
      req.destroy();
      reject({
        success: false,
        error: 'Request timeout'
      });
    });

    req.end();
  });
}

async function runTests() {
  console.log('🚀 Starting API endpoint tests...\n');

  // Test Activity API
  try {
    console.log('📢 Testing Activity API (/api/activity)...');
    const activityResult = await testEndpoint('/api/activity', 'Activity Feed');
    
    if (activityResult.success && activityResult.status === 200) {
      console.log(`✅ Activity API: ${activityResult.responseTime}ms`);
      console.log(`   Status: ${activityResult.status}`);
      console.log(`   Data items: ${activityResult.data.data ? activityResult.data.data.length : 0}`);
      
      if (activityResult.data.data && activityResult.data.data.length > 0) {
        console.log('   Sample activity:', activityResult.data.data[0].activity_type);
      }
    } else {
      console.log(`❌ Activity API failed: ${activityResult.status} - ${activityResult.error || 'Unknown error'}`);
    }
  } catch (error) {
    console.log(`❌ Activity API error: ${error.error}`);
  }

  console.log('');

  // Test Market Stats API
  try {
    console.log('📊 Testing Market Stats API (/api/market-stats)...');
    const statsResult = await testEndpoint('/api/market-stats', 'Market Stats');
    
    if (statsResult.success && statsResult.status === 200) {
      console.log(`✅ Market Stats API: ${statsResult.responseTime}ms`);
      console.log(`   Status: ${statsResult.status}`);
      
      if (statsResult.data.data) {
        console.log(`   SOL Price: $${statsResult.data.data.sol_price}`);
        console.log(`   BTC Price: $${statsResult.data.data.btc_price}`);
        console.log(`   Active Bots: ${statsResult.data.data.active_bots}`);
      }
    } else {
      console.log(`❌ Market Stats API failed: ${statsResult.status} - ${statsResult.error || 'Unknown error'}`);
    }
  } catch (error) {
    console.log(`❌ Market Stats API error: ${error.error}`);
  }

  console.log('\n📋 SUMMARY:');
  console.log('   These APIs provide instant data loading for components');
  console.log('   Components no longer need to wait for WebSocket messages');
  console.log('   Tab switching should now be instant with immediate data display');
  console.log('   WebSocket is only used for real-time updates after initial load');
}

runTests().catch(console.error);

console.log('💡 Make sure the Next.js dev server is running on port 3000');
console.log('⏹️  This test will complete automatically\n');
