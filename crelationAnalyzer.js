/**
 * Correlation Analyzer
 * Analyze correlations between cryptocurrencies and sectors
 */

class CorrelationAnalyzer {
  constructor(config, dataManager) {
    this.config = config;
    this.dataManager = dataManager;
    this.correlationData = new Map();
    this.lastUpdate = null;
    this.initialized = false;
  }

  /**
   * Initialize correlation analyzer
   */
  async init() {
    try {
      // Load cached correlation data
      this.loadCache();

      // Calculate initial correlations
      await this.calculateCorrelations();

      this.initialized = true;
      console.log('Correlation analyzer initialized');
    } catch (error) {
      console.error('Failed to initialize correlation analyzer:', error);
      throw error;
    }
  }

  /**
   * Calculate correlation matrix
   */
  async calculateCorrelations(symbols = null) {
    try {
      console.log('Calculating correlations...');

      // Use default symbols if none provided
      if (!symbols) {
        symbols = this.getDefaultSymbols();
      }

      // Fetch price data for all symbols
      const priceData = await this.fetchPriceData(symbols);

      if (!priceData || priceData.length === 0) {
        throw new Error('Failed to fetch price data');
      }

      // Calculate pairwise correlations
      const correlations = this.calculatePairwiseCorrelations(priceData);

      // Store results
      this.correlationData = new Map();
      for (const correlation of correlations) {
        const key = `${correlation.symbol1}-${correlation.symbol2}`;
        this.correlationData.set(key, correlation);
      }

      this.lastUpdate = new Date().toISOString();

      // Cache results
      this.saveCache();

      console.log(`Calculated ${correlations.length} correlations`);

      return correlations;
    } catch (error) {
      console.error('Failed to calculate correlations:', error);
      return [];
    }
  }

  /**
   * Get default symbols to analyze
   */
  getDefaultSymbols() {
    const tierCoins = [
      ...this.config.tiers.S.coins,
      ...this.config.tiers.A.coins,
      ...this.config.tiers.B.coins
    ];

    return tierCoins;
  }

  /**
   * Fetch price data for symbols
   */
  async fetchPriceData(symbols) {
    const priceData = [];

    for (const symbol of symbols) {
      try {
        // Fetch recent price data (last 30 days)
        const klines = await this.dataManager.fetchData(
          `/klines?symbol=${symbol}USDT&interval=1d&limit=${this.config.correlation.lookbackPeriod}`,
          {
            cacheDuration: 3600000, // 1 hour cache
            useCache: true
          }
        );

        if (klines && Array.isArray(klines)) {
          // Extract closing prices
          const prices = klines.map(k => parseFloat(k[4]));

          priceData.push({
            symbol,
            prices,
            change: this.calculateChange(prices)
          });
        }
      } catch (error) {
        console.warn(`Failed to fetch data for ${symbol}:`, error.message);
      }
    }

    return priceData;
  }

  /**
   * Calculate price change percentage
   */
  calculateChange(prices) {
    if (prices.length < 2) return 0;
    const first = prices[0];
    const last = prices[prices.length - 1];
    return ((last - first) / first) * 100;
  }

  /**
   * Calculate pairwise correlations
   */
  calculatePairwiseCorrelations(priceData) {
    const correlations = [];

    // Compare each pair of symbols
    for (let i = 0; i < priceData.length; i++) {
      for (let j = i + 1; j < priceData.length; j++) {
        const symbol1 = priceData[i].symbol;
        const symbol2 = priceData[j].symbol;
        const prices1 = priceData[i].prices;
        const prices2 = priceData[j].prices;

        // Calculate correlation coefficient
        const correlation = this.calculateCorrelationCoefficient(prices1, prices2);

        correlations.push({
          symbol1,
          symbol2,
          correlation,
          absCorrelation: Math.abs(correlation),
          strength: this.getCorrelationStrength(correlation),
          direction: correlation > 0 ? 'positive' : correlation < 0 ? 'negative' : 'none'
        });
      }
    }

    // Sort by absolute correlation
    correlations.sort((a, b) => b.absCorrelation - a.absCorrelation);

    return correlations;
  }

  /**
   * Calculate Pearson correlation coefficient
   */
  calculateCorrelationCoefficient(prices1, prices2) {
    const n = Math.min(prices1.length, prices2.length);

    if (n < 2) return 0;

    // Calculate returns instead of prices for better correlation
    const returns1 = this.calculateReturns(prices1.slice(0, n));
    const returns2 = this.calculateReturns(prices2.slice(0, n));

    // Calculate means
    const mean1 = returns1.reduce((sum, r) => sum + r, 0) / n;
    const mean2 = returns2.reduce((sum, r) => sum + r, 0) / n;

    // Calculate correlation
    let numerator = 0;
    let denominator1 = 0;
    let denominator2 = 0;

    for (let i = 0; i < n; i++) {
      const diff1 = returns1[i] - mean1;
      const diff2 = returns2[i] - mean2;

      numerator += diff1 * diff2;
      denominator1 += diff1 * diff1;
      denominator2 += diff2 * diff2;
    }

    const denominator = Math.sqrt(denominator1 * denominator2);

    if (denominator === 0) return 0;

    return numerator / denominator;
  }

  /**
   * Calculate daily returns from prices
   */
  calculateReturns(prices) {
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
    return returns;
  }

  /**
   * Get correlation strength category
   */
  getCorrelationStrength(correlation) {
    const abs = Math.abs(correlation);
    if (abs >= 0.8) return 'very_strong';
    if (abs >= 0.6) return 'strong';
    if (abs >= 0.4) return 'moderate';
    if (abs >= 0.2) return 'weak';
    return 'very_weak';
  }

  /**
   * Get correlation between two symbols
   */
  getCorrelation(symbol1, symbol2) {
    const key1 = `${symbol1}-${symbol2}`;
    const key2 = `${symbol2}-${symbol1}`;

    return this.correlationData.get(key1) || this.correlationData.get(key2) || null;
  }

  /**
   * Get highly correlated symbols
   */
  getHighCorrelations(symbol, minCorrelation = null) {
    const threshold = minCorrelation || this.config.correlation.minCorrelation;
    const correlations = [];

    for (const [key, correlation] of this.correlationData.entries()) {
      if ((correlation.symbol1 === symbol || correlation.symbol2 === symbol) &&
          correlation.absCorrelation >= threshold) {
        correlations.push(correlation);
      }
    }

    // Sort by correlation strength
    correlations.sort((a, b) => b.absCorrelation - a.absCorrelation);

    return correlations;
  }

  /**
   * Get correlation heatmap data
   */
  getHeatmapData(symbols = null) {
    const symbolList = symbols || this.getDefaultSymbols();

    // Create matrix
    const matrix = [];
    for (const symbol1 of symbolList) {
      const row = [];
      for (const symbol2 of symbolList) {
        if (symbol1 === symbol2) {
          row.push(1.0);
        } else {
          const correlation = this.getCorrelation(symbol1, symbol2);
          row.push(correlation ? correlation.correlation : 0);
        }
      }
      matrix.push({ symbol: symbol1, correlations: row });
    }

    return {
      symbols: symbolList,
      matrix,
      lastUpdate: this.lastUpdate
    };
  }

  /**
   * Get sector correlations
   */
  getSectorCorrelations() {
    const sectors = {
      'L1': ['SOL', 'SUI', 'NEAR', 'APT', 'AVAX', 'ATOM', 'ALGO', 'ADA'],
      'DeFi': ['LINK', 'UNI', 'AAVE', 'MKR'],
      'Layer2': ['OP', 'ARB'],
      'AI': ['TAO', 'RENDER', 'FET', 'WLD'],
      'Privacy': ['ZEC', 'XMR'],
      'Payment': ['DOGE', 'TRX', 'LTC'],
      'Storage': ['FIL', 'AR'],
      'DePIN': ['HNT', 'AKT', 'MOVR']
    };

    const sectorCorrelations = {};

    for (const [sectorName, sectorCoins] of Object.entries(sectors)) {
      const correlations = [];

      // Calculate correlations within sector
      for (let i = 0; i < sectorCoins.length; i++) {
        for (let j = i + 1; j < sectorCoins.length; j++) {
          const correlation = this.getCorrelation(sectorCoins[i], sectorCoins[j]);
          if (correlation) {
            correlations.push(correlation);
          }
        }
      }

      // Calculate average sector correlation
      const avgCorrelation = correlations.length > 0
        ? correlations.reduce((sum, c) => sum + c.absCorrelation, 0) / correlations.length
        : 0;

      sectorCorrelations[sectorName] = {
        coins: sectorCoins,
        avgCorrelation,
        correlations: correlations.slice(0, 5) // Top 5
      };
    }

    return sectorCorrelations;
  }

  /**
   * Find diversification opportunities
   */
  findDiversificationOpportunities(portfolioSymbols) {
    const opportunities = [];

    for (const portfolioSymbol of portfolioSymbols) {
      // Find symbols with low correlation to portfolio symbol
      const lowCorrelation = [];

      for (const [key, correlation] of this.correlationData.entries()) {
        if ((correlation.symbol1 === portfolioSymbol || correlation.symbol2 === portfolioSymbol) &&
            correlation.absCorrelation < 0.3) {

          const otherSymbol = correlation.symbol1 === portfolioSymbol
            ? correlation.symbol2
            : correlation.symbol1;

          lowCorrelation.push({
            symbol: otherSymbol,
            correlation: correlation.correlation
          });
        }
      }

      if (lowCorrelation.length > 0) {
        opportunities.push({
          portfolioSymbol,
          diversificationCandidates: lowCorrelation.slice(0, 5)
        });
      }
    }

    return opportunities;
  }

  /**
   * Get correlation statistics
   */
  getCorrelationStats() {
    const correlations = Array.from(this.correlationData.values());

    if (correlations.length === 0) {
      return null;
    }

    const avgCorrelation = correlations.reduce((sum, c) => sum + c.absCorrelation, 0) / correlations.length;

    const strong = correlations.filter(c => c.strength === 'strong' || c.strength === 'very_strong').length;
    const moderate = correlations.filter(c => c.strength === 'moderate').length;
    const weak = correlations.filter(c => c.strength === 'weak' || c.strength === 'very_weak').length;

    const positive = correlations.filter(c => c.direction === 'positive').length;
    const negative = correlations.filter(c => c.direction === 'negative').length;

    return {
      total: correlations.length,
      average: avgCorrelation.toFixed(3),
      strong,
      moderate,
      weak,
      positive,
      negative,
      lastUpdate: this.lastUpdate
    };
  }

  /**
   * Export correlation data
   */
  exportCorrelations(format = 'json') {
    const data = {
      exportDate: new Date().toISOString(),
      lastUpdate: this.lastUpdate,
      correlations: Array.from(this.correlationData.values())
    };

    if (format === 'json') {
      return JSON.stringify(data, null, 2);
    } else if (format === 'csv') {
      const headers = ['Symbol 1', 'Symbol 2', 'Correlation', 'Strength', 'Direction'];
      const rows = data.correlations.map(c => [
        c.symbol1,
        c.symbol2,
        c.correlation.toFixed(3),
        c.strength,
        c.direction
      ]);
      return [headers, ...rows].map(row => row.join(',')).join('\n');
    }

    throw new Error('Unsupported export format');
  }

  /**
   * Save correlation data to cache
   */
  saveCache() {
    try {
      const data = {
        correlations: Array.from(this.correlationData.entries()),
        lastUpdate: this.lastUpdate
      };
      localStorage.setItem('correlation_cache', JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save correlation cache:', error);
    }
  }

  /**
   * Load correlation data from cache
   */
  loadCache() {
    try {
      const data = localStorage.getItem('correlation_cache');
      if (data) {
        const parsed = JSON.parse(data);
        this.correlationData = new Map(parsed.correlations);
        this.lastUpdate = parsed.lastUpdate;
      }
    } catch (error) {
      console.error('Failed to load correlation cache:', error);
    }
  }

  /**
   * Clear correlation data
   */
  clearCache() {
    this.correlationData.clear();
    this.lastUpdate = null;
    localStorage.removeItem('correlation_cache');
  }

  /**
   * Check if update is needed
   */
  needsUpdate() {
    if (!this.lastUpdate) return true;

    const age = Date.now() - new Date(this.lastUpdate).getTime();
    return age > this.config.correlation.updateInterval;
  }

  /**
   * Cleanup
   */
  destroy() {
    this.saveCache();
  }
}

// Export for use in dashboard
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CorrelationAnalyzer };
}
