/**
 * Data Pipeline Manager
 * Handles unified data fetching with caching, rate limiting, and failover
 */

class DataManager {
  constructor(config) {
    this.config = config;
    this.cache = new Map();
    this.cacheTimeouts = new Map();
    this.requestQueue = [];
    this.isProcessing = false;
    this.lastRequestTime = {};
    this.healthStatus = new Map();
    this.retryCount = new Map();
  }

  /**
   * Fetch data with caching, rate limiting, and failover
   */
  async fetchData(endpoint, options = {}) {
    const {
      cacheKey,
      cacheDuration = 5000,
      useCache = true,
      retries = this.config.dataSources.retryAttempts,
      priority = 'normal'
    } = options;

    // Check cache first
    if (useCache && cacheKey) {
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        console.log(`Cache hit: ${cacheKey}`);
        return cached;
      }
    }

    // Add to queue if rate limited
    if (!this.canMakeRequest(endpoint)) {
      return this.queueRequest(endpoint, options, retries);
    }

    // Fetch with failover
    try {
      const data = await this.fetchWithFailover(endpoint, options, retries);

      // Cache successful response
      if (useCache && cacheKey && data) {
        this.setCache(cacheKey, data, cacheDuration);
      }

      // Update health status
      this.updateHealthStatus(endpoint, true);
      this.retryCount.delete(endpoint);

      return data;
    } catch (error) {
      console.error(`Failed to fetch ${endpoint}:`, error);
      this.updateHealthStatus(endpoint, false);
      throw error;
    }
  }

  /**
   * Fetch from primary source with automatic failover
   */
  async fetchWithFailover(endpoint, options, retries) {
    const sources = [this.config.dataSources.primary, ...this.config.dataSources.fallback];

    for (const source of sources) {
      try {
        const data = await this.fetchFromSource(source, endpoint, options);
        if (data) {
          return data;
        }
      } catch (error) {
        console.warn(`Failed to fetch from ${source}:`, error.message);
        continue;
      }
    }

    throw new Error(`All data sources failed after ${retries} retries`);
  }

  /**
   * Fetch from specific exchange
   */
  async fetchFromSource(exchange, endpoint, options) {
    const exchangeConfig = this.config.exchanges[exchange];
    if (!exchangeConfig) {
      throw new Error(`Unknown exchange: ${exchange}`);
    }

    const url = `${exchangeConfig.api}${endpoint}`;
    const timeout = this.config.dataSources.timeout;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // Validate data structure
      if (!this.validateData(data)) {
        throw new Error('Invalid data structure received');
      }

      return data;
    } finally {
      clearTimeout(timeoutId);
      this.lastRequestTime[exchange] = Date.now();
    }
  }

  /**
   * WebSocket connection for real-time data
   */
  connectWebSocket(symbols, callback) {
    const exchange = this.config.dataSources.primary;
    const wsConfig = this.config.exchanges[exchange];

    if (!wsConfig.websocket) {
      console.error('WebSocket not configured for this exchange');
      return null;
    }

    const ws = new WebSocket(wsConfig.websocket);

    ws.onopen = () => {
      console.log('WebSocket connected');
      // Subscribe to symbols
      symbols.forEach(symbol => {
        ws.send(JSON.stringify({
          method: 'SUBSCRIBE',
          params: [`${symbol.toLowerCase()}@ticker`],
          id: Date.now()
        }));
      });
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        callback(data);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      // Auto-reconnect logic could be added here
    };

    return ws;
  }

  /**
   * Cache management
   */
  setCache(key, data, duration) {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      duration
    });

    // Set auto-expire
    if (this.cacheTimeouts.has(key)) {
      clearTimeout(this.cacheTimeouts.get(key));
    }

    const timeoutId = setTimeout(() => {
      this.cache.delete(key);
      this.cacheTimeouts.delete(key);
    }, duration);

    this.cacheTimeouts.set(key, timeoutId);
  }

  getFromCache(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;

    const age = Date.now() - cached.timestamp;
    if (age > cached.duration) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  clearCache(pattern = null) {
    if (pattern) {
      // Clear specific pattern
      for (const key of this.cache.keys()) {
        if (key.includes(pattern)) {
          this.cache.delete(key);
        }
      }
    } else {
      // Clear all
      this.cache.clear();
      this.cacheTimeouts.forEach(timeout => clearTimeout(timeout));
      this.cacheTimeouts.clear();
    }
  }

  /**
   * Rate limiting
   */
  canMakeRequest(endpoint) {
    const exchange = this.config.dataSources.primary;
    const lastRequest = this.lastRequestTime[exchange] || 0;
    const timeSinceLastRequest = Date.now() - lastRequest;
    const minInterval = 100; // Minimum 100ms between requests

    return timeSinceLastRequest >= minInterval;
  }

  async queueRequest(endpoint, options, retries) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ endpoint, options, retries, resolve, reject });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.isProcessing || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const request = this.requestQueue.shift();

    try {
      const result = await this.fetchData(request.endpoint, request.options);
      request.resolve(result);
    } catch (error) {
      request.reject(error);
    } finally {
      this.isProcessing = false;
      // Process next request after a short delay
      setTimeout(() => this.processQueue(), 100);
    }
  }

  /**
   * Health monitoring
   */
  updateHealthStatus(endpoint, isHealthy) {
    const key = endpoint.split('?')[0]; // Remove query params
    const current = this.healthStatus.get(key) || {
      success: 0,
      failure: 0,
      lastCheck: null
    };

    if (isHealthy) {
      current.success++;
    } else {
      current.failure++;
    }

    current.lastCheck = Date.now();
    this.healthStatus.set(key, current);
  }

  getHealthStatus() {
    const status = {};
    for (const [key, value] of this.healthStatus.entries()) {
      const total = value.success + value.failure;
      const successRate = total > 0 ? (value.success / total * 100).toFixed(1) : 0;
      status[key] = {
        successRate: `${successRate}%`,
        totalRequests: total,
        lastCheck: new Date(value.lastCheck).toISOString()
      };
    }
    return status;
  }

  /**
   * Data validation
   */
  validateData(data) {
    if (!data || typeof data !== 'object') {
      return false;
    }

    // Check for common error patterns
    if (data.code && data.code !== 200) {
      return false;
    }

    if (data.error) {
      return false;
    }

    return true;
  }

  /**
   * Batch fetch multiple endpoints
   */
  async batchFetch(endpoints, options = {}) {
    const promises = endpoints.map(endpoint =>
      this.fetchData(endpoint, options).catch(error => ({ error, endpoint }))
    );

    const results = await Promise.all(promises);

    // Separate successful and failed requests
    const successful = results.filter(r => !r.error);
    const failed = results.filter(r => r.error);

    if (failed.length > 0) {
      console.warn(`${failed.length} requests failed:`, failed);
    }

    return successful;
  }

  /**
   * Cleanup
   */
  destroy() {
    this.cacheTimeouts.forEach(timeout => clearTimeout(timeout));
    this.clearCache();
    this.requestQueue = [];
  }
}

// Export for use in dashboard
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DataManager };
}
