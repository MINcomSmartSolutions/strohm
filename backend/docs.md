## Modules

<dl>
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
<p>Incremental fetch of STOPPED transactions since last high‑water mark (T0).
High‑Water Mark Concept:
We persist the timestamp of the latest processed transaction (the “high‑water mark” or T0).
On each run, we only fetch transactions whose stopTimestamp is strictly greater than T0.
After processing, we update T0 to the maximum stopTimestamp seen. This ensures:
  • No overlap or reprocessing of already handled transactions.
  • No gaps: even if a transaction ends just after T0, it will be fetched next run.
  • Linear, efficient incremental retrieval without maintaining complex windows.</p>
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
<li>Handles user session after authentication callback.</li>
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
<dt><a href="#generateOdooHash">generateOdooHash(message, secret)</a> ⇒ <code>string</code></dt>
<dd><p>Generate HMAC signature matching Odoo implementation</p>
</dd>
<dt><a href="#generateSalt">generateSalt(length)</a> ⇒ <code>string</code></dt>
<dd><p>Generate a cryptographically secure random salt</p>
</dd>
<dt><a href="#identifyUser">identifyUser(identifier, options)</a> ⇒ <code>Promise.&lt;Object&gt;</code></dt>
<dd><p>Gets a user by either user_id or oauth_id</p>
</dd>
<dt><a href="#fmt">fmt(dt, toUTC)</a> ⇒ <code>string</code></dt>
<dd><p>Format a Luxon DateTime into SteVe&#39;s expected ISO string (no Z)</p>
</dd>
<dt><a href="#createError">createError(errorDef, [customMessage], [originalError])</a> ⇒ <code>Object</code></dt>
<dd><p>Create an application error with standard format</p>
</dd>
<dt><a href="#appErrorHandler">appErrorHandler()</a></dt>
<dd><p>Express error handler for AppErrors</p>
</dd>
</dl>

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

<a name="module_services/odoo"></a>

## services/odoo
Odoo Integration Service

It is responsible for user creation, login, key rotation, and invoicing with Odoo via REST API.


* [services/odoo](#module_services/odoo)
    * [~createOdooUser(user)](#module_services/odoo..createOdooUser)
    * [~getOdooPortalLogin(user)](#module_services/odoo..getOdooPortalLogin) ⇒ <code>string</code>
    * [~rotateOdooUserAuth(user)](#module_services/odoo..rotateOdooUserAuth) ⇒ <code>Promise.&lt;Object&gt;</code>
    * [~createOdooTxnInvoice(db_txn)](#module_services/odoo..createOdooTxnInvoice) ⇒ <code>Promise.&lt;string&gt;</code>
  * [~checkValidPaymentMethod(user)](#module_services/odoo..checkValidPaymentMethod) ⇒ <code>
    Promise.&lt;boolean&gt;</code>

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
Generates a secure Odoo portal login URL for the given user.

- Validates the user object.
- Fetches Odoo credentials from the database.
- Constructs a login URL with required query parameters for authentication.
- Throws if credentials are missing or invalid.

**Kind**: inner method of [<code>services/odoo</code>](#module_services/odoo)  
**Returns**: <code>string</code> - Odoo portal login URL.  
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

### services/odoo~createOdooTxnInvoice(db_txn) ⇒ <code>Promise.&lt;string&gt;</code>
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
**Returns**: <code>Promise.&lt;string&gt;</code> - The created bill ID.  
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

Incremental fetch of STOPPED transactions since last high‑water mark (T0).
High‑Water Mark Concept:
We persist the timestamp of the latest processed transaction (the “high‑water mark” or T0).
On each run, we only fetch transactions whose stopTimestamp is strictly greater than T0.
After processing, we update T0 to the maximum stopTimestamp seen. This ensures:
• No overlap or reprocessing of already handled transactions.
• No gaps: even if a transaction ends just after T0, it will be fetched next run.
• Linear, efficient incremental retrieval without maintaining complex windows.


* [services/steve_transactions](#module_services/steve_transactions)
    * [~fetchSince(since)](#module_services/steve_transactions..fetchSince) ⇒ <code>
      Promise.&lt;Array.&lt;Object&gt;&gt;</code>
    * [~processSince(txns)](#module_services/steve_transactions..processSince) ⇒ <code>Promise.&lt;DateTime&gt;</code>
    * [~runIncremental()](#module_services/steve_transactions..runIncremental) ⇒ <code>Promise.&lt;{fetched: number,
      high\_water\_mark: DateTime}&gt;</code>
    * [~runFull()](#module_services/steve_transactions..runFull) ⇒ <code>Promise.&lt;{fetched: number,
      high\_water\_mark: DateTime}&gt;</code>
    * [~runToday()](#module_services/steve_transactions..runToday) ⇒ <code>Promise.&lt;{fetched: number,
      high\_water\_mark: DateTime}&gt;</code>

<a name="module_services/steve_transactions..fetchSince"></a>

### services/steve_transactions~fetchSince(since) ⇒ <code>Promise.&lt;Array.&lt;Object&gt;&gt;</code>
Fetch STOPPED transactions since a given timestamp (exclusive)
If no timestamp is provided, fetch all transactions

**Kind**: inner method of [<code>services/steve\_transactions</code>](#module_services/steve_transactions)  
**Returns**: <code>Promise.&lt;Array.&lt;Object&gt;&gt;</code> - Array of transactions  
<a name="module_services/steve_transactions..processSince"></a>

### services/steve_transactions~processSince(txns) ⇒ <code>Promise.&lt;DateTime&gt;</code>
Record and create bills for transactions/charging sessions

**Kind**: inner method of [<code>services/steve\_transactions</code>](#module_services/steve_transactions)  
**Returns**: <code>Promise.&lt;DateTime&gt;</code> - The new high‑water mark (max stopTimestamp)  
**Throws**:

- <code>ValidationError</code> If any transaction does not match the expected schema

<a name="module_services/steve_transactions..runIncremental"></a>

### services/steve_transactions~runIncremental() ⇒ <code>Promise.&lt;{fetched: number, high\_water\_mark: DateTime}&gt;</code>
Run incremental billing cycle: fetch and process since last T0

**Kind**: inner method of [<code>services/steve\_transactions</code>](#module_services/steve_transactions)  
<a name="module_services/steve_transactions..runFull"></a>

### services/steve_transactions~runFull() ⇒ <code>Promise.&lt;{fetched: number, high\_water\_mark: DateTime}&gt;</code>
Fetches all transactions from Steve, processes them, and updates the high-water mark.
Use for a full sync (no time filter).

**Kind**: inner method of [<code>services/steve\_transactions</code>](#module_services/steve_transactions)  
<a name="module_services/steve_transactions..runToday"></a>

### services/steve_transactions~runToday() ⇒ <code>Promise.&lt;{fetched: number, high\_water\_mark: DateTime}&gt;</code>
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
    * [~createSteveUser(user, [blocked])](#module_services/steve_user..createSteveUser) ⇒ <code>
      Promise.&lt;Object&gt;</code>
    * [~getSteveUser(user_rfid)](#module_services/steve_user..getSteveUser) ⇒ <code>Promise.&lt;(
      Array.&lt;Object&gt;\|null)&gt;</code>
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
- Returns the up-to-date user object.

**Kind**: inner method of [<code>services/user\_operations</code>](#module_services/user_operations)  
**Returns**: <code>Promise.&lt;Object&gt;</code> - User object from the database.  
<a name="module_utils/oidc_config"></a>

## utils/oidc\_config
OIDC configuration for authentication middleware.

- Uses environment variables for secrets and endpoints.
- Customizes authorization parameters and routes.
- Handles user session after authentication callback.

<a name="module_utils/queries"></a>

## utils/queries
Global database queries


* [utils/queries](#module_utils/queries)
    * [~handleQueryError(error, operation)](#module_utils/queries..handleQueryError)
    * [~getUsers(filters, options)](#module_utils/queries..getUsers) ⇒ <code>Promise.&lt;Array&gt;</code>
  * [~getUserUnique(filters)](#module_utils/queries..getUserUnique) ⇒ <code>Promise.&lt;(Object.&lt;User&gt;\|null)
    &gt;</code>
  * [~setUserOdooCredentials(user, odoo_user_id, odoo_partner_id, encrypted_key, salt)](#module_utils/queries..setUserOdooCredentials) ⇒ <code>
    Promise.&lt;number&gt;</code>
  * [~getUserOdooCredentials(user_id)](#module_utils/queries..getUserOdooCredentials) ⇒ <code>Promise.&lt;(Object\|null)
    &gt;</code>
  * [~rotateOdooUserKey(user_id, old_key_id, new_key, new_key_salt)](#module_utils/queries..rotateOdooUserKey) ⇒ <code>
    Promise.&lt;boolean&gt;</code>
  * [~setSteveUserParamaters(user, steve_id)](#module_utils/queries..setSteveUserParamaters) ⇒ <code>Promise.&lt;(
    Object\|undefined)&gt;</code>
  * [~recordActivityLog(user_id, event_type, target, rfid, reason)](#module_utils/queries..recordActivityLog) ⇒ <code>
    Promise.&lt;void&gt;</code>
    * [~recordTransaction(tx)](#module_utils/queries..recordTransaction) ⇒ <code>Promise.&lt;Object&gt;</code>
  * [~setLastStopTimestamp(new_watermark)](#module_utils/queries..setLastStopTimestamp) ⇒ <code>
    Promise.&lt;void&gt;</code>
  * [~getLastStopTimestamp()](#module_utils/queries..getLastStopTimestamp) ⇒ <code>Promise.&lt;(DateTime\|null)
    &gt;</code>
    * [~saveInvoiceId(txn, invoice_id)](#module_utils/queries..saveInvoiceId) ⇒ <code>Promise.&lt;void&gt;</code>
  * [~getCurrentElectricityPrice(specified_datetime)](#module_utils/queries..getCurrentElectricityPrice) ⇒ <code>
    Promise.&lt;number&gt;</code>

<a name="module_utils/queries..handleQueryError"></a>

### utils/queries~handleQueryError(error, operation)
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
<a name="module_utils/queries..recordTransaction"></a>

### utils/queries~recordTransaction(tx) ⇒ <code>Promise.&lt;Object&gt;</code>
Record a transaction record into the `charging_transactions` table.
If transaction already exists and is complete, returns it without modification.
Otherwise, inserts a new record with proper user association or updates existing one.

**Kind**: inner method of [<code>utils/queries</code>](#module_utils/queries)  
**Returns**: <code>Promise.&lt;Object&gt;</code> - db_txn - The transaction record from database  
<a name="module_utils/queries..setLastStopTimestamp"></a>

### utils/queries~setLastStopTimestamp(new_watermark) ⇒ <code>Promise.&lt;void&gt;</code>
Sets the last stop timestamp watermark.
Inserts or updates the `watermark` table with the given timestamp.

**Kind**: inner method of [<code>utils/queries</code>](#module_utils/queries)  
<a name="module_utils/queries..getLastStopTimestamp"></a>

### utils/queries~getLastStopTimestamp() ⇒ <code>Promise.&lt;(DateTime\|null)&gt;</code>
Retrieves the most recent `last_stop_timestamp` from the watermark table.
Returns a Luxon DateTime if found, otherwise null.

**Kind**: inner method of [<code>utils/queries</code>](#module_utils/queries)  
**Returns**: <code>Promise.&lt;(DateTime\|null)&gt;</code> - The latest stop timestamp or null if not found.  
**Throws**:

- <code>DatabaseError</code> On query error.

<a name="module_utils/queries..saveInvoiceId"></a>

### utils/queries~saveInvoiceId(txn, invoice_id) ⇒ <code>Promise.&lt;void&gt;</code>
Updates the `invoice_ref` field for a transaction in `charging_transactions`.
This is used to link a transaction to an invoice in Odoo.

**Kind**: inner method of [<code>utils/queries</code>](#module_utils/queries)  
**Throws**:

- <code>DatabaseError</code><code>ValidationError</code> On query error.

<a name="module_utils/queries..getCurrentElectricityPrice"></a>

### utils/queries~getCurrentElectricityPrice(specified_datetime) ⇒ <code>Promise.&lt;number&gt;</code>
Retrieves the current electricity price from the database.
If a `specified_datetime` is provided, it will return the price valid at that time.

**Kind**: inner method of [<code>utils/queries</code>](#module_utils/queries)  
**Returns**: <code>Promise.&lt;number&gt;</code> - The current electricity price in cents per kWh.  
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
    * [~tx](#module_utils/typedef..tx) : <code>Object</code>
    * [~db_txn](#module_utils/typedef..db_txn) : <code>Object</code>
    * [~electricity_price](#module_utils/typedef..electricity_price) : <code>Object</code>

<a name="module_utils/typedef..User"></a>

### utils/typedef~User : <code>Object</code>
**Kind**: inner typedef of [<code>utils/typedef</code>](#module_utils/typedef)  
**Properties**

| Name           | Type                | Description                                             |
|----------------|---------------------|---------------------------------------------------------|
| user_id        | <code>string</code> | The user's ID                                           |
| name           | <code>string</code> | The user's name                                         |
| email          | <code>string</code> | The user's email                                        |
| odoo_user_id   | <code>number</code> | The user's Odoo ID                                      |
| partner_id     | <code>number</code> | The user's Odoo partner ID                              |
| oauth_id       | <code>string</code> | The OAuth ID                                            |
| rfid           | <code>string</code> | The user's RFID                                         |
| steve_id       | <code>number</code> | The user's OCPP tag primary key in SteVe                |
| deactivated_at | <code>Date</code>   | The date and time when the user is (if any) deactivated |

<a name="module_utils/typedef..tx"></a>

### utils/typedef~tx : <code>Object</code>
**Kind**: inner typedef of [<code>utils/typedef</code>](#module_utils/typedef)  
**Properties**

| Name           | Type                                                                                     | Description                                                          |
|----------------|------------------------------------------------------------------------------------------|----------------------------------------------------------------------|
| id             | <code>number</code>                                                                      | PK of the transaction                                                |
| connectorId    | <code>number</code>                                                                      | Connector ID of the charge box at which the transaction took place   |
| chargeBoxPk    | <code>number</code>                                                                      | PK of the charge box at which the transaction took place             |
| ocppTagPk      | <code>number</code>                                                                      | PK of the OCPP tag used in the transaction                           |
| chargeBoxId    | <code>string</code>                                                                      | The identifier of the charge box at which the transaction took place |
| ocppIdTag      | <code>string</code>                                                                      | The Ocpp Tag used in the transaction                                 |
| startTimestamp | <code>Date</code>                                                                        | The timestamp at which the transaction started                       |
| stopTimestamp  | <code>Date</code> \| <code>null</code>                                                   | The timestamp at which the transaction ended                         |
| startValue     | <code>string</code>                                                                      | The meter value reading at the start of the transaction              |
| stopValue      | <code>string</code> \| <code>null</code>                                                 | The meter value reading at the end of the transaction                |
| stopReason     | <code>string</code> \| <code>null</code>                                                 | The reason for the transaction being stopped                         |
| stopEventActor | <code>&#x27;station&#x27;</code> \| <code>&#x27;manual&#x27;</code> \| <code>null</code> | The actor who stopped the transaction                                |

<a name="module_utils/typedef..db_txn"></a>

### utils/typedef~db\_txn : <code>Object</code>
**Kind**: inner typedef of [<code>utils/typedef</code>](#module_utils/typedef)  
**Properties**

| Name                | Type                | Description                                                                          |
|---------------------|---------------------|--------------------------------------------------------------------------------------|
| id                  | <code>number</code> | PK of the transaction in the database                                                |
| created_at          | <code>Date</code>   | The timestamp at which the transaction was created                                   |
| start_timestamp     | <code>Date</code>   | The timestamp at which the transaction started                                       |
| stop_timestamp      | <code>Date</code>   | The timestamp at which the transaction ended                                         |
| delivered_energy_wh | <code>number</code> | The amount of energy delivered during the transaction in watt-hours                  |
| start_value         | <code>number</code> | The meter value reading at the start of the transaction                              |
| stop_value          | <code>number</code> | The meter value reading at the end of the transaction                                |
| stop_reason         | <code>string</code> | The reason for the transaction being stopped                                         |
| stop_event_actor    | <code>string</code> | The actor who stopped the transaction                                                |
| connector_id        | <code>number</code> | Connector ID of the charge box at which the transaction took place                   |
| chargebox_pk        | <code>number</code> | PK of the charge box at which the transaction took place in SteVe                    |
| ocpp_tag_pk         | <code>number</code> | PK of the OCPP tag used in the transaction in SteVe (steve_id in strohm.users table) |
| ocpp_id_tag         | <code>number</code> | The Ocpp Tag used in the transaction (rfid in strohm.users table)                    |
| user_id             | <code>number</code> | The user ID associated with the transaction                                          |
| invoice_ref         | <code>number</code> | The invoice reference associated with the transaction returned from Odoo             |
| steve_id            | <code>number</code> | PK of the transaction in SteVe                                                       |

<a name="module_utils/typedef..electricity_price"></a>

### utils/typedef~electricity\_price : <code>Object</code>
**Kind**: inner typedef of [<code>utils/typedef</code>](#module_utils/typedef)  
**Properties**

| Name       | Type                | Description                                              |
|------------|---------------------|----------------------------------------------------------|
| id         | <code>number</code> | PK of the electricity price                              |
| created_at | <code>Date</code>   | The timestamp at which the electricity price was created |
| valid_from | <code>Date</code>   | The date from which the electricity price is valid       |
| valid_till | <code>Date</code>   | The date until which the electricity price is valid      |
| price      | <code>number</code> | The price as per kWh in cents                            |

<a name="module_app"></a>

## app
Express app instance.

<a name="AppError"></a>

## AppError
Base class for custom application errors

**Kind**: global class  
<a name="config"></a>

## config : <code>object</code>
Configuration settings for SteVe and Odoo integrations

**Kind**: global namespace  
**Properties**

| Name                                 | Type                | Description                                      |
|--------------------------------------|---------------------|--------------------------------------------------|
| STEVE_CONFIG                         | <code>object</code> | Configuration for SteVe server and API endpoints |
| STEVE_CONFIG.HOST                    | <code>string</code> | SteVe server host                                |
| STEVE_CONFIG.PORT                    | <code>string</code> | SteVe server port                                |
| STEVE_CONFIG.URL                     | <code>string</code> | SteVe base URL                                   |
| STEVE_CONFIG.OCPP_TAGS_URI           | <code>string</code> | OCPP tags API endpoint                           |
| STEVE_CONFIG.TRANSACTIONS_URI        | <code>string</code> | Transactions API endpoint                        |
| ODOO_CONFIG                          | <code>object</code> | Configuration for Odoo server and API endpoints  |
| ODOO_CONFIG.HOST                     | <code>string</code> | Odoo server host                                 |
| ODOO_CONFIG.PORT                     | <code>string</code> | Odoo server port                                 |
| ODOO_CONFIG.URL                      | <code>string</code> | Odoo base URL                                    |
| ODOO_CONFIG.EXTERNAL_HOST            | <code>string</code> | Odoo external host                               |
| ODOO_CONFIG.EXTERNAL_PORT            | <code>string</code> | Odoo external port                               |
| ODOO_CONFIG.EXTERNAL_URL             | <code>string</code> | Odoo external URL                                |
| ODOO_CONFIG.API_SECRET               | <code>string</code> | Odoo API secret                                  |
| ODOO_CONFIG.USER_CREATION_URI        | <code>string</code> | User creation endpoint                           |
| ODOO_CONFIG.INVOICE_CREATION_URI     | <code>string</code> | Invoice creation endpoint                        |
| ODOO_CONFIG.PORTAL_LOGIN_URI         | <code>string</code> | Portal login endpoint                            |
| ODOO_CONFIG.ROTATE_APIKEY_URI        | <code>string</code> | API key rotation endpoint                        |
| ODOO_CONFIG.CHECK_PAYMENT_METHOD_URI | <code>string</code> | Payment method check endpoint                    |

<a name="logger"></a>

## logger
Application Error Codes

This module defines standardized error codes and messages for the application.
Errors are grouped by category and include codes, HTTP status codes, and messages.

**Kind**: global constant  
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
<a name="identifyUser"></a>

## identifyUser(identifier, options) ⇒ <code>Promise.&lt;Object&gt;</code>
Gets a user by either user_id or oauth_id

**Kind**: global function  
**Returns**: <code>Promise.&lt;Object&gt;</code> - - User object  
**Throws**:

- <code>ValidationError</code> - If user not found or doesn't meet requirements

<a name="fmt"></a>

## fmt(dt, toUTC) ⇒ <code>string</code>
Format a Luxon DateTime into SteVe's expected ISO string (no Z)

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
