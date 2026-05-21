/**
 * Alert System for Crypto Dashboard
 * Real-time alerts for price thresholds, volume spikes, and technical indicators
 */

class AlertSystem {
  constructor(config, dataManager) {
    this.config = config;
    this.dataManager = dataManager;
    this.alerts = [];
    this.activeAlerts = new Map();
    this.alertHistory = [];
    this.cooldowns = new Map();
    this.soundEnabled = this.config.alerts.soundEnabled;
    this.browserNotifications = false;
    this.initialized = false;
  }

  /**
   * Initialize alert system
   */
  async init() {
    try {
      // Load saved alerts
      this.loadAlerts();

      // Load alert history
      this.loadHistory();

      // Request browser notification permission
      if (this.config.alerts.pushNotifications) {
        await this.requestNotificationPermission();
      }

      // Start monitoring
      this.startMonitoring();

      this.initialized = true;
      console.log('Alert system initialized');
    } catch (error) {
      console.error('Failed to initialize alert system:', error);
      throw error;
    }
  }

  /**
   * Request browser notification permission
   */
  async requestNotificationPermission() {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      this.browserNotifications = permission === 'granted';
      return this.browserNotifications;
    }
    return false;
  }

  /**
   * Create a new alert
   */
  async createAlert(alertData) {
    const alert = {
      id: Date.now().toString(),
      symbol: alertData.symbol.toUpperCase(),
      type: alertData.type, // 'price', 'volume', 'rsi', 'custom'
      condition: alertData.condition, // 'above', 'below', 'crosses', 'change_percent'
      threshold: parseFloat(alertData.threshold),
      enabled: true,
      createdAt: new Date().toISOString(),
      triggered: false,
      triggeredAt: null,
      message: alertData.message || `Alert for ${alertData.symbol}`,
      cooldown: alertData.cooldown || this.config.alerts.cooldown,
      repeat: alertData.repeat || false
    };

    // Validate alert
    if (!this.validateAlert(alert)) {
      throw new Error('Invalid alert data');
    }

    this.alerts.push(alert);
    this.activeAlerts.set(alert.id, alert);

    // Save to storage
    this.saveAlerts();

    return alert;
  }

  /**
   * Validate alert data
   */
  validateAlert(alert) {
    if (!alert.symbol || alert.symbol.length === 0) return false;
    if (!['price', 'volume', 'rsi', 'custom'].includes(alert.type)) return false;
    if (!['above', 'below', 'crosses_up', 'crosses_down', 'change_percent'].includes(alert.condition)) return false;
    if (isNaN(alert.threshold)) return false;

    return true;
  }

  /**
   * Start monitoring for alerts
   */
  startMonitoring() {
    // Check alerts every 5 seconds
    setInterval(() => {
      this.checkAlerts();
    }, 5000);
  }

  /**
   * Check all active alerts
   */
  async checkAlerts() {
    const enabledAlerts = this.alerts.filter(a => a.enabled && !a.triggered);

    for (const alert of enabledAlerts) {
      // Check cooldown
      if (this.isInCooldown(alert)) {
        continue;
      }

      // Check alert condition
      const shouldTrigger = await this.evaluateAlert(alert);

      if (shouldTrigger) {
        await this.triggerAlert(alert);
      }
    }
  }

  /**
   * Evaluate if alert condition is met
   */
  async evaluateAlert(alert) {
    try {
      const data = await this.dataManager.fetchData(`/ticker/24hr?symbol=${alert.symbol}USDT`);

      if (!data || !data[0]) {
        console.warn(`No data available for ${alert.symbol}`);
        return false;
      }

      const ticker = data[0];
      const currentPrice = parseFloat(ticker.lastPrice);
      const volume = parseFloat(ticker.volume);
      const changePercent = parseFloat(ticker.priceChangePercent);

      switch (alert.type) {
        case 'price':
          return this.checkPriceCondition(currentPrice, alert);

        case 'volume':
          return this.checkVolumeCondition(volume, alert);

        case 'change_percent':
          return this.checkChangePercentCondition(changePercent, alert);

        case 'rsi':
          // RSI would need to be calculated or fetched from indicator data
          return false; // Placeholder

        default:
          return false;
      }
    } catch (error) {
      console.error(`Error evaluating alert ${alert.id}:`, error);
      return false;
    }
  }

  /**
   * Check price condition
   */
  checkPriceCondition(price, alert) {
    switch (alert.condition) {
      case 'above':
        return price > alert.threshold;
      case 'below':
        return price < alert.threshold;
      case 'crosses_up':
        // Need previous price to detect crossing
        return false; // Placeholder
      case 'crosses_down':
        return false; // Placeholder
      default:
        return false;
    }
  }

  /**
   * Check volume condition
   */
  checkVolumeCondition(volume, alert) {
    const threshold = alert.threshold;

    switch (alert.condition) {
      case 'above':
        return volume > threshold;
      case 'below':
        return volume < threshold;
      default:
        return false;
    }
  }

  /**
   * Check change percent condition
   */
  checkChangePercentCondition(changePercent, alert) {
    const threshold = alert.threshold;

    // Check if change percent crosses threshold
    if (alert.condition === 'above') {
      return changePercent > threshold;
    } else if (alert.condition === 'below') {
      return changePercent < threshold;
    } else if (alert.condition === 'crosses_up') {
      // Check if it just crossed above threshold
      return changePercent > threshold && changePercent - threshold < 1;
    } else if (alert.condition === 'crosses_down') {
      return changePercent < threshold && threshold - changePercent < 1;
    }

    return false;
  }

  /**
   * Trigger an alert
   */
  async triggerAlert(alert) {
    console.log(`Alert triggered: ${alert.message}`);

    // Mark as triggered
    alert.triggered = true;
    alert.triggeredAt = new Date().toISOString();

    // Add to history
    this.alertHistory.push({
      ...alert,
      triggeredAt: alert.triggeredAt
    });

    // Set cooldown
    this.setCooldown(alert);

    // Send notifications
    await this.sendNotification(alert);

    // Play sound if enabled
    if (this.soundEnabled) {
      this.playSound();
    }

    // Save to storage
    this.saveAlerts();
    this.saveHistory();

    // Create toast notification
    this.showToast(alert);

    // If alert is not repeatable, disable it
    if (!alert.repeat) {
      alert.enabled = false;
    }
  }

  /**
   * Send browser notification
   */
  async sendNotification(alert) {
    if (this.browserNotifications && this.config.alerts.pushNotifications) {
      const notification = new Notification('Crypto Alert', {
        body: alert.message,
        icon: '/favicon.ico',
        tag: alert.id
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      // Auto-close after 5 seconds
      setTimeout(() => notification.close(), 5000);
    }
  }

  /**
   * Play alert sound
   */
  playSound() {
    const audio = new Audio('/alert.mp3');
    audio.play().catch(error => {
      console.warn('Failed to play alert sound:', error);
    });
  }

  /**
   * Show toast notification
   */
  showToast(alert) {
    // Create toast element
    const toast = document.createElement('div');
    toast.className = 'alert-toast';
    toast.innerHTML = `
      <div class="toast-content">
        <strong>${alert.symbol}</strong>
        <p>${alert.message}</p>
        <small>${new Date(alert.triggeredAt).toLocaleTimeString()}</small>
      </div>
    `;

    // Add to document
    document.body.appendChild(toast);

    // Remove after duration
    setTimeout(() => {
      toast.remove();
    }, this.config.ui.toastDuration);
  }

  /**
   * Set cooldown for alert
   */
  setCooldown(alert) {
    this.cooldowns.set(alert.id, Date.now() + alert.cooldown);
  }

  /**
   * Check if alert is in cooldown
   */
  isInCooldown(alert) {
    const cooldownEnd = this.cooldowns.get(alert.id);
    if (!cooldownEnd) return false;

    if (Date.now() < cooldownEnd) {
      return true;
    }

    this.cooldowns.delete(alert.id);
    return false;
  }

  /**
   * Get all alerts
   */
  getAlerts() {
    return this.alerts;
  }

  /**
   * Get alert by ID
   */
  getAlert(alertId) {
    return this.alerts.find(a => a.id === alertId);
  }

  /**
   * Update alert
   */
  async updateAlert(alertId, updates) {
    const alert = this.alerts.find(a => a.id === alertId);
    if (!alert) {
      throw new Error('Alert not found');
    }

    // Allow updating only certain fields
    const allowedUpdates = ['enabled', 'threshold', 'condition', 'message', 'cooldown', 'repeat'];
    for (const field of allowedUpdates) {
      if (updates[field] !== undefined) {
        alert[field] = updates[field];
      }
    }

    this.saveAlerts();

    return alert;
  }

  /**
   * Delete alert
   */
  deleteAlert(alertId) {
    const index = this.alerts.findIndex(a => a.id === alertId);
    if (index === -1) {
      throw new Error('Alert not found');
    }

    this.alerts.splice(index, 1);
    this.activeAlerts.delete(alertId);

    this.saveAlerts();
  }

  /**
   * Create preset alerts for a symbol
   */
  createPresetAlerts(symbol) {
    const presets = [
      {
        symbol,
        type: 'price',
        condition: 'above',
        threshold: 0, // Will be set based on current price
        message: `${symbol} price increased`
      },
      {
        symbol,
        type: 'price',
        condition: 'below',
        threshold: 0, // Will be set based on current price
        message: `${symbol} price decreased`
      },
      {
        symbol,
        type: 'change_percent',
        condition: 'above',
        threshold: this.config.alerts.thresholds.priceChange.up,
        message: `${symbol} up ${this.config.alerts.thresholds.priceChange.up}%`
      },
      {
        symbol,
        type: 'change_percent',
        condition: 'below',
        threshold: this.config.alerts.thresholds.priceChange.down,
        message: `${symbol} down ${Math.abs(this.config.alerts.thresholds.priceChange.down)}%`
      }
    ];

    return Promise.all(presets.map(preset => this.createAlert(preset)));
  }

  /**
   * Get alert statistics
   */
  getAlertStats() {
    const total = this.alerts.length;
    const enabled = this.alerts.filter(a => a.enabled).length;
    const triggered = this.alerts.filter(a => a.triggered).length;
    const today = this.alertHistory.filter(a => {
      const triggerDate = new Date(a.triggeredAt);
      const today = new Date();
      return triggerDate.toDateString() === today.toDateString();
    }).length;

    return {
      total,
      enabled,
      triggered,
      triggeredToday: today,
      history: this.alertHistory.length
    };
  }

  /**
   * Save alerts to localStorage
   */
  saveAlerts() {
    try {
      localStorage.setItem('alerts', JSON.stringify(this.alerts));
    } catch (error) {
      console.error('Failed to save alerts:', error);
    }
  }

  /**
   * Load alerts from localStorage
   */
  loadAlerts() {
    try {
      const data = localStorage.getItem('alerts');
      if (data) {
        this.alerts = JSON.parse(data);
        this.alerts.forEach(alert => {
          this.activeAlerts.set(alert.id, alert);
        });
      }
    } catch (error) {
      console.error('Failed to load alerts:', error);
    }
  }

  /**
   * Save alert history
   */
  saveHistory() {
    try {
      // Keep only last 1000 history entries
      const history = this.alertHistory.slice(-1000);
      localStorage.setItem('alert_history', JSON.stringify(history));
    } catch (error) {
      console.error('Failed to save alert history:', error);
    }
  }

  /**
   * Load alert history
   */
  loadHistory() {
    try {
      const data = localStorage.getItem('alert_history');
      if (data) {
        this.alertHistory = JSON.parse(data);
      }
    } catch (error) {
      console.error('Failed to load alert history:', error);
    }
  }

  /**
   * Clear alert history
   */
  clearHistory() {
    this.alertHistory = [];
    localStorage.removeItem('alert_history');
  }

  /**
   * Clear all data
   */
  clearAll() {
    this.alerts = [];
    this.alertHistory = [];
    this.activeAlerts.clear();
    this.cooldowns.clear();
    localStorage.removeItem('alerts');
    localStorage.removeItem('alert_history');
  }

  /**
   * Cleanup
   */
  destroy() {
    this.saveAlerts();
    this.saveHistory();
  }
}

// Export for use in dashboard
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AlertSystem };
}
