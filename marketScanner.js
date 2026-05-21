/**
 * Market Scanner
 * Automatically scan for trading opportunities across multiple coins
 */

class MarketScanner {
  constructor(config, dataManager) {
    this.config = config;
    this.dataManager = dataManager;
    this.scanResults = [];
    this.scanHistory = [];
    this.scanning = false;
    this.scanInterval = null;
    this.initialized = false;
  }

  /**
   * Initialize market scanner
   */
  async init() {
    try {
      // Load scan history
      this.loadHistory();

      // Start periodic scanning
      if (this.config.scanner.enabled) {
        this.startScanning();
      }

      this.initialized = true;
      console.log('Market scanner initialized');
    } catch (error) {
      console.error('Failed to initialize market scanner:', error);
      throw error;
    }
  }

  /**
   * Start periodic scanning
   */
  startScanning() {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
    }

    this.scanInterval = setInterval(async () => {
      if (!this.scanning) {
        await this.scanMarket();
      }
    }, this.config.scanner.scanInterval);

    console.log(`Scanner started with ${this.config.scanner.scanInterval}ms interval`);
  }

  /**
   * Stop periodic scanning
   */
  stopScanning() {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    console.log('Scanner stopped');
  }

  /**
   * Scan the entire market for opportunities
   */
  async scanMarket() {
    if (this.scanning) {
      console.warn('Scan already in progress');
      return null;
    }

    this.scanning = true;
    const startTime = Date.now();

    try {
      console.log('Starting market scan...');

      // Fetch all tickers
      const tickers = await this.dataManager.fetchData('/ticker/24hr', {
        useCache: false,
        cacheDuration: 0
      });

      if (!tickers || !Array.isArray(tickers)) {
        throw new Error('Invalid ticker data received');
      }

      // Filter based on minimum requirements
      const filteredTickers = this.filterTickers(tickers);

      // Scan for different opportunities
      const opportunities = [];

      if (this.config.scanner.opportunities.rsiOversold) {
        const oversold = this.scanRSIOversold(filteredTickers);
        opportunities.push(...oversold);
      }

      if (this.config.scanner.opportunities.rsiOverbought) {
        const overbought = this.scanRSIOverbought(filteredTickers);
        opportunities.push(...overbought);
      }

      if (this.config.scanner.opportunities.volumeBreakout) {
        const volumeBreakouts = this.scanVolumeBreakout(filteredTickers);
        opportunities.push(...volumeBreakouts);
      }

      if (this.config.scanner.opportunities.priceBreakout) {
        const priceBreakouts = this.scanPriceBreakout(filteredTickers);
        opportunities.push(...priceBreakouts);
      }

      if (this.config.scanner.opportunities.momentumDivergence) {
        const divergences = this.scanMomentumDivergence(filteredTickers);
        opportunities.push(...divergences);
      }

      // Sort by score
      opportunities.sort((a, b) => b.score - a.score);

      // Limit results
      this.scanResults = opportunities.slice(0, this.config.scanner.maxCoins);

      const scanTime = Date.now() - startTime;
      console.log(`Scan complete in ${scanTime}ms. Found ${opportunities.length} opportunities.`);

      // Save to history
      this.saveToHistory(this.scanResults);

      return this.scanResults;

    } catch (error) {
      console.error('Market scan failed:', error);
      return null;
    } finally {
      this.scanning = false;
    }
  }

  /**
   * Filter tickers based on minimum requirements
   */
  filterTickers(tickers) {
    return tickers.filter(ticker => {
      const volume = parseFloat(ticker.quoteVolume);
      const price = parseFloat(ticker.lastPrice);

      // Check minimum volume
      if (volume < this.config.scanner.minVolume) return false;

      // Check minimum price
      if (price < this.config.scanner.minPrice) return false;

      // Check if it's a USDT pair
      if (!ticker.symbol.endsWith('USDT')) return false;

      return true;
    });
  }

  /**
   * Scan for RSI oversold conditions
   */
  scanRSIOversold(tickers) {
    const opportunities = [];
    const threshold = this.config.alerts.thresholds.rsi.oversold;

    // Calculate RSI for each ticker (simplified - would need proper OHLCV data)
    for (const ticker of tickers) {
      const changePercent = parseFloat(ticker.priceChangePercent);

      // Simplified RSI proxy: heavily declined coins might be oversold
      if (changePercent < -10) { // 10% drop
        opportunities.push({
          symbol: ticker.symbol.replace('USDT', ''),
          type: 'rsi_oversold',
          score: this.calculateOversoldScore(ticker),
          data: {
            price: parseFloat(ticker.lastPrice),
            changePercent,
            volume: parseFloat(ticker.quoteVolume),
            reason: `Price dropped ${Math.abs(changePercent).toFixed(2)}% - potential oversold condition`
          },
          timestamp: new Date().toISOString()
        });
      }
    }

    return opportunities;
  }

  /**
   * Scan for RSI overbought conditions
   */
  scanRSIOverbought(tickers) {
    const opportunities = [];

    for (const ticker of tickers) {
      const changePercent = parseFloat(ticker.priceChangePercent);

      // Simplified RSI proxy: heavily gained coins might be overbought
      if (changePercent > 10) { // 10% gain
        opportunities.push({
          symbol: ticker.symbol.replace('USDT', ''),
          type: 'rsi_overbought',
          score: this.calculateOverboughtScore(ticker),
          data: {
            price: parseFloat(ticker.lastPrice),
            changePercent,
            volume: parseFloat(ticker.quoteVolume),
            reason: `Price increased ${changePercent.toFixed(2)}% - potential overbought condition`
          },
          timestamp: new Date().toISOString()
        });
      }
    }

    return opportunities;
  }

  /**
   * Scan for volume breakouts
   */
  scanVolumeBreakout(tickers) {
    const opportunities = [];
    const threshold = this.config.alerts.thresholds.volume.spike;

    for (const ticker of tickers) {
      const volume = parseFloat(ticker.quoteVolume);
      const avgVolume = this.calculateAverageVolume(ticker);

      // Check if volume is significantly higher than average
      if (avgVolume && volume > avgVolume * threshold) {
        opportunities.push({
          symbol: ticker.symbol.replace('USDT', ''),
          type: 'volume_breakout',
          score: this.calculateVolumeScore(ticker, avgVolume),
          data: {
            price: parseFloat(ticker.lastPrice),
            volume,
            avgVolume,
            volumeRatio: (volume / avgVolume).toFixed(2),
            changePercent: parseFloat(ticker.priceChangePercent),
            reason: `Volume ${(volume / avgVolume).toFixed(1)}x higher than average`
          },
          timestamp: new Date().toISOString()
        });
      }
    }

    return opportunities;
  }

  /**
   * Scan for price breakouts
   */
  scanPriceBreakout(tickers) {
    const opportunities = [];

    for (const ticker of tickers) {
      const high = parseFloat(ticker.highPrice);
      const low = parseFloat(ticker.lowPrice);
      const current = parseFloat(ticker.lastPrice);
      const changePercent = parseFloat(ticker.priceChangePercent);

      // Check if price is near daily high with good volume
      const range = high - low;
      const position = (current - low) / range;

      if (position > 0.9 && changePercent > 5) {
        opportunities.push({
          symbol: ticker.symbol.replace('USDT', ''),
          type: 'price_breakout',
          score: this.calculateBreakoutScore(ticker),
          data: {
            price: current,
            high,
            low,
            range,
            position: (position * 100).toFixed(1),
            changePercent,
            volume: parseFloat(ticker.quoteVolume),
            reason: `Price at top of daily range (${(position * 100).toFixed(1)}%) with ${changePercent.toFixed(1)}% gain`
          },
          timestamp: new Date().toISOString()
        });
      }
    }

    return opportunities;
  }

  /**
   * Scan for momentum divergences
   */
  scanMomentumDivergence(tickers) {
    const opportunities = [];

    for (const ticker of tickers) {
      const changePercent = parseFloat(ticker.priceChangePercent);
      const volume = parseFloat(ticker.quoteVolume);
      const price = parseFloat(ticker.lastPrice);

      // Look for price up with volume down (weak momentum)
      // or price down with volume up (potential capitulation)
      if (changePercent > 5) {
        const volumeChange = this.calculateVolumeChange(ticker);

        if (volumeChange < 0) {
          opportunities.push({
            symbol: ticker.symbol.replace('USDT', ''),
            type: 'bearish_divergence',
            score: this.calculateDivergenceScore(ticker),
            data: {
              price,
              changePercent,
              volumeChange: volumeChange.toFixed(1),
              reason: `Price up ${changePercent.toFixed(1)}% but volume decreasing - weak momentum`
            },
            timestamp: new Date().toISOString()
          });
        }
      } else if (changePercent < -5) {
        const volumeChange = this.calculateVolumeChange(ticker);

        if (volumeChange > 50) { // Volume up 50%
          opportunities.push({
            symbol: ticker.symbol.replace('USDT', ''),
            type: 'capitulation',
            score: this.calculateDivergenceScore(ticker),
            data: {
              price,
              changePercent,
              volumeChange: volumeChange.toFixed(1),
              reason: `Price down ${Math.abs(changePercent).toFixed(1)}% with high volume - potential capitulation`
            },
            timestamp: new Date().toISOString()
          });
        }
      }
    }

    return opportunities;
  }

  /**
   * Calculate oversold score
   */
  calculateOversoldScore(ticker) {
    const changePercent = parseFloat(ticker.priceChangePercent);
    const volume = parseFloat(ticker.quoteVolume);

    // More negative = higher score, but adjusted for volume
    const baseScore = Math.min(Math.abs(changePercent), 20); // Cap at 20
    const volumeBonus = Math.min(volume / 10000000, 10); // Up to 10 points for volume

    return baseScore + volumeBonus;
  }

  /**
   * Calculate overbought score
   */
  calculateOverboughtScore(ticker) {
    const changePercent = parseFloat(ticker.priceChangePercent);

    // More positive = higher score
    return Math.min(changePercent, 20);
  }

  /**
   * Calculate volume breakout score
   */
  calculateVolumeScore(ticker, avgVolume) {
    const volume = parseFloat(ticker.quoteVolume);
    const ratio = volume / avgVolume;

    // Higher ratio = higher score
    return Math.min(ratio * 10, 30);
  }

  /**
   * Calculate breakout score
   */
  calculateBreakoutScore(ticker) {
    const high = parseFloat(ticker.highPrice);
    const low = parseFloat(ticker.lowPrice);
    const current = parseFloat(ticker.lastPrice);
    const changePercent = parseFloat(ticker.priceChangePercent);

    const range = high - low;
    const position = (current - low) / range;

    // Position in range + change percent
    return (position * 20) + Math.min(changePercent, 10);
  }

  /**
   * Calculate divergence score
   */
  calculateDivergenceScore(ticker) {
    const changePercent = Math.abs(parseFloat(ticker.priceChangePercent));
    const volume = parseFloat(ticker.quoteVolume);

    return Math.min(changePercent, 15) + Math.min(volume / 5000000, 10);
  }

  /**
   * Calculate average volume (simplified)
   */
  calculateAverageVolume(ticker) {
    // This would typically use historical data
    // For now, use a simple estimate based on current volume
    const volume = parseFloat(ticker.quoteVolume);
    return volume * 0.8; // Assume current is 20% above average
  }

  /**
   * Calculate volume change percentage
   */
  calculateVolumeChange(ticker) {
    // This would typically use historical data
    // For now, return a random value for demonstration
    return Math.random() * 40 - 20; // -20% to +20%
  }

  /**
   * Get scan results
   */
  getScanResults() {
    return this.scanResults;
  }

  /**
   * Get scan history
   */
  getScanHistory(limit = 10) {
    return this.scanHistory.slice(-limit);
  }

  /**
   * Save scan to history
   */
  saveToHistory(results) {
    const scanEntry = {
      timestamp: new Date().toISOString(),
      opportunities: results.length,
      topPicks: results.slice(0, 5).map(r => ({
        symbol: r.symbol,
        type: r.type,
        score: r.score
      }))
    };

    this.scanHistory.push(scanEntry);

    // Keep only last 100 scans
    if (this.scanHistory.length > 100) {
      this.scanHistory = this.scanHistory.slice(-100);
    }

    // Save to localStorage
    this.saveHistory();
  }

  /**
   * Save history to localStorage
   */
  saveHistory() {
    try {
      localStorage.setItem('scanner_history', JSON.stringify(this.scanHistory));
    } catch (error) {
      console.error('Failed to save scanner history:', error);
    }
  }

  /**
   * Load history from localStorage
   */
  loadHistory() {
    try {
      const data = localStorage.getItem('scanner_history');
      if (data) {
        this.scanHistory = JSON.parse(data);
      }
    } catch (error) {
      console.error('Failed to load scanner history:', error);
    }
  }

  /**
   * Export scan results
   */
  exportResults(format = 'json') {
    if (format === 'json') {
      return JSON.stringify(this.scanResults, null, 2);
    } else if (format === 'csv') {
      const headers = ['Symbol', 'Type', 'Score', 'Price', 'Change%', 'Reason', 'Timestamp'];
      const rows = this.scanResults.map(r => [
        r.symbol,
        r.type,
        r.score.toFixed(2),
        r.data.price,
        r.data.changePercent?.toFixed(2) || 'N/A',
        r.data.reason,
        r.timestamp
      ]);
      return [headers, ...rows].map(row => row.join(',')).join('\n');
    }

    throw new Error('Unsupported export format');
  }

  /**
   * Clear history
   */
  clearHistory() {
    this.scanHistory = [];
    localStorage.removeItem('scanner_history');
  }

  /**
   * Cleanup
   */
  destroy() {
    this.stopScanning();
    this.saveHistory();
  }
}

// Export for use in dashboard
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MarketScanner };
}
