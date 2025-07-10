/**
 * Configuration Manager Singleton
 * 
 * This is a real-world example of where the Singleton pattern is ideal:
 * - Application configuration should be consistent across all modules
 * - We want to avoid loading configuration multiple times
 * - We need a centralized place to manage environment-specific settings
 * - Configuration changes should be reflected everywhere immediately
 * 
 * Why Singleton is appropriate here:
 * 1. **Single Source of Truth**: All parts of the application access the same config
 * 2. **Memory Efficiency**: Only one instance holds the configuration in memory
 * 3. **Consistency**: Changes to config are immediately available everywhere
 * 4. **Lazy Loading**: Config is loaded only when first accessed
 * 5. **Thread Safety**: In Node.js, module caching ensures only one instance
 */

class ConfigurationManager {
    // Private static instance - this is the key to the Singleton pattern
    // It holds the single instance of our class
    static #instance = null;

    // Private constructor - prevents direct instantiation with 'new'
    // This is crucial for the Singleton pattern
    constructor() {
        // This should never be called directly
        // The constructor is private to enforce the Singleton pattern
        if (ConfigurationManager.#instance) {
            throw new Error('ConfigurationManager is a singleton. Use getInstance() to access it.');
        }

        // Initialize configuration with default values
        this.#config = {
            // Database configuration
            database: {
                host: process.env.DB_HOST || 'localhost',
                port: parseInt(process.env.DB_PORT) || 5432,
                name: process.env.DB_NAME || 'myapp',
                user: process.env.DB_USER || 'postgres',
                password: process.env.DB_PASSWORD || '',
                poolSize: parseInt(process.env.DB_POOL_SIZE) || 10
            },

            // Server configuration
            server: {
                port: parseInt(process.env.PORT) || 3000,
                host: process.env.HOST || '0.0.0.0',
                environment: process.env.NODE_ENV || 'development',
                cors: {
                    enabled: process.env.CORS_ENABLED === 'true',
                    origins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000']
                }
            },

            // Application configuration
            app: {
                name: process.env.APP_NAME || 'My Application',
                version: process.env.APP_VERSION || '1.0.0',
                debug: process.env.DEBUG === 'true',
                logLevel: process.env.LOG_LEVEL || 'info'
            },

            // External services
            services: {
                redis: {
                    host: process.env.REDIS_HOST || 'localhost',
                    port: parseInt(process.env.REDIS_PORT) || 6379,
                    password: process.env.REDIS_PASSWORD || null
                },
                email: {
                    provider: process.env.EMAIL_PROVIDER || 'smtp',
                    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
                    port: parseInt(process.env.EMAIL_PORT) || 587,
                    secure: process.env.EMAIL_SECURE === 'true'
                }
            }
        };

        // Track if configuration has been loaded from external source
        this.#loaded = false;

        // Validation rules for configuration
        this.#validationRules = {
            database: {
                host: (value) => typeof value === 'string' && value.length > 0,
                port: (value) => Number.isInteger(value) && value > 0 && value <= 65535,
                poolSize: (value) => Number.isInteger(value) && value > 0 && value <= 100
            },
            server: {
                port: (value) => Number.isInteger(value) && value > 0 && value <= 65535,
                environment: (value) => ['development', 'staging', 'production'].includes(value)
            }
        };
    }

    // Private properties - using # for true privacy (ES2022+)
    #config = {};
    #loaded = false;
    #validationRules = {};

    /**
     * Get the singleton instance
     * This is the main access point for the Singleton pattern
     * 
     * @returns {ConfigurationManager} The singleton instance
     */
    static getInstance() {
        // Lazy initialization - create instance only when first accessed
        if (!ConfigurationManager.#instance) {
            ConfigurationManager.#instance = new ConfigurationManager();
        }
        return ConfigurationManager.#instance;
    }

    /**
     * Load configuration from a JSON file
     * This demonstrates how the Singleton can be enhanced with external data
     * 
     * @param {string} filePath - Path to the configuration file
     * @returns {Promise<void>}
     */
    async loadFromFile(filePath) {
        try {
            const fs = await import('fs/promises');
            const configData = await fs.readFile(filePath, 'utf8');
            const fileConfig = JSON.parse(configData);

            // Deep merge the file configuration with defaults
            this.#config = this.#deepMerge(this.#config, fileConfig);
            this.#loaded = true;

            console.log(`Configuration loaded from ${filePath}`);
        } catch (error) {
            console.warn(`Failed to load configuration from ${filePath}:`, error.message);
            // Don't throw - we still have default configuration
        }
    }

    /**
     * Get a configuration value using dot notation
     * Example: get('database.host') returns the database host
     * 
     * @param {string} key - Configuration key in dot notation
     * @param {*} defaultValue - Default value if key doesn't exist
     * @returns {*} The configuration value
     */
    get(key, defaultValue = undefined) {
        if (!key || typeof key !== 'string') {
            throw new Error('Configuration key must be a non-empty string');
        }

        const keys = key.split('.');
        let value = this.#config;

        // Navigate through the nested object structure
        for (const k of keys) {
            if (value && typeof value === 'object' && k in value) {
                value = value[k];
            } else {
                return defaultValue;
            }
        }

        return value;
    }

    /**
     * Set a configuration value using dot notation
     * This allows runtime configuration changes that affect all modules
     * 
     * Example: set('database.host', 'localhost') sets the database host to localhost
     * 
     * @param {string} key - Configuration key in dot notation
     * @param {*} value - Value to set
     * @returns {boolean} True if the value was set successfully
     */
    set(key, value) {
        if (!key || typeof key !== 'string') {
            throw new Error('Configuration key must be a non-empty string');
        }

        const keys = key.split('.');
        const lastKey = keys.pop();
        let current = this.#config;

        // Navigate to the parent object
        for (const k of keys) {
            if (!(k in current) || typeof current[k] !== 'object') {
                current[k] = {};
            }
            current = current[k];
        }

        // Validate the value if validation rules exist
        if (this.#validateValue(key, value)) {
            current[lastKey] = value;
            return true;
        }

        return false;
    }

    /**
     * Get the entire configuration object
     * Useful for debugging or when you need all configuration at once
     * 
     * @returns {Object} The complete configuration object
     */
    getAll() {
        // Return a deep copy to prevent external modification
        return JSON.parse(JSON.stringify(this.#config));
    }

    /**
     * Check if configuration has been loaded from external source
     * 
     * @returns {boolean} True if external configuration was loaded
     */
    isLoaded() {
        return this.#loaded;
    }

    /**
     * Reset configuration to defaults
     * Useful for testing or when you need to start fresh
     */
    reset() {
        // Create a new instance to reset everything
        ConfigurationManager.#instance = null;
        return ConfigurationManager.getInstance();
    }

    /**
     * Validate a configuration value against defined rules
     * 
     * @param {string} key - Configuration key
     * @param {*} value - Value to validate
     * @returns {boolean} True if value is valid
     */
    #validateValue(key, value) {
        const keys = key.split('.');
        const section = keys[0];
        const property = keys[1];

        if (this.#validationRules[section] && this.#validationRules[section][property]) {
            const validator = this.#validationRules[section][property];
            return validator(value);
        }

        return true; // No validation rule defined, assume valid
    }

    /**
     * Deep merge two objects
     * Used to merge external configuration with defaults
     * 
     * @param {Object} target - Target object
     * @param {Object} source - Source object
     * @returns {Object} Merged object
     */
    #deepMerge(target, source) {
        const result = { ...target };

        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = this.#deepMerge(result[key] || {}, source[key]);
            } else {
                result[key] = source[key];
            }
        }

        return result;
    }

    /**
     * Get a string representation of the configuration
     * Useful for logging or debugging
     * 
     * @returns {string} String representation
     */
    toString() {
        return `ConfigurationManager(loaded: ${this.#loaded}, keys: ${Object.keys(this.#config).join(', ')})`;
    }
}

// Export the singleton instance directly
// This is the recommended way in Node.js due to module caching
// Module caching ensures that this instance is shared across all imports
const configManager = ConfigurationManager.getInstance();

// Also export the class for testing purposes
export { ConfigurationManager, configManager };

// For CommonJS compatibility (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ConfigurationManager, configManager };
} 