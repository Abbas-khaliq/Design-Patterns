/**
 * Order Service Module
 * 
 * This module demonstrates Singleton usage in a different business domain (e-commerce).
 * It shows how the same Singleton instances are used across different services.
 * 
 * Key Learning Points:
 * 1. How different services use the same Singleton instances
 * 2. How Singleton state is shared across business domains
 * 3. Transaction management with Singleton database manager
 * 4. Service-specific logging and configuration
 */

// Import Singleton instances - same instances used across all services
import { configManager } from '../configManager.js';
import { logger } from '../logger.js';
import { databaseManager } from '../databaseManager.js';

/**
 * Order Service class that demonstrates Singleton usage in e-commerce domain
 */
class OrderService {
    constructor() {
        // Create a child logger with service context
        this.logger = logger.child({ service: 'OrderService' });

        // Get service-specific configuration
        this.config = {
            maxOrderValue: configManager.get('app.maxOrderValue', 10000),
            enableOrderValidation: configManager.get('app.enableOrderValidation', true),
            orderProcessingTimeout: configManager.get('app.orderProcessingTimeout', 30000),
            taxRate: configManager.get('app.taxRate', 0.08), // 8% tax
            shippingCost: configManager.get('app.shippingCost', 5.99)
        };

        this.logger.info('OrderService initialized', this.config);
    }

    /**
     * Create a new order
     * Demonstrates transaction management with Singleton
     * 
     * @param {Object} orderData - Order data
     * @returns {Promise<Object>} Created order
     */
    async createOrder(orderData) {
        this.logger.info('Creating order', {
            userId: orderData.userId,
            itemCount: orderData.items.length,
            total: orderData.total
        });

        try {
            // Validate order data
            this.#validateOrderData(orderData);

            // Use database transaction for order creation
            const order = await databaseManager.transaction(async (connection) => {
                // Calculate final total with tax and shipping
                const subtotal = orderData.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
                const tax = subtotal * this.config.taxRate;
                const shipping = subtotal > 50 ? 0 : this.config.shippingCost; // Free shipping over $50
                const total = subtotal + tax + shipping;

                // Insert order
                const orderQuery = `
                    INSERT INTO orders (user_id, total, tax, shipping, status, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, 'pending', NOW(), NOW())
                    RETURNING id, user_id, total, tax, shipping, status, created_at
                `;

                const orderParams = [orderData.userId, total, tax, shipping];
                const orderResult = await databaseManager.query(orderQuery, orderParams);
                const order = orderResult.rows[0];

                // Insert order items
                for (const item of orderData.items) {
                    const itemQuery = `
                        INSERT INTO order_items (order_id, product_id, quantity, price, created_at)
                        VALUES ($1, $2, $3, $4, NOW())
                    `;

                    const itemParams = [order.id, item.productId, item.quantity, item.price];
                    await databaseManager.query(itemQuery, itemParams);
                }

                // Update inventory (simplified)
                for (const item of orderData.items) {
                    const inventoryQuery = `
                        UPDATE products 
                        SET stock_quantity = stock_quantity - $1
                        WHERE id = $2 AND stock_quantity >= $1
                    `;

                    const inventoryResult = await databaseManager.query(inventoryQuery, [item.quantity, item.productId]);

                    if (inventoryResult.rowCount === 0) {
                        throw new Error(`Insufficient stock for product ${item.productId}`);
                    }
                }

                return order;
            });

            this.logger.info('Order created successfully', {
                orderId: order.id,
                userId: order.user_id,
                total: order.total,
                status: order.status
            });

            return order;

        } catch (error) {
            this.logger.error('Failed to create order', {
                error: error.message,
                orderData: { userId: orderData.userId, itemCount: orderData.items.length }
            });
            throw error;
        }
    }

    /**
     * Process an order
     * 
     * @param {number} orderId - Order ID
     * @returns {Promise<Object>} Updated order
     */
    async processOrder(orderId) {
        this.logger.info('Processing order', { orderId });

        try {
            // Get order details
            const order = await this.getOrder(orderId);
            if (!order) {
                throw new Error('Order not found');
            }

            if (order.status !== 'pending') {
                throw new Error(`Order cannot be processed. Current status: ${order.status}`);
            }

            // Process order with transaction
            const updatedOrder = await databaseManager.transaction(async (connection) => {
                // Update order status
                const updateQuery = `
                    UPDATE orders 
                    SET status = 'processing', updated_at = NOW()
                    WHERE id = $1 AND status = 'pending'
                    RETURNING id, user_id, total, status, created_at, updated_at
                `;

                const result = await databaseManager.query(updateQuery, [orderId]);

                if (result.rowCount === 0) {
                    throw new Error('Order status update failed');
                }

                // Simulate processing time
                await new Promise(resolve => setTimeout(resolve, 1000));

                // Update to completed status
                const completeQuery = `
                    UPDATE orders 
                    SET status = 'completed', updated_at = NOW()
                    WHERE id = $1
                    RETURNING id, user_id, total, status, created_at, updated_at
                `;

                const completeResult = await databaseManager.query(completeQuery, [orderId]);
                return completeResult.rows[0];
            });

            this.logger.info('Order processed successfully', {
                orderId: updatedOrder.id,
                status: updatedOrder.status
            });

            return updatedOrder;

        } catch (error) {
            this.logger.error('Failed to process order', {
                error: error.message,
                orderId
            });
            throw error;
        }
    }

    /**
     * Get order by ID
     * 
     * @param {number} orderId - Order ID
     * @returns {Promise<Object|null>} Order object or null
     */
    async getOrder(orderId) {
        this.logger.debug('Getting order by ID', { orderId });

        try {
            const query = `
                SELECT o.id, o.user_id, o.total, o.tax, o.shipping, o.status, 
                       o.created_at, o.updated_at,
                       json_agg(
                           json_build_object(
                               'id', oi.id,
                               'product_id', oi.product_id,
                               'quantity', oi.quantity,
                               'price', oi.price
                           )
                       ) as items
                FROM orders o
                LEFT JOIN order_items oi ON o.id = oi.order_id
                WHERE o.id = $1
                GROUP BY o.id
            `;

            const result = await databaseManager.query(query, [orderId]);

            if (result.rows.length === 0) {
                this.logger.warn('Order not found', { orderId });
                return null;
            }

            return result.rows[0];

        } catch (error) {
            this.logger.error('Failed to get order', {
                error: error.message,
                orderId
            });
            throw error;
        }
    }

    /**
     * Get orders by user ID
     * 
     * @param {number} userId - User ID
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Orders and pagination info
     */
    async getOrdersByUser(userId, options = {}) {
        const { page = 1, limit = 10, status = null } = options;
        const offset = (page - 1) * limit;

        this.logger.debug('Getting orders by user', { userId, page, limit, status });

        try {
            let query = `
                SELECT id, user_id, total, tax, shipping, status, created_at, updated_at
                FROM orders
                WHERE user_id = $1
            `;

            const params = [userId];

            // Add status filter if specified
            if (status) {
                query += ' AND status = $2';
                params.push(status);
            }

            // Add pagination
            query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
            params.push(limit, offset);

            const result = await databaseManager.query(query, params);

            // Get total count for pagination
            const countQuery = `
                SELECT COUNT(*) as total
                FROM orders
                WHERE user_id = $1
                ${status ? 'AND status = $2' : ''}
            `;

            const countParams = status ? [userId, status] : [userId];
            const countResult = await databaseManager.query(countQuery, countParams);
            const total = parseInt(countResult.rows[0].total);

            return {
                orders: result.rows,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit)
                }
            };

        } catch (error) {
            this.logger.error('Failed to get orders by user', {
                error: error.message,
                userId,
                options
            });
            throw error;
        }
    }

    /**
     * Cancel an order
     * 
     * @param {number} orderId - Order ID
     * @returns {Promise<Object>} Updated order
     */
    async cancelOrder(orderId) {
        this.logger.info('Cancelling order', { orderId });

        try {
            const order = await this.getOrder(orderId);
            if (!order) {
                throw new Error('Order not found');
            }

            if (order.status === 'completed' || order.status === 'shipped') {
                throw new Error('Cannot cancel completed or shipped order');
            }

            // Cancel order with transaction
            const updatedOrder = await databaseManager.transaction(async (connection) => {
                // Update order status
                const updateQuery = `
                    UPDATE orders 
                    SET status = 'cancelled', updated_at = NOW()
                    WHERE id = $1 AND status IN ('pending', 'processing')
                    RETURNING id, user_id, total, status, created_at, updated_at
                `;

                const result = await databaseManager.query(updateQuery, [orderId]);

                if (result.rowCount === 0) {
                    throw new Error('Order cancellation failed');
                }

                // Restore inventory
                const itemsQuery = `
                    SELECT product_id, quantity
                    FROM order_items
                    WHERE order_id = $1
                `;

                const itemsResult = await databaseManager.query(itemsQuery, [orderId]);

                for (const item of itemsResult.rows) {
                    const restoreQuery = `
                        UPDATE products 
                        SET stock_quantity = stock_quantity + $1
                        WHERE id = $2
                    `;

                    await databaseManager.query(restoreQuery, [item.quantity, item.product_id]);
                }

                return result.rows[0];
            });

            this.logger.info('Order cancelled successfully', {
                orderId: updatedOrder.id,
                status: updatedOrder.status
            });

            return updatedOrder;

        } catch (error) {
            this.logger.error('Failed to cancel order', {
                error: error.message,
                orderId
            });
            throw error;
        }
    }

    /**
     * Get order statistics
     * 
     * @returns {Promise<Object>} Order statistics
     */
    async getOrderStatistics() {
        this.logger.debug('Getting order statistics');

        try {
            const query = `
                SELECT 
                    COUNT(*) as total_orders,
                    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_orders,
                    COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing_orders,
                    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_orders,
                    COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_orders,
                    SUM(total) as total_revenue,
                    AVG(total) as average_order_value,
                    COUNT(CASE WHEN created_at >= NOW() - INTERVAL '24 hours' THEN 1 END) as orders_24h
                FROM orders
                WHERE status != 'cancelled'
            `;

            const result = await databaseManager.query(query);
            const stats = result.rows[0];

            this.logger.info('Order statistics retrieved', stats);

            return stats;

        } catch (error) {
            this.logger.error('Failed to get order statistics', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Validate order data
     * 
     * @param {Object} orderData - Order data to validate
     * @throws {Error} If validation fails
     */
    #validateOrderData(orderData) {
        if (!orderData.userId || typeof orderData.userId !== 'number') {
            throw new Error('Valid user ID is required');
        }

        if (!orderData.items || !Array.isArray(orderData.items) || orderData.items.length === 0) {
            throw new Error('Order must contain at least one item');
        }

        // Validate each item
        for (const item of orderData.items) {
            if (!item.productId || typeof item.productId !== 'number') {
                throw new Error('Valid product ID is required for each item');
            }

            if (!item.quantity || typeof item.quantity !== 'number' || item.quantity <= 0) {
                throw new Error('Valid quantity is required for each item');
            }

            if (!item.price || typeof item.price !== 'number' || item.price < 0) {
                throw new Error('Valid price is required for each item');
            }
        }

        // Check maximum order value
        const total = orderData.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        if (total > this.config.maxOrderValue) {
            throw new Error(`Order total exceeds maximum allowed value of $${this.config.maxOrderValue}`);
        }
    }
}

// Create and export the service instance
const orderService = new OrderService();

export { orderService }; 