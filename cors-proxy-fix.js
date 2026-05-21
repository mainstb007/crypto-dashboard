/**
 * CORS Proxy Fix for Crypto Dashboard
 * Add this script before the closing </head> tag in index.html
 */

// CORS Proxy Configuration
const CORS_CONFIG = {
  enabled: true,
  proxies: [
    '', // Direct connection (no proxy)
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?',
  ],
  retryDelay: 1000, // Delay between retries in ms
  maxRetries: 2,    // Maximum retries per proxy
  requestDelay: 200  // Delay between coin requests to avoid rate limiting
};

// Enhanced fetch with CORS proxy support and retry logic
async function fetchWithProxy(url, options = {}) {
  const { proxies, retryDelay, maxRetries } = CORS_CONFIG;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    for (const proxy of proxies) {
      try {
        const proxyUrl = proxy ? proxy + encodeURIComponent(url) : url;
        const response = await fetch(proxyUrl, {
          ...options,
          headers: {
            ...options.headers,
            ...(proxy ? { 'X-Requested-With': 'XMLHttpRequest' } : {})
          }
        });

        if (response.ok) {
          console.log(`✅ Success: ${url.substring(0, 50)}... via ${proxy || 'direct'}`);
          return response;
        }

        console.log(`⚠️ HTTP ${response.status}: ${url.substring(0, 50)}... via ${proxy || 'direct'}`);
      } catch (error) {
        console.log(`❌ Error: ${error.message} for ${url.substring(0, 50)}... via ${proxy || 'direct'}`);
      }
    }

    // Wait before retrying
    if (attempt < maxRetries - 1) {
      await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
    }
  }

  throw new Error(`Failed to fetch after ${maxRetries} attempts: ${url.substring(0, 50)}...`);
}

// Original fetch functions (will be overridden)
const originalFetchFromBinance = window.fetchFromBinance;
const originalFetchFromKuCoin = window.fetchFromKuCoin;
const originalFetchFromBybit = window.fetchFromBybit;
const originalFetchFromCoinGecko = window.fetchFromCoinGecko;

// Enhanced fetch functions with CORS proxy support
window.fetchFromBinance = async function(symbol) {
  try {
    const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}USDT`;
    const response = await fetchWithProxy(url);

    if (!response.ok) {
      console.error(`Binance API error for ${symbol}: HTTP ${response.status}`);
      return null;
    }

    const data = await response.json();
    console.log(`✅ Binance data received for ${symbol}`);

    return {
      exchange: 'Binance',
      price: parseFloat(data.lastPrice),
      change24h: parseFloat(data.priceChangePercent),
      volume24h: parseFloat(data.quoteVolume),
      high24h: parseFloat(data.highPrice),
      low24h: parseFloat(data.lowPrice)
    };
  } catch (error) {
    console.error(`❌ Binance fetch failed for ${symbol}:`, error.message);
    return null;
  }
};

window.fetchFromKuCoin = async function(symbol) {
  try {
    const url = `https://api.kucoin.com/api/v1/market/stats?symbol=${symbol}-USDT`;
    const response = await fetchWithProxy(url);

    if (!response.ok) {
      console.error(`KuCoin API error for ${symbol}: HTTP ${response.status}`);
      return null;
    }

    const data = await response.json();
    if (data.code !== '200000') {
      console.error(`KuCoin API error for ${symbol}: ${data.msg}`);
      return null;
    }

    const stats = data.data;
    console.log(`✅ KuCoin data received for ${symbol}`);

    return {
      exchange: 'KuCoin',
      price: parseFloat(stats.last),
      change24h: parseFloat(stats.changeRate) * 100,
      volume24h: parseFloat(stats.volValue),
      high24h: parseFloat(stats.high),
      low24h: parseFloat(stats.low)
    };
  } catch (error) {
    console.error(`❌ KuCoin fetch failed for ${symbol}:`, error.message);
    return null;
  }
};

window.fetchFromBybit = async function(symbol) {
  try {
    const url = `https://api.bybit.com/v5/market/tickers?category=spot&symbol=${symbol}USDT`;
    const response = await fetchWithProxy(url);

    if (!response.ok) {
      console.error(`Bybit API error for ${symbol}: HTTP ${response.status}`);
      return null;
    }

    const data = await response.json();
    if (data.retCode !== 0 || !data.result.list || data.result.list.length === 0) {
      console.error(`Bybit API error for ${symbol}: ${data.retMsg}`);
      return null;
    }

    const ticker = data.result.list[0];
    console.log(`✅ Bybit data received for ${symbol}`);

    return {
      exchange: 'Bybit',
      price: parseFloat(ticker.lastPrice),
      change24h: parseFloat(ticker.price24hPcnt) * 100,
      volume24h: parseFloat(ticker.turnover24h) * parseFloat(ticker.lastPrice),
      high24h: parseFloat(ticker.highPrice24h),
      low24h: parseFloat(ticker.lowPrice24h)
    };
  } catch (error) {
    console.error(`❌ Bybit fetch failed for ${symbol}:`, error.message);
    return null;
  }
};

window.fetchFromCoinGecko = async function(symbol) {
  try {
    const coinId = COIN_IDS[symbol];
    if (!coinId) {
      console.log(`⚠️ No CoinGecko ID for ${symbol}`);
      return null;
    }

    const url = `https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&community_data=false&developer_data=false`;
    const response = await fetchWithProxy(url);

    if (!response.ok) {
      console.error(`CoinGecko API error for ${symbol}: HTTP ${response.status}`);
      return null;
    }

    const data = await response.json();
    console.log(`✅ CoinGecko data received for ${symbol}`);

    return {
      exchange: 'CoinGecko',
      price: data.market_data?.current_price?.usd || 0,
      change24h: data.market_data?.price_change_percentage_24h || 0,
      volume24h: data.market_data?.total_volume?.usd || 0,
      high24h: data.market_data?.high_24h?.usd || 0,
      low24h: data.market_data?.low_24h?.usd || 0
    };
  } catch (error) {
    console.error(`❌ CoinGecko fetch failed for ${symbol}:`, error.message);
    return null;
  }
};

// Enhanced refreshData with delay between coin fetches
const originalRefreshData = window.refreshData;
window.refreshData = async function() {
  console.log('🚀 Starting data fetch with CORS proxy support...');

  document.getElementById('loading').style.display = 'block';
  document.getElementById('content').style.display = 'none';
  document.getElementById('error').style.display = 'none';

  try {
    console.log(`📊 Fetching data for ${ALL_COINS.length} coins with delays...`);

    // Fetch coins with delays to avoid rate limiting
    const coinPromises = ALL_COINS.map(async (coin, index) => {
      // Add delay between requests
      await new Promise(resolve => setTimeout(resolve, CORS_CONFIG.requestDelay * index));
      return fetchCoinData(coin);
    });

    const results = await Promise.allSettled(coinPromises);
    console.log(`✅ Data fetch complete: ${results.filter(r => r.status === 'fulfilled').length}/${results.length} coins successful`);

    // Continue with original processing...
    await originalRefreshData();

  } catch (error) {
    console.error('❌ Error fetching data:', error);
    document.getElementById('error').innerHTML = `
      <strong>Error:</strong> ${error.message}<br>
      <small>Open browser console (F12) for detailed logs</small>
    `;
    document.getElementById('error').style.display = 'block';
    document.getElementById('loading').style.display = 'none';
  }
};

// Log initialization
console.log('🔧 CORS Proxy Fix Loaded');
console.log(`📊 Configuration: ${CORS_CONFIG.proxies.length} proxies, ${CORS_CONFIG.maxRetries} retries, ${CORS_CONFIG.requestDelay}ms delay`);