## Modules

<dl>
<dt><a href="#module_controllers/auth">controllers/auth</a></dt>
<dd><p>Controller for handling user logout.</p>
</dd>
<dt><a href="#module_controllers/charging">controllers/charging</a></dt>
<dd><p>Controller for handling charging session operations.</p>
</dd>
<dt><a href="#module_controllers/consent_admin">controllers/consent_admin</a></dt>
<dd><p>Admin controller for consent management (PDF upload).
Protected by Tailscale network authentication.</p>
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
transaction handling and audit capabilities required for GDPR compliance.</p>
</dd>
<dt><a href="#module_controllers/dev_admin">controllers/dev_admin</a></dt>
<dd><p>Dev Admin Controller</p>
<p>Provides admin endpoints for managing users across SteVe, Odoo, and Database.
These endpoints are protected by Tailscale network authentication middleware.</p>
<p>SECURITY: Access is restricted to requests originating from Tailscale IP addresses.</p>
</dd>
<dt><a href="#module_controllers/electricity_price">controllers/electricity_price</a></dt>
<dd><p>Controller for handling electricity price</p>
</dd>
<dt><a href="#module_controllers/odoo">controllers/odoo</a></dt>
<dd><p>Controller for handling Odoo internal user sync webhooks.</p>
</dd>
<dt><a href="#module_controllers/pricing_admin">controllers/pricing_admin</a></dt>
<dd><p>Admin controller for electricity price and VAT rate management.
Protected by Tailscale network authentication.</p>
</dd>
<dt><a href="#module_helpers/notifications">helpers/notifications</a></dt>
<dd><p>Helper utilities for flash notifications</p>
</dd>
<dt><a href="#module_middlewares/consent">middlewares/consent</a></dt>
<dd><p>Middleware for checking user consent status and enforcing consent requirements.</p>
<p>This middleware ensures that authenticated users have provided valid consent
before accessing protected routes. It performs ONLY consent validation and
relies on the ensureAuthenticated middleware running first.</p>
<p><strong>SINGLE RESPONSIBILITY</strong>: This middleware ONLY checks consent status.
Authentication must be handled by ensureAuthenticated middleware before this runs.</p>
<p><strong>ARCHITECTURAL INTEGRATION</strong>: This middleware leverages the consent service
which uses direct database connections instead of the standard <code>db.[query]</code>
pattern used elsewhere in the application. This design choice provides
enhanced audit capabilities and specialized transaction handling for
GDPR compliance requirements.</p>
</dd>
<dt><a href="#module_middlewares/ensureAuthenticated">middlewares/ensureAuthenticated</a></dt>
<dd><p>Middleware for ensuring user authentication via OIDC and loading user data.</p>
<p>This middleware validates OIDC authentication and ensures that the user exists
in the application database. It acts as the authentication layer that must pass
before any authorization checks (like consent) are performed.</p>
<p><strong>SINGLE RESPONSIBILITY</strong>: This middleware ONLY handles authentication.
It does NOT check consent or other authorization concerns.</p>
</dd>
<dt><a href="#module_middlewares/tailscaleAuth">middlewares/tailscaleAuth</a></dt>
<dd><p>Tailscale Authentication Middleware</p>
<p>Restricts access to endpoints based on Tailscale network membership.
Checks if the request originates from a Tailscale IP address.</p>
</dd>
<dt><a href="#module_services/billing_reconciliation">services/billing_reconciliation</a></dt>
<dd><p>Billing Reconciliation Service</p>
<p>This service handles retroactive billing of transactions that were initially unbilled.
Common scenarios:</p>
<ul>
<li>User registered after transaction completed</li>
<li>Transaction was updated with user info after initial processing</li>
<li>Failed billing attempts that need retry</li>
</ul>
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
<dd><p>Cron job service for periodic transaction fetching and billing reconciliation.</p>
<ul>
<li>Schedules a job to run every configured interval for transaction fetching.</li>
<li>Schedules billing reconciliation to run every hour.</li>
<li>Calls runIncremental to fetch new transactions.</li>
<li>Logs the result after each execution.</li>
<li>Monitors SteVe health and automatically stops/starts cron job based on availability.</li>
</ul>
</dd>
<dt><a href="#module_services/dbMigration">services/dbMigration</a></dt>
<dd><p>Migration service module
Handles database migrations programmatically using node-pg-migrate</p>
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
<p>Responsible for fetching and recording transactions from the external SteVe API.
This service does NOT handle billing - all billing logic is in billing_reconciliation service.</p>
<p>Sliding window fetch strategy:
On each run, we fetch all transactions from the last N minutes (default 3).
Since recordTransaction uses upsert (ON CONFLICT), re-fetching the same transaction is safe.
This eliminates watermark drift bugs and ensures no transactions are missed.</p>
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
<dt><a href="#module_utils/env-validator">utils/env-validator</a></dt>
<dd><p>Environment variable validation
Validates all required environment variables at startup to catch configuration issues early.</p>
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

## Members

<dl>
<dt><a href="#oidcDiscoveryCache">oidcDiscoveryCache</a></dt>
<dd><p>Cache for OIDC discovery configuration
Security: TTL of 24 hours prevents using stale/compromised endpoints indefinitely
while avoiding frequent network calls
OIDC discovery cache is overkill for most use cases but adds resilience.</p>
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
<dt><a href="#generateSalt">generateSalt(bytes)</a> ⇒ <code>string</code></dt>
<dd><p>Generate a cryptographically secure random salt</p>
</dd>
<dt><a href="#validateOIDCProperties">validateOIDCProperties(req)</a> ⇒ <code>boolean</code></dt>
<dd><p>Validates that the OIDC authentication properties like access token and user info are present.
Most of the checks are done by the OIDC library, but we add some little extra checks.</p>
</dd>
<dt><a href="#getOidcDiscovery">getOidcDiscovery()</a> ⇒ <code>Promise.&lt;Object&gt;</code></dt>
<dd><p>Fetches and caches the OIDC discovery configuration</p>
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
<dt><a href="#safeErrorMessage">safeErrorMessage()</a></dt>
<dd><p>Return a safe error message for the client (never expose internal details)</p>
</dd>
</dl>

<a name="module_controllers/auth"></a>

## controllers/auth
Controller for handling user logout.

<a name="module_controllers/charging"></a>

## controllers/charging
Controller for handling charging session operations.

<a name="module_controllers/consent_admin"></a>

## controllers/consent\_admin
Admin controller for consent management (PDF upload).
Protected by Tailscale network authentication.


* [controllers/consent_admin](#module_controllers/consent_admin)
    * [~getConsentRevisions()](#module_controllers/consent_admin..getConsentRevisions)
    * [~uploadConsentPdf()](#module_controllers/consent_admin..uploadConsentPdf)

<a name="module_controllers/consent_admin..getConsentRevisions"></a>

### controllers/consent_admin~getConsentRevisions()
GET /api/dev/consent/revisions - Get current active consent revisions

**Kind**: inner method of [<code>controllers/consent\_admin</code>](#module_controllers/consent_admin)  
<a name="module_controllers/consent_admin..uploadConsentPdf"></a>

### controllers/consent_admin~uploadConsentPdf()
POST /api/dev/consent/upload - Upload a new consent PDF

Body (multipart/form-data):
- pdf: PDF file (required, max 10MB)
- consent_type: 'agb' or 'datenschutz' (required)
- version: version string (required)
- title: document title (required)

**Kind**: inner method of [<code>controllers/consent\_admin</code>](#module_controllers/consent_admin)  
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
transaction handling and audit capabilities required for GDPR compliance.

**See**

- [services/consent](#module_services/consent) For underlying consent operations
- [middlewares/consent](#module_middlewares/consent) For consent enforcement middleware

<a name="module_controllers/consent..renderConsentFallbackView"></a>

### controllers/consent~renderConsentFallbackView(params) ⇒ <code>void</code>
Render read-only consent content when a PDF is not available.

**Kind**: inner method of [<code>controllers/consent</code>](#module_controllers/consent)  
<a name="module_controllers/dev_admin"></a>

## controllers/dev\_admin
Dev Admin Controller

Provides admin endpoints for managing users across SteVe, Odoo, and Database.
These endpoints are protected by Tailscale network authentication middleware.

SECURITY: Access is restricted to requests originating from Tailscale IP addresses.


* [controllers/dev_admin](#module_controllers/dev_admin)
    * [~getAllUsers()](#module_controllers/dev_admin..getAllUsers)
    * [~blockUserInSteve()](#module_controllers/dev_admin..blockUserInSteve)
    * [~unblockUserInSteve()](#module_controllers/dev_admin..unblockUserInSteve)
    * [~deleteUserFromSteve()](#module_controllers/dev_admin..deleteUserFromSteve)
    * [~deactivateUserInDB()](#module_controllers/dev_admin..deactivateUserInDB)
    * [~activateUserInDB()](#module_controllers/dev_admin..activateUserInDB)
    * [~deleteUserFromDB()](#module_controllers/dev_admin..deleteUserFromDB)
    * [~revokeOdooCredentials()](#module_controllers/dev_admin..revokeOdooCredentials)

<a name="module_controllers/dev_admin..getAllUsers"></a>

### controllers/dev_admin~getAllUsers()
Get all users with their status across all systems

**Kind**: inner method of [<code>controllers/dev\_admin</code>](#module_controllers/dev_admin)  
<a name="module_controllers/dev_admin..blockUserInSteve"></a>

### controllers/dev_admin~blockUserInSteve()
Block user in SteVe

**Kind**: inner method of [<code>controllers/dev\_admin</code>](#module_controllers/dev_admin)  
<a name="module_controllers/dev_admin..unblockUserInSteve"></a>

### controllers/dev_admin~unblockUserInSteve()
Unblock user in SteVe

**Kind**: inner method of [<code>controllers/dev\_admin</code>](#module_controllers/dev_admin)  
<a name="module_controllers/dev_admin..deleteUserFromSteve"></a>

### controllers/dev_admin~deleteUserFromSteve()
Delete user from SteVe

**Kind**: inner method of [<code>controllers/dev\_admin</code>](#module_controllers/dev_admin)  
<a name="module_controllers/dev_admin..deactivateUserInDB"></a>

### controllers/dev_admin~deactivateUserInDB()
Deactivate user in database

**Kind**: inner method of [<code>controllers/dev\_admin</code>](#module_controllers/dev_admin)  
<a name="module_controllers/dev_admin..activateUserInDB"></a>

### controllers/dev_admin~activateUserInDB()
Activate user in database

**Kind**: inner method of [<code>controllers/dev\_admin</code>](#module_controllers/dev_admin)  
<a name="module_controllers/dev_admin..deleteUserFromDB"></a>

### controllers/dev_admin~deleteUserFromDB()
Delete user from database (PERMANENT - USE WITH CAUTION)

**Kind**: inner method of [<code>controllers/dev\_admin</code>](#module_controllers/dev_admin)  
<a name="module_controllers/dev_admin..revokeOdooCredentials"></a>

### controllers/dev_admin~revokeOdooCredentials()
Revoke Odoo credentials for user

**Kind**: inner method of [<code>controllers/dev\_admin</code>](#module_controllers/dev_admin)  
<a name="module_controllers/electricity_price"></a>

## controllers/electricity\_price
Controller for handling electricity price

<a name="module_controllers/odoo"></a>

## controllers/odoo
Controller for handling Odoo internal user sync webhooks.


* [controllers/odoo](#module_controllers/odoo)
    * [~handleInvoiceSync(req, res)](#module_controllers/odoo..handleInvoiceSync) ⇒ <code>Object</code>
    * [~handleSaleOrderSync(req, res)](#module_controllers/odoo..handleSaleOrderSync) ⇒ <code>Object</code>

<a name="module_controllers/odoo..handleInvoiceSync"></a>

### controllers/odoo~handleInvoiceSync(req, res) ⇒ <code>Object</code>
Handles invoice creation and updates from Odoo webhook.

Validates invoice data against schema, upserts invoice record, and links to related sale orders.

**Kind**: inner method of [<code>controllers/odoo</code>](#module_controllers/odoo)  
**Returns**: <code>Object</code> - JSON response with success status  
**Throws**:

- <code>400</code> Invalid invoice data
- <code>500</code> Database error

<a name="module_controllers/odoo..handleSaleOrderSync"></a>

### controllers/odoo~handleSaleOrderSync(req, res) ⇒ <code>Object</code>
Handles sale order creation and updates from Odoo webhook.

Validates sale order data, upserts order record. If a Steve transaction ID is present,
creates new record; otherwise only updates existing orders.

**Kind**: inner method of [<code>controllers/odoo</code>](#module_controllers/odoo)  
**Returns**: <code>Object</code> - JSON response with success status  
**Throws**:

- <code>400</code> Invalid sale order data
- <code>500</code> Database error

<a name="module_controllers/pricing_admin"></a>

## controllers/pricing\_admin
Admin controller for electricity price and VAT rate management.
Protected by Tailscale network authentication.


* [controllers/pricing_admin](#module_controllers/pricing_admin)
    * [~getIP()](#module_controllers/pricing_admin..getIP)
    * [~getElectricityPrices()](#module_controllers/pricing_admin..getElectricityPrices)
    * [~createElectricityPrice()](#module_controllers/pricing_admin..createElectricityPrice)
    * [~getVATRates()](#module_controllers/pricing_admin..getVATRates)
    * [~createVATRate()](#module_controllers/pricing_admin..createVATRate)

<a name="module_controllers/pricing_admin..getIP"></a>

### controllers/pricing_admin~getIP()
Get the admin source IP from the request for audit logging

**Kind**: inner method of [<code>controllers/pricing\_admin</code>](#module_controllers/pricing_admin)  
<a name="module_controllers/pricing_admin..getElectricityPrices"></a>

### controllers/pricing_admin~getElectricityPrices()
GET /api/dev/pricing/electricity - List all electricity prices

**Kind**: inner method of [<code>controllers/pricing\_admin</code>](#module_controllers/pricing_admin)  
<a name="module_controllers/pricing_admin..createElectricityPrice"></a>

### controllers/pricing_admin~createElectricityPrice()
POST /api/dev/pricing/electricity - Set a new electricity price

Body (JSON):
- price_eur_kwh: number (required, netto price in EUR/kWh)
- valid_from: ISO 8601 datetime string (required)

**Kind**: inner method of [<code>controllers/pricing\_admin</code>](#module_controllers/pricing_admin)  
<a name="module_controllers/pricing_admin..getVATRates"></a>

### controllers/pricing_admin~getVATRates()
GET /api/dev/pricing/vat - List all VAT rates

**Kind**: inner method of [<code>controllers/pricing\_admin</code>](#module_controllers/pricing_admin)  
<a name="module_controllers/pricing_admin..createVATRate"></a>

### controllers/pricing_admin~createVATRate()
POST /api/dev/pricing/vat - Set a new VAT rate

Body (JSON):
- rate: integer (required, percentage e.g. 19 for 19%)
- description: string (optional)
- effective_from: ISO 8601 datetime string (required)

**Kind**: inner method of [<code>controllers/pricing\_admin</code>](#module_controllers/pricing_admin)  
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
before accessing protected routes. It performs ONLY consent validation and
relies on the ensureAuthenticated middleware running first.

**SINGLE RESPONSIBILITY**: This middleware ONLY checks consent status.
Authentication must be handled by ensureAuthenticated middleware before this runs.

**ARCHITECTURAL INTEGRATION**: This middleware leverages the consent service
which uses direct database connections instead of the standard `db.[query]`
pattern used elsewhere in the application. This design choice provides
enhanced audit capabilities and specialized transaction handling for
GDPR compliance requirements.

**See**

- [middlewares/ensureAuthenticated](#module_middlewares/ensureAuthenticated) Must run before this middleware
- [services/consent](#module_services/consent) For underlying consent operations
- [controllers/consent](#module_controllers/consent) For consent page handling

<a name="module_middlewares/consent..requireConsent"></a>

### middlewares/consent~requireConsent(req, res, next) ⇒ <code>void</code>
Consent Validation Flow:
1. Check if user exists (req.user is populated)
2. If user exists:
   - Check if they have latest consent via `hasLatestConsent()`
   - If no consent, redirect to /consent
   - If has consent, call next()
3. If user doesn't exist (new user):
   - Redirect to /consent (they need to give consent first)

**Kind**: inner method of [<code>middlewares/consent</code>](#module_middlewares/consent)  
**Returns**: <code>void</code> - Calls next() to continue middleware chain or redirects to /consent  
**Security**: Security Considerations:
- Enforces consent requirements for data protection compliance
- Provides audit trail through comprehensive logging
- On error, redirects to logout to prevent unauthorized access  
**See**

- [middlewares/ensureAuthenticated](#module_middlewares/ensureAuthenticated) Must run before this middleware
- [module:services/consent.hasLatestConsent](module:services/consent.hasLatestConsent) For consent validation logic

<a name="module_middlewares/ensureAuthenticated"></a>

## middlewares/ensureAuthenticated
Middleware for ensuring user authentication via OIDC and loading user data.

This middleware validates OIDC authentication and ensures that the user exists
in the application database. It acts as the authentication layer that must pass
before any authorization checks (like consent) are performed.

**SINGLE RESPONSIBILITY**: This middleware ONLY handles authentication.
It does NOT check consent or other authorization concerns.

<a name="module_middlewares/ensureAuthenticated..ensureAuthenticated"></a>

### middlewares/ensureAuthenticated~ensureAuthenticated(req, res, next) ⇒ <code>void</code>
Authentication Flow:
1. Validate OIDC properties (token validity, expiration, etc.)
2. Query database for user by oauth_id
3. If user exists:
   - Load user into req.user
   - Synchronize session if needed
   - Call next()
4. If user doesn't exist:
   - This means they haven't given consent yet
   - They'll be handled by consent middleware later
   - Still call next() to allow access to /consent route
5. If OIDC validation fails:
   - Clear session and redirect to welcome page

**Kind**: inner method of [<code>middlewares/ensureAuthenticated</code>](#module_middlewares/ensureAuthenticated)  
**Returns**: <code>void</code> - Calls next() on success or redirects on failure  
<a name="module_middlewares/tailscaleAuth"></a>

## middlewares/tailscaleAuth
Tailscale Authentication Middleware

Restricts access to endpoints based on Tailscale network membership.
Checks if the request originates from a Tailscale IP address.

<a name="module_middlewares/tailscaleAuth..ensureTailscaleAccess"></a>

### middlewares/tailscaleAuth~ensureTailscaleAccess(req, res, next)
Middleware to ensure request comes from Tailscale network

Checks X-Forwarded-For and X-Real-IP headers against configured Tailscale IP ranges.
In production, also validates that the request passed through nginx proxy.

**Kind**: inner method of [<code>middlewares/tailscaleAuth</code>](#module_middlewares/tailscaleAuth)  
<a name="module_services/billing_reconciliation"></a>

## services/billing\_reconciliation
Billing Reconciliation Service

This service handles retroactive billing of transactions that were initially unbilled.
Common scenarios:
- User registered after transaction completed
- Transaction was updated with user info after initial processing
- Failed billing attempts that need retry


* [services/billing_reconciliation](#module_services/billing_reconciliation)
    * [~processSingleUnbilledTransaction(txn)](#module_services/billing_reconciliation..processSingleUnbilledTransaction) ⇒ <code>Promise.&lt;{success: boolean, txn\_id: number, user\_associated: boolean, invoice\_created: boolean, invoice\_id: (number\|null), order\_id: (number\|null), error: (string\|null)}&gt;</code>
    * [~runBillingReconciliation(options)](#module_services/billing_reconciliation..runBillingReconciliation) ⇒ <code>Promise.&lt;{processed: number, users\_associated: number, invoices\_created: number, orders\_created: number, failed: number, results: Array.&lt;Object&gt;}&gt;</code>
    * [~getUnbilledTransactionStats()](#module_services/billing_reconciliation..getUnbilledTransactionStats) ⇒ <code>Promise.&lt;{total\_unbilled: number, unbilled\_with\_user: number, unbilled\_without\_user: number}&gt;</code>

<a name="module_services/billing_reconciliation..processSingleUnbilledTransaction"></a>

### services/billing_reconciliation~processSingleUnbilledTransaction(txn) ⇒ <code>Promise.&lt;{success: boolean, txn\_id: number, user\_associated: boolean, invoice\_created: boolean, invoice\_id: (number\|null), order\_id: (number\|null), error: (string\|null)}&gt;</code>
Process a single unbilled transaction: attempt to associate user and create invoice

**Kind**: inner method of [<code>services/billing\_reconciliation</code>](#module_services/billing_reconciliation)  
<a name="module_services/billing_reconciliation..runBillingReconciliation"></a>

### services/billing_reconciliation~runBillingReconciliation(options) ⇒ <code>Promise.&lt;{processed: number, users\_associated: number, invoices\_created: number, orders\_created: number, failed: number, results: Array.&lt;Object&gt;}&gt;</code>
Run billing reconciliation for all unbilled transactions

**Kind**: inner method of [<code>services/billing\_reconciliation</code>](#module_services/billing_reconciliation)  
<a name="module_services/billing_reconciliation..getUnbilledTransactionStats"></a>

### services/billing_reconciliation~getUnbilledTransactionStats() ⇒ <code>Promise.&lt;{total\_unbilled: number, unbilled\_with\_user: number, unbilled\_without\_user: number}&gt;</code>
Get summary statistics of unbilled transactions

**Kind**: inner method of [<code>services/billing\_reconciliation</code>](#module_services/billing_reconciliation)  
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
    * [~getActiveConsentRevision([consentType])](#module_services/consent..getActiveConsentRevision) ⇒ <code>Promise.&lt;(db\_consent\_revision\|null)&gt;</code>
    * [~hasValidConsent(userId)](#module_services/consent..hasValidConsent) ⇒ <code>Promise.&lt;boolean&gt;</code>
    * [~hasLatestConsent(user)](#module_services/consent..hasLatestConsent) ⇒ <code>Promise.&lt;boolean&gt;</code>
    * [~recordConsent(userId, consentRevisionId, ipAddress, userAgent, [consentMethod])](#module_services/consent..recordConsent) ⇒ <code>Promise.&lt;db\_user\_consent&gt;</code>
    * [~withdrawConsent(userId)](#module_services/consent..withdrawConsent) ⇒ <code>Promise.&lt;boolean&gt;</code>
    * [~getUserConsentHistory(userId)](#module_services/consent..getUserConsentHistory) ⇒ <code>Promise.&lt;Array.&lt;db\_user\_consent&gt;&gt;</code> \| <code>number</code> \| <code>Date</code> \| <code>boolean</code> \| <code>Date</code> \| <code>null</code> \| <code>string</code> \| <code>string</code> \| <code>string</code>
    * [~createConsentRevision(version, title, [content], [consentType], [pdfData], [pdfFilename], [pdfSize], [pdfContentType], [privacyPolicyUrl], [termsUrl], [expiresAt], [optional])](#module_services/consent..createConsentRevision) ⇒ <code>Promise.&lt;db\_consent\_revision&gt;</code>
    * [~getAllActiveConsentRevisions()](#module_services/consent..getAllActiveConsentRevisions)
    * [~getConsentPdf()](#module_services/consent..getConsentPdf)
    * [~validateAndSanitizePdf()](#module_services/consent..validateAndSanitizePdf)

<a name="module_services/consent..getActiveConsentRevision"></a>

### services/consent~getActiveConsentRevision([consentType]) ⇒ <code>Promise.&lt;(db\_consent\_revision\|null)&gt;</code>
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
<a name="module_services/consent..hasLatestConsent"></a>

### services/consent~hasLatestConsent(user) ⇒ <code>Promise.&lt;boolean&gt;</code>
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

### services/consent~recordConsent(userId, consentRevisionId, ipAddress, userAgent, [consentMethod]) ⇒ <code>Promise.&lt;db\_user\_consent&gt;</code>
Records a user's consent decision

This function creates a permanent record of user consent including metadata
for compliance and audit purposes. All consent records are immutable once
created to maintain legal audit trail integrity.

**Kind**: inner method of [<code>services/consent</code>](#module_services/consent)  
**Returns**: <code>Promise.&lt;db\_user\_consent&gt;</code> - The created consent record with audit information  
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

### services/consent~getUserConsentHistory(userId) ⇒ <code>Promise.&lt;Array.&lt;db\_user\_consent&gt;&gt;</code> \| <code>number</code> \| <code>Date</code> \| <code>boolean</code> \| <code>Date</code> \| <code>null</code> \| <code>string</code> \| <code>string</code> \| <code>string</code>
History Data Includes:
- **Chronological Order**: Most recent consent actions first
- **Version Tracking**: Which consent version was accepted
- **Withdrawal Status**: Clear indication of current consent state
- **Method Attribution**: How each consent was collected
- **Complete Timeline**: Full audit trail for compliance reporting

**Kind**: inner method of [<code>services/consent</code>](#module_services/consent)  
**Returns**: <code>Promise.&lt;Array.&lt;db\_user\_consent&gt;&gt;</code> - Array of consent history records ordered by date (newest first)<code>number</code> - id - Unique identifier for the consent record<code>Date</code> - consented_at - When consent was originally given<code>boolean</code> - is_withdrawn - Whether this consent has been withdrawn<code>Date</code> \| <code>null</code> - withdrawn_at - When consent was withdrawn (null if not withdrawn)<code>string</code> - consent_method - Method used to collect consent<code>string</code> - version - Version of the consent revision<code>string</code> - title - Title of the consent revision  
**Throws**:

- <code>Error</code> Database connection or query errors (handled via db.handleQueryError)

**Compliance**: **Audit Trail**: This function supports GDPR Article 5(2) accountability
principle by providing complete documentation of consent lifecycle events.  
<a name="module_services/consent..createConsentRevision"></a>

### services/consent~createConsentRevision(version, title, [content], [consentType], [pdfData], [pdfFilename], [pdfSize], [pdfContentType], [privacyPolicyUrl], [termsUrl], [expiresAt], [optional]) ⇒ <code>Promise.&lt;db\_consent\_revision&gt;</code>
Creation Process:
1. **Transaction Start**: Begins database transaction
2. **Deactivation**: Sets all existing active revisions to inactive
3. **Creation**: Creates new revision with is_active = true
4. **Transaction Commit**: Ensures atomic activation switch

**IMPORTANT**: This function automatically deactivates all existing active
consent revisions of that type before creating the new one. This ensures only one consent
revision is active at any given time, maintaining consistency for user consent
validation throughout the application.

**Kind**: inner method of [<code>services/consent</code>](#module_services/consent)  
**Returns**: <code>Promise.&lt;db\_consent\_revision&gt;</code> - The created consent revision record  
**Throws**:

- <code>Error</code> Database connection or query errors (handled via db.handleQueryError)

<a name="module_services/consent..getAllActiveConsentRevisions"></a>

### services/consent~getAllActiveConsentRevisions()
Retrieves all active consent revisions (one per consent_type).

**Kind**: inner method of [<code>services/consent</code>](#module_services/consent)  
<a name="module_services/consent..getConsentPdf"></a>

### services/consent~getConsentPdf()
Retrieves the PDF binary data for a consent revision.

**Kind**: inner method of [<code>services/consent</code>](#module_services/consent)  
<a name="module_services/consent..validateAndSanitizePdf"></a>

### services/consent~validateAndSanitizePdf()
Validates and sanitizes a PDF buffer.
- Checks magic bytes (%PDF)
- Enforces 10MB size limit
- Re-serializes with pdf-lib to strip JavaScript and other active content

**Kind**: inner method of [<code>services/consent</code>](#module_services/consent)  
<a name="module_services/cron"></a>

## services/cron
Cron job service for periodic transaction fetching and billing reconciliation.

- Schedules a job to run every configured interval for transaction fetching.
- Schedules billing reconciliation to run every hour.
- Calls runIncremental to fetch new transactions.
- Logs the result after each execution.
- Monitors SteVe health and automatically stops/starts cron job based on availability.


* [services/cron](#module_services/cron)
    * [~billingReconciliationJob](#module_services/cron..billingReconciliationJob)
    * [~startCronWithHealthCheck()](#module_services/cron..startCronWithHealthCheck)
    * [~stopCronWithHealthCheck()](#module_services/cron..stopCronWithHealthCheck)
    * [~getCronStatus()](#module_services/cron..getCronStatus) ⇒ <code>Object</code>

<a name="module_services/cron..billingReconciliationJob"></a>

### services/cron~billingReconciliationJob
Billing reconciliation job - runs every hour at minute 5
Attempts to:
1. Associate users with previously unbilled transactions
2. Create invoices for transactions that now have associated users

**Kind**: inner constant of [<code>services/cron</code>](#module_services/cron)  
<a name="module_services/cron..startCronWithHealthCheck"></a>

### services/cron~startCronWithHealthCheck()
Start the transaction fetch cron job with health monitoring

**Kind**: inner method of [<code>services/cron</code>](#module_services/cron)  
<a name="module_services/cron..stopCronWithHealthCheck"></a>

### services/cron~stopCronWithHealthCheck()
Stop the transaction fetch cron job and health monitoring

**Kind**: inner method of [<code>services/cron</code>](#module_services/cron)  
<a name="module_services/cron..getCronStatus"></a>

### services/cron~getCronStatus() ⇒ <code>Object</code>
Get cron job status

**Kind**: inner method of [<code>services/cron</code>](#module_services/cron)  
<a name="module_services/dbMigration"></a>

## services/dbMigration
Migration service module
Handles database migrations programmatically using node-pg-migrate


* [services/dbMigration](#module_services/dbMigration)
    * [~buildConnectionUrl()](#module_services/dbMigration..buildConnectionUrl) ⇒ <code>string</code>
    * [~createDatabaseIfNotExists()](#module_services/dbMigration..createDatabaseIfNotExists) ⇒ <code>Promise.&lt;boolean&gt;</code>
    * [~runMigrations()](#module_services/dbMigration..runMigrations) ⇒ <code>Promise.&lt;void&gt;</code>

<a name="module_services/dbMigration..buildConnectionUrl"></a>

### services/dbMigration~buildConnectionUrl() ⇒ <code>string</code>
Build database connection URL from environment variables

**Kind**: inner method of [<code>services/dbMigration</code>](#module_services/dbMigration)  
**Returns**: <code>string</code> - PostgreSQL connection URL  
**Throws**:

- <code>Error</code> If required environment variables are missing

<a name="module_services/dbMigration..createDatabaseIfNotExists"></a>

### services/dbMigration~createDatabaseIfNotExists() ⇒ <code>Promise.&lt;boolean&gt;</code>
Create database if it doesn't exist
Connects to the default 'postgres' database and creates the target database

**Kind**: inner method of [<code>services/dbMigration</code>](#module_services/dbMigration)  
**Returns**: <code>Promise.&lt;boolean&gt;</code> - True if database was created, false if it already existed  
**Throws**:

- <code>Error</code> If database creation fails

<a name="module_services/dbMigration..runMigrations"></a>

### services/dbMigration~runMigrations() ⇒ <code>Promise.&lt;void&gt;</code>
Run pending database migrations

**Kind**: inner method of [<code>services/dbMigration</code>](#module_services/dbMigration)  
**Throws**:

- <code>Error</code> If migration fails

<a name="module_services/logger"></a>

## services/logger : <code>winston</code>
Logger service using winston with file rotation and enhanced console output


* [services/logger](#module_services/logger) : <code>winston</code>
    * [~safeStringify(obj)](#module_services/logger..safeStringify) ⇒ <code>string</code>
    * [~prettyPrint(value)](#module_services/logger..prettyPrint) ⇒ <code>string</code>

<a name="module_services/logger..safeStringify"></a>

### services/logger~safeStringify(obj) ⇒ <code>string</code>
Safely stringify objects with circular references

**Kind**: inner method of [<code>services/logger</code>](#module_services/logger)  
**Returns**: <code>string</code> - JSON string or empty string if no metadata  
<a name="module_services/logger..prettyPrint"></a>

### services/logger~prettyPrint(value) ⇒ <code>string</code>
Pretty-print a value for logs (safe for circular refs)

**Kind**: inner method of [<code>services/logger</code>](#module_services/logger)  
<a name="module_services/network"></a>

## services/network
Network service module for external API clients.

- Exports pre-configured Axios instances for Odoo and SteVe APIs.
- Tests connections to SteVe and Odoo on module load.


* [services/network](#module_services/network)
    * [~odooAuthedAxios](#module_services/network..odooAuthedAxios) : <code>AxiosInstance</code>
    * [~odooPlainAxios](#module_services/network..odooPlainAxios) : <code>AxiosInstance</code>
    * [~steveAxios](#module_services/network..steveAxios)
    * [~getSteveHealth()](#module_services/network..getSteveHealth) ⇒ <code>Object</code>
    * [~updateSteveHealth(isHealthy, error)](#module_services/network..updateSteveHealth)
    * [~checkSteveHealth()](#module_services/network..checkSteveHealth) ⇒ <code>Promise.&lt;boolean&gt;</code>
    * [~createOdooAxios([includeAuth])](#module_services/network..createOdooAxios) ⇒ <code>AxiosInstance</code>
    * [~unsuccessfulResponse(res, statusCode, responseData)](#module_services/network..unsuccessfulResponse) ⇒ <code>\*</code>
    * [~getIP(req, ensureProxyHeaders)](#module_services/network..getIP) ⇒ <code>string</code>
    * [~isIPInCIDR(ip, cidr)](#module_services/network..isIPInCIDR) ⇒ <code>boolean</code>

<a name="module_services/network..odooAuthedAxios"></a>

### services/network~odooAuthedAxios : <code>AxiosInstance</code>
An Axios instance for interacting with the Odoo API with authentication with internal docker network.

**Kind**: inner constant of [<code>services/network</code>](#module_services/network)  
<a name="module_services/network..odooPlainAxios"></a>

### services/network~odooPlainAxios : <code>AxiosInstance</code>
An Axios instance for interacting with the Odoo API without authentication with internal docker network.

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

<a name="module_services/network..getSteveHealth"></a>

### services/network~getSteveHealth() ⇒ <code>Object</code>
Get SteVe health status

**Kind**: inner method of [<code>services/network</code>](#module_services/network)  
<a name="module_services/network..updateSteveHealth"></a>

### services/network~updateSteveHealth(isHealthy, error)
Update SteVe health status

**Kind**: inner method of [<code>services/network</code>](#module_services/network)  
<a name="module_services/network..checkSteveHealth"></a>

### services/network~checkSteveHealth() ⇒ <code>Promise.&lt;boolean&gt;</code>
Check SteVe connection health

**Kind**: inner method of [<code>services/network</code>](#module_services/network)  
<a name="module_services/network..createOdooAxios"></a>

### services/network~createOdooAxios([includeAuth]) ⇒ <code>AxiosInstance</code>
Creates a pre-configured Axios instance for interacting with the Odoo API.

**Kind**: inner method of [<code>services/network</code>](#module_services/network)  
**Returns**: <code>AxiosInstance</code> - A configured Axios instance for Odoo API requests.  
**Throws**:

- <code>SystemError</code> If `includeAuth` is true and the Odoo admin API key is not set in the environment variables.

<a name="module_services/network..unsuccessfulResponse"></a>

### services/network~unsuccessfulResponse(res, statusCode, responseData) ⇒ <code>\*</code>
Helper function to send a standardized unsuccessful response.

**Kind**: inner method of [<code>services/network</code>](#module_services/network)  
<a name="module_services/network..getIP"></a>

### services/network~getIP(req, ensureProxyHeaders) ⇒ <code>string</code>
Helper function to extract the client's IP address from the request

**Kind**: inner method of [<code>services/network</code>](#module_services/network)  
<a name="module_services/network..isIPInCIDR"></a>

### services/network~isIPInCIDR(ip, cidr) ⇒ <code>boolean</code>
Check if an IP address is within a CIDR range

**Kind**: inner method of [<code>services/network</code>](#module_services/network)  
<a name="module_services/odoo"></a>

## services/odoo
Odoo Integration Service

It is responsible for user creation, login, key rotation, and invoicing with Odoo via REST API.


* [services/odoo](#module_services/odoo)
    * [~createOdooUser(user)](#module_services/odoo..createOdooUser)
    * [~getOdooPortalLogin(user)](#module_services/odoo..getOdooPortalLogin) ⇒ <code>string</code>
    * [~rotateOdooUserAuth(user)](#module_services/odoo..rotateOdooUserAuth) ⇒ <code>Promise.&lt;Object&gt;</code>
    * [~sendTxnToOdooProcessing(db_txn)](#module_services/odoo..sendTxnToOdooProcessing) ⇒ <code>Promise.&lt;Object&gt;</code>

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

<a name="module_services/odoo..sendTxnToOdooProcessing"></a>

### services/odoo~sendTxnToOdooProcessing(db_txn) ⇒ <code>Promise.&lt;Object&gt;</code>
Sends the txn to odoo for processing. Creating sales or invoice is its responsibility.

Request payload to Odoo:
  partner_id (int): ID of the sale/customer (`res.partner`).
  lines_data (list[dict]): Invoice line data dict with the following fields:
    - name (str): Product name.
    - sku (str): Internal reference for product.
    - uom_name (str): Unit of measure name (e.g., "kWh"; only "kWh" accepted for now).
    - base_price (float): Standard list price for product (e.g., 0.35).
    - custom_rate (float): Actual invoice price (e.g., 0.38).
    - quantity (float): Consumed quantity (e.g., 150, in kWh).
    - session_start (datetime): Session start datetime in ISO.
    - session_end (datetime): Session end datetime in ISO.
    - session_backend_ref (int): Steve txn ID for the transaction.
    // TODO: Add more fields if needed. e.g. payment terms, bill_date etc.

- Validates the transaction object.
- Fetches Odoo credentials for the user.
- Prepares invoice line data.
- Sends a POST request to Odoo to create the order/invoice.
- Stores order and invoice (if created) in local database.
- Links them via junction table for consolidated billing support.

**Kind**: inner method of [<code>services/odoo</code>](#module_services/odoo)  
**Returns**: <code>Promise.&lt;Object&gt;</code> - Object containing {order_id, odoo_order_id, invoice_id, odoo_invoice_id}  
**Throws**:

- <code>ValidationError</code><code>SystemError</code> On validation or Odoo errors.

<a name="module_services/steve_transactions"></a>

## services/steve\_transactions
SteVe Transactions Service

Responsible for fetching and recording transactions from the external SteVe API.
This service does NOT handle billing - all billing logic is in billing_reconciliation service.

Sliding window fetch strategy:
On each run, we fetch all transactions from the last N minutes (default 3).
Since recordTransaction uses upsert (ON CONFLICT), re-fetching the same transaction is safe.
This eliminates watermark drift bugs and ensures no transactions are missed.

Steve API docs: Steve http://instance:port/steve/manager/swagger-ui/swagger-ui/index.html


* [services/steve_transactions](#module_services/steve_transactions)
    * [~TEMPORARY_STOP_REASONS](#module_services/steve_transactions..TEMPORARY_STOP_REASONS)
    * [~PERMANENT_STOP_REASONS](#module_services/steve_transactions..PERMANENT_STOP_REASONS)
    * [~fetchTxnsSince([since])](#module_services/steve_transactions..fetchTxnsSince) ⇒ <code>Promise.&lt;Array.&lt;{steve\_txn}&gt;&gt;</code>
    * [~processTxns(txns)](#module_services/steve_transactions..processTxns) ⇒ <code>Promise.&lt;{processedTxnCount: number, completedTxnCount: number}&gt;</code>
    * [~runIncremental()](#module_services/steve_transactions..runIncremental) ⇒ <code>Promise.&lt;{fetchedTxnCount: number, processedTxnCount: number, completedTxnCount: number}&gt;</code>
    * [~runFull()](#module_services/steve_transactions..runFull) ⇒ <code>Promise.&lt;{fetchedTxnCount: number, processedTxnCount: number, completedTxnCount: number}&gt;</code>
    * [~runToday()](#module_services/steve_transactions..runToday) ⇒ <code>Promise.&lt;{fetchedTxnCount: number, processedTxnCount: number, completedTxnCount: number}&gt;</code>

<a name="module_services/steve_transactions..TEMPORARY_STOP_REASONS"></a>

### services/steve_transactions~TEMPORARY\_STOP\_REASONS
Stop reasons that indicate a transaction is temporarily stopped/paused
and should not be billed yet (may resume later).
According to OCPP1.6 spec
For now we do not handle any temporary stop reasons differently. Bill the transaction if it has stopTimestamp.

**Kind**: inner constant of [<code>services/steve\_transactions</code>](#module_services/steve_transactions)  
<a name="module_services/steve_transactions..PERMANENT_STOP_REASONS"></a>

### services/steve_transactions~PERMANENT\_STOP\_REASONS
Stop reasons that indicate a permanent transaction end
and should be processed for billing.
According to OCPP1.6 spec
For now we do not handle any temporary stop reasons differently. Bill the transaction if it has stopTimestamp.

**Kind**: inner constant of [<code>services/steve\_transactions</code>](#module_services/steve_transactions)  
<a name="module_services/steve_transactions..fetchTxnsSince"></a>

### services/steve_transactions~fetchTxnsSince([since]) ⇒ <code>Promise.&lt;Array.&lt;{steve\_txn}&gt;&gt;</code>
Fetch all transactions since a given timestamp (exclusive)
If no timestamp is provided, fetch all transactions

**Kind**: inner method of [<code>services/steve\_transactions</code>](#module_services/steve_transactions)  
**Returns**: <code>Promise.&lt;Array.&lt;{steve\_txn}&gt;&gt;</code> - Array of transactions  
<a name="module_services/steve_transactions..processTxns"></a>

### services/steve_transactions~processTxns(txns) ⇒ <code>Promise.&lt;{processedTxnCount: number, completedTxnCount: number}&gt;</code>
Record all transactions in the database.

**Kind**: inner method of [<code>services/steve\_transactions</code>](#module_services/steve_transactions)  
**Returns**: <code>Promise.&lt;{processedTxnCount: number, completedTxnCount: number}&gt;</code> - count of transactions  
**Throws**:

- <code>ValidationError</code> If any transaction does not match the expected schema

<a name="module_services/steve_transactions..runIncremental"></a>

### services/steve_transactions~runIncremental() ⇒ <code>Promise.&lt;{fetchedTxnCount: number, processedTxnCount: number, completedTxnCount: number}&gt;</code>
Run incremental fetch: fetch transactions from the last N minutes (sliding window).
Re-fetching duplicates is safe due to upsert in recordTransaction.

**Kind**: inner method of [<code>services/steve\_transactions</code>](#module_services/steve_transactions)  
<a name="module_services/steve_transactions..runFull"></a>

### services/steve_transactions~runFull() ⇒ <code>Promise.&lt;{fetchedTxnCount: number, processedTxnCount: number, completedTxnCount: number}&gt;</code>
Fetches all transactions from Steve and processes them.
Use for a full sync (no time filter).

**Kind**: inner method of [<code>services/steve\_transactions</code>](#module_services/steve_transactions)  
<a name="module_services/steve_transactions..runToday"></a>

### services/steve_transactions~runToday() ⇒ <code>Promise.&lt;{fetchedTxnCount: number, processedTxnCount: number, completedTxnCount: number}&gt;</code>
Fetch and process all of today's transactions.

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
    * [~createSteveUser(user, [blocked], [reason], [failIfExists])](#module_services/steve_user..createSteveUser) ⇒ <code>Promise.&lt;(Object\|null)&gt;</code>
    * [~getSteveUser(user_rfid)](#module_services/steve_user..getSteveUser) ⇒ <code>Promise.&lt;(steve\_user\|null)&gt;</code>
    * [~blockSteveUser(user, [reason], [expiredDate])](#module_services/steve_user..blockSteveUser) ⇒ <code>Promise.&lt;void&gt;</code>
    * [~unblockSteveUser(user, reason)](#module_services/steve_user..unblockSteveUser) ⇒ <code>Promise.&lt;void&gt;</code>
    * [~deleteSteveUser(user)](#module_services/steve_user..deleteSteveUser) ⇒ <code>Promise.&lt;void&gt;</code>
    * [~changeRFIDofSteveUser(user, old_rfid)](#module_services/steve_user..changeRFIDofSteveUser)

<a name="module_services/steve_user..createSteveUser"></a>

### services/steve_user~createSteveUser(user, [blocked], [reason], [failIfExists]) ⇒ <code>Promise.&lt;(Object\|null)&gt;</code>
Creates a new user in SteVe with the given RFID.
- If the user already exists in SteVe, records a FIND USER activity and saves the `ocppTagPk` to the local DB.
- If the user does not exist, creates it with the specified block status, validates the response,
  stores the returned `ocppTagPk` in the local DB and returns the created SteVe user data.
- Side effects: updates DB via `db.setSteveUserParamaters` and records activity logs.

**Kind**: inner method of [<code>services/steve\_user</code>](#module_services/steve_user)  
**Returns**: <code>Promise.&lt;(Object\|null)&gt;</code> - Resolves to the created SteVe user object when a new user was created; resolves to `null` if the user already existed (no new creation).  
**Throws**:

- <code>ValidationError</code><code>SystemError</code><code>Error</code> If validation fails, SteVe returns an error or no response, or other failures occur.

<a name="module_services/steve_user..getSteveUser"></a>

### services/steve_user~getSteveUser(user_rfid) ⇒ <code>Promise.&lt;(steve\_user\|null)&gt;</code>
Fetches a user from SteVe by RFID.
Returns null if not found, throws if multiple found or on error.
Validates the user data.

**Kind**: inner method of [<code>services/steve\_user</code>](#module_services/steve_user)  
**Returns**: <code>Promise.&lt;(steve\_user\|null)&gt;</code> - User data array or null if not found.  
**Throws**:

- <code>ValidationError</code><code>Error</code> On invalid input or fetch error.

<a name="module_services/steve_user..blockSteveUser"></a>

### services/steve_user~blockSteveUser(user, [reason], [expiredDate]) ⇒ <code>Promise.&lt;void&gt;</code>
Blocks a user in SteVe by setting their maxActiveTransactionCount to 0.
Validates input, updates the user, checks the block status, and logs the action.

**Kind**: inner method of [<code>services/steve\_user</code>](#module_services/steve_user)  
**Throws**:

- <code>ValidationError</code><code>Error</code> If input is invalid or block fails.

<a name="module_services/steve_user..unblockSteveUser"></a>

### services/steve_user~unblockSteveUser(user, reason) ⇒ <code>Promise.&lt;void&gt;</code>
Unblocks a user in SteVe by setting their maxActiveTransactionCount to 1.
Validates input, updates the user, checks the unblock status, and logs the action.

**Kind**: inner method of [<code>services/steve\_user</code>](#module_services/steve_user)  
**Throws**:

- <code>ValidationError</code><code>Error</code> If input is invalid or unblock fails.

<a name="module_services/steve_user..deleteSteveUser"></a>

### services/steve_user~deleteSteveUser(user) ⇒ <code>Promise.&lt;void&gt;</code>
Deletes a user from SteVe by their steve_id.
Validates input, deletes the user, and logs the action.

**Kind**: inner method of [<code>services/steve\_user</code>](#module_services/steve_user)  
**Throws**:

- <code>ValidationError</code><code>Error</code> If input is invalid or deletion fails.

<a name="module_services/steve_user..changeRFIDofSteveUser"></a>

### services/steve_user~changeRFIDofSteveUser(user, old_rfid)
Changes the RFID of an existing SteVe user.
Should run after the RFID is changed in the local DB.

**Kind**: inner method of [<code>services/steve\_user</code>](#module_services/steve_user)  
<a name="module_services/user_operations"></a>

## services/user\_operations
Service for checking overall user integrity and creating users with proper links to external systems.

<a name="module_services/user_operations..userOperations"></a>

### services/user_operations~userOperations(oidc_user, [createUserIfNotExists]) ⇒ <code>Promise.&lt;Object&gt;</code>
Handles user creation and linking with external systems.

- Checks if a user exists by OIDC ID.
- If not, and createUserIfNotExists is true creates a new user with the users' rfid.
- If not, and createUserIfNotExists is false, returns null.
- If user exists but is deactivated, throws an error.
- If user exists, checks for updates in OIDC data and updates the user if needed.
- Ensures the user is registered in Odoo and Steve systems.
- Returns the up-to-date detailed user object.

**Kind**: inner method of [<code>services/user\_operations</code>](#module_services/user_operations)  
**Returns**: <code>Promise.&lt;Object&gt;</code> - User object from the database.  
<a name="module_utils/env-validator"></a>

## utils/env-validator
Environment variable validation
Validates all required environment variables at startup to catch configuration issues early.


* [utils/env-validator](#module_utils/env-validator)
    * [~envSchema](#module_utils/env-validator..envSchema)
    * [~validateEnv()](#module_utils/env-validator..validateEnv) ⇒ <code>Object</code>
    * [~validateEnvOrExit()](#module_utils/env-validator..validateEnvOrExit)

<a name="module_utils/env-validator..envSchema"></a>

### utils/env-validator~envSchema
Schema for environment variable validation

**Kind**: inner constant of [<code>utils/env-validator</code>](#module_utils/env-validator)  
<a name="module_utils/env-validator..validateEnv"></a>

### utils/env-validator~validateEnv() ⇒ <code>Object</code>
Validates environment variables against the schema

**Kind**: inner method of [<code>utils/env-validator</code>](#module_utils/env-validator)  
**Returns**: <code>Object</code> - Validated and sanitized environment variables  
**Throws**:

- <code>Error</code> If validation fails

<a name="module_utils/env-validator..validateEnvOrExit"></a>

### utils/env-validator~validateEnvOrExit()
Validates environment variables and exits process if validation fails
Should be called at the very beginning of the application

**Kind**: inner method of [<code>utils/env-validator</code>](#module_utils/env-validator)  
<a name="module_utils/oidc_config"></a>

## utils/oidc\_config
OIDC configuration for authentication middleware.

- Uses environment variables for secrets and endpoints.
- Customizes authorization parameters and routes.

<a name="module_utils/queries"></a>

## utils/queries
Global database queries


* [utils/queries](#module_utils/queries)
    * [~normalizeRFID(rfid)](#module_utils/queries..normalizeRFID) ⇒ <code>string</code>
    * [~handleQueryError(error, operation, silent)](#module_utils/queries..handleQueryError)
    * [~getUsers(filters, options)](#module_utils/queries..getUsers) ⇒ <code>Promise.&lt;Array&gt;</code>
    * [~getUserUnique(filters)](#module_utils/queries..getUserUnique) ⇒ <code>Promise.&lt;(User\|null)&gt;</code>
    * [~setUserOdooCredentials(user, odoo_user_id, odoo_partner_id, encrypted_key, salt)](#module_utils/queries..setUserOdooCredentials) ⇒ <code>Promise.&lt;number&gt;</code>
    * [~getUserOdooCredentials(user_id)](#module_utils/queries..getUserOdooCredentials) ⇒ <code>Promise.&lt;(Object\|null)&gt;</code>
    * [~rotateOdooUserKey(user_id, old_key_id, new_key, new_key_salt)](#module_utils/queries..rotateOdooUserKey) ⇒ <code>Promise.&lt;boolean&gt;</code>
    * [~setSteveUserParamaters(user, steve_id)](#module_utils/queries..setSteveUserParamaters) ⇒ <code>Promise.&lt;(Object\|undefined)&gt;</code>
    * [~recordActivityLog(user_id, event_type, target, rfid, reason)](#module_utils/queries..recordActivityLog) ⇒ <code>Promise.&lt;void&gt;</code>
    * [~userCrossCheckForTxn(client, ocppTagPk, ocppIdTag, txn_steve_id)](#module_utils/queries..userCrossCheckForTxn) ⇒ <code>Promise.&lt;(number\|null)&gt;</code>
    * [~recordSteveTxn(steve_txn)](#module_utils/queries..recordSteveTxn) ⇒ <code>Promise.&lt;Object.&lt;db\_txn&gt;&gt;</code>
    * ~~[~saveInvoiceId(txn, invoice_id)](#module_utils/queries..saveInvoiceId) ⇒ <code>Promise.&lt;void&gt;</code>~~
    * [~getTransactionBySteveTxnId(steve_txn_id)](#module_utils/queries..getTransactionBySteveTxnId) ⇒ <code>Promise.&lt;(Object\|null)&gt;</code>
    * [~upsertTxnOdooOrder(txn_id, orderDetails)](#module_utils/queries..upsertTxnOdooOrder) ⇒ <code>Promise.&lt;db\_odoo\_txn\_order&gt;</code>
    * [~updateTxnOdooOrder(odoo_saleorder_id, updates)](#module_utils/queries..updateTxnOdooOrder) ⇒ <code>Promise.&lt;(db\_odoo\_txn\_order\|null)&gt;</code>
    * [~upsertTxnOdooInvoice(odoo_invoice_id, invoiceDetails)](#module_utils/queries..upsertTxnOdooInvoice) ⇒ <code>Promise.&lt;db\_odoo\_invoice&gt;</code>
    * [~updateTxnOdooInvoice(odoo_invoice_id, updates)](#module_utils/queries..updateTxnOdooInvoice) ⇒ <code>Promise.&lt;(db\_odoo\_invoice\|null)&gt;</code>
    * [~getTxnOdooDetails(txn_id)](#module_utils/queries..getTxnOdooDetails) ⇒ <code>Promise.&lt;Array&gt;</code>
    * [~getOdooOrderIdBySaleOrderId(odoo_saleorder_id)](#module_utils/queries..getOdooOrderIdBySaleOrderId) ⇒ <code>Promise.&lt;(number\|null)&gt;</code>
    * [~getInvoiceIdByOdooInvoiceId(odoo_invoice_id)](#module_utils/queries..getInvoiceIdByOdooInvoiceId) ⇒ <code>Promise.&lt;(number\|null)&gt;</code>
    * [~linkOrderToInvoice(orderIds, invoiceId)](#module_utils/queries..linkOrderToInvoice) ⇒ <code>Promise.&lt;Array&gt;</code>
    * [~getOrdersByInvoiceId(invoice_id)](#module_utils/queries..getOrdersByInvoiceId) ⇒ <code>Promise.&lt;Array&gt;</code>
    * [~getElectricityPrice(specified_datetime)](#module_utils/queries..getElectricityPrice) ⇒ <code>Promise.&lt;({price\_eur\_kwh: Number, valid\_from: DateTime, valid\_till: DateTime}\|null)&gt;</code>
    * [~getElectricityPriceOrDefault([specified_datetime])](#module_utils/queries..getElectricityPriceOrDefault) ⇒ <code>Promise.&lt;{for\_timestamp:DateTime, price\_eur\_kwh: Number, valid\_from: DateTime, valid\_till: DateTime}&gt;</code>
    * [~getUsersCount(filters)](#module_utils/queries..getUsersCount) ⇒ <code>Promise.&lt;number&gt;</code>
    * [~updateUser(userId, updates)](#module_utils/queries..updateUser) ⇒ <code>Promise.&lt;object&gt;</code>
    * [~activateUser(user)](#module_utils/queries..activateUser)
    * [~getUserOpenChargingSession(user_id)](#module_utils/queries..getUserOpenChargingSession) ⇒ <code>Promise.&lt;(db\_txn\|null)&gt;</code>
    * [~deleteUser(user)](#module_utils/queries..deleteUser)
    * [~getUnbilledTransactions(options)](#module_utils/queries..getUnbilledTransactions) ⇒ <code>Promise.&lt;Array.&lt;Object.&lt;db\_txn&gt;&gt;&gt;</code>
    * [~tryAssociateUserToTransaction(db_txn)](#module_utils/queries..tryAssociateUserToTransaction) ⇒ <code>Promise.&lt;(number\|null)&gt;</code>
    * [~getAllElectricityPrices()](#module_utils/queries..getAllElectricityPrices) ⇒ <code>Promise.&lt;Array&gt;</code>
    * [~setElectricityPrice(price_eur_kwh, valid_from)](#module_utils/queries..setElectricityPrice) ⇒ <code>Promise.&lt;Object&gt;</code>
    * [~getAllVATRates()](#module_utils/queries..getAllVATRates) ⇒ <code>Promise.&lt;Array&gt;</code>
    * [~setVATRate(rate, description, effective_from)](#module_utils/queries..setVATRate) ⇒ <code>Promise.&lt;Object&gt;</code>

<a name="module_utils/queries..normalizeRFID"></a>

### utils/queries~normalizeRFID(rfid) ⇒ <code>string</code>
Normalizes RFID tags to uppercase for consistent storage and comparison.
RFIDs may come in different cases from different sources (SteVe, OIDC, etc.)

**Kind**: inner method of [<code>utils/queries</code>](#module_utils/queries)  
**Returns**: <code>string</code> - Normalized RFID in uppercase  
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

<a name="module_utils/queries..getUserUnique"></a>

### utils/queries~getUserUnique(filters) ⇒ <code>Promise.&lt;(User\|null)&gt;</code>
Gets a single user with uniqueness validation.
Throws an error if multiple users match the criteria.

**Kind**: inner method of [<code>utils/queries</code>](#module_utils/queries)  
**Returns**: <code>Promise.&lt;(User\|null)&gt;</code> - - The matching user or null if not found  
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
<a name="module_utils/queries..userCrossCheckForTxn"></a>

### utils/queries~userCrossCheckForTxn(client, ocppTagPk, ocppIdTag, txn_steve_id) ⇒ <code>Promise.&lt;(number\|null)&gt;</code>
Cross-check user by steve_id and validate RFID consistency

**Kind**: inner method of [<code>utils/queries</code>](#module_utils/queries)  
**Returns**: <code>Promise.&lt;(number\|null)&gt;</code> - - user_id if found, null otherwise  
<a name="module_utils/queries..recordSteveTxn"></a>

### utils/queries~recordSteveTxn(steve_txn) ⇒ <code>Promise.&lt;Object.&lt;db\_txn&gt;&gt;</code>
Record a transaction record into the `charging_transactions` table.
If transaction already exists and is complete, returns it without modification.
Otherwise, inserts a new record with proper user association or updates existing one.

**Kind**: inner method of [<code>utils/queries</code>](#module_utils/queries)  
**Returns**: <code>Promise.&lt;Object.&lt;db\_txn&gt;&gt;</code> - db_txn - The transaction record from database  
<a name="module_utils/queries..saveInvoiceId"></a>

### ~~utils/queries~saveInvoiceId(txn, invoice_id) ⇒ <code>Promise.&lt;void&gt;</code>~~
***Use upsertTxnOdooOrder() and linkOrderToInvoice() instead.
This function is kept for backward compatibility only.
The invoice_ref column is being deprecated in favor of the odoo_txn_orders/odoo_invoices tables.***

Updates the `invoice_ref` field for a transaction in `charging_transactions`.
This is used to link a transaction to an invoice in Odoo.

**Kind**: inner method of [<code>utils/queries</code>](#module_utils/queries)  
**Throws**:

- <code>DatabaseError</code><code>ValidationError</code> On query error.

<a name="module_utils/queries..getTransactionBySteveTxnId"></a>

### utils/queries~getTransactionBySteveTxnId(steve_txn_id) ⇒ <code>Promise.&lt;(Object\|null)&gt;</code>
Retrieves a transaction by its Steve ID.

**Kind**: inner method of [<code>utils/queries</code>](#module_utils/queries)  
**Returns**: <code>Promise.&lt;(Object\|null)&gt;</code> - The transaction object or null if not found  
<a name="module_utils/queries..upsertTxnOdooOrder"></a>

### utils/queries~upsertTxnOdooOrder(txn_id, orderDetails) ⇒ <code>Promise.&lt;db\_odoo\_txn\_order&gt;</code>
Creates or updates a sale order record linked to a charging transaction.
If odoo_saleorder_id already exists, updates the existing record by the txn_id

**Kind**: inner method of [<code>utils/queries</code>](#module_utils/queries)  
**Returns**: <code>Promise.&lt;db\_odoo\_txn\_order&gt;</code> - The upserted order record  
<a name="module_utils/queries..updateTxnOdooOrder"></a>

### utils/queries~updateTxnOdooOrder(odoo_saleorder_id, updates) ⇒ <code>Promise.&lt;(db\_odoo\_txn\_order\|null)&gt;</code>
Updates an existing sale order record by Odoo sale order ID.
Only updates fields that are provided (non-undefined).

**Kind**: inner method of [<code>utils/queries</code>](#module_utils/queries)  
**Returns**: <code>Promise.&lt;(db\_odoo\_txn\_order\|null)&gt;</code> - The updated order record or null if not found  
<a name="module_utils/queries..upsertTxnOdooInvoice"></a>

### utils/queries~upsertTxnOdooInvoice(odoo_invoice_id, invoiceDetails) ⇒ <code>Promise.&lt;db\_odoo\_invoice&gt;</code>
Creates or updates an invoice record.
If odoo_invoice_id already exists, updates the existing record.
To link orders to this invoice, use linkOrderToInvoice() function.

**Kind**: inner method of [<code>utils/queries</code>](#module_utils/queries)  
**Returns**: <code>Promise.&lt;db\_odoo\_invoice&gt;</code> - The upserted invoice record  
<a name="module_utils/queries..updateTxnOdooInvoice"></a>

### utils/queries~updateTxnOdooInvoice(odoo_invoice_id, updates) ⇒ <code>Promise.&lt;(db\_odoo\_invoice\|null)&gt;</code>
Updates an existing invoice record by Odoo invoice ID.
Only updates fields that are provided (non-undefined).

**Kind**: inner method of [<code>utils/queries</code>](#module_utils/queries)  
**Returns**: <code>Promise.&lt;(db\_odoo\_invoice\|null)&gt;</code> - The updated invoice record or null if not found  
<a name="module_utils/queries..getTxnOdooDetails"></a>

### utils/queries~getTxnOdooDetails(txn_id) ⇒ <code>Promise.&lt;Array&gt;</code>
Gets all order and invoice details for a charging transaction.

**Kind**: inner method of [<code>utils/queries</code>](#module_utils/queries)  
**Returns**: <code>Promise.&lt;Array&gt;</code> - Array of orders with their linked invoices  
<a name="module_utils/queries..getOdooOrderIdBySaleOrderId"></a>

### utils/queries~getOdooOrderIdBySaleOrderId(odoo_saleorder_id) ⇒ <code>Promise.&lt;(number\|null)&gt;</code>
Gets the local order record ID by Odoo sale order ID.
Useful when you need to link an invoice to an order.

**Kind**: inner method of [<code>utils/queries</code>](#module_utils/queries)  
**Returns**: <code>Promise.&lt;(number\|null)&gt;</code> - The local order ID or null if not found  
<a name="module_utils/queries..getInvoiceIdByOdooInvoiceId"></a>

### utils/queries~getInvoiceIdByOdooInvoiceId(odoo_invoice_id) ⇒ <code>Promise.&lt;(number\|null)&gt;</code>
Gets the local invoice record ID by Odoo invoice ID.

**Kind**: inner method of [<code>utils/queries</code>](#module_utils/queries)  
**Returns**: <code>Promise.&lt;(number\|null)&gt;</code> - The local invoice ID or null if not found  
<a name="module_utils/queries..linkOrderToInvoice"></a>

### utils/queries~linkOrderToInvoice(orderIds, invoiceId) ⇒ <code>Promise.&lt;Array&gt;</code>
Links one or more orders to an invoice (for consolidated billing).
Each order can only be linked to one invoice.

**Kind**: inner method of [<code>utils/queries</code>](#module_utils/queries)  
**Returns**: <code>Promise.&lt;Array&gt;</code> - Array of created link records  
<a name="module_utils/queries..getOrdersByInvoiceId"></a>

### utils/queries~getOrdersByInvoiceId(invoice_id) ⇒ <code>Promise.&lt;Array&gt;</code>
Gets all orders linked to a specific invoice.

**Kind**: inner method of [<code>utils/queries</code>](#module_utils/queries)  
**Returns**: <code>Promise.&lt;Array&gt;</code> - Array of order records  
<a name="module_utils/queries..getElectricityPrice"></a>

### utils/queries~getElectricityPrice(specified_datetime) ⇒ <code>Promise.&lt;({price\_eur\_kwh: Number, valid\_from: DateTime, valid\_till: DateTime}\|null)&gt;</code>
Retrieves the current electricity price from the database.
If a `specified_datetime` is provided, it will return the price valid at that time.
If no price is found, it returns null.

**Kind**: inner method of [<code>utils/queries</code>](#module_utils/queries)  
<a name="module_utils/queries..getElectricityPriceOrDefault"></a>

### utils/queries~getElectricityPriceOrDefault([specified_datetime]) ⇒ <code>Promise.&lt;{for\_timestamp:DateTime, price\_eur\_kwh: Number, valid\_from: DateTime, valid\_till: DateTime}&gt;</code>
Retrieves the current electricity price or falls back to a default price if none is found.

This function attempts to fetch the electricity price for a specified datetime
or the current time if no datetime is provided. If no price is found or the price
is invalid, it falls back to a default price defined in the global configuration.

**Kind**: inner method of [<code>utils/queries</code>](#module_utils/queries)  
**Returns**: <code>Promise.&lt;{for\_timestamp:DateTime, price\_eur\_kwh: Number, valid\_from: DateTime, valid\_till: DateTime}&gt;</code> - - The electricity price in EUR/kWh.  
**Throws**:

- <code>ValidationError</code> - If the specified datetime is invalid.
- <code>DatabaseError</code> - If there is an error during the database query.

<a name="module_utils/queries..getUsersCount"></a>

### utils/queries~getUsersCount(filters) ⇒ <code>Promise.&lt;number&gt;</code>
Get total count of users matching the given filters

**Kind**: inner method of [<code>utils/queries</code>](#module_utils/queries)  
**Returns**: <code>Promise.&lt;number&gt;</code> - Total count of matching users  
<a name="module_utils/queries..updateUser"></a>

### utils/queries~updateUser(userId, updates) ⇒ <code>Promise.&lt;object&gt;</code>
Updates specific user's information in the database.
Uses a whitelist of allowed columns to prevent unauthorized field updates.

**Kind**: inner method of [<code>utils/queries</code>](#module_utils/queries)  
**Returns**: <code>Promise.&lt;object&gt;</code> - The updated user object.  
**Throws**:

- <code>ValidationError</code> If userId is invalid, updates is empty, or contains invalid column names.
- <code>DatabaseError</code> If database operation fails.

<a name="module_utils/queries..activateUser"></a>

### utils/queries~activateUser(user)
Activates a previously deactivated user.

**Kind**: inner method of [<code>utils/queries</code>](#module_utils/queries)  
**Throws**:

- <code>ValidationError</code> If required parameters are missing.
- <code>DatabaseError</code> If activation fails.

<a name="module_utils/queries..getUserOpenChargingSession"></a>

### utils/queries~getUserOpenChargingSession(user_id) ⇒ <code>Promise.&lt;(db\_txn\|null)&gt;</code>
Checks if a user has an open (active) charging session.
An open charging session is one where stop_timestamp is NULL.

**Kind**: inner method of [<code>utils/queries</code>](#module_utils/queries)  
**Returns**: <code>Promise.&lt;(db\_txn\|null)&gt;</code> - The open charging transaction if exists, null otherwise.  
**Throws**:

- <code>ValidationError</code> If user_id is invalid.
- <code>DatabaseError</code> If database operation fails.

<a name="module_utils/queries..deleteUser"></a>

### utils/queries~deleteUser(user)
Deletes a user from the database (hard delete).
WARNING: This permanently removes the user and all associated records.

**Kind**: inner method of [<code>utils/queries</code>](#module_utils/queries)  
**Throws**:

- <code>ValidationError</code> If required parameters are missing.
- <code>DatabaseError</code> If deletion fails.

<a name="module_utils/queries..getUnbilledTransactions"></a>

### utils/queries~getUnbilledTransactions(options) ⇒ <code>Promise.&lt;Array.&lt;Object.&lt;db\_txn&gt;&gt;&gt;</code>
Retrieves unbilled transactions that are stopped and have an associated user.
These are transactions that:
- Have a stop_timestamp (transaction is complete)
- Have a user_id (user is known)
- Do NOT have an order created in Odoo yet (not yet billed)

**Kind**: inner method of [<code>utils/queries</code>](#module_utils/queries)  
**Returns**: <code>Promise.&lt;Array.&lt;Object.&lt;db\_txn&gt;&gt;&gt;</code> - Array of unbilled transaction objects  
**Throws**:

- <code>DatabaseError</code> On query error

<a name="module_utils/queries..tryAssociateUserToTransaction"></a>

### utils/queries~tryAssociateUserToTransaction(db_txn) ⇒ <code>Promise.&lt;(number\|null)&gt;</code>
Attempts to associate a user with a transaction by looking up the user via RFID.
This is useful for retroactively associating users who registered after their transaction started.

**Kind**: inner method of [<code>utils/queries</code>](#module_utils/queries)  
**Returns**: <code>Promise.&lt;(number\|null)&gt;</code> - The user_id if found and updated, null otherwise  
**Throws**:

- <code>DatabaseError</code><code>ValidationError</code> On query error

<a name="module_utils/queries..getAllElectricityPrices"></a>

### utils/queries~getAllElectricityPrices() ⇒ <code>Promise.&lt;Array&gt;</code>
Retrieves all electricity prices ordered by valid_from descending.

**Kind**: inner method of [<code>utils/queries</code>](#module_utils/queries)  
**Returns**: <code>Promise.&lt;Array&gt;</code> - Array of electricity price records  
<a name="module_utils/queries..setElectricityPrice"></a>

### utils/queries~setElectricityPrice(price_eur_kwh, valid_from) ⇒ <code>Promise.&lt;Object&gt;</code>
Inserts a new electricity price starting at `valid_from`.
Automatically closes the currently active price period to prevent gaps.
Rejects if `valid_from` is at or before the latest existing price start date
to preserve the audit trail.

If a price is active at `valid_from`, its `valid_till` is set to `valid_from`
so there is no gap or overlap.

**Kind**: inner method of [<code>utils/queries</code>](#module_utils/queries)  
**Returns**: <code>Promise.&lt;Object&gt;</code> - The inserted price record  
<a name="module_utils/queries..getAllVATRates"></a>

### utils/queries~getAllVATRates() ⇒ <code>Promise.&lt;Array&gt;</code>
Retrieves all VAT rates ordered by effective_from descending.

**Kind**: inner method of [<code>utils/queries</code>](#module_utils/queries)  
**Returns**: <code>Promise.&lt;Array&gt;</code> - Array of VAT rate records  
<a name="module_utils/queries..setVATRate"></a>

### utils/queries~setVATRate(rate, description, effective_from) ⇒ <code>Promise.&lt;Object&gt;</code>
Inserts a new VAT rate starting at `effective_from`.
Automatically closes the currently active VAT period to prevent gaps.
Rejects if `effective_from` is at or before the latest existing rate start date
to preserve the audit trail.

If a rate is active at `effective_from`, its `effective_to` is set to `effective_from`
so there is no gap or overlap.

**Kind**: inner method of [<code>utils/queries</code>](#module_utils/queries)  
**Returns**: <code>Promise.&lt;Object&gt;</code> - The inserted VAT rate record  
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
    * [~OIDCUser](#module_utils/typedef..OIDCUser) : <code>Object</code>
    * [~steve_user](#module_utils/typedef..steve_user) : <code>Object</code>
    * [~steve_txn](#module_utils/typedef..steve_txn) : <code>Object</code>
    * [~db_txn](#module_utils/typedef..db_txn) : <code>Object</code>
    * [~electricity_price](#module_utils/typedef..electricity_price) : <code>Object</code>
    * [~db_consent_revision](#module_utils/typedef..db_consent_revision) : <code>Object</code>
    * [~db_user_consent](#module_utils/typedef..db_user_consent) : <code>Object</code>
    * [~db_odoo_txn_order](#module_utils/typedef..db_odoo_txn_order) : <code>Object</code>
    * [~db_odoo_invoice](#module_utils/typedef..db_odoo_invoice) : <code>Object</code>
    * [~db_odoo_order_invoice_link](#module_utils/typedef..db_odoo_order_invoice_link) : <code>Object</code>

<a name="module_utils/typedef..User"></a>

### utils/typedef~User : <code>Object</code>
**Kind**: inner typedef of [<code>utils/typedef</code>](#module_utils/typedef)  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| user_id | <code>number</code> | The user's ID |
| name | <code>string</code> | The user's name |
| email | <code>string</code> | The user's email |
| odoo_user_id | <code>number</code> | The user's Odoo ID |
| odoo_partner_id | <code>number</code> | The user's Odoo partner ID |
| oauth_id | <code>string</code> | The OAuth ID |
| rfid | <code>string</code> | The user's RFID |
| steve_id | <code>number</code> | The user's OCPP tag primary key in SteVe |
| deactivated_at | <code>Date</code> | The date and time when the user is (if any) deactivated |

<a name="module_utils/typedef..OIDCUser"></a>

### utils/typedef~OIDCUser : <code>Object</code>
**Kind**: inner typedef of [<code>utils/typedef</code>](#module_utils/typedef)  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| sub | <code>string</code> | The subject (unique identifier) of the user |
| name | <code>string</code> | The name of the user |
| email | <code>string</code> | The email of the user |
| [hmMifareSerial] | <code>string</code> | The HM Mifare Serial (RFID) of the user (optional yet in the beta) |
| [preferred_username] | <code>string</code> | The preferred username of the user |
| [given_name] | <code>string</code> | The given name of the user |
| [family_name] | <code>string</code> | The family name of the user |

<a name="module_utils/typedef..steve_user"></a>

### utils/typedef~steve\_user : <code>Object</code>
**Kind**: inner typedef of [<code>utils/typedef</code>](#module_utils/typedef)  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| ocppTagPk | <code>number</code> | PK of the OCPP tag |
| idTag | <code>string</code> | The OCPP tag (for example, RFID) |
| inTransaction | <code>boolean</code> \| <code>null</code> | Whether the OCPP tag has active transactions |
| blocked | <code>boolean</code> | Whether the OCPP tag is blocked |
| maxActiveTransactionCount | <code>number</code> | Maximum allowed concurrent transactions for this tag |
| expiryDate | <code>Date</code> \| <code>null</code> | Date/time at which the OCPP tag will expire (optional) |
| activeTransactionCount | <code>number</code> \| <code>null</code> | Current number of active transactions (optional) |
| note | <code>string</code> \| <code>null</code> | Additional note (optional) |

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

<a name="module_utils/typedef..db_user_consent"></a>

### utils/typedef~db\_user\_consent : <code>Object</code>
**Kind**: inner typedef of [<code>utils/typedef</code>](#module_utils/typedef)  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| id | <code>number</code> | Unique identifier for the user consent record |
| user_id | <code>string</code> | Identifier of the user who gave consent |
| consent_revision_id | <code>number</code> | Identifier of the consent revision agreed to |
| consented_at | <code>Date</code> | Timestamp when the user gave consent |
| ip_address | <code>string</code> | IP address from which consent was given |
| user_agent | <code>string</code> \| <code>null</code> | User agent string of the browser/device (optional) |
| consent_method | <code>string</code> | Method by which consent was obtained (e.g., "web", "mobile") |
| is_withdrawn | <code>boolean</code> | Indicates if the user has withdrawn consent |
| withdrawn_at | <code>Date</code> | Timestamp when consent was withdrawn (null if not withdrawn) |
| effective_from | <code>Date</code> | Timestamp when the consent became effective |
| updated_at | <code>Date</code> | Timestamp when the consent record was last updated |

<a name="module_utils/typedef..db_odoo_txn_order"></a>

### utils/typedef~db\_odoo\_txn\_order : <code>Object</code>
**Kind**: inner typedef of [<code>utils/typedef</code>](#module_utils/typedef)  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| id | <code>number</code> | Primary key for the order record |
| txn_id | <code>number</code> | Foreign key linking to charging_transactions.id |
| odoo_saleorder_id | <code>number</code> \| <code>null</code> | The Odoo sale order ID |
| odoo_saleorder_name | <code>string</code> \| <code>null</code> | The Odoo sale order name (e.g., 'S00001') |
| qty | <code>number</code> \| <code>null</code> | Quantity of electricity delivered in kWh |
| unit_price | <code>number</code> \| <code>null</code> | Unit price per kWh in euros at the time of order creation |
| total_amount | <code>number</code> \| <code>null</code> | Total amount for the order (may include taxes and discounts) |
| confirmed | <code>boolean</code> | Whether the order is confirmed (default: true) |
| billed | <code>boolean</code> | Whether the order has been billed (default: false) |
| cancelled | <code>boolean</code> | Whether the order is cancelled (default: false) |
| created_at | <code>Date</code> | Timestamp when the order record was created |

<a name="module_utils/typedef..db_odoo_invoice"></a>

### utils/typedef~db\_odoo\_invoice : <code>Object</code>
**Kind**: inner typedef of [<code>utils/typedef</code>](#module_utils/typedef)  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| id | <code>number</code> | Primary key for the invoice record |
| odoo_invoice_id | <code>number</code> | The Odoo invoice ID (unique) |
| odoo_invoice_name | <code>string</code> \| <code>null</code> | The Odoo invoice name (e.g., 'INV/2025/0001') |
| total_amount | <code>number</code> \| <code>null</code> | Total invoice amount (may include taxes and discounts) |
| paid | <code>boolean</code> | Whether the invoice is paid (default: false) |
| cancelled | <code>boolean</code> | Whether the invoice is cancelled (default: false) |
| created_at | <code>Date</code> | Timestamp when the invoice record was created |

<a name="module_utils/typedef..db_odoo_order_invoice_link"></a>

### utils/typedef~db\_odoo\_order\_invoice\_link : <code>Object</code>
**Kind**: inner typedef of [<code>utils/typedef</code>](#module_utils/typedef)  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| id | <code>number</code> | Primary key for the link record |
| order_id | <code>number</code> | Foreign key to odoo_txn_orders.id (unique - one order per invoice) |
| invoice_id | <code>number</code> | Foreign key to odoo_invoices.id (one invoice can have multiple orders) |
| created_at | <code>Date</code> | Timestamp when the link was created |

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
<a name="oidcDiscoveryCache"></a>

## oidcDiscoveryCache
Cache for OIDC discovery configuration
Security: TTL of 24 hours prevents using stale/compromised endpoints indefinitely
while avoiding frequent network calls
OIDC discovery cache is overkill for most use cases but adds resilience.

**Kind**: global variable  
<a name="config"></a>

## config : <code>object</code>
Configuration settings for SteVe and Odoo integrations

**Kind**: global namespace  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| STEVE_CONFIG | <code>object</code> | Configuration for SteVe server and API endpoints |
| STEVE_CONFIG.URL | <code>string</code> | External STEVE_BASE_URL env |
| STEVE_CONFIG.OCPP_TAGS_URI | <code>string</code> | OCPP tags API endpoint |
| STEVE_CONFIG.TRANSACTIONS_URI | <code>string</code> | Transactions API endpoint |
| ODOO_CONFIG | <code>object</code> | Configuration for Odoo server and API endpoints |
| ODOO_CONFIG.HOST | <code>string</code> | Odoo server host |
| ODOO_CONFIG.PORT | <code>string</code> | Odoo server port (usually 8069) |
| ODOO_CONFIG.INTERNAL_BASE_URL | <code>string</code> | Internal URL accesing through docker network, created from .HOST and .PORT |
| ODOO_CONFIG.EXTERNAL_BASE_URL | <code>string</code> | Odoo external URL |
| ODOO_CONFIG.API_SECRET | <code>string</code> | Odoo API secret |
| ODOO_CONFIG.USER_CREATION_URI | <code>string</code> | User creation endpoint |
| ODOO_CONFIG.TXN_PROCESS_URI | <code>string</code> | Invoice creation endpoint |
| ODOO_CONFIG.PORTAL_LOGIN_URI | <code>string</code> | Portal login endpoint |
| ODOO_CONFIG.ROTATE_APIKEY_URI | <code>string</code> | API key rotation endpoint |

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

## generateSalt(bytes) ⇒ <code>string</code>
Generate a cryptographically secure random salt

**Kind**: global function  
**Returns**: <code>string</code> - - salt string  
<a name="validateOIDCProperties"></a>

## validateOIDCProperties(req) ⇒ <code>boolean</code>
Validates that the OIDC authentication properties like access token and user info are present.
Most of the checks are done by the OIDC library, but we add some little extra checks.

**Kind**: global function  
**Returns**: <code>boolean</code> - - True if authentication is valid, false otherwise  
<a name="getOidcDiscovery"></a>

## getOidcDiscovery() ⇒ <code>Promise.&lt;Object&gt;</code>
Fetches and caches the OIDC discovery configuration

**Kind**: global function  
**Returns**: <code>Promise.&lt;Object&gt;</code> - OIDC discovery document  
**Throws**:

- <code>SystemError</code> If fetch fails

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
<a name="safeErrorMessage"></a>

## safeErrorMessage()
Return a safe error message for the client (never expose internal details)

**Kind**: global function  
