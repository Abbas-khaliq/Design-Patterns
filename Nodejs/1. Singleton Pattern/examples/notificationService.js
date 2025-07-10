/**
 * Notification Service Module
 * 
 * This module demonstrates Singleton usage in a notification/messaging domain.
 * It shows how Singletons can manage external service integrations and maintain
 * consistent state across different notification channels.
 * 
 * Key Learning Points:
 * 1. How Singletons manage external service connections
 * 2. How to use Singletons for rate limiting and queuing
 * 3. Service-specific configuration and logging
 * 4. Error handling and retry logic with Singletons
 */

// Import Singleton instances - same instances used across all services
import { configManager } from '../configManager.js';
import { logger } from '../logger.js';
import { databaseManager } from '../databaseManager.js';

/**
 * Notification Service class that demonstrates Singleton usage in messaging domain
 */
class NotificationService {
    constructor() {
        // Create a child logger with service context
        this.logger = logger.child({ service: 'NotificationService' });

        // Get service-specific configuration
        this.config = {
            emailProvider: configManager.get('services.email.provider', 'smtp'),
            emailHost: configManager.get('services.email.host', 'smtp.gmail.com'),
            emailPort: configManager.get('services.email.port', 587),
            emailSecure: configManager.get('services.email.secure', false),
            smsProvider: configManager.get('services.sms.provider', 'twilio'),
            pushProvider: configManager.get('services.push.provider', 'firebase'),
            maxRetries: configManager.get('app.notificationMaxRetries', 3),
            retryDelay: configManager.get('app.notificationRetryDelay', 1000),
            rateLimit: configManager.get('app.notificationRateLimit', 100), // per minute
            enableQueue: configManager.get('app.enableNotificationQueue', true)
        };

        // Initialize notification statistics
        this.#stats = {
            totalSent: 0,
            successful: 0,
            failed: 0,
            byType: {
                email: { sent: 0, successful: 0, failed: 0 },
                sms: { sent: 0, successful: 0, failed: 0 },
                push: { sent: 0, successful: 0, failed: 0 }
            },
            lastSent: null
        };

        // Rate limiting
        this.#rateLimitCounter = 0;
        this.#rateLimitResetTime = Date.now() + 60000; // 1 minute

        // Notification queue for batching
        this.#notificationQueue = [];
        this.#queueProcessing = false;

        this.logger.info('NotificationService initialized', this.config);
    }

    // Private properties
    #stats = {};
    #rateLimitCounter = 0;
    #rateLimitResetTime = 0;
    #notificationQueue = [];
    #queueProcessing = false;

    /**
     * Send email notification
     * 
     * @param {string} to - Recipient email
     * @param {string} subject - Email subject
     * @param {string} body - Email body
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Send result
     */
    async sendEmail(to, subject, body, options = {}) {
        this.logger.info('Sending email notification', {
            to,
            subject,
            hasBody: !!body,
            options: Object.keys(options)
        });

        try {
            // Validate email parameters
            this.#validateEmailParams(to, subject, body);

            // Check rate limiting
            this.#checkRateLimit();

            // Prepare email data
            const emailData = {
                to,
                subject,
                body,
                from: options.from || configManager.get('services.email.from', 'noreply@example.com'),
                replyTo: options.replyTo,
                attachments: options.attachments || [],
                template: options.template,
                templateData: options.templateData || {}
            };

            // Send email
            const result = await this.#sendEmailNotification(emailData);

            // Update statistics
            this.#updateStats('email', true);

            // Log to database if enabled
            if (configManager.get('app.enableNotificationLogging', true)) {
                await this.#logNotification('email', to, subject, result);
            }

            this.logger.info('Email sent successfully', {
                to,
                subject,
                messageId: result.messageId
            });

            return result;

        } catch (error) {
            this.#updateStats('email', false);

            this.logger.error('Failed to send email', {
                error: error.message,
                to,
                subject
            });

            throw error;
        }
    }

    /**
     * Send SMS notification
     * 
     * @param {string} to - Recipient phone number
     * @param {string} message - SMS message
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Send result
     */
    async sendSMS(to, message, options = {}) {
        this.logger.info('Sending SMS notification', {
            to,
            messageLength: message.length,
            options: Object.keys(options)
        });

        try {
            // Validate SMS parameters
            this.#validateSMSParams(to, message);

            // Check rate limiting
            this.#checkRateLimit();

            // Prepare SMS data
            const smsData = {
                to,
                message,
                from: options.from || configManager.get('services.sms.from', '+1234567890'),
                priority: options.priority || 'normal'
            };

            // Send SMS
            const result = await this.#sendSMSNotification(smsData);

            // Update statistics
            this.#updateStats('sms', true);

            // Log to database if enabled
            if (configManager.get('app.enableNotificationLogging', true)) {
                await this.#logNotification('sms', to, message, result);
            }

            this.logger.info('SMS sent successfully', {
                to,
                messageId: result.messageId
            });

            return result;

        } catch (error) {
            this.#updateStats('sms', false);

            this.logger.error('Failed to send SMS', {
                error: error.message,
                to
            });

            throw error;
        }
    }

    /**
     * Send push notification
     * 
     * @param {string} userId - User ID or device token
     * @param {string} title - Notification title
     * @param {string} body - Notification body
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Send result
     */
    async sendPushNotification(userId, title, body, options = {}) {
        this.logger.info('Sending push notification', {
            userId,
            title,
            bodyLength: body.length,
            options: Object.keys(options)
        });

        try {
            // Validate push notification parameters
            this.#validatePushParams(userId, title, body);

            // Check rate limiting
            this.#checkRateLimit();

            // Prepare push notification data
            const pushData = {
                userId,
                title,
                body,
                data: options.data || {},
                badge: options.badge,
                sound: options.sound || 'default',
                priority: options.priority || 'normal'
            };

            // Send push notification
            const result = await this.#sendPushNotification(pushData);

            // Update statistics
            this.#updateStats('push', true);

            // Log to database if enabled
            if (configManager.get('app.enableNotificationLogging', true)) {
                await this.#logNotification('push', userId, title, result);
            }

            this.logger.info('Push notification sent successfully', {
                userId,
                messageId: result.messageId
            });

            return result;

        } catch (error) {
            this.#updateStats('push', false);

            this.logger.error('Failed to send push notification', {
                error: error.message,
                userId,
                title
            });

            throw error;
        }
    }

    /**
     * Send bulk notifications
     * 
     * @param {Array} notifications - Array of notification objects
     * @returns {Promise<Object>} Bulk send result
     */
    async sendBulkNotifications(notifications) {
        this.logger.info('Sending bulk notifications', {
            count: notifications.length,
            types: [...new Set(notifications.map(n => n.type))]
        });

        const results = {
            total: notifications.length,
            successful: 0,
            failed: 0,
            errors: []
        };

        // Process notifications in batches
        const batchSize = configManager.get('app.notificationBatchSize', 10);

        for (let i = 0; i < notifications.length; i += batchSize) {
            const batch = notifications.slice(i, i + batchSize);

            // Process batch concurrently
            const batchPromises = batch.map(async (notification) => {
                try {
                    switch (notification.type) {
                        case 'email':
                            await this.sendEmail(notification.to, notification.subject, notification.body, notification.options);
                            break;
                        case 'sms':
                            await this.sendSMS(notification.to, notification.message, notification.options);
                            break;
                        case 'push':
                            await this.sendPushNotification(notification.userId, notification.title, notification.body, notification.options);
                            break;
                        default:
                            throw new Error(`Unknown notification type: ${notification.type}`);
                    }

                    results.successful++;

                } catch (error) {
                    results.failed++;
                    results.errors.push({
                        notification,
                        error: error.message
                    });
                }
            });

            // Wait for batch to complete
            await Promise.all(batchPromises);

            // Add delay between batches to avoid overwhelming services
            if (i + batchSize < notifications.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        this.logger.info('Bulk notifications completed', results);

        return results;
    }

    /**
     * Get notification statistics
     * 
     * @returns {Object} Notification statistics
     */
    getStatistics() {
        return {
            ...this.#stats,
            rateLimit: {
                current: this.#rateLimitCounter,
                limit: this.config.rateLimit,
                resetTime: new Date(this.#rateLimitResetTime)
            },
            queue: {
                pending: this.#notificationQueue.length,
                processing: this.#queueProcessing
            }
        };
    }

    /**
     * Clear notification statistics
     */
    clearStatistics() {
        this.#stats = {
            totalSent: 0,
            successful: 0,
            failed: 0,
            byType: {
                email: { sent: 0, successful: 0, failed: 0 },
                sms: { sent: 0, successful: 0, failed: 0 },
                push: { sent: 0, successful: 0, failed: 0 }
            },
            lastSent: null
        };

        this.logger.info('Notification statistics cleared');
    }

    /**
     * Validate email parameters
     * 
     * @param {string} to - Recipient email
     * @param {string} subject - Email subject
     * @param {string} body - Email body
     * @throws {Error} If validation fails
     */
    #validateEmailParams(to, subject, body) {
        if (!to || typeof to !== 'string' || !this.#isValidEmail(to)) {
            throw new Error('Valid recipient email is required');
        }

        if (!subject || typeof subject !== 'string' || subject.trim().length === 0) {
            throw new Error('Email subject is required');
        }

        if (!body || typeof body !== 'string' || body.trim().length === 0) {
            throw new Error('Email body is required');
        }
    }

    /**
     * Validate SMS parameters
     * 
     * @param {string} to - Recipient phone number
     * @param {string} message - SMS message
     * @throws {Error} If validation fails
     */
    #validateSMSParams(to, message) {
        if (!to || typeof to !== 'string' || !this.#isValidPhoneNumber(to)) {
            throw new Error('Valid recipient phone number is required');
        }

        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            throw new Error('SMS message is required');
        }

        if (message.length > 160) {
            throw new Error('SMS message cannot exceed 160 characters');
        }
    }

    /**
     * Validate push notification parameters
     * 
     * @param {string} userId - User ID
     * @param {string} title - Notification title
     * @param {string} body - Notification body
     * @throws {Error} If validation fails
     */
    #validatePushParams(userId, title, body) {
        if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
            throw new Error('Valid user ID is required');
        }

        if (!title || typeof title !== 'string' || title.trim().length === 0) {
            throw new Error('Notification title is required');
        }

        if (!body || typeof body !== 'string' || body.trim().length === 0) {
            throw new Error('Notification body is required');
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
     * Check if phone number is valid
     * 
     * @param {string} phone - Phone number to validate
     * @returns {boolean} True if valid
     */
    #isValidPhoneNumber(phone) {
        const phoneRegex = /^\+?[\d\s\-\(\)]+$/;
        return phoneRegex.test(phone) && phone.replace(/\D/g, '').length >= 10;
    }

    /**
     * Check rate limiting
     * 
     * @throws {Error} If rate limit exceeded
     */
    #checkRateLimit() {
        const now = Date.now();

        // Reset counter if time window has passed
        if (now > this.#rateLimitResetTime) {
            this.#rateLimitCounter = 0;
            this.#rateLimitResetTime = now + 60000; // 1 minute
        }

        // Check if rate limit exceeded
        if (this.#rateLimitCounter >= this.config.rateLimit) {
            throw new Error(`Rate limit exceeded. Maximum ${this.config.rateLimit} notifications per minute.`);
        }

        this.#rateLimitCounter++;
    }

    /**
     * Send email notification (simulated)
     * 
     * @param {Object} emailData - Email data
     * @returns {Promise<Object>} Send result
     */
    async #sendEmailNotification(emailData) {
        // Simulate email sending
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                // Simulate success/failure
                if (Math.random() > 0.05) { // 95% success rate
                    resolve({
                        messageId: `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        status: 'sent',
                        timestamp: new Date().toISOString()
                    });
                } else {
                    reject(new Error('Email service temporarily unavailable'));
                }
            }, 500);
        });
    }

    /**
     * Send SMS notification (simulated)
     * 
     * @param {Object} smsData - SMS data
     * @returns {Promise<Object>} Send result
     */
    async #sendSMSNotification(smsData) {
        // Simulate SMS sending
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                // Simulate success/failure
                if (Math.random() > 0.03) { // 97% success rate
                    resolve({
                        messageId: `sms_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        status: 'sent',
                        timestamp: new Date().toISOString()
                    });
                } else {
                    reject(new Error('SMS service temporarily unavailable'));
                }
            }, 300);
        });
    }

    /**
     * Send push notification (simulated)
     * 
     * @param {Object} pushData - Push notification data
     * @returns {Promise<Object>} Send result
     */
    async #sendPushNotification(pushData) {
        // Simulate push notification sending
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                // Simulate success/failure
                if (Math.random() > 0.02) { // 98% success rate
                    resolve({
                        messageId: `push_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        status: 'sent',
                        timestamp: new Date().toISOString()
                    });
                } else {
                    reject(new Error('Push notification service temporarily unavailable'));
                }
            }, 200);
        });
    }

    /**
     * Update notification statistics
     * 
     * @param {string} type - Notification type
     * @param {boolean} success - Whether send was successful
     */
    #updateStats(type, success) {
        this.#stats.totalSent++;
        this.#stats.byType[type].sent++;

        if (success) {
            this.#stats.successful++;
            this.#stats.byType[type].successful++;
        } else {
            this.#stats.failed++;
            this.#stats.byType[type].failed++;
        }

        this.#stats.lastSent = new Date().toISOString();
    }

    /**
     * Log notification to database
     * 
     * @param {string} type - Notification type
     * @param {string} recipient - Recipient
     * @param {string} content - Notification content
     * @param {Object} result - Send result
     */
    async #logNotification(type, recipient, content, result) {
        try {
            const query = `
                INSERT INTO notification_logs (type, recipient, content, message_id, status, created_at)
                VALUES ($1, $2, $3, $4, $5, NOW())
            `;

            await databaseManager.query(query, [
                type,
                recipient,
                content,
                result.messageId,
                result.status
            ]);

        } catch (error) {
            this.logger.error('Failed to log notification to database', {
                error: error.message,
                type,
                recipient
            });
        }
    }
}

// Create and export the service instance
const notificationService = new NotificationService();

export { notificationService }; 