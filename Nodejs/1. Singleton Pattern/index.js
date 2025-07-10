/**
 * Singleton Pattern Demo - Main Application
 * 
 * This file demonstrates how to use the Singleton pattern in a real-world Node.js application.
 * It shows how multiple Singletons work together and how they maintain consistent state
 * across different modules.
 * 
 * Key Learning Points:
 * 1. How to import and use Singleton instances
 * 2. How Singletons maintain state across modules
 * 3. How to configure Singletons for different environments
 * 4. Real-world usage patterns and best practices
 */

// Import our Singleton instances
import { configManager } from './configManager.js';
import { logger } from './logger.js';
import { databaseManager } from './databaseManager.js';

// Import example modules to demonstrate cross-module Singleton usage
import { userService } from './examples/userService.js';
import { orderService } from './examples/orderService.js';
import { notificationService } from './examples/notificationService.js';

/**
 * Main application class that demonstrates Singleton usage
 */
class Application {
    constructor() {
        this.name = 'Singleton Pattern Demo';
        this.version = '1.0.0';
        this.isRunning = false;
    }

    /**
     * Initialize the application
     * This demonstrates how to configure Singletons at startup
     */
    async initialize() {
        console.log('\n🚀 Starting Singleton Pattern Demo Application\n');

        try {
            // Step 1: Configure the Configuration Manager
            await this.#configureApplication();

            // Step 2: Configure the Logger based on environment
            this.#configureLogger();

            // Step 3: Configure the Database Manager
            this.#configureDatabase();

            // Step 4: Log application startup
            logger.info('Application initialized successfully', {
                app: this.name,
                version: this.version,
                environment: configManager.get('server.environment'),
                timestamp: new Date().toISOString()
            });

            this.isRunning = true;

        } catch (error) {
            logger.error('Failed to initialize application', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Configure the application using the Configuration Manager Singleton
     */
    async #configureApplication() {
        logger.info('Configuring application...');

        // Load configuration from file if it exists
        try {
            await configManager.loadFromFile('./config.json');
            logger.info('Configuration loaded from file');
        } catch (error) {
            logger.warn('No configuration file found, using defaults');
        }

        // Set some runtime configuration
        configManager.set('app.startTime', new Date().toISOString());
        configManager.set('app.processId', process.pid);

        logger.info('Application configuration ready', {
            databaseHost: configManager.get('database.host'),
            serverPort: configManager.get('server.port'),
            environment: configManager.get('server.environment')
        });
    }

    /**
     * Configure the Logger Singleton based on environment
     */
    #configureLogger() {
        const environment = configManager.get('server.environment');
        const logLevel = configManager.get('app.logLevel');

        // Configure logger based on environment
        const loggerConfig = {
            level: logLevel,
            format: environment === 'production' ? 'json' : 'text',
            colors: environment !== 'production',
            outputs: ['console']
        };

        logger.configure(loggerConfig);

        logger.info('Logger configured', loggerConfig);
    }

    /**
     * Configure the Database Manager Singleton
     */
    #configureDatabase() {
        const dbConfig = {
            maxConnections: configManager.get('database.poolSize'),
            connectionTimeout: 30000,
            queryTimeout: 10000,
            retryAttempts: 3,
            config: {
                host: configManager.get('database.host'),
                port: configManager.get('database.port'),
                database: configManager.get('database.name'),
                username: configManager.get('database.user'),
                password: configManager.get('database.password')
            }
        };

        databaseManager.configure(dbConfig);

        // Set up database event listeners
        databaseManager.on('connected', () => {
            logger.info('Database connected');
        });

        databaseManager.on('disconnected', () => {
            logger.warn('Database disconnected');
        });

        databaseManager.on('error', (error) => {
            logger.error('Database error', { error: error.message });
        });

        logger.info('Database manager configured', {
            host: dbConfig.config.host,
            port: dbConfig.config.port,
            maxConnections: dbConfig.maxConnections
        });
    }

    /**
     * Run the application demo
     * This demonstrates how Singletons work together in a real application
     */
    async run() {
        if (!this.isRunning) {
            throw new Error('Application not initialized');
        }

        logger.info('Starting application demo...');

        try {
            // Connect to database
            await databaseManager.connect();

            // Demonstrate cross-module Singleton usage
            await this.#demonstrateUserOperations();
            await this.#demonstrateOrderOperations();
            await this.#demonstrateNotificationOperations();

            // Show Singleton statistics
            this.#displayStatistics();

            // Demonstrate Singleton state consistency
            await this.#demonstrateStateConsistency();

        } catch (error) {
            logger.error('Application demo failed', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Demonstrate user operations using Singletons
     */
    async #demonstrateUserOperations() {
        logger.info('Demonstrating user operations...');

        // Create a user
        const user = await userService.createUser({
            name: 'John Doe',
            email: 'john@example.com',
            role: 'customer'
        });

        logger.info('User created', { userId: user.id, name: user.name });

        // Update user
        await userService.updateUser(user.id, { role: 'premium' });
        logger.info('User updated', { userId: user.id, newRole: 'premium' });

        // Get user
        const retrievedUser = await userService.getUser(user.id);
        logger.info('User retrieved', { user: retrievedUser });
    }

    /**
     * Demonstrate order operations using Singletons
     */
    async #demonstrateOrderOperations() {
        logger.info('Demonstrating order operations...');

        // Create an order
        const order = await orderService.createOrder({
            userId: 1,
            items: [
                { productId: 101, quantity: 2, price: 29.99 },
                { productId: 102, quantity: 1, price: 49.99 }
            ],
            total: 109.97
        });

        logger.info('Order created', { orderId: order.id, total: order.total });

        // Process order
        await orderService.processOrder(order.id);
        logger.info('Order processed', { orderId: order.id });

        // Get order statistics
        const stats = await orderService.getOrderStatistics();
        logger.info('Order statistics', stats);
    }

    /**
     * Demonstrate notification operations using Singletons
     */
    async #demonstrateNotificationOperations() {
        logger.info('Demonstrating notification operations...');

        // Send different types of notifications
        await notificationService.sendEmail('user@example.com', 'Welcome!', 'Welcome to our platform');
        await notificationService.sendSMS('+1234567890', 'Your order has been shipped');
        await notificationService.sendPushNotification('user123', 'New message received');

        logger.info('Notifications sent successfully');

        // Get notification statistics
        const stats = notificationService.getStatistics();
        logger.info('Notification statistics', stats);
    }

    /**
     * Display statistics from all Singletons
     */
    #displayStatistics() {
        console.log('\n📊 Singleton Statistics:\n');

        // Configuration Manager stats
        console.log('Configuration Manager:');
        console.log(`  - Configuration loaded: ${configManager.isLoaded()}`);
        console.log(`  - Environment: ${configManager.get('server.environment')}`);
        console.log(`  - Database host: ${configManager.get('database.host')}`);
        console.log(`  - Server port: ${configManager.get('server.port')}`);

        // Logger stats
        const loggerStats = logger.getStats();
        console.log('\nLogger:');
        console.log(`  - Total logs: ${loggerStats.total}`);
        console.log(`  - Log level: ${logger.getLevel()}`);
        console.log(`  - By level:`, loggerStats.byLevel);

        // Database Manager stats
        const dbStats = databaseManager.getStats();
        console.log('\nDatabase Manager:');
        console.log(`  - Connection state: ${databaseManager.getConnectionState()}`);
        console.log(`  - Total queries: ${dbStats.totalQueries}`);
        console.log(`  - Successful queries: ${dbStats.successfulQueries}`);
        console.log(`  - Failed queries: ${dbStats.failedQueries}`);
        console.log(`  - Active connections: ${dbStats.activeConnections}`);

        console.log('\n');
    }

    /**
     * Demonstrate that Singleton state is consistent across modules
     */
    async #demonstrateStateConsistency() {
        logger.info('Demonstrating Singleton state consistency...');

        // Show that all modules use the same Singleton instances
        const config1 = configManager.getAll();
        const config2 = configManager.getAll();

        // Verify they're the same instance
        console.log('✅ Configuration Manager instances are identical:', config1 === config2);

        // Show logger state consistency
        const logger1 = logger.getLevel();
        const logger2 = logger.getLevel();
        console.log('✅ Logger instances are identical:', logger1 === logger2);

        // Show database state consistency
        const dbState1 = databaseManager.getConnectionState();
        const dbState2 = databaseManager.getConnectionState();
        console.log('✅ Database Manager instances are identical:', dbState1 === dbState2);

        // Demonstrate configuration changes affect all modules
        configManager.set('app.demoMode', true);
        const demoMode = configManager.get('app.demoMode');
        console.log('✅ Configuration change reflected immediately:', demoMode === true);

        logger.info('Singleton state consistency verified');
    }

    /**
     * Shutdown the application gracefully
     */
    async shutdown() {
        logger.info('Shutting down application...');

        try {
            // Disconnect from database
            await databaseManager.disconnect();

            // Flush any remaining logs
            logger.flush();

            // Clean up resources
            await databaseManager.destroy();
            logger.destroy();

            this.isRunning = false;
            logger.info('Application shutdown complete');

        } catch (error) {
            logger.error('Error during shutdown', { error: error.message });
            throw error;
        }
    }
}

/**
 * Main function to run the demo
 */
async function main() {
    const app = new Application();

    try {
        // Initialize the application
        await app.initialize();

        // Run the demo
        await app.run();

        // Wait a bit to see any async operations complete
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Shutdown gracefully
        await app.shutdown();

        console.log('\n✅ Singleton Pattern Demo completed successfully!\n');

    } catch (error) {
        console.error('\n❌ Demo failed:', error.message);
        process.exit(1);
    }
}

// Run the demo if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

export { Application }; 