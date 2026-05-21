/**
 * Backtesting Engine
 * Test trading strategies historically to evaluate performance
 */

class BacktestEngine {
  constructor(config, dataManager) {
    this.config = config;
    this.dataManager = dataManager;
    this.results = [];
    this.initialized = false;
  }

  /**
   * Initialize backtesting engine
   */
  async init() {
    try {
      this.initialized = true;
      console.log('Backtesting engine initialized');
    } catch (error) {
      console.error('Failed to initialize backtesting engine:', error);
      throw error;
    }
  }

  /**
   * Run backtest on a strategy
   */
  async runBacktest(strategy, params = {}) {
    try {
      console.log(`Running backtest for strategy: ${strategy}`);

      const backtest = {
        id: Date.now().toString(),
        strategy,
        params,
        startTime: new Date().toISOString(),
        status: 'running'
      };

      // Fetch historical data
      const historicalData = await this.fetchHistoricalData(params);

      if (!historicalData || historicalData.length === 0) {
        throw new Error('No historical data available');
      }

      // Execute strategy on historical data
      const results = await this.executeStrategy(strategy, historicalData, params);

      backtest.endTime = new Date().toISOString();
      backtest.status = 'completed';
      backtest.results = results;

      // Store results
      this.results.push(backtest);

      return backtest;
    } catch (error) {
      console.error('Backtest failed:', error);
      throw error;
    }
  }

  /**
   * Fetch historical price data
   */
  async fetchHistoricalData(params) {
    const {
      symbol = 'BTCUSDT',
      interval = '1d',
      days = this.config.backtesting.defaultPeriod,
      limit = days
    } = params;

    try {
      const klines = await this.dataManager.fetchData(
        `/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
        {
          cacheDuration: 86400000, // 24 hour cache
          useCache: true
        }
      );

      if (!klines || !Array.isArray(klines)) {
        throw new Error('Invalid klines data');
      }

      // Transform into OHLCV format
      return klines.map(k => ({
        timestamp: k[0],
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
        closeTime: k[6],
        quoteVolume: parseFloat(k[7]),
        trades: parseInt(k[8])
      }));
    } catch (error) {
      console.error('Failed to fetch historical data:', error);
      throw error;
    }
  }

  /**
   * Execute trading strategy on historical data
   */
  async executeStrategy(strategy, data, params) {
    switch (strategy) {
      case 'staged_deployment':
        return this.stagedDeploymentStrategy(data, params);
      case 'simple_momentum':
        return this.simpleMomentumStrategy(data, params);
      case 'mean_reversion':
        return this.meanReversionStrategy(data, params);
      case 'rsi_strategy':
        return this.rsiStrategy(data, params);
      default:
        throw new Error(`Unknown strategy: ${strategy}`);
    }
  }

  /**
   * Staged deployment strategy (from deployment plan)
   */
  stagedDeploymentStrategy(data, params) {
    const {
      capital = 10000,
      zone1Percent = 0.40,
      zone2Percent = 0.35,
      zone3Percent = 0.25,
      invalidationThreshold = -10,
      profitTarget = 100
    } = params;

    let position = 0;
    let entryPrice = 0;
    let totalInvested = 0;
    let trades = [];

    // Calculate zones based on data range
    const high = Math.max(...data.map(d => d.high));
    const low = Math.min(...data.map(d => d.low));
    const range = high - low;

    const zone1Entry = low + (range * 0.2);
    const zone2Entry = low + (range * 0.1);
    const zone3Entry = low;

    const invalidation = low - (range * 0.05);

    for (let i = 1; i < data.length; i++) {
      const candle = data[i];
      const prevCandle = data[i - 1];

      // Zone 1 entry
      if (position === 0 && candle.close <= zone1Entry) {
        const amount = capital * zone1Percent;
        const shares = amount / candle.close;
        position += shares;
        entryPrice = candle.close;
        totalInvested += amount;

        trades.push({
          type: 'buy',
          timestamp: candle.timestamp,
          price: candle.close,
          amount,
          shares,
          zone: 'zone1'
        });
      }

      // Zone 2 entry
      else if (position > 0 && candle.close <= zone2Entry) {
        const amount = capital * zone2Percent;
        const shares = amount / candle.close;
        position += shares;
        entryPrice = (entryPrice + candle.close) / 2; // Average entry
        totalInvested += amount;

        trades.push({
          type: 'buy',
          timestamp: candle.timestamp,
          price: candle.close,
          amount,
          shares,
          zone: 'zone2'
        });
      }

      // Zone 3 entry
      else if (position > 0 && candle.close <= zone3Entry) {
        const amount = capital * zone3Percent;
        const shares = amount / candle.close;
        position += shares;
        entryPrice = (entryPrice * 2 + candle.close) / 3; // Average entry
        totalInvested += amount;

        trades.push({
          type: 'buy',
          timestamp: candle.timestamp,
          price: candle.close,
          amount,
          shares,
          zone: 'zone3'
        });
      }

      // Check invalidation
      if (position > 0 && candle.close <= invalidation) {
        const exitValue = position * candle.close;
        const pnl = exitValue - totalInvested;

        trades.push({
          type: 'sell',
          timestamp: candle.timestamp,
          price: candle.close,
          amount: exitValue,
          shares: position,
          reason: 'invalidation',
          pnl
        });

        position = 0;
        entryPrice = 0;
        totalInvested = 0;
      }

      // Check profit target
      if (position > 0 && candle.close >= entryPrice * (1 + profitTarget / 100)) {
        const exitValue = position * candle.close;
        const pnl = exitValue - totalInvested;

        trades.push({
          type: 'sell',
          timestamp: candle.timestamp,
          price: candle.close,
          amount: exitValue,
          shares: position,
          reason: 'profit_target',
          pnl
        });

        position = 0;
        entryPrice = 0;
        totalInvested = 0;
      }
    }

    // Calculate final P&L if still in position
    let finalPnL = 0;
    if (position > 0) {
      const finalCandle = data[data.length - 1];
      const exitValue = position * finalCandle.close;
      finalPnL = exitValue - totalInvested;
    }

    return this.calculateBacktestMetrics(trades, capital, finalPnL);
  }

  /**
   * Simple momentum strategy
   */
  simpleMomentumStrategy(data, params) {
    const {
      capital = 10000,
      momentumPeriod = 5,
      entryThreshold = 2,
      exitThreshold = -1
    } = params;

    let position = 0;
    let entryPrice = 0;
    let totalInvested = 0;
    let trades = [];

    for (let i = momentumPeriod; i < data.length; i++) {
      const candle = data[i];
      const prevCandle = data[i - momentumPeriod];

      // Calculate momentum
      const momentum = ((candle.close - prevCandle.close) / prevCandle.close) * 100;

      // Entry signal
      if (position === 0 && momentum > entryThreshold) {
        const amount = capital;
        const shares = amount / candle.close;
        position = shares;
        entryPrice = candle.close;
        totalInvested = amount;

        trades.push({
          type: 'buy',
          timestamp: candle.timestamp,
          price: candle.close,
          amount,
          shares,
          momentum
        });
      }

      // Exit signal
      if (position > 0 && momentum < exitThreshold) {
        const exitValue = position * candle.close;
        const pnl = exitValue - totalInvested;

        trades.push({
          type: 'sell',
          timestamp: candle.timestamp,
          price: candle.close,
          amount: exitValue,
          shares: position,
          momentum,
          pnl
        });

        position = 0;
        entryPrice = 0;
        totalInvested = 0;
      }
    }

    const finalPnL = position > 0 ? (position * data[data.length - 1].close) - totalInvested : 0;

    return this.calculateBacktestMetrics(trades, capital, finalPnL);
  }

  /**
   * Mean reversion strategy
   */
  meanReversionStrategy(data, params) {
    const {
      capital = 10000,
      lookbackPeriod = 20,
      entryZScore = 2,
      exitZScore = 0
    } = params;

    let position = 0;
    let entryPrice = 0;
    let totalInvested = 0;
    let trades = [];

    for (let i = lookbackPeriod; i < data.length; i++) {
      const candle = data[i];
      const lookbackData = data.slice(i - lookbackPeriod, i);

      // Calculate mean and standard deviation
      const prices = lookbackData.map(d => d.close);
      const mean = prices.reduce((sum, p) => sum + p, 0) / prices.length;
      const variance = prices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / prices.length;
      const stdDev = Math.sqrt(variance);

      // Calculate z-score
      const zScore = (candle.close - mean) / stdDev;

      // Entry signal (oversold)
      if (position === 0 && zScore < -entryZScore) {
        const amount = capital;
        const shares = amount / candle.close;
        position = shares;
        entryPrice = candle.close;
        totalInvested = amount;

        trades.push({
          type: 'buy',
          timestamp: candle.timestamp,
          price: candle.close,
          amount,
          shares,
          zScore
        });
      }

      // Exit signal (mean reversion)
      if (position > 0 && zScore >= exitZScore) {
        const exitValue = position * candle.close;
        const pnl = exitValue - totalInvested;

        trades.push({
          type: 'sell',
          timestamp: candle.timestamp,
          price: candle.close,
          amount: exitValue,
          shares: position,
          zScore,
          pnl
        });

        position = 0;
        entryPrice = 0;
        totalInvested = 0;
      }
    }

    const finalPnL = position > 0 ? (position * data[data.length - 1].close) - totalInvested : 0;

    return this.calculateBacktestMetrics(trades, capital, finalPnL);
  }

  /**
   * RSI-based strategy
   */
  rsiStrategy(data, params) {
    const {
      capital = 10000,
      rsiPeriod = 14,
      oversoldThreshold = 30,
      overboughtThreshold = 70
    } = params;

    let position = 0;
    let entryPrice = 0;
    let totalInvested = 0;
    let trades = [];

    // Calculate RSI for all data points
    const rsiValues = this.calculateRSI(data, rsiPeriod);

    for (let i = rsiPeriod + 1; i < data.length; i++) {
      const candle = data[i];
      const rsi = rsiValues[i];

      if (!rsi) continue;

      // Entry signal (oversold)
      if (position === 0 && rsi < oversoldThreshold) {
        const amount = capital;
        const shares = amount / candle.close;
        position = shares;
        entryPrice = candle.close;
        totalInvested = amount;

        trades.push({
          type: 'buy',
          timestamp: candle.timestamp,
          price: candle.close,
          amount,
          shares,
          rsi
        });
      }

      // Exit signal (overbought)
      if (position > 0 && rsi > overboughtThreshold) {
        const exitValue = position * candle.close;
        const pnl = exitValue - totalInvested;

        trades.push({
          type: 'sell',
          timestamp: candle.timestamp,
          price: candle.close,
          amount: exitValue,
          shares: position,
          rsi,
          pnl
        });

        position = 0;
        entryPrice = 0;
        totalInvested = 0;
      }
    }

    const finalPnL = position > 0 ? (position * data[data.length - 1].close) - totalInvested : 0;

    return this.calculateBacktestMetrics(trades, capital, finalPnL);
  }

  /**
   * Calculate RSI values
   */
  calculateRSI(data, period) {
    const rsiValues = {};
    let gains = 0;
    let losses = 0;

    // Calculate initial average gain/loss
    for (let i = 1; i <= period; i++) {
      const change = data[i].close - data[i - 1].close;
      if (change > 0) {
        gains += change;
      } else {
        losses += Math.abs(change);
      }
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    // Calculate RSI for each point
    for (let i = period + 1; i < data.length; i++) {
      const change = data[i].close - data[i - 1].close;

      const gain = change > 0 ? change : 0;
      const loss = change < 0 ? Math.abs(change) : 0;

      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;

      if (avgLoss === 0) {
        rsiValues[i] = 100;
      } else {
        const rs = avgGain / avgLoss;
        rsiValues[i] = 100 - (100 / (1 + rs));
      }
    }

    return rsiValues;
  }

  /**
   * Calculate backtest performance metrics
   */
  calculateBacktestMetrics(trades, capital, finalPnL) {
    const buyTrades = trades.filter(t => t.type === 'buy');
    const sellTrades = trades.filter(t => t.type === 'sell');

    const totalTrades = sellTrades.length;
    const winningTrades = sellTrades.filter(t => t.pnl > 0).length;
    const losingTrades = sellTrades.filter(t => t.pnl <= 0).length;

    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

    const totalPnL = sellTrades.reduce((sum, t) => sum + (t.pnl || 0), 0) + finalPnL;
    const totalReturn = (totalPnL / capital) * 100;

    const avgWin = winningTrades > 0
      ? sellTrades.filter(t => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0) / winningTrades
      : 0;

    const avgLoss = losingTrades > 0
      ? sellTrades.filter(t => t.pnl <= 0).reduce((sum, t) => sum + t.pnl, 0) / losingTrades
      : 0;

    const largestWin = sellTrades.length > 0
      ? Math.max(...sellTrades.map(t => t.pnl || 0))
      : 0;

    const largestLoss = sellTrades.length > 0
      ? Math.min(...sellTrades.map(t => t.pnl || 0))
      : 0;

    const profitFactor = avgLoss !== 0
      ? (avgWin / Math.abs(avgLoss)).toFixed(2)
      : '∞';

    return {
      totalTrades,
      winningTrades,
      losingTrades,
      winRate: winRate.toFixed(2),
      totalPnL: totalPnL.toFixed(2),
      totalReturn: totalReturn.toFixed(2),
      avgWin: avgWin.toFixed(2),
      avgLoss: avgLoss.toFixed(2),
      largestWin: largestWin.toFixed(2),
      largestLoss: largestLoss.toFixed(2),
      profitFactor,
      trades,
      finalPnL: finalPnL.toFixed(2)
    };
  }

  /**
   * Get backtest results
   */
  getResults() {
    return this.results;
  }

  /**
   * Get specific backtest result
   */
  getResult(id) {
    return this.results.find(r => r.id === id);
  }

  /**
   * Export backtest results
   */
  exportResults(id = null, format = 'json') {
    const results = id ? [this.getResult(id)] : this.results;

    if (format === 'json') {
      return JSON.stringify(results, null, 2);
    } else if (format === 'csv') {
      const allTrades = results.flatMap(r => r.results.trades);
      const headers = ['Type', 'Timestamp', 'Price', 'Amount', 'P&L', 'Reason'];
      const rows = allTrades.map(t => [
        t.type,
        new Date(t.timestamp).toISOString(),
        t.price.toFixed(2),
        t.amount.toFixed(2),
        (t.pnl || 0).toFixed(2),
        t.reason || ''
      ]);
      return [headers, ...rows].map(row => row.join(',')).join('\n');
    }

    throw new Error('Unsupported export format');
  }

  /**
   * Clear results
   */
  clearResults() {
    this.results = [];
  }

  /**
   * Cleanup
   */
  destroy() {
    this.results = [];
  }
}

// Export for use in dashboard
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BacktestEngine };
}
