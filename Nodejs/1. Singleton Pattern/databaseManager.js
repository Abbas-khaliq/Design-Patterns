/**
 * Database Manager Singleton
 * 
 * This is a perfect real-world example of the Singleton pattern for database management:
 * - Database connections should be shared across the application
 * - Connection pooling prevents resource waste
 * - We need centralized control over database operations
 * - Connection state should be consistent across all modules
 * 
 * Why Singleton is appropriate for database management:
 * 1. **Connection Pooling**: Single manager controls all database connections
 * 2. **Resource Efficiency**: Prevents multiple connection pools from being created
 * 3. **State Management**: Connection status is shared across the application
 * 4. **Transaction Management**: Centralized control over database transactions
 * 5. **Performance**: Single connection pool is more efficient than multiple
 */

class DatabaseManager {
    // Private static instance - the core of the Singleton pattern
    static #instance = null;

    // Connection states
    static #CONNECTION_STATES = {
        DISCONNECTED: 'disconnected',
        CONNECTING: 'connecting',
        CONNECTED: 'connected',
        ERROR: 'error'
    };

    // Private constructor - prevents direct instantiation
    constructor() {
        if (DatabaseManager.#instance) {
            throw new Error('DatabaseManager is a singleton. Use getInstance() to access it.');
        }

        // Initialize database manager with default settings
        this.#connectionState = DatabaseManager.#CONNECTION_STATES.DISCONNECTED;
        this.#connectionPool = new Map();
        this.#maxConnections = 10;
        this.#connectionTimeout = 30000; // 30 seconds
        this.#queryTimeout = 10000; // 10 seconds
        this.#retryAttempts = 3;
        this.#retryDelay = 1000; // 1 second

        // Database configuration (would come from config manager in real app)
        this.#config = {
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT) || 5432,
            database: process.env.DB_NAME || 'myapp',
            username: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || '',
            ssl: process.env.DB_SSL === 'true'
        };

        // Statistics tracking
        this.#stats = {
            totalQueries: 0,
            successfulQueries: 0,
            failedQueries: 0,
            activeConnections: 0,
            connectionErrors: 0
        };

        // Event listeners for connection state changes
        this.#eventListeners = new Map();
    }

    // Private properties
    #connectionState = DatabaseManager.#CONNECTION_STATES.DISCONNECTED;
    #connectionPool = new Map();
    #maxConnections = 10;
    #connectionTimeout = 30000;
    #queryTimeout = 10000;
    #retryAttempts = 3;
    #retryDelay = 1000;
    #config = {};
    #stats = {};
    #eventListeners = new Map();

    /**
     * Get the singleton instance
     * 
     * @returns {DatabaseManager} The singleton instance
     */
    static getInstance() {
        if (!DatabaseManager.#instance) {
            DatabaseManager.#instance = new DatabaseManager();
        }
        return DatabaseManager.#instance;
    }

    /**
     * Configure the database manager
     * This demonstrates how the Singleton can be configured after creation
     * 
     * @param {Object} options - Configuration options
     */
    configure(options = {}) {
        const {
            maxConnections = 10,
            connectionTimeout = 30000,
            queryTimeout = 10000,
            retryAttempts = 3,
            retryDelay = 1000,
            config = {}
        } = options;

        this.#maxConnections = maxConnections;
        this.#connectionTimeout = connectionTimeout;
        this.#queryTimeout = queryTimeout;
        this.#retryAttempts = retryAttempts;
        this.#retryDelay = retryDelay;

        // Merge configuration
        this.#config = { ...this.#config, ...config };

        console.log('DatabaseManager configured:', {
            maxConnections,
            connectionTimeout,
            queryTimeout
        });
    }

    /**
     * Connect to the database
     * This demonstrates lazy initialization - connection is established only when needed
     * 
     * @returns {Promise<void>}
     */
    async connect() {
        if (this.#connectionState === DatabaseManager.#CONNECTION_STATES.CONNECTED) {
            console.log('Database already connected');
            return;
        }

        if (this.#connectionState === DatabaseManager.#CONNECTION_STATES.CONNECTING) {
            console.log('Database connection already in progress');
            return;
        }

        this.#connectionState = DatabaseManager.#CONNECTION_STATES.CONNECTING;
        this.#emit('connecting');

        try {
            // Simulate database connection
            await this.#simulateConnection();

            // Initialize connection pool
            await this.#initializeConnectionPool();

            this.#connectionState = DatabaseManager.#CONNECTION_STATES.CONNECTED;
            this.#emit('connected');

            console.log('Database connected successfully');
        } catch (error) {
            this.#connectionState = DatabaseManager.#CONNECTION_STATES.ERROR;
            this.#stats.connectionErrors++;
            this.#emit('error', error);

            console.error('Database connection failed:', error.message);
            throw error;
        }
    }

    /**
     * Disconnect from the database
     * 
     * @returns {Promise<void>}
     */
    async disconnect() {
        if (this.#connectionState === DatabaseManager.#CONNECTION_STATES.DISCONNECTED) {
            console.log('Database already disconnected');
            return;
        }

        this.#connectionState = DatabaseManager.#CONNECTION_STATES.DISCONNECTED;
        this.#emit('disconnected');

        // Close all connections in the pool
        for (const [id, connection] of this.#connectionPool) {
            await this.#closeConnection(connection);
            this.#connectionPool.delete(id);
        }

        this.#stats.activeConnections = 0;
        console.log('Database disconnected');
    }

    /**
     * Execute a query
     * This demonstrates how the Singleton manages database operations
     * 
     * @param {string} query - SQL query to execute
     * @param {Array} params - Query parameters
     * @returns {Promise<Object>} Query result
     */
    async query(query, params = []) {
        if (!query || typeof query !== 'string') {
            throw new Error('Query must be a non-empty string');
        }

        this.#stats.totalQueries++;

        // Ensure we're connected
        if (this.#connectionState !== DatabaseManager.#CONNECTION_STATES.CONNECTED) {
            await this.connect();
        }

        // Get a connection from the pool
        const connection = await this.#getConnection();

        try {
            // Execute the query with retry logic
            const result = await this.#executeQueryWithRetry(connection, query, params);
            this.#stats.successfulQueries++;

            return result;
        } catch (error) {
            this.#stats.failedQueries++;
            console.error('Query failed:', error.message);
            throw error;
        } finally {
            // Return connection to the pool
            this.#releaseConnection(connection);
        }
    }

    /**
     * Execute a transaction
     * This demonstrates advanced database management features
     * 
     * @param {Function} callback - Transaction callback function
     * @returns {Promise<Object>} Transaction result
     */
    async transaction(callback) {
        if (typeof callback !== 'function') {
            throw new Error('Transaction callback must be a function');
        }

        const connection = await this.#getConnection();

        try {
            // Start transaction
            await this.#beginTransaction(connection);

            // Execute the transaction callback
            const result = await callback(connection);

            // Commit transaction
            await this.#commitTransaction(connection);

            return result;
        } catch (error) {
            // Rollback transaction on error
            await this.#rollbackTransaction(connection);
            throw error;
        } finally {
            this.#releaseConnection(connection);
        }
    }

    /**
     * Get database statistics
     * 
     * @returns {Object} Database statistics
     */
    getStats() {
        return {
            ...this.#stats,
            connectionState: this.#connectionState,
            poolSize: this.#connectionPool.size,
            maxConnections: this.#maxConnections
        };
    }

    /**
     * Get the current connection state
     * 
     * @returns {string} Connection state
     */
    getConnectionState() {
        return this.#connectionState;
    }

    /**
     * Check if the database is connected
     * 
     * @returns {boolean} True if connected
     */
    isConnected() {
        return this.#connectionState === DatabaseManager.#CONNECTION_STATES.CONNECTED;
    }

    /**
     * Add event listener
     * 
     * @param {string} event - Event name
     * @param {Function} listener - Event listener function
     */
    on(event, listener) {
        if (!this.#eventListeners.has(event)) {
            this.#eventListeners.set(event, []);
        }
        this.#eventListeners.get(event).push(listener);
    }

    /**
     * Remove event listener
     * 
     * @param {string} event - Event name
     * @param {Function} listener - Event listener function
     */
    off(event, listener) {
        if (this.#eventListeners.has(event)) {
            const listeners = this.#eventListeners.get(event);
            const index = listeners.indexOf(listener);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }

    /**
     * Emit event to listeners
     * 
     * @param {string} event - Event name
     * @param {...any} args - Event arguments
     */
    #emit(event, ...args) {
        if (this.#eventListeners.has(event)) {
            const listeners = this.#eventListeners.get(event);
            listeners.forEach(listener => {
                try {
                    listener(...args);
                } catch (error) {
                    console.error(`Error in event listener for ${event}:`, error);
                }
            });
        }
    }

    /**
     * Simulate database connection
     * In a real implementation, this would connect to an actual database
     * 
     * @returns {Promise<void>}
     */
    async #simulateConnection() {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                // Simulate connection success/failure
                if (Math.random() > 0.1) { // 90% success rate
                    resolve();
                } else {
                    reject(new Error('Connection timeout'));
                }
            }, 1000);
        });
    }

    /**
     * Initialize connection pool
     * 
     * @returns {Promise<void>}
     */
    async #initializeConnectionPool() {
        // Create initial connections for the pool
        for (let i = 0; i < Math.min(3, this.#maxConnections); i++) {
            const connection = await this.#createConnection();
            this.#connectionPool.set(connection.id, connection);
        }

        this.#stats.activeConnections = this.#connectionPool.size;
    }

    /**
     * Create a new database connection
     * 
     * @returns {Promise<Object>} Connection object
     */
    async #createConnection() {
        // Simulate connection creation
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve({
                    id: `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    createdAt: new Date(),
                    lastUsed: new Date(),
                    inUse: false
                });
            }, 100);
        });
    }

    /**
     * Get a connection from the pool
     * 
     * @returns {Promise<Object>} Connection object
     */
    async #getConnection() {
        // Try to find an available connection
        for (const [id, connection] of this.#connectionPool) {
            if (!connection.inUse) {
                connection.inUse = true;
                connection.lastUsed = new Date();
                return connection;
            }
        }

        // If no available connections and pool is not full, create a new one
        if (this.#connectionPool.size < this.#maxConnections) {
            const connection = await this.#createConnection();
            connection.inUse = true;
            this.#connectionPool.set(connection.id, connection);
            this.#stats.activeConnections = this.#connectionPool.size;
            return connection;
        }

        // Wait for a connection to become available
        return new Promise((resolve) => {
            const checkConnection = () => {
                for (const [id, connection] of this.#connectionPool) {
                    if (!connection.inUse) {
                        connection.inUse = true;
                        connection.lastUsed = new Date();
                        resolve(connection);
                        return;
                    }
                }
                setTimeout(checkConnection, 100);
            };
            checkConnection();
        });
    }

    /**
     * Release a connection back to the pool
     * 
     * @param {Object} connection - Connection to release
     */
    #releaseConnection(connection) {
        if (connection && this.#connectionPool.has(connection.id)) {
            connection.inUse = false;
            connection.lastUsed = new Date();
        }
    }

    /**
     * Close a database connection
     * 
     * @param {Object} connection - Connection to close
     * @returns {Promise<void>}
     */
    async #closeConnection(connection) {
        // Simulate connection closing
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve();
            }, 50);
        });
    }

    /**
     * Execute query with retry logic
     * 
     * @param {Object} connection - Database connection
     * @param {string} query - SQL query
     * @param {Array} params - Query parameters
     * @returns {Promise<Object>} Query result
     */
    async #executeQueryWithRetry(connection, query, params) {
        let lastError;

        for (let attempt = 1; attempt <= this.#retryAttempts; attempt++) {
            try {
                return await this.#executeQuery(connection, query, params);
            } catch (error) {
                lastError = error;

                if (attempt < this.#retryAttempts) {
                    await this.#delay(this.#retryDelay * attempt);
                }
            }
        }

        throw lastError;
    }

    /**
     * Execute a single query
     * 
     * @param {Object} connection - Database connection
     * @param {string} query - SQL query
     * @param {Array} params - Query parameters
     * @returns {Promise<Object>} Query result
     */
    async #executeQuery(connection, query, params) {
        // Simulate query execution
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                // Simulate query success/failure
                if (Math.random() > 0.05) { // 95% success rate
                    resolve({
                        rows: [
                            { id: 1, name: 'Example Row 1' },
                            { id: 2, name: 'Example Row 2' }
                        ],
                        rowCount: 2,
                        query: query,
                        params: params
                    });
                } else {
                    reject(new Error('Query execution failed'));
                }
            }, 200);
        });
    }

    /**
     * Begin a transaction
     * 
     * @param {Object} connection - Database connection
     * @returns {Promise<void>}
     */
    async #beginTransaction(connection) {
        // Simulate transaction begin
        return new Promise((resolve) => {
            setTimeout(() => {
                connection.transactionActive = true;
                resolve();
            }, 50);
        });
    }

    /**
     * Commit a transaction
     * 
     * @param {Object} connection - Database connection
     * @returns {Promise<void>}
     */
    async #commitTransaction(connection) {
        // Simulate transaction commit
        return new Promise((resolve) => {
            setTimeout(() => {
                connection.transactionActive = false;
                resolve();
            }, 50);
        });
    }

    /**
     * Rollback a transaction
     * 
     * @param {Object} connection - Database connection
     * @returns {Promise<void>}
     */
    async #rollbackTransaction(connection) {
        // Simulate transaction rollback
        return new Promise((resolve) => {
            setTimeout(() => {
                connection.transactionActive = false;
                resolve();
            }, 50);
        });
    }

    /**
     * Delay execution
     * 
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise<void>}
     */
    #delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Clean up resources
     * Important for graceful shutdown
     */
    async destroy() {
        await this.disconnect();
        this.#eventListeners.clear();
    }

    /**
     * String representation
     * 
     * @returns {string} String representation
     */
    toString() {
        return `DatabaseManager(state: ${this.#connectionState}, poolSize: ${this.#connectionPool.size}/${this.#maxConnections})`;
    }
}

// Export the singleton instance
const databaseManager = DatabaseManager.getInstance();

// Also export the class for testing
export { DatabaseManager, databaseManager };

// For CommonJS compatibility
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DatabaseManager, databaseManager };
} 