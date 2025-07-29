/**
 * @file Service for handling user consent operations.
 *
 * @module services/consent
 * @exports consentService
 */

const pool = require('./db_conn');
const logger = require('./logger');
const {db} = require("../utils/queries");


/**
 * Get the active consent revision
 * @returns {Promise<Object|null>} Active consent revision or null if none exists
 */
const getActiveConsentRevision = async () => {
    const client = await pool.connect();
    try {
        const result = await client.query(`
            SELECT id,
                   version,
                   title,
                   content,
                   privacy_policy_url,
                   terms_url,
                   created_at,
                   expires_at
            FROM consent_revisions
            WHERE is_active = true
              AND (expires_at IS NULL OR expires_at > NOW())
            ORDER BY created_at DESC
            LIMIT 1
        `);

        return result.rows[0] || null;
    } catch (error) {
        db.handleQueryError(error, 'getActiveConsentRevision');
    } finally {
        client.release();
    }
};

/**
 * Check if user has consented to the current active consent revision
 * @param {number} userId - User ID
 * @returns {Promise<boolean>} True if user has valid consent, false otherwise
 */
const hasValidConsent = async (userId) => {
    const client = await pool.connect();
    try {
        const result = await client.query(`
            SELECT uc.id
            FROM user_consents uc
                     JOIN consent_revisions cr ON uc.consent_revision_id = cr.id
            WHERE uc.user_id = $1::integer
              AND cr.is_active = true
              AND uc.is_withdrawn = false
              AND (cr.expires_at IS NULL OR cr.expires_at > NOW())
            LIMIT 1
        `, [userId]);

        return result.rows.length > 0;
    } catch (error) {
        db.handleQueryError(error, 'hasValidConsent');
    } finally {
        client.release();
    }
};

/**
 * Check if user has consented to the latest active significant consent revision
 * This ensures users have agreed to the most recent terms
 * @param {number} userId - User ID
 * @returns {Promise<boolean>} True if user has consented to the latest revision, false otherwise
 */
const hasLatestConsent = async (userId) => {
    const client = await pool.connect();
    try {
        // Get the latest active consent revision
        const latestRevision = await client.query(`
            SELECT id
            FROM consent_revisions
            WHERE is_active = true
              AND (expires_at IS NULL OR expires_at > NOW())
              AND optional = false
            ORDER BY created_at DESC
            LIMIT 1
        `);

        if (latestRevision.rows.length === 0) {
            // No active consent revision found
            return false;
        }

        const latestRevisionId = latestRevision.rows[0].id;

        // Check if user has consented to this specific revision
        const userConsent = await client.query(`
            SELECT id
            FROM user_consents
            WHERE user_id = $1::integer
              AND consent_revision_id = $2::integer
              AND is_withdrawn = false
            LIMIT 1
        `, [userId, latestRevisionId]);

        return userConsent.rows.length > 0;
    } catch (error) {
        db.handleQueryError(error, 'hasLatestConsent');
    } finally {
        client.release();
    }
};

/**
 * Record user consent
 * @param {number} userId - User ID
 * @param {number} consentRevisionId - Consent revision ID
 * @param {string} ipAddress - User's IP address
 * @param {string} userAgent - User's browser user agent
 * @param {string} consentMethod - Method of consent (default: 'web_form')
 * @returns {Promise<Object>} Created consent record
 */
const recordConsent = async (userId, consentRevisionId, ipAddress, userAgent, consentMethod = 'web_form') => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query(`
            INSERT INTO user_consents (user_id, consent_revision_id, ip_address, user_agent, consent_method)
            VALUES ($1::integer, $2::integer, $3, $4, $5)
            RETURNING id, user_id, consent_revision_id, consented_at, ip_address, user_agent, consent_method
        `, [userId, consentRevisionId, ipAddress, userAgent, consentMethod]);

        await client.query('COMMIT');
        logger.info(`Consent recorded for user ${userId} with revision ${consentRevisionId}`);
        return result.rows[0];
    } catch (error) {
        await client.query('ROLLBACK');
        db.handleQueryError(error, 'recordConsent');
    } finally {
        client.release();
    }
};

/**
 * Withdraw user consent
 * @param {number} userId - User ID
 * @returns {Promise<boolean>} True if consent was withdrawn, false if no active consent found
 */
const withdrawConsent = async (userId) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query(`
            UPDATE user_consents
            SET is_withdrawn = true,
                withdrawn_at = NOW()
            WHERE user_id = $1::integer
              AND is_withdrawn = false
            RETURNING id
        `, [userId]);

        await client.query('COMMIT');
        if (result.rows.length > 0) {
            logger.info(`Consent withdrawn for user ${userId}`);
            return true;
        }

        return false;
    } catch (error) {
        await client.query('ROLLBACK');
        db.handleQueryError(error, 'withdrawConsent');
    } finally {
        client.release();
    }
};

/**
 * Get user's consent history
 * @param {number} userId - User ID
 * @returns {Promise<Array>} Array of consent records
 */
const getUserConsentHistory = async (userId) => {
    const client = await pool.connect();
    try {
        const result = await client.query(`
            SELECT uc.id,
                   uc.consented_at,
                   uc.is_withdrawn,
                   uc.withdrawn_at,
                   uc.consent_method,
                   cr.version,
                   cr.title
            FROM user_consents uc
                     JOIN consent_revisions cr ON uc.consent_revision_id = cr.id
            WHERE uc.user_id = $1::integer
            ORDER BY uc.consented_at DESC
        `, [userId]);

        return result.rows;
    } catch (error) {
        db.handleQueryError(error, 'getUserConsentHistory');
    } finally {
        client.release();
    }
};

/**
 * Create a new consent revision
 * @param {string} version - Version identifier
 * @param {string} title - Consent title
 * @param {string} content - Consent content
 * @param {string} privacyPolicyUrl - Privacy policy URL (optional)
 * @param {string} termsUrl - Terms of service URL (optional)
 * @param {Date} expiresAt - Expiration date (optional)
 * @returns {Promise<Object>} Created consent revision
 */
const createConsentRevision = async (version, title, content, privacyPolicyUrl = null, termsUrl = null, expiresAt = null) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Deactivate previous active revisions
        await client.query('UPDATE consent_revisions SET is_active = false WHERE is_active = true');

        const result = await client.query(`
            INSERT INTO consent_revisions (version, title, content, privacy_policy_url, terms_url, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, version, title, content, privacy_policy_url, terms_url, created_at, expires_at, is_active
        `, [version, title, content, privacyPolicyUrl, termsUrl, expiresAt]);

        await client.query('COMMIT');
        logger.info(`New consent revision created: ${version}`);
        return result.rows[0];
    } catch (error) {
        await client.query('ROLLBACK');
        db.handleQueryError(error, 'createConsentRevision');
    } finally {
        client.release();
    }
};

module.exports = {
    getActiveConsentRevision,
    hasValidConsent,
    hasLatestConsent,
    recordConsent,
    withdrawConsent,
    getUserConsentHistory,
    createConsentRevision
};
