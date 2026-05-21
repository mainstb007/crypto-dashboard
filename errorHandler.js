/**
 * Error Handling & Monitoring System
 * Provides connection health checks, auto-reconnection, error logging, and data freshness indicators
 */

class ErrorHandler {
  constructor(config) {
    this.config = config;
    this.errorLog = [];
    this.metrics = {
      totalErrors: 0,
      errorsByType: {},
      errorsByEndpoint: {},
      lastError: null
    };
    this.connectionStatus = 'unknown';
    this.lastHealthCheck = null;
    this.healthCheckInterval = null;
    this.dataFreshness = new Map();
  }

  /**
   * Initialize error handling
   */
  init() {
    // Start health check interval
    if (this.config.monitoring.healthCheckInterval > 0) {
      this.startHealthCheck();
    }

    // Set up global error handlers
    this.setupGlobalHandlers();

    // Log initialization
    this.log('info', 'ErrorHandler initialized');
  }

  /**
   * Handle different types of errors
   */
  handleError(error, context = {}) {
    const errorInfo = {
      timestamp: new Date().toISOString(),
      type: this.classifyError(error),
      message: error.message || 'Unknown error',
      stack: error.stack,
      context,
      severity: this.getSeverity(error)
    };

    // Update metrics
    this.metrics.totalErrors++;
    this.metrics.errorsByType[errorInfo.type] = (this.metrics.errorsByType[errorInfo.type] || 0) + 1;
    this.metrics.errorsByType[context.endpoint || 'unknown'] = (this.metrics.errorsByEndpoint[context.endpoint || 'unknown'] || 0) + 1;
    this.metrics.lastError = errorInfo;

    // Log based on severity
    if (this.config.monitoring.logLevel === 'debug' || errorInfo.severity === 'error') {
      this.log('error', JSON.stringify(errorInfo));
    } else if (errorInfo.severity === 'warning') {
      this.log('warn', JSON.stringify(errorInfo));
    }

    // Add to in-memory log
    this.errorLog.push(errorInfo);

    // Keep log size manageable
    if (this.errorLog.length > 1000) {
      this.errorLog = this.errorLog.slice(-500);
    }

    // Return error info for potential recovery
    return errorInfo;
  }

  /**
   * Classify error type
   */
  classifyError(error) {
    if (error.message.includes('fetch')) return 'network';
    if (error.message.includes('timeout')) return 'timeout';
    if (error.message.includes('abort')) return 'abort';
    if (error.message.includes('parse')) return 'parse';
    if (error.message.includes('rate limit')) return 'rate_limit';
    if (error.message.includes('validation')) return 'validation';
    return 'unknown';
  }

  /**
   * Get error severity
   */
  getSeverity(error) {
    const type = this.classifyError(error);
    const criticalErrors = ['network', 'timeout', 'parse'];

    return criticalErrors.includes(type) ? 'error' : 'warning';
  }

  /**
   * Logging with levels
   */
  log(level, message) {
    if (!this.shouldLog(level)) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message
    };

    if (this.config.monitoring.logToConsole) {
      const consoleMethod = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
      console[consoleMethod](`[${logEntry.timestamp}] [${level.toUpperCase()}] ${message}`);
    }

    // Could add file logging here
    if (this.config.monitoring.logToFile) {
      this.saveToFile(logEntry);
    }
  }

  /**
   * Check if should log based on level
   */
  shouldLog(level) {
    const levels = ['debug', 'info', 'warn', 'error'];
    const configLevel = this.config.monitoring.logLevel || 'info';
    return levels.indexOf(level) >= levels.indexOf(configLevel);
  }

  /**
   * Health check for data sources
   */
  async performHealthCheck(dataManager) {
    const startTime = Date.now();

    try {
      // Try to fetch a simple endpoint
      await dataManager.fetchData('/ticker/24hr', {
        cacheDuration: 0,
        useCache: false
      });

      this.connectionStatus = 'healthy';
      this.lastHealthCheck = new Date().toISOString();
      this.log('debug', `Health check passed (${Date.now() - startTime}ms)`);

      return {
        status: 'healthy',
        latency: Date.now() - startTime,
        timestamp: this.lastHealthCheck
      };
    } catch (error) {
      this.connectionStatus = 'unhealthy';
      this.lastHealthCheck = new Date().toISOString();
      this.log('warn', `Health check failed: ${error.message}`);

      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: this.lastHealthCheck
      };
    }
  }

  /**
   * Start periodic health checks
   */
  startHealthCheck(dataManager) {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck(dataManager);
    }, this.config.monitoring.healthCheckInterval);
  }

  /**
   * Stop health checks
   */
  stopHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Track data freshness
   */
  updateDataFreshness(source, age) {
    this.dataFreshness.set(source, {
      age,
      lastUpdate: Date.now(),
      status: age < 10000 ? 'fresh' : age < 30000 ? 'stale' : 'expired'
    });
  }

  /**
   * Get data freshness status
   */
  getDataFreshness(source) {
    return this.dataFreshness.get(source) || { status: 'unknown', age: Infinity };
  }

  /**
   * Get overall system health
   */
  getSystemHealth() {
    return {
      connection: this.connectionStatus,
      lastHealthCheck: this.lastHealthCheck,
      uptime: this.getUptime(),
      errorRate: this.getErrorRate(),
      totalErrors: this.metrics.totalErrors,
      recentErrors: this.getRecentErrors(10),
      dataFreshness: Object.fromEntries(this.dataFreshness)
    };
  }

  /**
   * Get error rate
   */
  getErrorRate() {
    if (this.errorLog.length === 0) return 0;

    const oneHourAgo = Date.now() - 3600000;
    const recentErrors = this.errorLog.filter(e => new Date(e.timestamp).getTime() > oneHourAgo);

    return (recentErrors.length / 60).toFixed(2); // errors per minute
  }

  /**
   * Get recent errors
   */
  getRecentErrors(count = 10) {
    return this.errorLog.slice(-count);
  }

  /**
   * Get uptime (time since initialization)
   */
  getUptime() {
    if (!this.startTime) return 'unknown';

    const uptime = Date.now() - this.startTime;
    const seconds = Math.floor(uptime / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  /**
   * Setup global error handlers
   */
  setupGlobalHandlers() {
    // Handle uncaught errors
    window.addEventListener('error', (event) => {
      this.handleError(event.error, { source: 'global' });
    });

    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.handleError(event.reason, { source: 'promise' });
    });

    // Track before unload for cleanup
    window.addEventListener('beforeunload', () => {
      this.stopHealthCheck();
    });
  }

  /**
   * Save log to file (basic implementation)
   */
  saveToFile(logEntry) {
    try {
      const logs = JSON.parse(localStorage.getItem('errorLogs') || '[]');
      logs.push(logEntry);

      // Keep only last 1000 logs
      if (logs.length > 1000) {
        logs.splice(0, logs.length - 1000);
      }

      localStorage.setItem('errorLogs', JSON.stringify(logs));
    } catch (error) {
      console.error('Failed to save log to file:', error);
    }
  }

  /**
   * Export error report
   */
  exportErrorReport() {
    const report = {
      generated: new Date().toISOString(),
      systemHealth: this.getSystemHealth(),
      metrics: this.metrics,
      recentErrors: this.getRecentErrors(50)
    };

    return JSON.stringify(report, null, 2);
  }

  /**
   * Clear error history
   */
  clearErrors() {
    this.errorLog = [];
    this.metrics = {
      totalErrors: 0,
      errorsByType: {},
      errorsByEndpoint: {},
      lastError: null
    };
    this.log('info', 'Error history cleared');
  }

  /**
   * Cleanup
   */
  destroy() {
    this.stopHealthCheck();
    this.clearErrors();
  }
}

// Create singleton instance
let errorHandlerInstance = null;

function getErrorHandler(config) {
  if (!errorHandlerInstance) {
    errorHandlerInstance = new ErrorHandler(config);
    errorHandlerInstance.init();
  }
  return errorHandlerInstance;
}

// Export for use in dashboard
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ErrorHandler, getErrorHandler };
}
