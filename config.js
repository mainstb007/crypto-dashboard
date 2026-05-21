/**
 * Configuration Management for Crypto Dashboard
 * Edit these settings without modifying the main code
 */

const config = {
  // Dashboard settings
  dashboard: {
    theme: 'auto', // 'auto', 'light', 'dark'
    refreshInterval: 5000, // milliseconds
    defaultFilter: 'all', // 'all', 'tier-s', 'tier-a', 'tier-b'
    showPrices: true,
    showScores: true,
    maxCardsPerRow: 4
  },

  // Alert system settings
  alerts: {
    enabled: true,
    soundEnabled: false,
    pushNotifications: true,
    thresholds: {
      priceChange: {
        up: 5, // Alert if price increases by 5%
        down: -5 // Alert if price decreases by 5%
      },
      volume: {
        spike: 2.0 // Alert if volume is 2x average
      },
      rsi: {
        oversold: 30,
        overbought: 70
      }
    },
    cooldown: 300000 // 5 minutes between alerts for same coin
  },

  // Portfolio tracking
  portfolio: {
    enabled: true,
    currency: 'USD',
    trackPerformance: true,
    saveHistory: true,
    autoSave: true
  },

  // Market scanner settings
  scanner: {
    enabled: true,
    scanInterval: 30000, // 30 seconds
    opportunities: {
      rsiOversold: true,
      rsiOverbought: true,
      volumeBreakout: true,
      momentumDivergence: true,
      priceBreakout: true
    },
    minVolume: 1000000, // $1M daily volume minimum
    minPrice: 0.01, // Minimum price to consider
    maxCoins: 50 // Maximum results to return
  },

  // Correlation analysis
  correlation: {
    enabled: true,
    lookbackPeriod: 30, // days
    minCorrelation: 0.7, // Minimum correlation to highlight
    updateInterval: 3600000 // 1 hour
  },

  // Data source settings
  dataSources: {
    primary: 'binance',
    fallback: ['kucoin', 'bybit'],
    timeout: 10000,
    retryAttempts: 3,
    retryDelay: 2000
  },

  // Risk management
  risk: {
    maxPositionSize: 10, // % of portfolio per coin
    maxCorrelatedPositions: 30, // % in correlated assets
    stopLossThreshold: -10, // % loss triggers alert
    takeProfitLevels: [20, 40, 60] // % gains for profit taking
  },

  // Tier allocations (for deployment plan)
  tiers: {
    S: {
      allocation: 0.58, // 58% of capital
      coins: ['SOL', 'ZEC', 'SUI', 'LINK', 'HBAR']
    },
    A: {
      allocation: 0.28, // 28% of capital
      coins: ['TAO', 'RENDER', 'NEAR', 'AR', 'HNT']
    },
    B: {
      allocation: 0.14, // 14% of capital
      coins: ['APT', 'AKT', 'XRP', 'OP', 'WLD', 'AVAX', 'TRX']
    }
  },

  // Backtesting settings
  backtesting: {
    enabled: true,
    defaultPeriod: 90, // days
    minDataPoints: 100,
    commission: 0.001, // 0.1% trading fee
    slippage: 0.0005 // 0.05% slippage
  },

  // Exchange API endpoints (add your keys here)
  exchanges: {
    binance: {
      api: 'https://api.binance.com/api/v3',
      websocket: 'wss://stream.binance.com:9443/ws',
      apiKey: '', // Add your key if needed
      secret: '' // Add your secret if needed
    },
    kucoin: {
      api: 'https://api.kucoin.com/api/v1',
      websocket: 'wss://api.kucoin.com/websocket',
      apiKey: '',
      secret: ''
    }
  },

  // Monitoring & logging
  monitoring: {
    logLevel: 'info', // 'debug', 'info', 'warn', 'error'
    logToConsole: true,
    logToFile: false,
    metricsEnabled: true,
    healthCheckInterval: 60000 // 1 minute
  },

  // UI settings
  ui: {
    compactMode: false,
    showCharts: true,
    animationDuration: 300,
    toastDuration: 5000,
    maxToasts: 3
  }
};

// Load user overrides from localStorage if available
function loadUserConfig() {
  try {
    const userConfig = localStorage.getItem('cryptoDashboard_config');
    if (userConfig) {
      const parsed = JSON.parse(userConfig);
      return deepMerge(config, parsed);
    }
  } catch (error) {
    console.warn('Failed to load user config:', error);
  }
  return config;
}

// Save user settings to localStorage
function saveUserConfig(settings) {
  try {
    localStorage.setItem('cryptoDashboard_config', JSON.stringify(settings));
    return true;
  } catch (error) {
    console.error('Failed to save config:', error);
    return false;
  }
}

// Deep merge utility
function deepMerge(target, source) {
  const result = { ...target };
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { config, loadUserConfig, saveUserConfig };
}
