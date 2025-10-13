## Modules

<dl>
<dt><a href="#module_controllers/auth">controllers/auth</a></dt>
<dd><p>Controller for handling user authentication and logout.</p>
</dd>
<dt><a href="#module_controllers/consent">controllers/consent</a></dt>
<dd><p>Controller for handling user consent pages and operations.</p>
<p>This controller manages the complete consent workflow including:</p>
<ul>
<li>Displaying consent forms to users</li>
<li>Processing consent submissions</li>
<li>Handling consent withdrawals</li>
<li>Validating user authentication and OIDC properties</li>
</ul>
<p><strong>ARCHITECTURAL INTEGRATION</strong>: This controller heavily relies on the consent service
which implements direct database queries instead of the standard <code>db.[query]</code> pattern
used throughout the rest of the application. The consent service provides specialized
transaction handling and enhanced audit capabilities required for GDPR compliance.</p>
<p><strong>SERVICE DEPENDENCIES</strong>: The controller uses several key functions from the consent
service that bypass the centralized queries.js mechanism:</p>
<ul>
<li><code>getActiveConsentRevision()</code> - Direct database query for active consent</li>
<li><code>recordConsent()</code> - Specialized audit trail recording with transactions</li>
<li><code>withdrawConsent()</code> - GDPR-compliant consent withdrawal with preservation</li>
<li><code>hasLatestConsent()</code> - Optimized consent validation queries</li>
</ul>
</dd>
<dt><a href="#module_controllers/odoo">controllers/odoo</a></dt>
<dd><p>Controller for handling Odoo internal user sync webhooks.</p>
</dd>
<dt><a href="#module_helpers/notifications">helpers/notifications</a></dt>
<dd><p>Helper utilities for flash notifications</p>
</dd>
<dt><a href="#module_middlewares/consent">middlewares/consent</a></dt>
<dd><p>Middleware for checking user consent status and enforcing consent requirements.</p>
<p>This middleware ensures that authenticated users have provided valid consent
before accessing protected routes. It handles consent validation, user session
management, and automatic redirection to consent pages when needed.</p>
<p>The middleware integrates with OIDC authentication and maintains an audit
trail of consent decisions while providing flexible route exclusions.</p>
<p><strong>ARCHITECTURAL INTEGRATION</strong>: This middleware leverages the consent service
which uses direct database connections instead of the standard <code>db.[query]</code>
pattern used elsewhere in the application. This design choice provides
enhanced audit capabilities and specialized transaction handling for
GDPR compliance requirements.</p>
</dd>
<dt><a href="#module_services/consent">services/consent</a></dt>
<dd><p>Service for handling user consent operations and consent revision management.</p>
<p>This service provides a comprehensive API for managing user consent workflows including:</p>
<ul>
<li>Active consent revision retrieval and management</li>
<li>User consent validation and verification</li>
<li>Consent recording with audit trail capabilities</li>
<li>Consent withdrawal and history tracking</li>
<li>Consent revision lifecycle management</li>
</ul>
<p><strong>ARCHITECTURAL NOTE</strong>: This service uses direct database connection pooling
instead of the centralized <code>db.[query]</code> mechanism used throughout the rest of
the server. While most services utilize the unified queries.js pattern with
centralized database operations, this consent service implements its own
database queries for specialized consent management requirements.</p>
<p>This approach provides:</p>
<ul>
<li>Enhanced audit trail capabilities for compliance</li>
<li>Specialized transaction handling for consent operations</li>
<li>Fine-grained control over consent-related database operations</li>
<li>Better separation of concerns for GDPR/privacy compliance features</li>
</ul>
</dd>
<dt><a href="#module_services/cron">services/cron</a></dt>
<dd><p>Cron job service for periodic transaction fetching.</p>
<ul>
<li>Schedules a job to run every 20 second.</li>
<li>Calls runIncremental to fetch new transactions.</li>
<li>Logs the result after each execution.</li>
</ul>
</dd>
<dt><a href="#module_services/logger">services/logger</a> : <code>winston</code></dt>
<dd><p>Logger service using winston with file rotation and enhanced console output</p>
</dd>
<dt><a href="#module_services/network">services/network</a></dt>
<dd><p>Network service module for external API clients.</p>
<ul>
<li>Exports pre-configured Axios instances for Odoo and SteVe APIs.</li>
<li>Tests connections to SteVe and Odoo on module load.</li>
</ul>
</dd>
<dt><a href="#module_services/odoo">services/odoo</a></dt>
<dd><p>Odoo Integration Service</p>
<p>It is responsible for user creation, login, key rotation, and invoicing with Odoo via REST API.</p>
</dd>
<dt><a href="#module_services/steve_transactions">services/steve_transactions</a></dt>
<dd><p>SteVe Transactions Service</p>
<p>Incremental fetch of all transactions since last high‑water mark (T0).
Records all transactions in database, but only bills permanently stopped ones.
High‑Water Mark Concept:
We persist the timestamp of the latest processed transaction (the &quot;high‑water mark&quot; or T0).
On each run, we only fetch transactions whose stopTimestamp is strictly greater than T0.
After processing, we update T0 to the maximum stopTimestamp seen. This ensures:
  • No overlap or reprocessing of already handled transactions.
  • No gaps: even if a transaction ends just after T0, it will be fetched next run.
  • Linear, efficient incremental retrieval without maintaining complex windows.</p>
<p>Steve API docs: Steve <a href="http://instance:port/steve/manager/swagger-ui/swagger-ui/index.html">http://instance:port/steve/manager/swagger-ui/swagger-ui/index.html</a></p>
</dd>
<dt><a href="#module_services/steve_user">services/steve_user</a></dt>
<dd><p>SteVe User Service</p>
<p>Provides functions to create, fetch, block, and unblock users in the SteVe OCPP backend.</p>
<ul>
<li>createSteveUser: Creates a new user in SteVe with the given RFID.</li>
<li>getSteveUser: Fetches a user from SteVe by RFID.</li>
<li>blockSteveUser: Blocks a user in SteVe (sets maxActiveTransactionCount to 0).</li>
<li>unblockSteveUser: Unblocks a user in SteVe (sets maxActiveTransactionCount to 1).</li>
</ul>
<p>All functions validate input and handle errors using custom error types.</p>
</dd>
<dt><a href="#module_services/user_operations">services/user_operations</a></dt>
<dd><p>Service for checking overall user integrity and creating users with proper links to external systems.</p>
</dd>
<dt><a href="#module_utils/oidc_config">utils/oidc_config</a></dt>
<dd><p>OIDC configuration for authentication middleware.</p>
<ul>
<li>Uses environment variables for secrets and endpoints.</li>
<li>Customizes authorization parameters and routes.</li>
</ul>
</dd>
<dt><a href="#module_utils/queries">utils/queries</a></dt>
<dd><p>Global database queries</p>
</dd>
<dt><a href="#module_utils/steve">utils/steve</a></dt>
<dd><p>Utility functions for Steve user data.</p>
</dd>
<dt><a href="#module_utils/typedef">utils/typedef</a></dt>
<dd><p>Type definitions</p>
</dd>
<dt><a href="#module_app">app</a></dt>
<dd><p>Express app instance.</p>
</dd>
</dl>

## Classes

<dl>
<dt><a href="#SCIMUserHandler">SCIMUserHandler</a></dt>
<dd><p>SCIM User Resource Handler
Handles CRUD operations for users via SCIM protocol</p>
</dd>
<dt><a href="#AppError">AppError</a></dt>
<dd><p>Base class for custom application errors</p>
</dd>
</dl>

## Objects

<dl>
<dt><a href="#config">config</a> : <code>object</code></dt>
<dd><p>Configuration settings for SteVe and Odoo integrations</p>
</dd>
</dl>

## Constants

<dl>
<dt><a href="#logger">logger</a></dt>
<dd><p>Application Error Codes</p>
<p>This module defines standardized error codes and messages for the application.
Errors are grouped by category and include codes, HTTP status codes, and messages.</p>
</dd>
</dl>

## Functions

<dl>
<dt><a href="#validateSCIMResource">validateSCIMResource(resource, schema, operation)</a></dt>
<dd><p>Validate SCIM resource using Joi and throw appropriate errors</p>
</dd>
<dt><a href="#scimErrorHandler">scimErrorHandler()</a></dt>
<dd><p>SCIM Error Handler Middleware</p>
</dd>
<dt><a href="#generateOdooHash">generateOdooHash(message, secret)</a> ⇒ <code>string</code></dt>
<dd><p>Generate HMAC signature matching Odoo implementation</p>
</dd>
<dt><a href="#generateSalt">generateSalt(length)</a> ⇒ <code>string</code></dt>
<dd><p>Generate a cryptographically secure random salt</p>
</dd>
<dt><a href="#validateOIDCProperties">validateOIDCProperties(req)</a> ⇒ <code>boolean</code></dt>
<dd><p>Validates that the OIDC authentication, most of the checks are done by the OIDC library, but we add some little extra checks.</p>
</dd>
<dt><a href="#identifyUser">identifyUser(identifier, options)</a> ⇒ <code>Promise.&lt;Object&gt;</code></dt>
<dd><p>Gets a user by either user_id or oauth_id</p>
</dd>
<dt><a href="#scimAuth">scimAuth(req, res, next)</a></dt>
<dd><p>SCIM HTTP Basic Authentication Middleware
Implements HTTP Basic authentication for SCIM endpoints as specified in RFC 7617</p>
</dd>
<dt><a href="#fmt">fmt(dt, toUTC)</a> ⇒ <code>string</code></dt>
<dd><p>Format a Luxon DateTime into format of ISO_NO_ZONE (e.g. 2025-08-25T14:30:00)</p>
</dd>
<dt><a href="#createError">createError(errorDef, [customMessage], [originalError])</a> ⇒ <code>Object</code></dt>
<dd><p>Create an application error with standard format</p>
</dd>
<dt><a href="#appErrorHandler">appErrorHandler()</a></dt>
<dd><p>Express error handler for AppErrors</p>
</dd>
</dl>

<a name="module_controllers/auth"></a>

## controllers/auth
Controller for handling user authentication and logout.

<a name="module_controllers/consent"></a>

## controllers/consent
Controller for handling user consent pages and operations.

This controller manages the complete consent workflow including:
- Displaying consent forms to users
- Processing consent submissions
- Handling consent withdrawals
- Validating user authentication and OIDC properties

**ARCHITECTURAL INTEGRATION**: This controller heavily relies on the consent service
which implements direct database queries instead of the standard `db.[query]` pattern
used throughout the rest of the application. The consent service provides specialized
transaction handling and enhanced audit capabilities required for GDPR compliance.

**SERVICE DEPENDENCIES**: The controller uses several key functions from the consent
service that bypass the centralized queries.js mechanism:
- `getActiveConsentRevision()` - Direct database query for active consent
- `recordConsent()` - Specialized audit trail recording with transactions
- `withdrawConsent()` - GDPR-compliant consent withdrawal with preservation
- `hasLatestConsent()` - Optimized consent validation queries

**See**

- [services/consent](#module_services/consent) For underlying consent operations
- [middlewares/consent](#module_middlewares/consent) For consent enforcement middleware

<a name="module_controllers/odoo"></a>

## controllers/odoo
Controller for handling Odoo internal user sync webhooks.

<a name="module_helpers/notifications"></a>

## helpers/notifications
Helper utilities for flash notifications


* [helpers/notifications](#module_helpers/notifications)
    * [~validateNotificationType(type)](#module_helpers/notifications..validateNotificationType) ⇒ <code>string</code>
    * [~isUrlSafe(url)](#module_helpers/notifications..isUrlSafe) ⇒ <code>boolean</code>
    * [~sanitizeMessage(message)](#module_helpers/notifications..sanitizeMessage) ⇒ <code>string</code>
    * [~setFlashMessage(req, message, type, title)](#module_helpers/notifications..setFlashMessage)
    * [~getFlashMessage(req)](#module_helpers/notifications..getFlashMessage) ⇒ <code>Object</code> \| <code>null</code>
    * [~redirectWithNotification(res, url, message, type, title)](#module_helpers/notifications..redirectWithNotification)

<a name="module_helpers/notifications..validateNotificationType"></a>

### helpers/notifications~validateNotificationType(type) ⇒ <code>string</code>
Validates notification type

**Kind**: inner method of [<code>helpers/notifications</code>](#module_helpers/notifications)  
**Returns**: <code>string</code> - - Valid type or default 'info'  
<a name="module_helpers/notifications..isUrlSafe"></a>

### helpers/notifications~isUrlSafe(url) ⇒ <code>boolean</code>
Validates URL to prevent open redirect vulnerabilities

**Kind**: inner method of [<code>helpers/notifications</code>](#module_helpers/notifications)  
**Returns**: <code>boolean</code> - - True if URL is safe  
<a name="module_helpers/notifications..sanitizeMessage"></a>

### helpers/notifications~sanitizeMessage(message) ⇒ <code>string</code>
Sanitizes message to prevent injection attacks

**Kind**: inner method of [<code>helpers/notifications</code>](#module_helpers/notifications)  
**Returns**: <code>string</code> - - Sanitized message  
<a name="module_helpers/notifications..setFlashMessage"></a>

### helpers/notifications~setFlashMessage(req, message, type, title)
Sets a flash message in the session that will be displayed on the next page

**Kind**: inner method of [<code>helpers/notifications</code>](#module_helpers/notifications)  
<a name="module_helpers/notifications..getFlashMessage"></a>

### helpers/notifications~getFlashMessage(req) ⇒ <code>Object</code> \| <code>null</code>
Gets and clears the flash message from session

**Kind**: inner method of [<code>helpers/notifications</code>](#module_helpers/notifications)  
**Returns**: <code>Object</code> \| <code>null</code> - Flash message object or null  
<a name="module_helpers/notifications..redirectWithNotification"></a>

### helpers/notifications~redirectWithNotification(res, url, message, type, title)
Redirects to a URL with notification parameters

**Kind**: inner method of [<code>helpers/notifications</code>](#module_helpers/notifications)  
**Throws**:

- <code>Error</code> If URL is not safe (prevents open redirect)

<a name="module_middlewares/consent"></a>

## middlewares/consent
Middleware for checking user consent status and enforcing consent requirements.

This middleware ensures that authenticated users have provided valid consent
before accessing protected routes. It handles consent validation, user session
management, and automatic redirection to consent pages when needed.

The middleware integrates with OIDC authentication and maintains an audit
trail of consent decisions while providing flexible route exclusions.

**ARCHITECTURAL INTEGRATION**: This middleware leverages the consent service
which uses direct database connections instead of the standard `db.[query]`
pattern used elsewhere in the application. This design choice provides
enhanced audit capabilities and specialized transaction handling for
GDPR compliance requirements.

**See**

- [services/consent](#module_services/consent) For underlying consent operations
- [controllers/consent](#module_controllers/consent) For consent page handling

<a name="module_middlewares/consent..requireConsent"></a>

### middlewares/consent~requireConsent(req, res, next) ⇒ <code>void</code>
Middleware Flow:
1. **Route Filtering**: Checks if current route should skip consent validation
   - Skipped routes: /consent, /logout, /health, /welcome, /login, /callback, /scim, /assets, /favicon
2. **Consent Revision Check**: Uses `getActiveConsentRevision()` to verify system has active consent
   - If no active revision exists, allows access without consent check
3. **OIDC Validation**: Validates OIDC authentication properties via `validateOIDCProperties()`
   - Redirects to /logout if validation fails
4. **User Resolution**: Queries database directly using `db.getUserUnique()` (standard pattern)
   - Updates session with user data if user exists via `userOperations()`
5. **Session Management**: Ensures authenticated users have proper session state
6. **Consent Validation**: Uses `hasLatestConsent()` to check current consent status
   - Redirects to /consent page if consent is missing or outdated
7. **Access Control**: Allows or denies access based on consent status

**Kind**: inner method of [<code>middlewares/consent</code>](#module_middlewares/consent)  
**Returns**: <code>void</code> - Calls next() to continue middleware chain or redirects user  
**Throws**:

- <code>Error</code> Logs errors but does not throw to prevent application blocking

**Security**: Security Considerations:
- Always validates OIDC properties before proceeding
- Gracefully handles errors to prevent application blocking
- Maintains session integrity during user operations
- Enforces consent requirements for data protection compliance
- Provides audit trail through comprehensive logging
- Integrates with consent service's specialized audit capabilities  
**Performance**: Performance Notes:
- Efficient route filtering prevents unnecessary database calls
- Caches user data in session to reduce database queries
- Fails gracefully without blocking application flow
- Minimal overhead for skipped routes
- Leverages consent service's optimized consent checking queries  
**See**

- [module:services/consent.getActiveConsentRevision](module:services/consent.getActiveConsentRevision) For active consent retrieval
- [module:services/consent.hasLatestConsent](module:services/consent.hasLatestConsent) For consent validation logic

<a name="module_services/consent"></a>

## services/consent
Service for handling user consent operations and consent revision management.

This service provides a comprehensive API for managing user consent workflows including:
- Active consent revision retrieval and management
- User consent validation and verification
- Consent recording with audit trail capabilities
- Consent withdrawal and history tracking
- Consent revision lifecycle management

**ARCHITECTURAL NOTE**: This service uses direct database connection pooling
instead of the centralized `db.[query]` mechanism used throughout the rest of
the server. While most services utilize the unified queries.js pattern with
centralized database operations, this consent service implements its own
database queries for specialized consent management requirements.

This approach provides:
- Enhanced audit trail capabilities for compliance
- Specialized transaction handling for consent operations
- Fine-grained control over consent-related database operations
- Better separation of concerns for GDPR/privacy compliance features

**Requires**: <code>module:services/db\_conn</code>, [<code>services/logger</code>](#module_services/logger), [<code>utils/queries</code>](#module_utils/queries)  

* [services/consent](#module_services/consent)
    * [~getActiveConsentRevision()](#module_services/consent..getActiveConsentRevision) ⇒ <code>Promise.&lt;(db\_consent\_revision\|null)&gt;</code>
    * [~hasValidConsent(userId)](#module_services/consent..hasValidConsent) ⇒ <code>Promise.&lt;boolean&gt;</code>
    * [~hasLatestConsent(userId)](#module_services/consent..hasLatestConsent) ⇒ <code>Promise.&lt;boolean&gt;</code>
    * [~recordConsent(userId, consentRevisionId, ipAddress, userAgent, [consentMethod])](#module_services/consent..recordConsent) ⇒ <code>Promise.&lt;Object&gt;</code> \| <code>number</code> \| <code>number</code> \| <code>number</code> \| <code>Date</code> \| <code>string</code> \| <code>string</code> \| <code>string</code>
    * [~withdrawConsent(userId)](#module_services/consent..withdrawConsent) ⇒ <code>Promise.&lt;boolean&gt;</code>
    * [~getUserConsentHistory(userId)](#module_services/consent..getUserConsentHistory) ⇒ <code>Promise.&lt;Array.&lt;Object&gt;&gt;</code> \| <code>number</code> \| <code>Date</code> \| <code>boolean</code> \| <code>Date</code> \| <code>null</code> \| <code>string</code> \| <code>string</code> \| <code>string</code>
    * [~createConsentRevision(version, title, content, [privacyPolicyUrl], [termsUrl], [expiresAt], [optional])](#module_services/consent..createConsentRevision) ⇒ <code>Promise.&lt;Object&gt;</code> \| <code>number</code> \| <code>string</code> \| <code>string</code> \| <code>string</code> \| <code>string</code> \| <code>null</code> \| <code>string</code> \| <code>null</code> \| <code>Date</code> \| <code>Date</code> \| <code>null</code> \| <code>boolean</code>

<a name="module_services/consent..getActiveConsentRevision"></a>

### services/consent~getActiveConsentRevision() ⇒ <code>Promise.&lt;(db\_consent\_revision\|null)&gt;</code>
Query Logic:
1. Filters for revisions marked as active (is_active = true)
2. Excludes expired revisions (expires_at IS NULL OR expires_at > NOW())
3. Orders by creation date descending to get the most recent
4. Limits to 1 result for performance

**Kind**: inner method of [<code>services/consent</code>](#module_services/consent)  
**Returns**: <code>Promise.&lt;(db\_consent\_revision\|null)&gt;</code> - The active consent revision object or null if none exists  
**Throws**:

- <code>Error</code> Database connection or query errors (handled via db.handleQueryError)

<a name="module_services/consent..hasValidConsent"></a>

### services/consent~hasValidConsent(userId) ⇒ <code>Promise.&lt;boolean&gt;</code>
Validation Criteria:
1. User has a consent record (user_consents table)
2. Consent is linked to an active revision (is_active = true)
3. Consent has not been withdrawn (is_withdrawn = false)
4. Consent revision has not expired (expires_at IS NULL OR expires_at > NOW())

**Note**: This function checks for ANY valid consent, not necessarily the latest.
For ensuring users have the most recent consent, use `hasLatestConsent()` instead.

**Kind**: inner method of [<code>services/consent</code>](#module_services/consent)  
**Returns**: <code>Promise.&lt;boolean&gt;</code> - True if user has valid consent, false otherwise  
**Throws**:

- <code>Error</code> Database connection or query errors (handled via db.handleQueryError)

**See**: [hasLatestConsent](hasLatestConsent) For checking consent to the most recent revision  
**Example**  
```js
const isValid = await hasValidConsent(123);
if (isValid) {
  console.log('User has valid consent');
} else {
  console.log('User needs to provide consent');
}
```
<a name="module_services/consent..hasLatestConsent"></a>

### services/consent~hasLatestConsent(userId) ⇒ <code>Promise.&lt;boolean&gt;</code>
Validation Process:
1. **Latest Revision Lookup**: Finds the most recent active, non-optional consent revision
2. **Consent Verification**: Checks if user has specifically consented to this revision
3. **Withdrawal Check**: Ensures the consent has not been withdrawn

Filtering Criteria for Latest Revision:
- is_active = true (currently active)
- expires_at IS NULL OR expires_at > NOW() (not expired)
- optional = false (mandatory consent only)
- ORDER BY created_at DESC (most recent first)

**Kind**: inner method of [<code>services/consent</code>](#module_services/consent)  
**Returns**: <code>Promise.&lt;boolean&gt;</code> - True if user has consented to the latest revision, false otherwise  
**Throws**:

- <code>Error</code> Database connection or query errors (handled via db.handleQueryError)

**See**: [hasValidConsent](hasValidConsent) For checking any valid consent (not necessarily latest)  
<a name="module_services/consent..recordConsent"></a>

### services/consent~recordConsent(userId, consentRevisionId, ipAddress, userAgent, [consentMethod]) ⇒ <code>Promise.&lt;Object&gt;</code> \| <code>number</code> \| <code>number</code> \| <code>number</code> \| <code>Date</code> \| <code>string</code> \| <code>string</code> \| <code>string</code>
Audit Trail Features:
- **Immutable Records**: Consent records cannot be modified once created
- **IP Address Tracking**: Records user's IP for geographical compliance
- **Device Fingerprinting**: User agent helps identify consent device
- **Method Tracking**: Records how consent was collected (web_form, api, etc.)
- **Timestamp Precision**: Exact time of consent for legal requirements
- **Transaction Safety**: Uses database transactions for data integrity

Supported Consent Methods:
- 'web_form' (default) - HTML form submission
- 'api' - Direct API call
- 'import' - Bulk import from external system
- 'admin' - Administrative action

**Kind**: inner method of [<code>services/consent</code>](#module_services/consent)  
**Returns**: <code>Promise.&lt;Object&gt;</code> - The created consent record with audit information<code>number</code> - .id - Unique identifier for the consent record<code>number</code> - .user_id - User who provided consent<code>number</code> - . consent_revision_id - Consent revision that was accepted<code>Date</code> - .consented_at - Timestamp when consent was provided<code>string</code> - .ip_address - IP address recorded for audit trail<code>string</code> - .user_agent - User agent recorded for audit trail<code>string</code> - .consent_method - Method used to collect consent  
**Throws**:

- <code>Error</code> Database connection or query errors (handled via db.handleQueryError)

**Legal**: **Legal Compliance**: This function is designed to meet GDPR Article 7
requirements for demonstrating consent. All recorded data serves as
evidence that consent was freely given, specific, informed, and unambiguous.  
<a name="module_services/consent..withdrawConsent"></a>

### services/consent~withdrawConsent(userId) ⇒ <code>Promise.&lt;boolean&gt;</code>
Withdrawal Process:
1. **Transaction Safety**: Uses database transaction for atomic operations
2. **Batch Update**: Updates all non-withdrawn consent records for the user
3. **Timestamp Recording**: Records exact time of withdrawal
4. **Audit Preservation**: Original consent records remain unchanged for compliance
5. **Return Indication**: Returns boolean indicating if any records were updated

**IMPORTANT**: This function does not delete consent records. It only marks
them as withdrawn while preserving the original consent data for legal and
audit purposes. This approach ensures compliance with data protection
regulations that require maintaining proof of both consent and withdrawal.

**Kind**: inner method of [<code>services/consent</code>](#module_services/consent)  
**Returns**: <code>Promise.&lt;boolean&gt;</code> - True if consent was withdrawn, false if no active consent found  
**Throws**:

- <code>Error</code> Database connection or query errors (handled via db.handleQueryError)

**Legal**: **GDPR Compliance**: Implements Article 7(3) requirement that withdrawal
must be as easy as giving consent. The function preserves audit trails
while honoring the user's right to withdraw consent at any time.  
<a name="module_services/consent..getUserConsentHistory"></a>

### services/consent~getUserConsentHistory(userId) ⇒ <code>Promise.&lt;Array.&lt;Object&gt;&gt;</code> \| <code>number</code> \| <code>Date</code> \| <code>boolean</code> \| <code>Date</code> \| <code>null</code> \| <code>string</code> \| <code>string</code> \| <code>string</code>
History Data Includes:
- **Chronological Order**: Most recent consent actions first
- **Version Tracking**: Which consent version was accepted
- **Withdrawal Status**: Clear indication of current consent state
- **Method Attribution**: How each consent was collected
- **Complete Timeline**: Full audit trail for compliance reporting

**Kind**: inner method of [<code>services/consent</code>](#module_services/consent)  
**Returns**: <code>Promise.&lt;Array.&lt;Object&gt;&gt;</code> - Array of consent history records ordered by date (newest first)<code>number</code> - id - Unique identifier for the consent record<code>Date</code> - consented_at - When consent was originally given<code>boolean</code> - is_withdrawn - Whether this consent has been withdrawn<code>Date</code> \| <code>null</code> - withdrawn_at - When consent was withdrawn (null if not withdrawn)<code>string</code> - consent_method - Method used to collect consent<code>string</code> - version - Version of the consent revision<code>string</code> - title - Title of the consent revision  
**Throws**:

- <code>Error</code> Database connection or query errors (handled via db.handleQueryError)

**Compliance**: **Audit Trail**: This function supports GDPR Article 5(2) accountability
principle by providing complete documentation of consent lifecycle events.  
<a name="module_services/consent..createConsentRevision"></a>

### services/consent~createConsentRevision(version, title, content, [privacyPolicyUrl], [termsUrl], [expiresAt], [optional]) ⇒ <code>Promise.&lt;Object&gt;</code> \| <code>number</code> \| <code>string</code> \| <code>string</code> \| <code>string</code> \| <code>string</code> \| <code>null</code> \| <code>string</code> \| <code>null</code> \| <code>Date</code> \| <code>Date</code> \| <code>null</code> \| <code>boolean</code>
Creation Process:
1. **Transaction Start**: Begins database transaction for atomicity
2. **Deactivation**: Sets all existing active revisions to inactive
3. **Creation**: Creates new revision with is_active = true
4. **Transaction Commit**: Ensures atomic activation switch

**IMPORTANT**: This function automatically deactivates all existing active
consent revisions before creating the new one. This ensures only one consent
revision is active at any given time, maintaining consistency for user consent
validation throughout the application.

**Kind**: inner method of [<code>services/consent</code>](#module_services/consent)  
**Returns**: <code>Promise.&lt;Object&gt;</code> - The created consent revision record<code>number</code> - .id - Unique identifier for the new revision<code>string</code> - .version - Version identifier<code>string</code> - .title - Consent title<code>string</code> - .content - Consent content<code>string</code> \| <code>null</code> - .privacy_policy_url - Privacy policy URL<code>string</code> \| <code>null</code> - .terms_url - Terms of service URL<code>Date</code> - .created_at - Creation timestamp<code>Date</code> \| <code>null</code> - .expires_at - Expiration timestamp<code>boolean</code> - .is_active - Always true for newly created revisions  
**Throws**:

- <code>Error</code> Database connection or query errors (handled via db.handleQueryError)

<a name="module_services/cron"></a>

## services/cron
Cron job service for periodic transaction fetching.

- Schedules a job to run every 20 second.
- Calls runIncremental to fetch new transactions.
- Logs the result after each execution.

<a name="module_services/logger"></a>

## services/logger : <code>winston</code>
Logger service using winston with file rotation and enhanced console output

<a name="module_services/network"></a>

## services/network
Network service module for external API clients.

- Exports pre-configured Axios instances for Odoo and SteVe APIs.
- Tests connections to SteVe and Odoo on module load.


* [services/network](#module_services/network)
    * [~odooAuthedAxios](#module_services/network..odooAuthedAxios) : <code>AxiosInstance</code>
    * [~odooPlainAxios](#module_services/network..odooPlainAxios) : <code>AxiosInstance</code>
    * [~steveAxios](#module_services/network..steveAxios)
    * [~createOdooAxios([includeAuth])](#module_services/network..createOdooAxios) ⇒ <code>AxiosInstance</code>

<a name="module_services/network..odooAuthedAxios"></a>

### services/network~odooAuthedAxios : <code>AxiosInstance</code>
An Axios instance for interacting with the Odoo API with authentication.

**Kind**: inner constant of [<code>services/network</code>](#module_services/network)  
<a name="module_services/network..odooPlainAxios"></a>

### services/network~odooPlainAxios : <code>AxiosInstance</code>
An Axios instance for interacting with the Odoo API without authentication.

**Kind**: inner constant of [<code>services/network</code>](#module_services/network)  
<a name="module_services/network..steveAxios"></a>

### services/network~steveAxios
Creates a pre-configured Axios instance for interacting with the SteVe API.

The configuration depends on the environment:
- In production, it uses an API key for authentication, which is passed as a custom header.
- In non-production environments, it uses basic authentication with a username and password.

**Kind**: inner constant of [<code>services/network</code>](#module_services/network)  
**Throws**:

- <code>SystemError</code> If required environment variables for authentication are not set.

<a name="module_services/network..createOdooAxios"></a>

### services/network~createOdooAxios([includeAuth]) ⇒ <code>AxiosInstance</code>
Creates a pre-configured Axios instance for interacting with the Odoo API.

**Kind**: inner method of [<code>services/network</code>](#module_services/network)  
**Returns**: <code>AxiosInstance</code> - A configured Axios instance for Odoo API requests.  
**Throws**:

- <code>SystemError</code> If `includeAuth` is true and the Odoo admin API key is not set in the environment variables.

<a name="module_services/odoo"></a>

## services/odoo
Odoo Integration Service

It is responsible for user creation, login, key rotation, and invoicing with Odoo via REST API.


* [services/odoo](#module_services/odoo)
    * [~createOdooUser(user)](#module_services/odoo..createOdooUser)
    * [~getOdooPortalLogin(user)](#module_services/odoo..getOdooPortalLogin) ⇒ <code>string</code>
    * [~rotateOdooUserAuth(user)](#module_services/odoo..rotateOdooUserAuth) ⇒ <code>Promise.&lt;Object&gt;</code>
    * [~createOdooTxnInvoice(db_txn)](#module_services/odoo..createOdooTxnInvoice) ⇒ <code>Promise.&lt;Number&gt;</code>
    * [~checkValidPaymentMethod(user)](#module_services/odoo..checkValidPaymentMethod) ⇒ <code>Promise.&lt;boolean&gt;</code>

<a name="module_services/odoo..createOdooUser"></a>

### services/odoo~createOdooUser(user)
Creates a new Odoo user.

- Throws if the user already has an Odoo user ID.
- Sends a POST request to Odoo to create the user.
- Verifies the response hash for integrity.
- Stores Odoo credentials in the database.
- Logs the creation activity.

**Kind**: inner method of [<code>services/odoo</code>](#module_services/odoo)  
**Throws**:

- <code>ValidationError</code><code>SystemError</code> On validation or Odoo errors.

<a name="module_services/odoo..getOdooPortalLogin"></a>

### services/odoo~getOdooPortalLogin(user) ⇒ <code>string</code>
Generates a secure Odoo portal login INTERNAL_BASE_URL for the given user.

- Validates the user object.
- Fetches Odoo credentials from the database.
- Constructs a login INTERNAL_BASE_URL with required query parameters for authentication.
- Throws if credentials are missing or invalid.

**Kind**: inner method of [<code>services/odoo</code>](#module_services/odoo)  
**Returns**: <code>string</code> - Odoo portal login INTERNAL_BASE_URL.  
**Throws**:

- <code>ValidationError</code> If user or credentials are invalid.

<a name="module_services/odoo..rotateOdooUserAuth"></a>

### services/odoo~rotateOdooUserAuth(user) ⇒ <code>Promise.&lt;Object&gt;</code>
Rotates the Odoo user API key for the given user.

- Validates the user object.
- Fetches current Odoo credentials from the database.
- Requests a new API key from Odoo and verifies the response hash.
- Updates the database with the new key and salt.
- Returns the updated Odoo credentials.

**Kind**: inner method of [<code>services/odoo</code>](#module_services/odoo)  
**Returns**: <code>Promise.&lt;Object&gt;</code> - Updated Odoo credentials.  
**Throws**:

- <code>ValidationError</code><code>SystemError</code> On validation or Odoo errors.

<a name="module_services/odoo..createOdooTxnInvoice"></a>

### services/odoo~createOdooTxnInvoice(db_txn) ⇒ <code>Promise.&lt;Number&gt;</code>
Creates a bill/invoice in Odoo for a given transaction.

Request payload to Odoo:
  session_start (datetime): Session start datetime in UTC.
  session_end (datetime): Session end datetime in UTC.
  partner_id (int): ID of the sale/customer (`res.partner`).
  lines_data (list[dict]): Invoice line data dict with the following fields:
    - name (str): Product name.
    - sku (str): Internal reference for product.
    - uom_name (str): Unit of measure name (e.g., "kWh"; only "kWh" accepted for now).
    - base_price (float): Standard list price for product (e.g., 0.35).
    - custom_rate (float): Actual invoice price (e.g., 0.38).
    - quantity (float): Consumed quantity (e.g., 150, in kWh).
    // TODO: Add more fields if needed. e.g. payment terms, bill_date etc.

- Validates the transaction object.
- Fetches Odoo credentials for the user.
- Prepares invoice line data.
- Sends a POST request to Odoo to create the invoice.
- Throws if creation fails.

**Kind**: inner method of [<code>services/odoo</code>](#module_services/odoo)  
**Returns**: <code>Promise.&lt;Number&gt;</code> - The created bill ID.  
**Throws**:

- <code>ValidationError</code><code>SystemError</code> On validation or Odoo errors.

<a name="module_services/odoo..checkValidPaymentMethod"></a>

### services/odoo~checkValidPaymentMethod(user) ⇒ <code>Promise.&lt;boolean&gt;</code>
Checks if the given user has a valid payment method in Odoo.

- Validates the user object.
- Fetches Odoo credentials for the user.
- Constructs and signs a request to Odoo to check payment method validity.
- Verifies the response hash for integrity.
- Returns true if the payment method is valid, false otherwise.

**Kind**: inner method of [<code>services/odoo</code>](#module_services/odoo)  
**Returns**: <code>Promise.&lt;boolean&gt;</code> - True if payment method is valid, false otherwise.  
**Throws**:

- <code>ValidationError</code><code>SystemError</code> On validation or Odoo errors.

<a name="module_services/steve_transactions"></a>

## services/steve\_transactions
SteVe Transactions Service

Incremental fetch of all transactions since last high‑water mark (T0).
Records all transactions in database, but only bills permanently stopped ones.
High‑Water Mark Concept:
We persist the timestamp of the latest processed transaction (the "high‑water mark" or T0).
On each run, we only fetch transactions whose stopTimestamp is strictly greater than T0.
After processing, we update T0 to the maximum stopTimestamp seen. This ensures:
  • No overlap or reprocessing of already handled transactions.
  • No gaps: even if a transaction ends just after T0, it will be fetched next run.
  • Linear, efficient incremental retrieval without maintaining complex windows.

Steve API docs: Steve http://instance:port/steve/manager/swagger-ui/swagger-ui/index.html


* [services/steve_transactions](#module_services/steve_transactions)
    * [~TEMPORARY_STOP_REASONS](#module_services/steve_transactions..TEMPORARY_STOP_REASONS)
    * [~PERMANENT_STOP_REASONS](#module_services/steve_transactions..PERMANENT_STOP_REASONS)
    * [~fetchTxnsSince(since)](#module_services/steve_transactions..fetchTxnsSince) ⇒ <code>Promise.&lt;Array.&lt;{steve\_txn}&gt;&gt;</code>
    * [~shouldProcessTransaction(txn)](#module_services/steve_transactions..shouldProcessTransaction) ⇒ <code>boolean</code>
    * [~processTxns(txns)](#module_services/steve_transactions..processTxns) ⇒ <code>Promise.&lt;{maxStop: DateTime, processedCount: number, billedCount: number}&gt;</code>
    * [~runIncremental()](#module_services/steve_transactions..runIncremental) ⇒ <code>Promise.&lt;{fetched: number, billed: number, high\_water\_mark: DateTime}&gt;</code>
    * [~runFull()](#module_services/steve_transactions..runFull) ⇒ <code>Promise.&lt;{fetched: number, billed: number, high\_water\_mark: DateTime}&gt;</code>
    * [~runToday()](#module_services/steve_transactions..runToday) ⇒ <code>Promise.&lt;{fetched: number, billed: number, high\_water\_mark: DateTime}&gt;</code>

<a name="module_services/steve_transactions..TEMPORARY_STOP_REASONS"></a>

### services/steve_transactions~TEMPORARY\_STOP\_REASONS
Stop reasons that indicate a transaction is temporarily stopped/paused
and should not be billed yet (may resume later).
According to OCPP1.6 spec

**Kind**: inner constant of [<code>services/steve\_transactions</code>](#module_services/steve_transactions)  
<a name="module_services/steve_transactions..PERMANENT_STOP_REASONS"></a>

### services/steve_transactions~PERMANENT\_STOP\_REASONS
Stop reasons that indicate a permanent transaction end
and should be processed for billing.
According to OCPP1.6 spec

**Kind**: inner constant of [<code>services/steve\_transactions</code>](#module_services/steve_transactions)  
<a name="module_services/steve_transactions..fetchTxnsSince"></a>

### services/steve_transactions~fetchTxnsSince(since) ⇒ <code>Promise.&lt;Array.&lt;{steve\_txn}&gt;&gt;</code>
Fetch all transactions since a given timestamp (exclusive)
If no timestamp is provided, fetch all transactions

**Kind**: inner method of [<code>services/steve\_transactions</code>](#module_services/steve_transactions)  
**Returns**: <code>Promise.&lt;Array.&lt;{steve\_txn}&gt;&gt;</code> - Array of transactions  
<a name="module_services/steve_transactions..shouldProcessTransaction"></a>

### services/steve_transactions~shouldProcessTransaction(txn) ⇒ <code>boolean</code>
Determines if a transaction should be processed for billing based on its stop reason

**Kind**: inner method of [<code>services/steve\_transactions</code>](#module_services/steve_transactions)  
**Returns**: <code>boolean</code> - True if transaction should be billed  
<a name="module_services/steve_transactions..processTxns"></a>

### services/steve_transactions~processTxns(txns) ⇒ <code>Promise.&lt;{maxStop: DateTime, processedCount: number, billedCount: number}&gt;</code>
Record all transactions and create bills for permanently stopped transactions

**Kind**: inner method of [<code>services/steve\_transactions</code>](#module_services/steve_transactions)  
**Returns**: <code>Promise.&lt;{maxStop: DateTime, processedCount: number, billedCount: number}&gt;</code> - The new high‑water mark (max stopTimestamp), count of all processed transactions, and count of billed transactions  
**Throws**:

- <code>ValidationError</code> If any transaction does not match the expected schema

<a name="module_services/steve_transactions..runIncremental"></a>

### services/steve_transactions~runIncremental() ⇒ <code>Promise.&lt;{fetched: number, billed: number, high\_water\_mark: DateTime}&gt;</code>
Run incremental billing cycle: fetch and process since last watermark

**Kind**: inner method of [<code>services/steve\_transactions</code>](#module_services/steve_transactions)  
<a name="module_services/steve_transactions..runFull"></a>

### services/steve_transactions~runFull() ⇒ <code>Promise.&lt;{fetched: number, billed: number, high\_water\_mark: DateTime}&gt;</code>
Fetches all transactions from Steve, processes them, and updates the high-water mark.
Use for a full sync (no time filter).

**Kind**: inner method of [<code>services/steve\_transactions</code>](#module_services/steve_transactions)  
<a name="module_services/steve_transactions..runToday"></a>

### services/steve_transactions~runToday() ⇒ <code>Promise.&lt;{fetched: number, billed: number, high\_water\_mark: DateTime}&gt;</code>
Fetch and process all of today's transactions and updates the high-water mark.

**Kind**: inner method of [<code>services/steve\_transactions</code>](#module_services/steve_transactions)  
<a name="module_services/steve_user"></a>

## services/steve\_user
SteVe User Service

Provides functions to create, fetch, block, and unblock users in the SteVe OCPP backend.
- createSteveUser: Creates a new user in SteVe with the given RFID.
- getSteveUser: Fetches a user from SteVe by RFID.
- blockSteveUser: Blocks a user in SteVe (sets maxActiveTransactionCount to 0).
- unblockSteveUser: Unblocks a user in SteVe (sets maxActiveTransactionCount to 1).

All functions validate input and handle errors using custom error types.


* [services/steve_user](#module_services/steve_user)
    * [~createSteveUser(user, [blocked])](#module_services/steve_user..createSteveUser) ⇒ <code>Promise.&lt;Object&gt;</code>
    * [~getSteveUser(user_rfid)](#module_services/steve_user..getSteveUser) ⇒ <code>Promise.&lt;(Array.&lt;Object&gt;\|null)&gt;</code>
    * [~blockSteveUser(user)](#module_services/steve_user..blockSteveUser)
    * [~unblockSteveUser(user)](#module_services/steve_user..unblockSteveUser)

<a name="module_services/steve_user..createSteveUser"></a>

### services/steve_user~createSteveUser(user, [blocked]) ⇒ <code>Promise.&lt;Object&gt;</code>
Creates a new user in SteVe with the given RFID.
- Checks if the user already exists.
- Creates the user with the specified block status.
- Validates the response and stores the steve_id in the database.
- Returns the created user data.

**Kind**: inner method of [<code>services/steve\_user</code>](#module_services/steve_user)  
**Returns**: <code>Promise.&lt;Object&gt;</code> - The created user data from SteVe.  
**Throws**:

- <code>ValidationError</code><code>Error</code> If validation fails or creation fails.

<a name="module_services/steve_user..getSteveUser"></a>

### services/steve_user~getSteveUser(user_rfid) ⇒ <code>Promise.&lt;(Array.&lt;Object&gt;\|null)&gt;</code>
Fetches a user from SteVe by RFID.
Returns null if not found, throws if multiple found or on error.
Validates the user data.

**Kind**: inner method of [<code>services/steve\_user</code>](#module_services/steve_user)  
**Returns**: <code>Promise.&lt;(Array.&lt;Object&gt;\|null)&gt;</code> - User data array or null if not found.  
**Throws**:

- <code>ValidationError</code><code>Error</code> On invalid input or fetch error.

<a name="module_services/steve_user..blockSteveUser"></a>

### services/steve_user~blockSteveUser(user)
Blocks a user in SteVe by setting their maxActiveTransactionCount to 0.
Validates input, updates the user, checks the block status, and logs the action.

**Kind**: inner method of [<code>services/steve\_user</code>](#module_services/steve_user)  
**Throws**:

- <code>ValidationError</code><code>Error</code> If input is invalid or block fails.

<a name="module_services/steve_user..unblockSteveUser"></a>

### services/steve_user~unblockSteveUser(user)
Unblocks a user in SteVe by setting their maxActiveTransactionCount to 1.
Validates input, updates the user, checks the unblock status, and logs the action.

**Kind**: inner method of [<code>services/steve\_user</code>](#module_services/steve_user)  
**Throws**:

- <code>ValidationError</code><code>Error</code> If input is invalid or unblock fails.

<a name="module_services/user_operations"></a>

## services/user\_operations
Service for checking overall user integrity and creating users with proper links to external systems.

<a name="module_services/user_operations..userOperations"></a>

### services/user_operations~userOperations(oidc_user) ⇒ <code>Promise.&lt;Object&gt;</code>
Handles user creation and linking with external systems.

- Checks if a user exists by OIDC ID.
- If not, creates a new user with a random RFID (for development).
- Ensures the user is registered in Odoo and Steve systems.
- Returns the up-to-date detailed user object.

**Kind**: inner method of [<code>services/user\_operations</code>](#module_services/user_operations)  
**Returns**: <code>Promise.&lt;Object&gt;</code> - User object from the database.  
<a name="module_utils/oidc_config"></a>

## utils/oidc\_config
OIDC configuration for authentication middleware.

- Uses environment variables for secrets and endpoints.
- Customizes authorization parameters and routes.

<a name="module_utils/queries"></a>

## utils/queries
Global database queries


* [utils/queries](#module_utils/queries)
    * [~handleQueryError(error, operation, silent)](#module_utils/queries..handleQueryError)
    * [~getUsers(filters, options)](#module_utils/queries..getUsers) ⇒ <code>Promise.&lt;Array&gt;</code>
    * [~getUserUnique(filters)](#module_utils/queries..getUserUnique) ⇒ <code>Promise.&lt;(Object.&lt;User&gt;\|null)&gt;</code>
    * [~setUserOdooCredentials(user, odoo_user_id, odoo_partner_id, encrypted_key, salt)](#module_utils/queries..setUserOdooCredentials) ⇒ <code>Promise.&lt;number&gt;</code>
    * [~getUserOdooCredentials(user_id)](#module_utils/queries..getUserOdooCredentials) ⇒ <code>Promise.&lt;(Object\|null)&gt;</code>
    * [~rotateOdooUserKey(user_id, old_key_id, new_key, new_key_salt)](#module_utils/queries..rotateOdooUserKey) ⇒ <code>Promise.&lt;boolean&gt;</code>
    * [~setSteveUserParamaters(user, steve_id)](#module_utils/queries..setSteveUserParamaters) ⇒ <code>Promise.&lt;(Object\|undefined)&gt;</code>
    * [~recordActivityLog(user_id, event_type, target, rfid, reason)](#module_utils/queries..recordActivityLog) ⇒ <code>Promise.&lt;void&gt;</code>
    * [~recordSteveTxn(steve_txn)](#module_utils/queries..recordSteveTxn) ⇒ <code>Promise.&lt;Object.&lt;db\_txn&gt;&gt;</code>
    * [~setLastStopTimestamp(new_watermark)](#module_utils/queries..setLastStopTimestamp) ⇒ <code>Promise.&lt;void&gt;</code>
    * [~getLastStopTimestamp()](#module_utils/queries..getLastStopTimestamp) ⇒ <code>Promise.&lt;(DateTime\|null)&gt;</code>
    * [~saveInvoiceId(txn, invoice_id)](#module_utils/queries..saveInvoiceId) ⇒ <code>Promise.&lt;void&gt;</code>
    * [~getCurrentElectricityPrice(specified_datetime)](#module_utils/queries..getCurrentElectricityPrice) ⇒ <code>Promise.&lt;number&gt;</code> \| <code>null</code>
    * [~getUsersCount(filters)](#module_utils/queries..getUsersCount) ⇒ <code>Promise.&lt;number&gt;</code>

<a name="module_utils/queries..handleQueryError"></a>

### utils/queries~handleQueryError(error, operation, silent)
Handles query errors.

**Kind**: inner method of [<code>utils/queries</code>](#module_utils/queries)  
**Throws**:

- <code>Error</code> - The error that happened during the operation.

<a name="module_utils/queries..getUsers"></a>

### utils/queries~getUsers(filters, options) ⇒ <code>Promise.&lt;Array&gt;</code>
Gets users based on dynamic filter parameters.

**Kind**: inner method of [<code>utils/queries</code>](#module_utils/queries)  
**Returns**: <code>Promise.&lt;Array&gt;</code> - - The matching users  
**Throws**:

- <code>DatabaseError</code> - If the database operation fails

**Example**  
```js
getUsers({ first_name: 'John' }) - Get all users named John
getUsers({ active: true }, { limit: 10, offset: 20 }) - Get 10 active users, skipping first 20
getUsers({}, { orderBy: 'created_at', orderDirection: 'DESC' }) - Get all users ordered by creation date descending
```
<a name="module_utils/queries..getUserUnique"></a>

### utils/queries~getUserUnique(filters) ⇒ <code>Promise.&lt;(Object.&lt;User&gt;\|null)&gt;</code>
Gets a single user with uniqueness validation.
Throws an error if multiple users match the criteria.

**Kind**: inner method of [<code>utils/queries</code>](#module_utils/queries)  
**Returns**: <code>Promise.&lt;(Object.&lt;User&gt;\|null)&gt;</code> - - The matching user or null if not found  
**Throws**:

- <code>DatabaseError</code> - database operation fails
- <code>ValidationError</code> - if multiple users match the criteria

<a name="module_utils/queries..setUserOdooCredentials"></a>

### utils/queries~setUserOdooCredentials(user, odoo_user_id, odoo_partner_id, encrypted_key, salt) ⇒ <code>Promise.&lt;number&gt;</code>
Sets Odoo credentials for a user in the database.
Updates the users table with Odoo IDs and stores encrypted API key information.

**Kind**: inner method of [<code>utils/queries</code>](#module_utils/queries)  
**Returns**: <code>Promise.&lt;number&gt;</code> - - The ID of the inserted API key record  
**Throws**:

- <code>ValidationError</code> - If parameters are missing or invalid
- <code>DatabaseError</code> - If database operations fail

<a name="module_utils/queries..getUserOdooCredentials"></a>

### utils/queries~getUserOdooCredentials(user_id) ⇒ <code>Promise.&lt;(Object\|null)&gt;</code>
Retrieves the latest valid Odoo API key credentials for a user.
Returns null if no credentials are found.

**Kind**: inner method of [<code>utils/queries</code>](#module_utils/queries)  
**Returns**: <code>Promise.&lt;(Object\|null)&gt;</code> - The credentials object or null.  
**Throws**:

- <code>ValidationError</code><code>DatabaseError</code> On missing parameters or query error.

<a name="module_utils/queries..rotateOdooUserKey"></a>

### utils/queries~rotateOdooUserKey(user_id, old_key_id, new_key, new_key_salt) ⇒ <code>Promise.&lt;boolean&gt;</code>
Rotates a user's Odoo API key.
Revokes the old key and inserts a new one for the user.

**Kind**: inner method of [<code>utils/queries</code>](#module_utils/queries)  
**Returns**: <code>Promise.&lt;boolean&gt;</code> - True if rotation is successful.  
**Throws**:

- <code>ValidationError</code><code>DatabaseError</code> On missing parameters or DB error.

<a name="module_utils/queries..setSteveUserParamaters"></a>

### utils/queries~setSteveUserParamaters(user, steve_id) ⇒ <code>Promise.&lt;(Object\|undefined)&gt;</code>
Sets the SteVe user ID for a user in the database.

**Kind**: inner method of [<code>utils/queries</code>](#module_utils/queries)  
**Returns**: <code>Promise.&lt;(Object\|undefined)&gt;</code> - The updated user row or undefined.  
**Throws**:

- <code>ValidationError</code> If required parameters are missing.
- <code>Error</code> If the update fails.

<a name="module_utils/queries..recordActivityLog"></a>

### utils/queries~recordActivityLog(user_id, event_type, target, rfid, reason) ⇒ <code>Promise.&lt;void&gt;</code>
Records an activity event for a user in the activity log.

**Kind**: inner method of [<code>utils/queries</code>](#module_utils/queries)  
<a name="module_utils/queries..recordSteveTxn"></a>

### utils/queries~recordSteveTxn(steve_txn) ⇒ <code>Promise.&lt;Object.&lt;db\_txn&gt;&gt;</code>
Record a transaction record into the `charging_transactions` table.
If transaction already exists and is complete, returns it without modification.
Otherwise, inserts a new record with proper user association or updates existing one.

**Kind**: inner method of [<code>utils/queries</code>](#module_utils/queries)  
**Returns**: <code>Promise.&lt;Object.&lt;db\_txn&gt;&gt;</code> - db_txn - The transaction record from database  
<a name="module_utils/queries..setLastStopTimestamp"></a>

### utils/queries~setLastStopTimestamp(new_watermark) ⇒ <code>Promise.&lt;void&gt;</code>
Sets the last stop timestamp watermark.
Inserts or updates the `watermark` table with the given timestamp.

**Kind**: inner method of [<code>utils/queries</code>](#module_utils/queries)  
<a name="module_utils/queries..getLastStopTimestamp"></a>

### utils/queries~getLastStopTimestamp() ⇒ <code>Promise.&lt;(DateTime\|null)&gt;</code>
Retrieves the most recent `last_stop_timestamp` aka watermark from the watermark table.
Returns a Luxon DateTime if found, otherwise null.

**Kind**: inner method of [<code>utils/queries</code>](#module_utils/queries)  
**Returns**: <code>Promise.&lt;(DateTime\|null)&gt;</code> - The latest stop timestamp or null if not found or error on watermark fetch.  
<a name="module_utils/queries..saveInvoiceId"></a>

### utils/queries~saveInvoiceId(txn, invoice_id) ⇒ <code>Promise.&lt;void&gt;</code>
Updates the `invoice_ref` field for a transaction in `charging_transactions`.
This is used to link a transaction to an invoice in Odoo.

**Kind**: inner method of [<code>utils/queries</code>](#module_utils/queries)  
**Throws**:

- <code>DatabaseError</code><code>ValidationError</code> On query error.

<a name="module_utils/queries..getCurrentElectricityPrice"></a>

### utils/queries~getCurrentElectricityPrice(specified_datetime) ⇒ <code>Promise.&lt;number&gt;</code> \| <code>null</code>
Retrieves the current electricity price from the database.
If a `specified_datetime` is provided, it will return the price valid at that time.
If no price is found, it returns null.

**Kind**: inner method of [<code>utils/queries</code>](#module_utils/queries)  
**Returns**: <code>Promise.&lt;number&gt;</code> \| <code>null</code> - If `specified_datetime` provided, that datetime's if not, the current electricity price in cents per kWh.  
<a name="module_utils/queries..getUsersCount"></a>

### utils/queries~getUsersCount(filters) ⇒ <code>Promise.&lt;number&gt;</code>
Get total count of users matching the given filters

**Kind**: inner method of [<code>utils/queries</code>](#module_utils/queries)  
**Returns**: <code>Promise.&lt;number&gt;</code> - Total count of matching users  
<a name="module_utils/steve"></a>

## utils/steve
Utility functions for Steve user data.

<a name="module_utils/steve..validateSteveUser"></a>

### utils/steve~validateSteveUser(response_data, userRfid)
Validates Steve user response data.
- Checks structure using Joi schema.
- Ensures idTag matches the expected RFID.

**Kind**: inner method of [<code>utils/steve</code>](#module_utils/steve)  
**Throws**:

- <code>ValidationError</code> If validation fails.

<a name="module_utils/typedef"></a>

## utils/typedef
Type definitions


* [utils/typedef](#module_utils/typedef)
    * [~User](#module_utils/typedef..User) : <code>Object</code>
    * [~steve_txn](#module_utils/typedef..steve_txn) : <code>Object</code>
    * [~db_txn](#module_utils/typedef..db_txn) : <code>Object</code>
    * [~electricity_price](#module_utils/typedef..electricity_price) : <code>Object</code>
    * [~db_consent_revision](#module_utils/typedef..db_consent_revision) : <code>Object</code>

<a name="module_utils/typedef..User"></a>

### utils/typedef~User : <code>Object</code>
**Kind**: inner typedef of [<code>utils/typedef</code>](#module_utils/typedef)  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| user_id | <code>string</code> | The user's ID |
| name | <code>string</code> | The user's name |
| email | <code>string</code> | The user's email |
| odoo_user_id | <code>number</code> | The user's Odoo ID |
| partner_id | <code>number</code> | The user's Odoo partner ID |
| oauth_id | <code>string</code> | The OAuth ID |
| rfid | <code>string</code> | The user's RFID |
| steve_id | <code>number</code> | The user's OCPP tag primary key in SteVe |
| deactivated_at | <code>Date</code> | The date and time when the user is (if any) deactivated |

<a name="module_utils/typedef..steve_txn"></a>

### utils/typedef~steve\_txn : <code>Object</code>
**Kind**: inner typedef of [<code>utils/typedef</code>](#module_utils/typedef)  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| id | <code>number</code> | PK of the transaction |
| connectorId | <code>number</code> | Connector ID of the charge box at which the transaction took place |
| chargeBoxPk | <code>number</code> | PK of the charge box at which the transaction took place |
| ocppTagPk | <code>number</code> | PK of the OCPP tag used in the transaction |
| chargeBoxId | <code>string</code> | The identifier of the charge box at which the transaction took place |
| ocppIdTag | <code>string</code> | The Ocpp Tag used in the transaction |
| startTimestamp | <code>Date</code> | The timestamp at which the transaction started |
| stopTimestamp | <code>Date</code> \| <code>null</code> | The timestamp at which the transaction ended |
| startValue | <code>string</code> | The meter value reading at the start of the transactionin watt-hours |
| stopValue | <code>string</code> \| <code>null</code> | The meter value reading at the end of the transaction in watt-hours |
| stopReason | <code>string</code> \| <code>null</code> | The reason for the transaction being stopped |
| stopEventActor | <code>&#x27;station&#x27;</code> \| <code>&#x27;manual&#x27;</code> \| <code>null</code> | The actor who stopped the transaction |

<a name="module_utils/typedef..db_txn"></a>

### utils/typedef~db\_txn : <code>Object</code>
**Kind**: inner typedef of [<code>utils/typedef</code>](#module_utils/typedef)  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| id | <code>number</code> | PK of the transaction in the database |
| created_at | <code>Date</code> | The timestamp at which the transaction was created |
| start_timestamp | <code>Date</code> | The timestamp at which the transaction started |
| stop_timestamp | <code>Date</code> | The timestamp at which the transaction ended |
| delivered_energy_wh | <code>number</code> | The amount of energy delivered during the transaction in watt-hours |
| start_value | <code>number</code> | The meter value reading at the start of the transaction in watt-hours |
| stop_value | <code>number</code> | The meter value reading at the end of the transaction in watt-hours |
| stop_reason | <code>string</code> | The reason for the transaction being stopped |
| stop_event_actor | <code>string</code> | The actor who stopped the transaction |
| connector_id | <code>number</code> | Connector ID of the charge box at which the transaction took place |
| chargebox_pk | <code>number</code> | PK of the charge box at which the transaction took place in SteVe |
| ocpp_tag_pk | <code>number</code> | PK of the OCPP tag used in the transaction in SteVe (steve_id in strohm.users table) |
| ocpp_id_tag | <code>number</code> | The Ocpp Tag used in the transaction (rfid in strohm.users table) |
| user_id | <code>number</code> | The user ID associated with the transaction |
| invoice_ref | <code>number</code> | The invoice reference associated with the transaction returned from Odoo |
| txn_steve_id | <code>number</code> | PK of the transaction in SteVe |

<a name="module_utils/typedef..electricity_price"></a>

### utils/typedef~electricity\_price : <code>Object</code>
**Kind**: inner typedef of [<code>utils/typedef</code>](#module_utils/typedef)  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| id | <code>number</code> | PK of the electricity price |
| created_at | <code>Date</code> | The timestamp at which the electricity price was created |
| valid_from | <code>Date</code> | The date from which the electricity price is valid |
| valid_till | <code>Date</code> | The date until which the electricity price is valid |
| price | <code>number</code> | The price as per kWh in cents |

<a name="module_utils/typedef..db_consent_revision"></a>

### utils/typedef~db\_consent\_revision : <code>Object</code>
**Kind**: inner typedef of [<code>utils/typedef</code>](#module_utils/typedef)  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| id | <code>number</code> | Unique identifier for the consent revision |
| version | <code>string</code> | Version identifier (e.g., "1.0", "2.1.3") |
| title | <code>string</code> | Human-readable title for the consent |
| content | <code>string</code> | Full consent text content |
| privacy_policy_url | <code>string</code> \| <code>null</code> | URL to privacy policy (optional) |
| terms_url | <code>string</code> \| <code>null</code> | URL to terms of service (optional) |
| created_at | <code>Date</code> | Timestamp when revision was created |
| expires_at | <code>Date</code> \| <code>null</code> | Expiration timestamp (null for no expiration) |

<a name="module_app"></a>

## app
Express app instance.

<a name="SCIMUserHandler"></a>

## SCIMUserHandler
SCIM User Resource Handler
Handles CRUD operations for users via SCIM protocol

**Kind**: global class  

* [SCIMUserHandler](#SCIMUserHandler)
    * [.read(request)](#SCIMUserHandler.read) ⇒ <code>Promise.&lt;Object&gt;</code>
    * [.write(resource)](#SCIMUserHandler.write) ⇒ <code>Promise.&lt;Object&gt;</code>
    * [.patch(id, resource)](#SCIMUserHandler.patch) ⇒ <code>Promise.&lt;Object&gt;</code>
    * [.delete(id)](#SCIMUserHandler.delete) ⇒ <code>Promise.&lt;void&gt;</code>
    * [.toSCIMUser(user)](#SCIMUserHandler.toSCIMUser) ⇒ <code>Object</code>

<a name="SCIMUserHandler.read"></a>

### SCIMUserHandler.read(request) ⇒ <code>Promise.&lt;Object&gt;</code>
Retrieve users with optional filtering and pagination

**Kind**: static method of [<code>SCIMUserHandler</code>](#SCIMUserHandler)  
**Returns**: <code>Promise.&lt;Object&gt;</code> - SCIM response with users  
<a name="SCIMUserHandler.write"></a>

### SCIMUserHandler.write(resource) ⇒ <code>Promise.&lt;Object&gt;</code>
NOT TESTED
Create a new user via SCIM. Should not be used since users are created via OIDC.
Does not trigger Odoo or SteVe user creation.

**Kind**: static method of [<code>SCIMUserHandler</code>](#SCIMUserHandler)  
**Returns**: <code>Promise.&lt;Object&gt;</code> - Created SCIM user  
<a name="SCIMUserHandler.patch"></a>

### SCIMUserHandler.patch(id, resource) ⇒ <code>Promise.&lt;Object&gt;</code>
Update an existing user via SCIM

**Kind**: static method of [<code>SCIMUserHandler</code>](#SCIMUserHandler)  
**Returns**: <code>Promise.&lt;Object&gt;</code> - Updated SCIM user  
<a name="SCIMUserHandler.delete"></a>

### SCIMUserHandler.delete(id) ⇒ <code>Promise.&lt;void&gt;</code>
Delete a user via SCIM

**Kind**: static method of [<code>SCIMUserHandler</code>](#SCIMUserHandler)  
<a name="SCIMUserHandler.toSCIMUser"></a>

### SCIMUserHandler.toSCIMUser(user) ⇒ <code>Object</code>
Convert database user to SCIM user format

**Kind**: static method of [<code>SCIMUserHandler</code>](#SCIMUserHandler)  
**Returns**: <code>Object</code> - SCIM user object  
<a name="AppError"></a>

## AppError
Base class for custom application errors

**Kind**: global class  
<a name="config"></a>

## config : <code>object</code>
Configuration settings for SteVe and Odoo integrations

**Kind**: global namespace  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| STEVE_CONFIG | <code>object</code> | Configuration for SteVe server and API endpoints |
| STEVE_CONFIG.HOST | <code>string</code> | SteVe server host |
| STEVE_CONFIG.PORT | <code>string</code> | SteVe server port |
| STEVE_CONFIG.INTERNAL_BASE_URL | <code>string</code> | SteVe base URL |
| STEVE_CONFIG.OCPP_TAGS_URI | <code>string</code> | OCPP tags API endpoint |
| STEVE_CONFIG.TRANSACTIONS_URI | <code>string</code> | Transactions API endpoint |
| ODOO_CONFIG | <code>object</code> | Configuration for Odoo server and API endpoints |
| ODOO_CONFIG.HOST | <code>string</code> | Odoo server host |
| ODOO_CONFIG.PORT | <code>string</code> | Odoo server port |
| ODOO_CONFIG.INTERNAL_BASE_URL | <code>string</code> | Odoo base URL |
| ODOO_CONFIG.EXTERNAL_HOST | <code>string</code> | Odoo external host |
| ODOO_CONFIG.EXTERNAL_PORT | <code>string</code> | Odoo external port |
| ODOO_CONFIG.EXTERNAL_BASE_URL | <code>string</code> | Odoo external URL |
| ODOO_CONFIG.API_SECRET | <code>string</code> | Odoo API secret |
| ODOO_CONFIG.USER_CREATION_URI | <code>string</code> | User creation endpoint |
| ODOO_CONFIG.INVOICE_CREATION_URI | <code>string</code> | Invoice creation endpoint |
| ODOO_CONFIG.PORTAL_LOGIN_URI | <code>string</code> | Portal login endpoint |
| ODOO_CONFIG.ROTATE_APIKEY_URI | <code>string</code> | API key rotation endpoint |
| ODOO_CONFIG.CHECK_PAYMENT_METHOD_URI | <code>string</code> | Payment method check endpoint |

<a name="logger"></a>

## logger
Application Error Codes

This module defines standardized error codes and messages for the application.
Errors are grouped by category and include codes, HTTP status codes, and messages.

**Kind**: global constant  
<a name="validateSCIMResource"></a>

## validateSCIMResource(resource, schema, operation)
Validate SCIM resource using Joi and throw appropriate errors

**Kind**: global function  
<a name="scimErrorHandler"></a>

## scimErrorHandler()
SCIM Error Handler Middleware

**Kind**: global function  
<a name="generateOdooHash"></a>

## generateOdooHash(message, secret) ⇒ <code>string</code>
Generate HMAC signature matching Odoo implementation

**Kind**: global function  
**Returns**: <code>string</code> - - Hexadecimal signature  
<a name="generateSalt"></a>

## generateSalt(length) ⇒ <code>string</code>
Generate a cryptographically secure random salt

**Kind**: global function  
**Returns**: <code>string</code> - - salt string  
<a name="validateOIDCProperties"></a>

## validateOIDCProperties(req) ⇒ <code>boolean</code>
Validates that the OIDC authentication, most of the checks are done by the OIDC library, but we add some little extra checks.

**Kind**: global function  
**Returns**: <code>boolean</code> - - True if authentication is valid, false otherwise  
<a name="identifyUser"></a>

## identifyUser(identifier, options) ⇒ <code>Promise.&lt;Object&gt;</code>
Gets a user by either user_id or oauth_id

**Kind**: global function  
**Returns**: <code>Promise.&lt;Object&gt;</code> - - User object  
**Throws**:

- <code>ValidationError</code> - If user not found or doesn't meet requirements

<a name="scimAuth"></a>

## scimAuth(req, res, next)
SCIM HTTP Basic Authentication Middleware
Implements HTTP Basic authentication for SCIM endpoints as specified in RFC 7617

**Kind**: global function  
<a name="fmt"></a>

## fmt(dt, toUTC) ⇒ <code>string</code>
Format a Luxon DateTime into format of ISO_NO_ZONE (e.g. 2025-08-25T14:30:00)

**Kind**: global function  
<a name="createError"></a>

## createError(errorDef, [customMessage], [originalError]) ⇒ <code>Object</code>
Create an application error with standard format

**Kind**: global function  
**Returns**: <code>Object</code> - Formatted error object  
<a name="appErrorHandler"></a>

## appErrorHandler()
Express error handler for AppErrors

**Kind**: global function  
