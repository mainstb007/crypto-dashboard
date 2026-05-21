/**
 * Portfolio Tracker Module
 * Track positions, P&L, and performance metrics
 */

class PortfolioTracker {
  constructor(config, dataManager) {
    this.config = config;
    this.dataManager = dataManager;
    this.positions = [];
    this.snapshots = [];
    this.performance = {};
    this.initialized = false;
  }

  /**
   * Initialize portfolio tracker
   */
  async init() {
    try {
      // Load saved portfolio data
      this.loadPortfolio();

      // Load historical snapshots
      this.loadSnapshots();

      // Calculate performance
      await this.calculatePerformance();

      this.initialized = true;

      // Set up auto-save if enabled
      if (this.config.portfolio.autoSave) {
        setInterval(() => this.savePortfolio(), 60000); // Save every minute
      }

      console.log('Portfolio tracker initialized');
    } catch (error) {
      console.error('Failed to initialize portfolio tracker:', error);
      throw error;
    }
  }

  /**
   * Add a new position
   */
  async addPosition(positionData) {
    const position = {
      id: Date.now().toString(),
      symbol: positionData.symbol.toUpperCase(),
      type: positionData.type || 'spot', // 'spot', 'margin', 'futures'
      side: positionData.side || 'long', // 'long', 'short'
      entryPrice: parseFloat(positionData.entryPrice),
      amount: parseFloat(positionData.amount),
      timestamp: new Date().toISOString(),
      notes: positionData.notes || '',
      stopLoss: positionData.stopLoss || null,
      takeProfit: positionData.takeProfit || null,
      status: 'open' // 'open', 'closed'
    };

    // Calculate position value
    position.value = position.entryPrice * position.amount;

    // Validate position
    if (!this.validatePosition(position)) {
      throw new Error('Invalid position data');
    }

    this.positions.push(position);

    // Save to storage
    this.savePortfolio();

    // Update performance metrics
    await this.calculatePerformance();

    return position;
  }

  /**
   * Close a position
   */
  async closePosition(positionId, exitPrice) {
    const position = this.positions.find(p => p.id === positionId);
    if (!position) {
      throw new Error('Position not found');
    }

    position.exitPrice = parseFloat(exitPrice);
    position.exitTimestamp = new Date().toISOString();
    position.status = 'closed';

    // Calculate final P&L
    const pnl = this.calculatePositionPnL(position);
    position.finalPnL = pnl;
    position.finalPnLPercent = ((pnl / position.value) * 100).toFixed(2);

    // Save to storage
    this.savePortfolio();

    // Create snapshot
    await this.createSnapshot('Position closed');

    // Update performance metrics
    await this.calculatePerformance();

    return position;
  }

  /**
   * Update position
   */
  async updatePosition(positionId, updates) {
    const position = this.positions.find(p => p.id === positionId);
    if (!position) {
      throw new Error('Position not found');
    }

    // Allow updating only certain fields for open positions
    const allowedUpdates = ['stopLoss', 'takeProfit', 'notes'];
    for (const field of allowedUpdates) {
      if (updates[field] !== undefined) {
        position[field] = updates[field];
      }
    }

    this.savePortfolio();

    return position;
  }

  /**
   * Calculate P&L for a position
   */
  calculatePositionPnL(position) {
    if (position.status === 'open') {
      // Get current price
      const currentPrice = this.getCurrentPrice(position.symbol);
      if (!currentPrice) return 0;

      if (position.side === 'long') {
        return (currentPrice - position.entryPrice) * position.amount;
      } else {
        return (position.entryPrice - currentPrice) * position.amount;
      }
    } else {
      // Calculate based on exit price
      if (position.side === 'long') {
        return (position.exitPrice - position.entryPrice) * position.amount;
      } else {
        return (position.entryPrice - position.exitPrice) * position.amount;
      }
    }
  }

  /**
   * Get current price for symbol
   */
  getCurrentPrice(symbol) {
    // This would typically come from the data manager
    // For now, return null to indicate price not available
    return null;
  }

  /**
   * Calculate overall portfolio performance
   */
  async calculatePerformance() {
    const openPositions = this.positions.filter(p => p.status === 'open');
    const closedPositions = this.positions.filter(p => p.status === 'closed');

    // Calculate total invested
    const totalInvested = this.positions.reduce((sum, p) => sum + p.value, 0);

    // Calculate current value
    let currentValue = 0;
    let unrealizedPnL = 0;

    for (const position of openPositions) {
      const currentPrice = this.getCurrentPrice(position.symbol);
      if (currentPrice) {
        const positionValue = currentPrice * position.amount;
        currentValue += positionValue;
        unrealizedPnL += this.calculatePositionPnL(position);
      } else {
        currentValue += position.value;
      }
    }

    // Calculate realized P&L
    const realizedPnL = closedPositions.reduce((sum, p) => {
      return sum + (p.finalPnL || 0);
    }, 0);

    // Calculate win rate
    const winningPositions = closedPositions.filter(p => p.finalPnL > 0);
    const winRate = closedPositions.length > 0
      ? (winningPositions.length / closedPositions.length * 100).toFixed(2)
      : 0;

    // Calculate average win/loss
    const avgWin = winningPositions.length > 0
      ? winningPositions.reduce((sum, p) => sum + p.finalPnL, 0) / winningPositions.length
      : 0;

    const losingPositions = closedPositions.filter(p => p.finalPnL < 0);
    const avgLoss = losingPositions.length > 0
      ? losingPositions.reduce((sum, p) => sum + p.finalPnL, 0) / losingPositions.length
      : 0;

    // Store performance metrics
    this.performance = {
      totalInvested,
      currentValue,
      unrealizedPnL,
      realizedPnL,
      totalPnL: unrealizedPnL + realizedPnL,
      totalPnLPercent: totalInvested > 0 ? ((currentValue + realizedPnL - totalInvested) / totalInvested * 100).toFixed(2) : 0,
      openPositions: openPositions.length,
      closedPositions: closedPositions.length,
      winRate: parseFloat(winRate),
      avgWin,
      avgLoss,
      profitFactor: avgLoss !== 0 ? (avgWin / Math.abs(avgLoss)).toFixed(2) : 0,
      largestWin: closedPositions.length > 0 ? Math.max(...closedPositions.map(p => p.finalPnL || 0)) : 0,
      largestLoss: closedPositions.length > 0 ? Math.min(...closedPositions.map(p => p.finalPnL || 0)) : 0
    };

    return this.performance;
  }

  /**
   * Get portfolio summary
   */
  getPortfolioSummary() {
    const openPositions = this.positions.filter(p => p.status === 'open');

    return {
      positions: openPositions,
      performance: this.performance,
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Get position details
   */
  getPosition(positionId) {
    const position = this.positions.find(p => p.id === positionId);
    if (!position) {
      throw new Error('Position not found');
    }

    // Add current P&L for open positions
    if (position.status === 'open') {
      position.currentPnL = this.calculatePositionPnL(position);
      position.currentPnLPercent = ((position.currentPnL / position.value) * 100).toFixed(2);
    }

    return position;
  }

  /**
   * Get all positions
   */
  getPositions(status = null) {
    if (status) {
      return this.positions.filter(p => p.status === status);
    }
    return this.positions;
  }

  /**
   * Validate position data
   */
  validatePosition(position) {
    if (!position.symbol || position.symbol.length === 0) return false;
    if (position.entryPrice <= 0) return false;
    if (position.amount <= 0) return false;
    if (!['long', 'short'].includes(position.side)) return false;
    if (!['spot', 'margin', 'futures'].includes(position.type)) return false;

    return true;
  }

  /**
   * Create portfolio snapshot
   */
  async createSnapshot(reason = 'Manual') {
    const snapshot = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      reason,
      positions: JSON.parse(JSON.stringify(this.positions)),
      performance: { ...this.performance }
    };

    this.snapshots.push(snapshot);

    // Keep only last 100 snapshots
    if (this.snapshots.length > 100) {
      this.snapshots = this.snapshots.slice(-100);
    }

    // Save to storage
    this.saveSnapshots();

    return snapshot;
  }

  /**
   * Get performance history from snapshots
   */
  getPerformanceHistory(days = 30) {
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    return this.snapshots.filter(s => new Date(s.timestamp).getTime() > cutoff);
  }

  /**
   * Export portfolio data
   */
  exportPortfolio(format = 'json') {
    const data = {
      exportDate: new Date().toISOString(),
      positions: this.positions,
      performance: this.performance,
      snapshots: this.snapshots.slice(-10) // Last 10 snapshots
    };

    if (format === 'json') {
      return JSON.stringify(data, null, 2);
    } else if (format === 'csv') {
      return this.convertToCSV(data.positions);
    }

    throw new Error('Unsupported export format');
  }

  /**
   * Convert positions to CSV
   */
  convertToCSV(positions) {
    const headers = ['ID', 'Symbol', 'Type', 'Side', 'Entry Price', 'Amount', 'Value', 'Status', 'P&L', 'P&L %', 'Timestamp'];

    const rows = positions.map(p => [
      p.id,
      p.symbol,
      p.type,
      p.side,
      p.entryPrice,
      p.amount,
      p.value.toFixed(2),
      p.status,
      (p.finalPnL || p.currentPnL || 0).toFixed(2),
      (p.finalPnLPercent || p.currentPnLPercent || 0) + '%',
      p.timestamp
    ]);

    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }

  /**
   * Save portfolio to localStorage
   */
  savePortfolio() {
    try {
      const data = {
        positions: this.positions,
        performance: this.performance
      };
      localStorage.setItem('portfolio_data', JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save portfolio:', error);
    }
  }

  /**
   * Load portfolio from localStorage
   */
  loadPortfolio() {
    try {
      const data = localStorage.getItem('portfolio_data');
      if (data) {
        const parsed = JSON.parse(data);
        this.positions = parsed.positions || [];
        this.performance = parsed.performance || {};
      }
    } catch (error) {
      console.error('Failed to load portfolio:', error);
    }
  }

  /**
   * Save snapshots to localStorage
   */
  saveSnapshots() {
    try {
      localStorage.setItem('portfolio_snapshots', JSON.stringify(this.snapshots));
    } catch (error) {
      console.error('Failed to save snapshots:', error);
    }
  }

  /**
   * Load snapshots from localStorage
   */
  loadSnapshots() {
    try {
      const data = localStorage.getItem('portfolio_snapshots');
      if (data) {
        this.snapshots = JSON.parse(data);
      }
    } catch (error) {
      console.error('Failed to load snapshots:', error);
    }
  }

  /**
   * Clear all data
   */
  clearData() {
    this.positions = [];
    this.snapshots = [];
    this.performance = {};
    localStorage.removeItem('portfolio_data');
    localStorage.removeItem('portfolio_snapshots');
  }

  /**
   * Cleanup
   */
  destroy() {
    this.savePortfolio();
    this.saveSnapshots();
  }
}

// Export for use in dashboard
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PortfolioTracker };
}
