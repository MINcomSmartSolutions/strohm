# Ladeabrechnung (Charging Billing in German)

This repository is designed work with SteVe and Odoo to bill and manage users' car charging without going cloud. Only
SteVe instance is should be configured independently and provided credentials to this system as environment variables,
after that the system should create users or if already created start picking up the charging sessions and bill them in
Odoo.

Authentication is done using OpenID Connect (OIDC) and the system can be integrated with any OIDC provider like
Keycloak, Auth0, Okta, Google Identity Platform etc. only requirement is that the provider should support RFID as a
scope to OIDC.

## ENVIRONMENT VARIABLES

If no default is provided below, the variable is required to be set.

### Server/Backend/Node Container

#### General

- NODE_ENV: ['dev','production','test'] (default: 'dev')
- SERVER_PORT: (default: 3000)
- SESSION_SECRET: Used to sign the session cookies. Should be at least 32 characters long.

#### OIDC

- SERVER_OIDC_SECRET
- SERVER_OIDC_CLIENT_ID
- SERVER_OIDC_ISSUER_BASE_URL
- SERVER_OIDC_BASE_URL: The servers base url (e.g. http://localhost:3000). For callbacks and redirects.
- SERVER_OIDC_CLIENT_SECRET

#### ODOO

- ODOO_ADMIN_API_KEY: This api key needs to be created for admin user in Odoo
- ODOO_API_SECRET: This is used to verify the redirections or requests hashed with this secret.
- ODOO_HOST
- ODOO_PORT: (default: 8069)
- ODOO_EXTERNAL_HOST: The host used to access Odoo from outside the docker network (e.g. https://odoo.domain.com). For
  redirects and webhooks.
- WEBHOOK_API_KEY: This api key is used to secure the endpoint when server makes calls to Odoo

#### Database (PostgreSQL 16.6)

- STROHM_DB_HOST
- STROHM_DB_NAME: (default: "strohm") if you change DB_NAME to something else make sure also change the database names
  in db-structure-strohm.sql file
- STROHM_DB_USER: (default: "strohm_admin")
- STROHM_DB_PASSWORD
- STROHM_DB_PORT: (default: 5432)

#### SteVe

in production and dev/test the environments slightly differ. In production we send it by preffered header and api key in
dev/test we use basic auth.

##### Production

- STEVE_HOST
- STEVE_API_KEY_HEADER
- STEVE_API_KEY

##### Dev/Test

- STEVE_HOST: (default: "steve")
- STEVE_AUTH_USERNAME: (default: "admin")
- STEVE_API_PASSWORD: (default: "1234api")

----

### Odoo Container

#### Doodba

[See](https://github.com/Tecnativa/doodba/blob/master/18.0.Dockerfile) for more odoo's image environment variables used
in default, but not specified here.

- DOODBA_ENV: ['prod','devel'] (default: "prod")
- LIST_DB: [boolean] (default: "false"): Whether to disable the database manager. This should be false in production
  otherwise deleting, copying or creating databases will be possible from the web interface.
- ODOO_ENV: ['dev','production','test'] (default: 'production')
- INITIAL_LANG: (default: "de_DE") Initial language to be activated for Odoo.
- WITHOUT_DEMO: ['all','false] (default: "all") Whether to load odoo demo data. In production, this should be set to "
  all" to avoid loading demo data.
- PROXY_MODE: [boolean] (default: "false") Whether to enable proxy mode. This should be enabled if Odoo is behind a
  reverse proxy.
- ADMIN_PASSWORD: (default: "admin") Password for the admin user created by doodba.

###### SMTP (To be used for sending emails from Odoo)

- SMTP_SERVER
- SMTP_PORT: (default: 25)
- SMTP_USER: (default: false)
- SMTP_PASSWORD: (default: false)
- SMTP_SSL: (default: false)

#### Database (PostgreSQL)

Same instance of database used with the Server but with different user and database.

- PGHOST
- PGDATABASE: (default: "odoo_db")
- PGUSER
- PGPASSWORD
- PGPORT: (default: 5432)

#### Integration with Server

- ODOO_API_SECRET: To be the same as SERVER --> ODOO --> ODOO_API_SECRET
- WEBHOOK_API_KEY: To be the same as SERVER --> ODOO --> WEBHOOK_API_KEY
- BACKEND_HOST
- BACKEND_PORT: (default: 3000)

----

### Database Container

Postgresql 16.6

- POSTGRES_DB: (default: "postgres")
- POSTGRES_USER: (default: "postgres")
- POSTGRES_PASSWORD
- POSTGRES_PORT: (default: 5432)