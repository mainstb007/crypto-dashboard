# Crypto Dashboard - Integration Guide

## Overview

Your crypto workspace has been significantly upgraded with advanced trading tools and infrastructure. This guide shows how to integrate and use all the new improvements.

## New Modules Added

### 1. Configuration Management (`config.js`)
Centralized settings management with easy customization.

**Key Features:**
- All settings in one place
- No code changes needed to adjust parameters
- User preferences saved to localStorage
- Environment-specific configurations

**Usage:**
```javascript
import { config, loadUserConfig, saveUserConfig } from './config.js';

// Load config (with user overrides)
const appConfig = loadUserConfig();

// Modify settings
appConfig.alerts.enabled = true;
appConfig.dashboard.refreshInterval = 10000;

// Save user preferences
saveUserConfig(appConfig);
```

### 2. Data Pipeline Manager (`dataManager.js`)
Unified data fetching with caching, rate limiting, and failover.

**Key Features:**
- Automatic fallback between exchanges
- Response caching with TTL
- Rate limiting to avoid API bans
- Connection health monitoring
- WebSocket support for real-time data
- Batch operations for efficiency

**Usage:**
```javascript
import { DataManager } from './dataManager.js';

const dataManager = new DataManager(config);

// Fetch with caching and failover
const price = await dataManager.fetchData('/ticker/24hr?symbol=BTCUSDT', {
  cacheKey: 'btc_price',
  cacheDuration: 5000, // 5 seconds
  useCache: true
});

// WebSocket connection
const ws = dataManager.connectWebSocket(['BTC', 'ETH'], (data) => {
  console.log('Real-time update:', data);
});

// Batch fetch multiple symbols
const results = await dataManager.batchFetch([
  '/ticker/24hr?symbol=BTCUSDT',
  '/ticker/24hr?symbol=ETHUSDT',
  '/ticker/24hr?symbol=SOLUSDT'
]);
```

### 3. Error Handler & Monitoring (`errorHandler.js`)
Comprehensive error handling and system health monitoring.

**Key Features:**
- Automatic error classification
- Health checks with auto-recovery
- Data freshness tracking
- Performance metrics
- Error logging and reporting

**Usage:**
```javascript
import { getErrorHandler } from './errorHandler.js';

const errorHandler = getErrorHandler(config);

// Handle errors
try {
  const data = await fetchData();
} catch (error) {
  errorHandler.handleError(error, { endpoint: '/ticker' });
}

// Get system health
const health = errorHandler.getSystemHealth();
console.log('System status:', health.connection);
console.log('Error rate:', health.errorRate);
console.log('Uptime:', health.uptime);

// Export error report
const report = errorHandler.exportErrorReport();
```

### 4. Portfolio Tracker (`portfolioTracker.js`)
Track positions, P&L, and performance metrics.

**Key Features:**
- Position management (open/close)
- Real-time P&L calculation
- Performance metrics (win rate, profit factor)
- Portfolio snapshots
- Historical performance tracking
- Export to CSV/JSON

**Usage:**
```javascript
import { PortfolioTracker } from './portfolioTracker.js';

const portfolio = new PortfolioTracker(config, dataManager);
await portfolio.init();

// Add a position
const position = await portfolio.addPosition({
  symbol: 'SOL',
  type: 'spot',
  side: 'long',
  entryPrice: 86.25,
  amount: 10,
  stopLoss: 80,
  takeProfit: 100
});

// Close position
await portfolio.closePosition(position.id, 95);

// Get portfolio summary
const summary = portfolio.getPortfolioSummary();
console.log('Total P&L:', summary.performance.totalPnL);
console.log('Win rate:', summary.performance.winRate + '%');

// Export data
const csv = portfolio.exportPortfolio('csv');
```

### 5. Alert System (`alertSystem.js`)
Real-time alerts for price, volume, and technical indicators.

**Key Features:**
- Price threshold alerts
- Volume spike detection
- RSI overbought/oversold alerts
- Browser push notifications
- Custom alert conditions
- Alert history and statistics

**Usage:**
```javascript
import { AlertSystem } from './alertSystem.js';

const alerts = new AlertSystem(config, dataManager);
await alerts.init();

// Create custom alert
const alert = await alerts.createAlert({
  symbol: 'SOL',
  type: 'price',
  condition: 'above',
  threshold: 100,
  message: 'SOL broke above $100!'
});

// Create preset alerts
await alerts.createPresetAlerts('BTC');

// Get alert statistics
const stats = alerts.getAlertStats();
console.log('Active alerts:', stats.enabled);
console.log('Triggered today:', stats.triggeredToday);

// Update alert
await alerts.updateAlert(alert.id, { enabled: false });
```

### 6. Market Scanner (`marketScanner.js`)
Automated scanning for trading opportunities.

**Key Features:**
- RSI oversold/overbought scanning
- Volume breakout detection
- Price breakout scanning
- Momentum divergence detection
- Opportunity scoring
- Historical scan results

**Usage:**
```javascript
import { MarketScanner } from './marketScanner.js';

const scanner = new MarketScanner(config, dataManager);
await scanner.init();

// Run manual scan
const opportunities = await scanner.scanMarket();
console.log(`Found ${opportunities.length} opportunities`);

// Get top opportunities
const topPicks = opportunities.slice(0, 5);
topPicks.forEach(op => {
  console.log(`${op.symbol}: ${op.type} (score: ${op.score})`);
});

// Export results
const csv = scanner.exportResults('csv');

// Start automatic scanning
scanner.startScanning(); // Runs every 30 seconds
```

### 7. Correlation Analyzer (`correlationAnalyzer.js`)
Analyze relationships between cryptocurrencies and sectors.

**Key Features:**
- Correlation matrix calculation
- Sector correlations
- Diversification opportunities
- Correlation heatmap data
- Historical tracking

**Usage:**
```javascript
import { CorrelationAnalyzer } from './correlationAnalyzer.js';

const correlation = new CorrelationAnalyzer(config, dataManager);
await correlation.init();

// Get correlation between two coins
const solEth = correlation.getCorrelation('SOL', 'ETH');
console.log('SOL-ETH correlation:', solEth.correlation);

// Get highly correlated coins
const correlated = correlation.getHighCorrelations('BTC', 0.8);
console.log('Coins correlated with BTC:', correlated);

// Get sector correlations
const sectors = correlation.getSectorCorrelations();
console.log('L1 sector correlation:', sectors['L1'].avgCorrelation);

// Get heatmap data
const heatmap = correlation.getHeatmapData(['BTC', 'ETH', 'SOL']);

// Find diversification opportunities
const portfolio = ['BTC', 'ETH', 'SOL'];
const opportunities = correlation.findDiversificationOpportunities(portfolio);
```

### 8. Backtesting Engine (`backtestEngine.js`)
Test trading strategies on historical data.

**Key Features:**
- Multiple strategy types
- Performance metrics calculation
- Historical simulation
- Trade-by-trade analysis
- Results export

**Usage:**
```javascript
import { BacktestEngine } from './backtestEngine.js';

const backtest = new BacktestEngine(config, dataManager);
await backtest.init();

// Test staged deployment strategy
const results = await backtest.runBacktest('staged_deployment', {
  symbol: 'BTCUSDT',
  interval: '1d',
  days: 90,
  capital: 10000,
  zone1Percent: 0.40,
  zone2Percent: 0.35,
  zone3Percent: 0.25
});

console.log('Return:', results.results.totalReturn + '%');
console.log('Win rate:', results.results.winRate + '%');
console.log('Profit factor:', results.results.profitFactor);

// Export results
const csv = backtest.exportResults(results.id, 'csv');
```

## Integration Steps

### Step 1: Add Scripts to HTML
Add these scripts to your dashboard's HTML head:

```html
<script src="config.js"></script>
<script src="dataManager.js"></script>
<script src="errorHandler.js"></script>
<script src="portfolioTracker.js"></script>
<script src="alertSystem.js"></script>
<script src="marketScanner.js"></script>
<script src="correlationAnalyzer.js"></script>
<script src="backtestEngine.js"></script>
```

### Step 2: Initialize Dashboard
Create an initialization script:

```javascript
// Initialize configuration
const config = loadUserConfig();

// Initialize core systems
const dataManager = new DataManager(config);
const errorHandler = getErrorHandler(config);

// Initialize features
const portfolio = new PortfolioTracker(config, dataManager);
const alerts = new AlertSystem(config, dataManager);
const scanner = new MarketScanner(config, dataManager);
const correlation = new CorrelationAnalyzer(config, dataManager);
const backtest = new BacktestEngine(config, dataManager);

// Start systems
await Promise.all([
  portfolio.init(),
  alerts.init(),
  scanner.init(),
  correlation.init(),
  backtest.init()
]);

// Run health check
const health = await errorHandler.performHealthCheck(dataManager);
console.log('System health:', health.status);
```

### Step 3: Add UI Components
Create UI sections for each feature:

**Portfolio Section:**
```html
<div id="portfolio-section">
  <h2>Portfolio</h2>
  <div id="portfolio-summary"></div>
  <div id="positions-list"></div>
  <button onclick="addPosition()">Add Position</button>
</div>
```

**Alerts Section:**
```html
<div id="alerts-section">
  <h2>Alerts</h2>
  <div id="alert-stats"></div>
  <div id="active-alerts"></div>
  <button onclick="createAlert()">Create Alert</button>
</div>
```

**Scanner Section:**
```html
<div id="scanner-section">
  <h2>Market Scanner</h2>
  <button onclick="runScan()">Scan Market</button>
  <div id="scan-results"></div>
</div>
```

### Step 4: Connect UI to Functions
Add event handlers:

```javascript
// Portfolio
function addPosition() {
  const position = {
    symbol: document.getElementById('symbol-input').value,
    entryPrice: parseFloat(document.getElementById('price-input').value),
    amount: parseFloat(document.getElementById('amount-input').value)
  };
  portfolio.addPosition(position);
  updatePortfolioDisplay();
}

// Alerts
function createAlert() {
  const alert = {
    symbol: document.getElementById('alert-symbol').value,
    type: document.getElementById('alert-type').value,
    condition: document.getElementById('alert-condition').value,
    threshold: parseFloat(document.getElementById('alert-threshold').value)
  };
  alerts.createAlert(alert);
  updateAlertDisplay();
}

// Scanner
async function runScan() {
  const results = await scanner.scanMarket();
  displayScanResults(results);
}
```

## Configuration Examples

### Adjust Alert Thresholds
```javascript
config.alerts.thresholds.priceChange.up = 10; // Alert on 10% gain
config.alerts.thresholds.priceChange.down = -5; // Alert on 5% loss
config.alerts.thresholds.rsi.oversold = 25; // More aggressive
saveUserConfig(config);
```

### Modify Scanner Settings
```javascript
config.scanner.opportunities.rsiOversold = true;
config.scanner.opportunities.volumeBreakout = true;
config.scanner.minVolume = 5000000; // $5M minimum
config.scanner.scanInterval = 60000; // Every minute
saveUserConfig(config);
```

### Change Risk Parameters
```javascript
config.risk.maxPositionSize = 5; // 5% max per position
config.risk.stopLossThreshold = -8; // -8% triggers alert
config.risk.takeProfitLevels = [15, 30, 50]; // Profit levels
saveUserConfig(config);
```

## API Quick Reference

### Data Manager
- `fetchData(endpoint, options)` - Fetch with caching/failover
- `connectWebSocket(symbols, callback)` - Real-time data
- `batchFetch(endpoints)` - Multiple requests

### Portfolio Tracker
- `addPosition(data)` - Add new position
- `closePosition(id, price)` - Close position
- `getPortfolioSummary()` - Get summary
- `exportPortfolio(format)` - Export data

### Alert System
- `createAlert(data)` - Create alert
- `createPresetAlerts(symbol)` - Quick alerts
- `getAlertStats()` - Get statistics

### Market Scanner
- `scanMarket()` - Run full scan
- `getScanResults()` - Get results
- `exportResults(format)` - Export

### Correlation Analyzer
- `getCorrelation(symbol1, symbol2)` - Get correlation
- `getHeatmapData(symbols)` - Get heatmap
- `findDiversificationOpportunities(portfolio)` - Diversification

### Backtesting Engine
- `runBacktest(strategy, params)` - Run backtest
- `getResults()` - Get all results
- `exportResults(id, format)` - Export

## Troubleshooting

### Data Not Updating
Check data manager health:
```javascript
const health = dataManager.getHealthStatus();
console.log('Data source health:', health);
```

### Alerts Not Triggering
Check alert status and cooldowns:
```javascript
const stats = alerts.getAlertStats();
console.log('Alert stats:', stats);
```

### High Memory Usage
Clear caches:
```javascript
dataManager.clearCache();
errorHandler.clearErrors();
scanner.clearHistory();
```

### Portfolio Not Calculating
Check initialization:
```javascript
if (portfolio.initialized) {
  console.log('Portfolio is ready');
} else {
  console.log('Portfolio not initialized');
}
```

## Best Practices

1. **Start with configuration** - Adjust settings in `config.js` first
2. **Test with small amounts** - Use paper trading before real money
3. **Monitor system health** - Check error rates and connection status
4. **Use caching wisely** - Balance freshness with API limits
5. **Backtest strategies** - Test before deploying real capital
6. **Diversify intelligently** - Use correlation analysis
7. **Set realistic alerts** - Avoid alert fatigue
8. **Export regularly** - Keep backup of your data

## Next Steps

1. Customize `config.js` with your preferences
2. Initialize all modules in your dashboard
3. Add UI components for each feature
4. Test with paper trading first
5. Gradually enable features
6. Monitor performance and adjust settings

Enjoy your upgraded crypto trading workspace!
