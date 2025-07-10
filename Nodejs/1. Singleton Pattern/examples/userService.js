/**
 * User Service Module
 * 
 * This module demonstrates how to use Singletons across different parts of the application.
 * It shows how the same Singleton instances are shared and maintain consistent state.
 * 
 * Key Learning Points:
 * 1. How to import and use Singleton instances in different modules
 * 2. How Singleton state is shared across modules
 * 3. How to use Singletons for logging, configuration, and database operations
 * 4. Real-world service layer patterns with Singletons
 */

// Import Singleton instances - these are the same instances used in other modules
import { configManager } from '../configManager.js';
import { logger } from '../logger.js';
import { databaseManager } from '../databaseManager.js';

/**
 * User Service class that demonstrates Singleton usage
 */
class UserService {
    constructor() {
        // Create a child logger with service context
        this.logger = logger.child({ service: 'UserService' });

        // Get service-specific configuration
        this.config = {
            maxUsers: configManager.get('app.maxUsers', 1000),
            userCacheTimeout: configManager.get('app.userCacheTimeout', 300000), // 5 minutes
            enableAuditLog: configManager.get('app.enableAuditLog', true)
        };

        this.logger.info('UserService initialized', this.config);
    }

    /**
     * Create a new user
     * Demonstrates database operations with Singleton
     * 
     * @param {Object} userData - User data
     * @returns {Promise<Object>} Created user
     */
    async createUser(userData) {
        this.logger.info('Creating user', { email: userData.email });

        try {
            // Validate user data
            this.#validateUserData(userData);

            // Check if user already exists
            const existingUser = await this.getUserByEmail(userData.email);
            if (existingUser) {
                throw new Error('User with this email already exists');
            }

            // Insert user into database
            const query = `
                INSERT INTO users (name, email, role, created_at, updated_at)
                VALUES ($1, $2, $3, NOW(), NOW())
                RETURNING id, name, email, role, created_at
            `;

            const params = [userData.name, userData.email, userData.role];
            const result = await databaseManager.query(query, params);

            const user = result.rows[0];

            // Log the creation
            this.logger.info('User created successfully', {
                userId: user.id,
                email: user.email,
                role: user.role
            });

            // Audit log if enabled
            if (this.config.enableAuditLog) {
                await this.#logAuditEvent('USER_CREATED', user.id, userData);
            }

            return user;

        } catch (error) {
            this.logger.error('Failed to create user', {
                error: error.message,
                userData: { email: userData.email, name: userData.name }
            });
            throw error;
        }
    }

    /**
     * Get user by ID
     * 
     * @param {number} userId - User ID
     * @returns {Promise<Object|null>} User object or null
     */
    async getUser(userId) {
        this.logger.debug('Getting user by ID', { userId });

        try {
            const query = `
                SELECT id, name, email, role, created_at, updated_at
                FROM users
                WHERE id = $1
            `;

            const result = await databaseManager.query(query, [userId]);

            if (result.rows.length === 0) {
                this.logger.warn('User not found', { userId });
                return null;
            }

            return result.rows[0];

        } catch (error) {
            this.logger.error('Failed to get user', {
                error: error.message,
                userId
            });
            throw error;
        }
    }

    /**
     * Get user by email
     * 
     * @param {string} email - User email
     * @returns {Promise<Object|null>} User object or null
     */
    async getUserByEmail(email) {
        this.logger.debug('Getting user by email', { email });

        try {
            const query = `
                SELECT id, name, email, role, created_at, updated_at
                FROM users
                WHERE email = $1
            `;

            const result = await databaseManager.query(query, [email]);

            return result.rows.length > 0 ? result.rows[0] : null;

        } catch (error) {
            this.logger.error('Failed to get user by email', {
                error: error.message,
                email
            });
            throw error;
        }
    }

    /**
     * Update user
     * 
     * @param {number} userId - User ID
     * @param {Object} updateData - Data to update
     * @returns {Promise<Object>} Updated user
     */
    async updateUser(userId, updateData) {
        this.logger.info('Updating user', { userId, updates: Object.keys(updateData) });

        try {
            // Get current user data for audit log
            const currentUser = await this.getUser(userId);
            if (!currentUser) {
                throw new Error('User not found');
            }

            // Build update query dynamically
            const allowedFields = ['name', 'email', 'role'];
            const updates = [];
            const params = [];
            let paramIndex = 1;

            for (const [field, value] of Object.entries(updateData)) {
                if (allowedFields.includes(field)) {
                    updates.push(`${field} = $${paramIndex}`);
                    params.push(value);
                    paramIndex++;
                }
            }

            if (updates.length === 0) {
                throw new Error('No valid fields to update');
            }

            // Add updated_at and user ID to params
            updates.push('updated_at = NOW()');
            params.push(userId);

            const query = `
                UPDATE users
                SET ${updates.join(', ')}
                WHERE id = $${paramIndex}
                RETURNING id, name, email, role, created_at, updated_at
            `;

            const result = await databaseManager.query(query, params);
            const updatedUser = result.rows[0];

            this.logger.info('User updated successfully', {
                userId: updatedUser.id,
                updatedFields: Object.keys(updateData)
            });

            // Audit log if enabled
            if (this.config.enableAuditLog) {
                await this.#logAuditEvent('USER_UPDATED', userId, {
                    previous: currentUser,
                    current: updatedUser
                });
            }

            return updatedUser;

        } catch (error) {
            this.logger.error('Failed to update user', {
                error: error.message,
                userId,
                updateData
            });
            throw error;
        }
    }

    /**
     * Delete user
     * 
     * @param {number} userId - User ID
     * @returns {Promise<boolean>} True if deleted
     */
    async deleteUser(userId) {
        this.logger.info('Deleting user', { userId });

        try {
            // Get user data for audit log
            const user = await this.getUser(userId);
            if (!user) {
                throw new Error('User not found');
            }

            const query = `
                DELETE FROM users
                WHERE id = $1
            `;

            const result = await databaseManager.query(query, [userId]);

            if (result.rowCount === 0) {
                throw new Error('User not found');
            }

            this.logger.info('User deleted successfully', { userId });

            // Audit log if enabled
            if (this.config.enableAuditLog) {
                await this.#logAuditEvent('USER_DELETED', userId, { deletedUser: user });
            }

            return true;

        } catch (error) {
            this.logger.error('Failed to delete user', {
                error: error.message,
                userId
            });
            throw error;
        }
    }

    /**
     * Get all users with pagination
     * 
     * @param {Object} options - Pagination options
     * @returns {Promise<Object>} Users and pagination info
     */
    async getUsers(options = {}) {
        const { page = 1, limit = 10, role = null } = options;
        const offset = (page - 1) * limit;

        this.logger.debug('Getting users', { page, limit, role });

        try {
            let query = `
                SELECT id, name, email, role, created_at, updated_at
                FROM users
            `;

            const params = [];

            // Add role filter if specified
            if (role) {
                query += ' WHERE role = $1';
                params.push(role);
            }

            // Add pagination
            query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
            params.push(limit, offset);

            const result = await databaseManager.query(query, params);

            // Get total count for pagination
            const countQuery = `
                SELECT COUNT(*) as total
                FROM users
                ${role ? 'WHERE role = $1' : ''}
            `;

            const countParams = role ? [role] : [];
            const countResult = await databaseManager.query(countQuery, countParams);
            const total = parseInt(countResult.rows[0].total);

            return {
                users: result.rows,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit)
                }
            };

        } catch (error) {
            this.logger.error('Failed to get users', {
                error: error.message,
                options
            });
            throw error;
        }
    }

    /**
     * Get user statistics
     * 
     * @returns {Promise<Object>} User statistics
     */
    async getUserStatistics() {
        this.logger.debug('Getting user statistics');

        try {
            const query = `
                SELECT 
                    COUNT(*) as total_users,
                    COUNT(CASE WHEN role = 'admin' THEN 1 END) as admin_count,
                    COUNT(CASE WHEN role = 'customer' THEN 1 END) as customer_count,
                    COUNT(CASE WHEN role = 'premium' THEN 1 END) as premium_count,
                    COUNT(CASE WHEN created_at >= NOW() - INTERVAL '24 hours' THEN 1 END) as new_users_24h
                FROM users
            `;

            const result = await databaseManager.query(query);
            const stats = result.rows[0];

            this.logger.info('User statistics retrieved', stats);

            return stats;

        } catch (error) {
            this.logger.error('Failed to get user statistics', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Validate user data
     * 
     * @param {Object} userData - User data to validate
     * @throws {Error} If validation fails
     */
    #validateUserData(userData) {
        if (!userData.name || typeof userData.name !== 'string' || userData.name.trim().length === 0) {
            throw new Error('Name is required and must be a non-empty string');
        }

        if (!userData.email || typeof userData.email !== 'string' || !this.#isValidEmail(userData.email)) {
            throw new Error('Valid email is required');
        }

        if (!userData.role || !['admin', 'customer', 'premium'].includes(userData.role)) {
            throw new Error('Role must be one of: admin, customer, premium');
        }
    }

    /**
     * Check if email is valid
     * 
     * @param {string} email - Email to validate
     * @returns {boolean} True if valid
     */
    #isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * Log audit event
     * 
     * @param {string} event - Event type
     * @param {number} userId - User ID
     * @param {Object} data - Event data
     */
    async #logAuditEvent(event, userId, data) {
        try {
            const query = `
                INSERT INTO audit_logs (event_type, user_id, data, created_at)
                VALUES ($1, $2, $3, NOW())
            `;

            await databaseManager.query(query, [event, userId, JSON.stringify(data)]);

            this.logger.debug('Audit event logged', { event, userId });

        } catch (error) {
            this.logger.error('Failed to log audit event', {
                error: error.message,
                event,
                userId
            });
        }
    }
}

// Create and export the service instance
const userService = new UserService();

export { userService }; 