/**
 * Logger Singleton
 * 
 * This is another perfect real-world example of the Singleton pattern:
 * - Logging should be consistent across the entire application
 * - We want centralized control over log levels and formats
 * - Multiple modules should share the same logging configuration
 * - Log output should be synchronized and properly formatted
 * 
 * Why Singleton is appropriate for logging:
 * 1. **Consistent Formatting**: All logs follow the same format and style
 * 2. **Centralized Control**: Log levels and outputs are managed in one place
 * 3. **Performance**: Single logger instance is more efficient than multiple
 * 4. **Thread Safety**: In Node.js, ensures logs are written in order
 * 5. **Configuration**: Log settings are shared across all modules
 */

class Logger {
    // Private static instance - the core of the Singleton pattern
    static #instance = null;

    // Log levels with numeric values for comparison
    static #LOG_LEVELS = {
        ERROR: 0,
        WARN: 1,
        INFO: 2,
        DEBUG: 3,
        TRACE: 4
    };

    // Private constructor - prevents direct instantiation
    constructor() {
        if (Logger.#instance) {
            throw new Error('Logger is a singleton. Use getInstance() to access it.');
        }

        // Initialize logger with default settings
        this.#logLevel = Logger.#LOG_LEVELS.INFO;
        this.#logFormat = 'json'; // 'json' or 'text'
        this.#timestamp = true;
        this.#colors = process.env.NODE_ENV !== 'production';
        this.#outputs = ['console']; // 'console', 'file', 'remote'
        this.#logBuffer = [];
        this.#maxBufferSize = 1000;
        this.#flushInterval = 5000; // 5 seconds

        // Set up periodic buffer flushing
        this.#setupBufferFlush();

        // Track log statistics
        this.#stats = {
            total: 0,
            byLevel: {
                ERROR: 0,
                WARN: 0,
                INFO: 0,
                DEBUG: 0,
                TRACE: 0
            }
        };
    }

    // Private properties
    #logLevel = Logger.#LOG_LEVELS.INFO;
    #logFormat = 'json';
    #timestamp = true;
    #colors = true;
    #outputs = ['console'];
    #logBuffer = [];
    #maxBufferSize = 1000;
    #flushInterval = 5000;
    #stats = {};
    #flushTimer = null;

    /**
     * Get the singleton instance
     * 
     * @returns {Logger} The singleton instance
     */
    static getInstance() {
        if (!Logger.#instance) {
            Logger.#instance = new Logger();
        }
        return Logger.#instance;
    }

    /**
     * Configure the logger
     * This demonstrates how the Singleton can be configured after creation
     * 
     * @param {Object} options - Configuration options
     */
    configure(options = {}) {
        const {
            level = 'INFO',
            format = 'json',
            timestamp = true,
            colors = process.env.NODE_ENV !== 'production',
            outputs = ['console'],
            maxBufferSize = 1000,
            flushInterval = 5000
        } = options;

        // Validate and set log level
        if (Logger.#LOG_LEVELS[level] !== undefined) {
            this.#logLevel = Logger.#LOG_LEVELS[level];
        }

        // Validate and set format
        if (['json', 'text'].includes(format)) {
            this.#logFormat = format;
        }

        // Set other options
        this.#timestamp = timestamp;
        this.#colors = colors;
        this.#outputs = Array.isArray(outputs) ? outputs : [outputs];
        this.#maxBufferSize = maxBufferSize;
        this.#flushInterval = flushInterval;

        // Restart buffer flush timer with new interval
        this.#setupBufferFlush();

        this.info('Logger configured', { level, format, outputs });
    }

    /**
     * Log an error message
     * 
     * @param {string} message - Error message
     * @param {Object} [context] - Additional context
     */
    error(message, context = {}) {
        this.#log('ERROR', message, context);
    }

    /**
     * Log a warning message
     * 
     * @param {string} message - Warning message
     * @param {Object} [context] - Additional context
     */
    warn(message, context = {}) {
        this.#log('WARN', message, context);
    }

    /**
     * Log an info message
     * 
     * @param {string} message - Info message
     * @param {Object} [context] - Additional context
     */
    info(message, context = {}) {
        this.#log('INFO', message, context);
    }

    /**
     * Log a debug message
     * 
     * @param {string} message - Debug message
     * @param {Object} [context] - Additional context
     */
    debug(message, context = {}) {
        this.#log('DEBUG', message, context);
    }

    /**
     * Log a trace message
     * 
     * @param {string} message - Trace message
     * @param {Object} [context] - Additional context
     */
    trace(message, context = {}) {
        this.#log('TRACE', message, context);
    }

    /**
     * Internal logging method
     * This is where the actual logging logic happens
     * 
     * @param {string} level - Log level
     * @param {string} message - Log message
     * @param {Object} context - Additional context
     */
    #log(level, message, context = {}) {
        // Check if this log level should be processed
        if (Logger.#LOG_LEVELS[level] > this.#logLevel) {
            return;
        }

        // Create log entry
        const logEntry = this.#createLogEntry(level, message, context);

        // Update statistics
        this.#updateStats(level);

        // Add to buffer
        this.#addToBuffer(logEntry);

        // Output immediately if console is enabled
        if (this.#outputs.includes('console')) {
            this.#outputToConsole(logEntry);
        }
    }

    /**
     * Create a structured log entry
     * 
     * @param {string} level - Log level
     * @param {string} message - Log message
     * @param {Object} context - Additional context
     * @returns {Object} Structured log entry
     */
    #createLogEntry(level, message, context) {
        const entry = {
            level,
            message,
            timestamp: this.#timestamp ? new Date().toISOString() : undefined,
            pid: process.pid,
            ...context
        };

        // Add stack trace for errors
        if (level === 'ERROR' && !context.stack) {
            entry.stack = new Error().stack;
        }

        return entry;
    }

    /**
     * Output log entry to console with appropriate formatting
     * 
     * @param {Object} logEntry - Log entry to output
     */
    #outputToConsole(logEntry) {
        if (this.#logFormat === 'json') {
            console.log(JSON.stringify(logEntry));
        } else {
            // Text format with colors
            const timestamp = logEntry.timestamp ? `[${logEntry.timestamp}]` : '';
            const level = this.#colorizeLevel(logEntry.level);
            const message = logEntry.message;
            const context = Object.keys(logEntry).length > 4
                ? ` ${JSON.stringify(logEntry)}`
                : '';

            console.log(`${timestamp} ${level} ${message}${context}`);
        }
    }

    /**
     * Add color to log level for console output
     * 
     * @param {string} level - Log level
     * @returns {string} Colored log level
     */
    #colorizeLevel(level) {
        if (!this.#colors) {
            return `[${level}]`;
        }

        const colors = {
            ERROR: '\x1b[31m', // Red
            WARN: '\x1b[33m',  // Yellow
            INFO: '\x1b[36m',  // Cyan
            DEBUG: '\x1b[35m', // Magenta
            TRACE: '\x1b[37m'  // White
        };

        const reset = '\x1b[0m';
        return `${colors[level]}[${level}]${reset}`;
    }

    /**
     * Add log entry to buffer for batch processing
     * 
     * @param {Object} logEntry - Log entry to buffer
     */
    #addToBuffer(logEntry) {
        this.#logBuffer.push(logEntry);

        // Flush buffer if it gets too large
        if (this.#logBuffer.length >= this.#maxBufferSize) {
            this.#flushBuffer();
        }
    }

    /**
     * Flush the log buffer to external outputs
     */
    #flushBuffer() {
        if (this.#logBuffer.length === 0) {
            return;
        }

        // Here you would send logs to external services
        // For example: file system, remote logging service, etc.
        if (this.#outputs.includes('file')) {
            this.#writeToFile(this.#logBuffer);
        }

        if (this.#outputs.includes('remote')) {
            this.#sendToRemote(this.#logBuffer);
        }

        // Clear the buffer
        this.#logBuffer = [];
    }

    /**
     * Set up periodic buffer flushing
     */
    #setupBufferFlush() {
        if (this.#flushTimer) {
            clearInterval(this.#flushTimer);
        }

        this.#flushTimer = setInterval(() => {
            this.#flushBuffer();
        }, this.#flushInterval);
    }

    /**
     * Update logging statistics
     * 
     * @param {string} level - Log level
     */
    #updateStats(level) {
        this.#stats.total++;
        this.#stats.byLevel[level]++;
    }

    /**
     * Get logging statistics
     * 
     * @returns {Object} Logging statistics
     */
    getStats() {
        return { ...this.#stats };
    }

    /**
     * Write logs to file (placeholder implementation)
     * 
     * @param {Array} logs - Array of log entries
     */
    #writeToFile(logs) {
        // This would be implemented to write to a log file
        // For now, we'll just log that we would write to file
        console.log(`Would write ${logs.length} logs to file`);
    }

    /**
     * Send logs to remote service (placeholder implementation)
     * 
     * @param {Array} logs - Array of log entries
     */
    #sendToRemote(logs) {
        // This would be implemented to send logs to a remote service
        // For now, we'll just log that we would send to remote
        console.log(`Would send ${logs.length} logs to remote service`);
    }

    /**
     * Force flush the buffer immediately
     */
    flush() {
        this.#flushBuffer();
    }

    /**
     * Get the current log level
     * 
     * @returns {string} Current log level
     */
    getLevel() {
        return Object.keys(Logger.#LOG_LEVELS).find(
            key => Logger.#LOG_LEVELS[key] === this.#logLevel
        );
    }

    /**
     * Check if a log level is enabled
     * 
     * @param {string} level - Log level to check
     * @returns {boolean} True if level is enabled
     */
    isLevelEnabled(level) {
        return Logger.#LOG_LEVELS[level] <= this.#logLevel;
    }

    /**
     * Create a child logger with additional context
     * This demonstrates how Singleton can be extended for specific use cases
     * 
     * @param {Object} context - Additional context for child logger
     * @returns {Object} Child logger interface
     */
    child(context = {}) {
        return {
            error: (message, childContext = {}) =>
                this.error(message, { ...context, ...childContext }),
            warn: (message, childContext = {}) =>
                this.warn(message, { ...context, ...childContext }),
            info: (message, childContext = {}) =>
                this.info(message, { ...context, ...childContext }),
            debug: (message, childContext = {}) =>
                this.debug(message, { ...context, ...childContext }),
            trace: (message, childContext = {}) =>
                this.trace(message, { ...context, ...childContext })
        };
    }

    /**
     * Clean up resources
     * Important for graceful shutdown
     */
    destroy() {
        if (this.#flushTimer) {
            clearInterval(this.#flushTimer);
            this.#flushTimer = null;
        }
        this.#flushBuffer();
    }

    /**
     * String representation
     * 
     * @returns {string} String representation
     */
    toString() {
        return `Logger(level: ${this.getLevel()}, format: ${this.#logFormat}, outputs: ${this.#outputs.join(', ')})`;
    }
}

// Export the singleton instance
const logger = Logger.getInstance();

// Also export the class for testing
export { Logger, logger };

// For CommonJS compatibility
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Logger, logger };
} 