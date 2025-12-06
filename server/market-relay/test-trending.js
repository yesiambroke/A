const fetch = require('node-fetch');
const fs = require('fs');

async function testTrendingAPI() {
  try {
    console.log('Testing trending API call...');

    // Read tokens from session file
    const sessionData = JSON.parse(fs.readFileSync('axiom_session.json', 'utf8'));
    const tokens = sessionData.tokens;

    console.log('Tokens loaded:', !!tokens.access_token, !!tokens.refresh_token);

    const url = 'https://api9.axiom.trade/meme-trending?timePeriod=24h';
    const headers = {
      'accept': 'application/json, text/plain, */*',
      'accept-language': 'en-US,en;q=0.9',
      'cache-control': 'no-cache',
      'cookie': `auth-refresh-token=${tokens.refresh_token}; auth-access-token=${tokens.access_token}`,
      'pragma': 'no-cache',
      'referer': 'https://axiom.trade/',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36 OPR/120.0.0.0'
    };

    console.log('Making request to:', url);
    console.log('Cookie header:', headers.cookie.substring(0, 100) + '...');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      headers,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    console.log('Response status:', response.status, response.statusText);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error response:', errorText);
      return false;
    }

    const data = await response.json();
    console.log('Response type:', typeof data, Array.isArray(data) ? 'array' : 'not array');
    console.log('Response length:', Array.isArray(data) ? data.length : 'N/A');

    if (Array.isArray(data) && data.length > 0) {
      console.log('First item sample:', JSON.stringify(data[0]).substring(0, 200));
    }

    return true;

  } catch (error) {
    console.error('Test failed:', error.message);
    console.error('Error stack:', error.stack);
    return false;
  }
}

testTrendingAPI();
