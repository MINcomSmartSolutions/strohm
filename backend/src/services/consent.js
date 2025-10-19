/**
 * @file Service for handling user consent operations and consent revision management.
 *
 * This service provides a comprehensive API for managing user consent workflows including:
 * - Active consent revision retrieval and management
 * - User consent validation and verification
 * - Consent recording with audit trail capabilities
 * - Consent withdrawal and history tracking
 * - Consent revision lifecycle management
 *
 * **ARCHITECTURAL NOTE**: This service uses direct database connection pooling
 * instead of the centralized `db.[query]` mechanism used throughout the rest of
 * the server. While most services utilize the unified queries.js pattern with
 * centralized database operations, this consent service implements its own
 * database queries for specialized consent management requirements.
 *
 * This approach provides:
 * - Enhanced audit trail capabilities for compliance
 * - Specialized transaction handling for consent operations
 * - Fine-grained control over consent-related database operations
 * - Better separation of concerns for GDPR/privacy compliance features
 *
 * @module services/consent
 * @requires services/db_conn Database connection pool
 * @requires services/logger Application logger
 * @requires utils/queries Centralized query utilities (for error handling)
 */

const pool = require('./db_conn');
const logger = require('./logger');
const {db} = require('#utils/queries');


/**
 * Retrieves the currently active consent revision from the database.
 *
 * An active consent revision is one that is marked as active and has not expired.
 * This function is used throughout the consent workflow to ensure users are
 * presented with the most current terms and conditions.
 *
 * @async
 * @function getActiveConsentRevision
 * @returns {Promise<db_consent_revision|null>} The active consent revision object or null if none exists
 *
 * @throws {Error} Database connection or query errors (handled via db.handleQueryError)
 *
 * @description
 * Query Logic:
 * 1. Filters for revisions marked as active (is_active = true)
 * 2. Excludes expired revisions (expires_at IS NULL OR expires_at > NOW())
 * 3. Orders by creation date descending to get the most recent
 * 4. Limits to 1 result for performance
 *
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
                   expires_at,
                   effective_from,
                   updated_at
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
 * Checks if a user has valid consent for the current active consent revision.
 *
 * This function verifies that a user has provided consent that is currently
 * valid, not withdrawn, and matches an active consent revision.
 *
 * @async
 * @function hasValidConsent
 * @param {number} userId - Unique identifier for the user
 * @returns {Promise<boolean>} True if user has valid consent, false otherwise
 *
 * @throws {Error} Database connection or query errors (handled via db.handleQueryError)
 *
 * @description
 * Validation Criteria:
 * 1. User has a consent record (user_consents table)
 * 2. Consent is linked to an active revision (is_active = true)
 * 3. Consent has not been withdrawn (is_withdrawn = false)
 * 4. Consent revision has not expired (expires_at IS NULL OR expires_at > NOW())
 *
 * **Note**: This function checks for ANY valid consent, not necessarily the latest.
 * For ensuring users have the most recent consent, use `hasLatestConsent()` instead.
 *
 * @see {@link hasLatestConsent} For checking consent to the most recent revision
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
 * Checks if a user has consented to the latest active significant consent revision.
 *
 * This function ensures users have agreed to the most recent mandatory terms and
 * conditions. It specifically checks for non-optional consent revisions to ensure
 * compliance with the latest requirements.
 *
 * @async
 * @function hasLatestConsent
 * @param {number} userId - Unique identifier for the user
 * @returns {Promise<boolean>} True if user has consented to the latest revision, false otherwise
 *
 * @throws {Error} Database connection or query errors (handled via db.handleQueryError)
 *
 * @description
 * Validation Process:
 * 1. **Latest Revision Lookup**: Finds the most recent active, non-optional consent revision
 * 2. **Consent Verification**: Checks if user has specifically consented to this revision
 * 3. **Withdrawal Check**: Ensures the consent has not been withdrawn
 *
 * Filtering Criteria for Latest Revision:
 * - is_active = true (currently active)
 * - expires_at IS NULL OR expires_at > NOW() (not expired)
 * - optional = false (mandatory consent only)
 * - ORDER BY created_at DESC (most recent first)
 *
 * @see {@link hasValidConsent} For checking any valid consent (not necessarily latest)
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
 * Records a user's consent decision with comprehensive audit trail information.
 *
 * This function creates a permanent record of user consent including metadata
 * for compliance and audit purposes. All consent records are immutable once
 * created to maintain legal audit trail integrity.
 *
 * @async
 * @function recordConsent
 * @param {number} userId - Unique identifier for the user providing consent
 * @param {number} consentRevisionId - ID of the consent revision being accepted
 * @param {string} ipAddress - IP address of the user when consent was given
 * @param {string} userAgent - Browser user agent string for device identification
 * @param {string} [consentMethod='web_form'] - Method used to collect consent
 * @returns {Promise<db_user_consent>} The created consent record with audit information
 * @throws {Error} Database connection or query errors (handled via db.handleQueryError)
 *
 * @description
 * Audit Trail Features:
 * - **Immutable Records**: Consent records cannot be modified once created
 * - **IP Address Tracking**: Records user's IP for geographical compliance
 * - **Device Fingerprinting**: User agent helps identify consent device
 * - **Method Tracking**: Records how consent was collected (web_form, api, etc.)
 * - **Timestamp Precision**: Exact time of consent for legal requirements
 * - **Transaction Safety**: Uses database transactions for data integrity
 *
 * @legal
 * **Legal Compliance**: This function is designed to meet GDPR Article 7
 * requirements for demonstrating consent. All recorded data serves as
 * evidence that consent was freely given, specific, informed, and unambiguous.
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
 * Withdraws a user's consent by marking all active consent records as withdrawn.
 *
 * This function implements the "right to withdraw consent" as required by GDPR
 * Article 7(3). It preserves the original consent records for audit purposes
 * while marking them as withdrawn with a timestamp.
 *
 * @async
 * @function withdrawConsent
 * @param {number} userId - Unique identifier for the user withdrawing consent
 * @returns {Promise<boolean>} True if consent was withdrawn, false if no active consent found
 *
 * @throws {Error} Database connection or query errors (handled via db.handleQueryError)
 *
 * @description
 * Withdrawal Process:
 * 1. **Transaction Safety**: Uses database transaction for atomic operations
 * 2. **Batch Update**: Updates all non-withdrawn consent records for the user
 * 3. **Timestamp Recording**: Records exact time of withdrawal
 * 4. **Audit Preservation**: Original consent records remain unchanged for compliance
 * 5. **Return Indication**: Returns boolean indicating if any records were updated
 *
 * **IMPORTANT**: This function does not delete consent records. It only marks
 * them as withdrawn while preserving the original consent data for legal and
 * audit purposes. This approach ensures compliance with data protection
 * regulations that require maintaining proof of both consent and withdrawal.
 *
 * @legal
 * **GDPR Compliance**: Implements Article 7(3) requirement that withdrawal
 * must be as easy as giving consent. The function preserves audit trails
 * while honoring the user's right to withdraw consent at any time.
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
 * Retrieves the complete consent history for a user including withdrawals.
 *
 * This function provides a comprehensive audit trail of all consent actions
 * taken by a user, including both consent grants and withdrawals. Essential
 * for compliance reporting and user privacy management.
 *
 * @async
 * @function getUserConsentHistory
 * @param {number} userId - Unique identifier for the user
 * @returns {Promise<Array<db_user_consent>>} Array of consent history records ordered by date (newest first)
 * @returns {number} id - Unique identifier for the consent record
 * @returns {Date} consented_at - When consent was originally given
 * @returns {boolean} is_withdrawn - Whether this consent has been withdrawn
 * @returns {Date|null} withdrawn_at - When consent was withdrawn (null if not withdrawn)
 * @returns {string} consent_method - Method used to collect consent
 * @returns {string} version - Version of the consent revision
 * @returns {string} title - Title of the consent revision
 *
 * @throws {Error} Database connection or query errors (handled via db.handleQueryError)
 *
 * @description
 * History Data Includes:
 * - **Chronological Order**: Most recent consent actions first
 * - **Version Tracking**: Which consent version was accepted
 * - **Withdrawal Status**: Clear indication of current consent state
 * - **Method Attribution**: How each consent was collected
 * - **Complete Timeline**: Full audit trail for compliance reporting
 *
 * @compliance
 * **Audit Trail**: This function supports GDPR Article 5(2) accountability
 * principle by providing complete documentation of consent lifecycle events.
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
 * Creates a new consent revision and manages the activation lifecycle.
 *
 * This function creates new consent revisions while properly managing the
 * activation state of existing revisions. Only one consent revision can be
 * active at a time to ensure consistency across the application.
 *
 * @async
 * @function createConsentRevision
 * @param {string} version - Version identifier for the new revision (e.g., "2.1.0")
 * @param {string} title - Human-readable title for the consent
 * @param {string} content - Full consent text content (supports HTML)
 * @param {string|null} [privacyPolicyUrl=null] - URL to privacy policy document
 * @param {string|null} [termsUrl=null] - URL to terms of service document
 * @param {Date|null} [expiresAt=null] - Optional expiration date for the revision
 * @param {boolean} [optional=false] - Whether this revision is optional (default false)
 * @returns {Promise<db_consent_revision>} The created consent revision record
 *
 * @throws {Error} Database connection or query errors (handled via db.handleQueryError)
 *
 * @description
 * Creation Process:
 * 1. **Transaction Start**: Begins database transaction for atomicity
 * 2. **Deactivation**: Sets all existing active revisions to inactive
 * 3. **Creation**: Creates new revision with is_active = true
 * 4. **Transaction Commit**: Ensures atomic activation switch
 *
 * **IMPORTANT**: This function automatically deactivates all existing active
 * consent revisions before creating the new one. This ensures only one consent
 * revision is active at any given time, maintaining consistency for user consent
 * validation throughout the application.
 *
 */
const createConsentRevision = async (version, title, content, privacyPolicyUrl = null, termsUrl = null, expiresAt = null, optional = false) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Deactivate previous active revisions
        await client.query('UPDATE consent_revisions SET is_active = false WHERE is_active = true');

        const result = await client.query(`
            INSERT INTO consent_revisions (version, title, content, privacy_policy_url, terms_url, expires_at, optional)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id, version, title, content, privacy_policy_url, terms_url, created_at, expires_at, is_active, optional, effective_from, updated_at
        `, [version, title, content, privacyPolicyUrl, termsUrl, expiresAt, optional]);

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
