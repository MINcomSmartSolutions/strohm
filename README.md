# Ladeabrechnung

This repository is designed work with SteVe and Odoo to bill and manage users' car charging without going cloud. Only
SteVe instance is should be configured independently and provided credentials to this system as environment variables,
after that the system should create users or if already created start picking up the charging sessions and bill them in
Odoo.

Authentication is done using OpenID Connect (OIDC) and the system can be integrated with any OIDC provider like
Keycloak, Auth0, Okta, Google Identity Platform etc. only requirement is that the provider should support RFID as a
scope to OIDC.

The admin panel is at /dev-admin.html route and it is exposed in development environment default.

## ENVIRONMENT VARIABLES

If no default is provided below, the variable is required to be set.

### Server/Backend/Node Container

#### General

- NODE_ENV: ['dev','production','test'] (default: 'dev')
- SERVER_PORT: (default: 3000)
- SESSION_SECRET: Used to sign the session cookies. Should be at least 32 characters long.
- TAILSCALE_ENABLE_ADMIN: (default: "false") Enable Tailscale admin access.
- TAILSCALE_ALLOWED_RANGES: Tailscale CGNAT IP ranges (comma-separated CIDR notation).Default Tailscale range:
  100.64.0.0/10. You can add multiple ranges separated by commas
- TAILSCALE_ALLOWED_IPS=Specific allowed Tailscale IP addresses (comma-separated). Leave empty to allow all IPs in the
  ranges. Or specify exact IPs for tighter security

#### OIDC

- SERVER_OIDC_SECRET
- SERVER_OIDC_CLIENT_ID
- SERVER_OIDC_ISSUER_BASE_URL
- SERVER_OIDC_BASE_URL: The servers base url. This has to be whitelisted at OIDC IdP.
- SERVER_OIDC_CLIENT_SECRET

#### ODOO

The image ghcr.io/mincomsmartsolutions/odoo:18 is used for the odoo image since it is custom and
includes [Strohm Addon](https://github.com/MINcomSmartSolutions/strohm_addon). But you can use vanilla odoo and install
the addon yourself as well

- ODOO_API_SECRET: This is used to authenticate and secure the communication between server and Odoo.
- ODOO_HOST: (default: "odoo") Used for making calls by internal docker network
- ODOO_PORT: (default: 8069) Used for making calls by internal docker network
- ODOO_EXTERNAL_BASE_URL: The full base URL used to access Odoo from outside the docker network.
- WEBHOOK_API_KEY: This api key is used to secure the endpoint when server makes calls to Odoo. Even tough the calls
  goes inside the docker network

#### Database (PostgreSQL 16.6)

- STROHM_DB_HOST
- STROHM_DB_NAME: (default: "strohm")
- STROHM_DB_USER: (default: "strohm_admin")
- STROHM_DB_PASSWORD
- STROHM_DB_PORT: (default: 5432)

#### SteVe

Specifically the branch 3.8.0 71bd4394c94dd9ca3a3870f5cf6678ae1da99c0d.

- STEVE_BASE_URL
- STEVE_AUTH_USERNAME: (default: "admin")
- STEVE_API_PASSWORD: (default: "1234api")
- STEVE_FETCH_INTERVAL: (default: 120) Interval to fetch new sessions from SteVe in seconds.

----

### Odoo Container

#### Doodba

[See](https://github.com/Tecnativa/doodba/blob/master/18.0.Dockerfile) for more odoo's image environment variables used
in default, but not specified here.

- DOODBA_ENV: ['prod','devel'] (default: "prod")
- LIST_DB: [boolean] (default: "false"): Whether to disable the database manager. This should be false in production
  otherwise deleting, copying or creating databases will be possible from the web interface.
- ODOO_ENV: ['dev','production','test'] (default: 'production')
- ALLOWED_HOSTS: (default: "*") Comma-separated list of allowed hosts for Odoo. In production, this should be set to
  the domain name or IP address of the Odoo and backend.
- INITIAL_LANG: (default: "de_DE") Initial language to be activated for Odoo.
- WITHOUT_DEMO: ['all','false] (default: "all") Whether to load odoo demo data. In production, this should be set to "
  all" to avoid loading demo data.
- PROXY_MODE: [boolean] (default: "false") Whether to enable proxy mode. This should be enabled if Odoo is behind a
  reverse proxy.
- ADMIN_PASSWORD: (default: "admin") Password for the admin user created by doodba. TO NOTE: For somereason it is
  always "admin" even if we set it to something else.

##### SMTP (To be used for sending emails from Odoo)

Prefer configuring these variables using Odoo GUI rather than environment variables.

- SMTP_SERVER
- SMTP_PORT: (default: 25)
- SMTP_USER: (default: false)
- SMTP_PASSWORD: (default: false)
- SMTP_SSL: (default: false)

#### Database (PostgreSQL 16.6)

Same instance of database used with the Server but with different user and database.

- PGHOST: PostgreSQL Host
- PGDATABASE: (default: "odoo")
- PGUSER
- PGPASSWORD
- PGPORT: (default: 5432)

#### Integration with Server

- ODOO_API_SECRET: To be the same as SERVER --> ODOO --> ODOO_API_SECRET
- WEBHOOK_API_KEY: To be the same as SERVER --> ODOO --> WEBHOOK_API_KEY
- BACKEND_HOST
- BACKEND_PORT: (default: 3000) To be the same as SERVER --> General --> SERVER_PORT
- BACKEND_EXTERNAL_URL: The servers external reachable base url

----

### Database Container

Postgresql 16.6

- POSTGRES_DB: (default: "postgres")
- POSTGRES_USER: (default: "postgres")
- POSTGRES_PASSWORD
- POSTGRES_PORT: (default: 5432)

STROHM_DB_USER, STROHM_DB_PASSWORD, PGUSER, PGPASSWORD needs to be created manually.