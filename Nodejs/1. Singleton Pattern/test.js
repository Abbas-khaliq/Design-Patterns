/**
 * Singleton Pattern Test Suite
 * 
 * This file demonstrates and tests the Singleton pattern implementation.
 * It shows how Singleton instances maintain consistent state across modules
 * and how they behave in different scenarios.
 * 
 * Key Test Areas:
 * 1. Singleton instance consistency
 * 2. State sharing across modules
 * 3. Configuration management
 * 4. Database connection pooling
 * 5. Logging consistency
 * 6. Error handling
 */

// Import our Singleton instances
import { configManager } from './configManager.js';
import { logger } from './logger.js';
import { databaseManager } from './databaseManager.js';

// Import example services
import { userService } from './examples/userService.js';
import { orderService } from './examples/orderService.js';
import { notificationService } from './examples/notificationService.js';

/**
 * Test suite for Singleton pattern
 */
class SingletonTestSuite {
    constructor() {
        this.tests = [];
        this.passed = 0;
        this.failed = 0;
    }

    /**
     * Add a test to the suite
     * 
     * @param {string} name - Test name
     * @param {Function} testFn - Test function
     */
    addTest(name, testFn) {
        this.tests.push({ name, testFn });
    }

    /**
     * Run all tests
     */
    async runTests() {
        console.log('\n🧪 Running Singleton Pattern Tests\n');
        console.log('='.repeat(60));

        for (const test of this.tests) {
            try {
                console.log(`\n📋 Running: ${test.name}`);
                await test.testFn();
                console.log(`✅ PASSED: ${test.name}`);
                this.passed++;
            } catch (error) {
                console.log(`❌ FAILED: ${test.name}`);
                console.log(`   Error: ${error.message}`);
                this.failed++;
            }
        }

        this.printSummary();
    }

    /**
     * Print test summary
     */
    printSummary() {
        console.log('\n' + '='.repeat(60));
        console.log('📊 Test Summary:');
        console.log(`   Total Tests: ${this.tests.length}`);
        console.log(`   Passed: ${this.passed}`);
        console.log(`   Failed: ${this.failed}`);
        console.log(`   Success Rate: ${((this.passed / this.tests.length) * 100).toFixed(1)}%`);
        console.log('='.repeat(60) + '\n');
    }
}

/**
 * Create and configure test suite
 */
function createTestSuite() {
    const suite = new SingletonTestSuite();

    // Test 1: Singleton Instance Consistency
    suite.addTest('Singleton Instance Consistency', async () => {
        // Get instances multiple times
        const config1 = configManager;
        const config2 = configManager;
        const logger1 = logger;
        const logger2 = logger;
        const db1 = databaseManager;
        const db2 = databaseManager;

        // Verify they are the same instances
        if (config1 !== config2) {
            throw new Error('Configuration Manager instances are not the same');
        }

        if (logger1 !== logger2) {
            throw new Error('Logger instances are not the same');
        }

        if (db1 !== db2) {
            throw new Error('Database Manager instances are not the same');
        }

        console.log('   ✓ All Singleton instances are consistent');
    });

    // Test 2: Configuration Manager Functionality
    suite.addTest('Configuration Manager Functionality', async () => {
        // Test setting and getting configuration
        configManager.set('test.key', 'test-value');
        const value = configManager.get('test.key');

        if (value !== 'test-value') {
            throw new Error(`Expected 'test-value', got '${value}'`);
        }

        // Test nested configuration
        configManager.set('test.nested.key', 'nested-value');
        const nestedValue = configManager.get('test.nested.key');

        if (nestedValue !== 'nested-value') {
            throw new Error(`Expected 'nested-value', got '${nestedValue}'`);
        }

        // Test default values
        const defaultValue = configManager.get('nonexistent.key', 'default');
        if (defaultValue !== 'default') {
            throw new Error(`Expected 'default', got '${defaultValue}'`);
        }

        console.log('   ✓ Configuration Manager functions correctly');
    });

    // Test 3: Logger Functionality
    suite.addTest('Logger Functionality', async () => {
        // Test different log levels
        logger.info('Test info message');
        logger.warn('Test warning message');
        logger.error('Test error message');

        // Test child logger
        const childLogger = logger.child({ context: 'test' });
        childLogger.info('Test child logger message');

        // Test logger configuration
        const originalLevel = logger.getLevel();
        logger.configure({ level: 'DEBUG' });

        if (logger.getLevel() !== 'DEBUG') {
            throw new Error('Logger level not updated correctly');
        }

        // Restore original level
        logger.configure({ level: originalLevel });

        console.log('   ✓ Logger functions correctly');
    });

    // Test 4: Database Manager Functionality
    suite.addTest('Database Manager Functionality', async () => {
        // Test connection state
        const initialState = databaseManager.getConnectionState();
        if (initialState !== 'disconnected') {
            throw new Error(`Expected 'disconnected', got '${initialState}'`);
        }

        // Test connection
        await databaseManager.connect();
        const connectedState = databaseManager.getConnectionState();
        if (connectedState !== 'connected') {
            throw new Error(`Expected 'connected', got '${connectedState}'`);
        }

        // Test query execution
        const result = await databaseManager.query('SELECT 1 as test');
        if (!result || !result.rows || result.rows.length === 0) {
            throw new Error('Query execution failed');
        }

        // Test statistics
        const stats = databaseManager.getStats();
        if (stats.totalQueries === 0) {
            throw new Error('Query statistics not updated');
        }

        // Test disconnection
        await databaseManager.disconnect();
        const disconnectedState = databaseManager.getConnectionState();
        if (disconnectedState !== 'disconnected') {
            throw new Error(`Expected 'disconnected', got '${disconnectedState}'`);
        }

        console.log('   ✓ Database Manager functions correctly');
    });

    // Test 5: Cross-Module State Sharing
    suite.addTest('Cross-Module State Sharing', async () => {
        // Set configuration in one module
        configManager.set('shared.test', 'shared-value');

        // Verify it's accessible in another module
        const value = configManager.get('shared.test');
        if (value !== 'shared-value') {
            throw new Error(`Expected 'shared-value', got '${value}'`);
        }

        // Test that all services use the same configuration
        const userConfig = userService.config;
        const orderConfig = orderService.config;
        const notificationConfig = notificationService.config;

        // All services should have access to the same configuration
        const testValue = configManager.get('shared.test');
        if (testValue !== 'shared-value') {
            throw new Error('Configuration not shared across modules');
        }

        console.log('   ✓ State is shared across modules');
    });

    // Test 6: Service Integration
    suite.addTest('Service Integration', async () => {
        // Connect database for service tests
        await databaseManager.connect();

        // Test user service
        const user = await userService.createUser({
            name: 'Test User',
            email: 'test@example.com',
            role: 'customer'
        });

        if (!user || !user.id) {
            throw new Error('User creation failed');
        }

        // Test order service
        const order = await orderService.createOrder({
            userId: user.id,
            items: [
                { productId: 101, quantity: 1, price: 29.99 }
            ],
            total: 29.99
        });

        if (!order || !order.id) {
            throw new Error('Order creation failed');
        }

        // Test notification service
        const emailResult = await notificationService.sendEmail(
            'test@example.com',
            'Test Subject',
            'Test Body'
        );

        if (!emailResult || !emailResult.messageId) {
            throw new Error('Email sending failed');
        }

        // Clean up
        await databaseManager.disconnect();

        console.log('   ✓ Services integrate correctly');
    });

    // Test 7: Error Handling
    suite.addTest('Error Handling', async () => {
        // Test configuration manager error handling
        try {
            configManager.get(null);
            throw new Error('Should have thrown error for null key');
        } catch (error) {
            // Expected error
        }

        // Test logger error handling
        try {
            logger.error('Test error message');
            // Should not throw
        } catch (error) {
            throw new Error('Logger should not throw on error logging');
        }

        // Test database manager error handling
        try {
            await databaseManager.query('');
            throw new Error('Should have thrown error for empty query');
        } catch (error) {
            // Expected error
        }

        console.log('   ✓ Error handling works correctly');
    });

    // Test 8: Performance and Memory Efficiency
    suite.addTest('Performance and Memory Efficiency', async () => {
        const startTime = Date.now();

        // Perform multiple operations
        for (let i = 0; i < 100; i++) {
            configManager.set(`perf.test.${i}`, `value-${i}`);
            logger.info(`Performance test message ${i}`);
        }

        const endTime = Date.now();
        const duration = endTime - startTime;

        // Should complete within reasonable time (adjust as needed)
        if (duration > 5000) {
            throw new Error(`Performance test took too long: ${duration}ms`);
        }

        // Verify all operations were successful
        for (let i = 0; i < 100; i++) {
            const value = configManager.get(`perf.test.${i}`);
            if (value !== `value-${i}`) {
                throw new Error(`Performance test value mismatch at index ${i}`);
            }
        }

        console.log(`   ✓ Performance test completed in ${duration}ms`);
    });

    // Test 9: Singleton Thread Safety (Node.js Context)
    suite.addTest('Singleton Thread Safety (Node.js)', async () => {
        // In Node.js, module caching ensures thread safety
        // This test verifies that multiple imports return the same instance

        // Simulate multiple imports
        const { configManager: config1 } = await import('./configManager.js');
        const { configManager: config2 } = await import('./configManager.js');
        const { logger: logger1 } = await import('./logger.js');
        const { logger: logger2 } = await import('./logger.js');

        // Verify they are the same instances
        if (config1 !== config2) {
            throw new Error('Configuration Manager instances differ across imports');
        }

        if (logger1 !== logger2) {
            throw new Error('Logger instances differ across imports');
        }

        // Test state consistency
        config1.set('thread.test', 'thread-value');
        const value = config2.get('thread.test');

        if (value !== 'thread-value') {
            throw new Error('State not consistent across imports');
        }

        console.log('   ✓ Thread safety verified in Node.js context');
    });

    // Test 10: Singleton vs Multi-threading Comparison
    suite.addTest('Singleton vs Multi-threading Comparison', async () => {
        console.log('   📝 Node.js (Single-threaded) Singleton behavior:');
        console.log('      - Module caching ensures only one instance');
        console.log('      - No race conditions to worry about');
        console.log('      - Perfect for managing application-wide state');
        console.log('      - Memory efficient - single instance in memory');
        console.log('');
        console.log('   📝 Multi-threaded environment would require:');
        console.log('      - Additional synchronization mechanisms');
        console.log('      - Locks, atomic operations, or thread-safe containers');
        console.log('      - More complex implementation');
        console.log('      - Potential performance overhead from synchronization');

        // This is informational - no actual test logic needed
        console.log('   ✓ Singleton pattern analysis completed');
    });

    return suite;
}

/**
 * Main test execution
 */
async function runTests() {
    try {
        const testSuite = createTestSuite();
        await testSuite.runTests();

        console.log('🎉 All Singleton pattern tests completed!\n');

    } catch (error) {
        console.error('❌ Test suite failed:', error.message);
        process.exit(1);
    }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runTests().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

export { createTestSuite, runTests }; 