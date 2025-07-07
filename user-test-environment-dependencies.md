# User Test Environment Dependencies

This diagram shows the service dependencies and shared environment configuration for the user-test-docker-compose.yml
setup.

```mermaid
graph TB
    %% External Dependencies
    ENV[Environment Variables<br/>ODOO_DB_DEVELOPMENT_PASSWORD<br/>ODOO_DEVELOPMENT_ADMIN_API_KEY<br/>STROHM_DB_PASSWORD]
    
    %% Database Services
    DB[(PostgreSQL Database<br/>odoo_user_test_db<br/>Port: 5432)]
    STEVEDB[(MariaDB Database<br/>steve_user_test_db<br/>Port: 3306)]
    
    %% Core Services
    SSO[SSO Service<br/>sso_auth<br/>Port: 8081]
    ODOO[Odoo Service<br/>odoo_user_test<br/>Port: 18069]
    STEVE[Steve Service<br/>steve_user_test<br/>Port: 8180]
    
    %% Supporting Services
    BACKEND[Backend Server<br/>user_test_backend<br/>Port: 3000]
    OCPP[OCPP Wallbox Simulator<br/>ocpp_wallbox_sim<br/>Port: 8090]
    
    %% Volumes
    ODOO_VOL[odoo-user-test-web-data]
    STEVE_VOL[steve-user-test-jars]
    STEVE_DB_VOL[steve-user-test-db-data]
    STROHM_DB_VOL[strohm-user-test-db-data]
    
    %% Database Files
    DB_FILES[Database Init Files<br/>db-etc.sql<br/>db-structure-strohm.sql<br/>db-odoo-init.sql]
    
    %% Local Files
    BACKEND_CODE[Backend Code<br/>./backend]
    OCPP_HTML[OCPP Simulator HTML<br/>./ocpp-wallbox-sim]
    
    %% Environment Dependencies
    ENV --> ODOO
    ENV --> BACKEND
    
    %% Service Dependencies
    DB --> ODOO
    DB --> BACKEND

    ODOO --> BACKEND
    SSO --> BACKEND
        STEVEDB --> STEVE
    STEVE --> BACKEND
    
    %% Volume Dependencies
    ODOO_VOL --> ODOO

    STROHM_DB_VOL --> DB
        STEVE_VOL --> STEVE
    STEVE_DB_VOL --> STEVEDB
    
    %% File Dependencies
    DB_FILES --> DB
    BACKEND_CODE --> BACKEND
    OCPP_HTML --> OCPP

    
    %% Network Communication
    BACKEND -.->|API calls| ODOO

    BACKEND <-.->|Database| DB
    BACKEND -.->|API calls| STEVE
    BACKEND -.->|Auth| SSO
    ODOO <-.->|Database| DB


    
    %% Styling
    classDef database fill:#e1f5fe,stroke:#0277bd,stroke-width:2px
    classDef service fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
    classDef volume fill:#fff3e0,stroke:#f57c00,stroke-width:2px
    classDef file fill:#e8f5e8,stroke:#388e3c,stroke-width:2px
    classDef env fill:#ffebee,stroke:#d32f2f,stroke-width:2px
    
    class DB,STEVEDB database
    class SSO,ODOO,STEVE,BACKEND,OCPP service
    class ODOO_VOL,STEVE_VOL,STEVE_DB_VOL,STROHM_DB_VOL volume
    class DB_FILES,BACKEND_CODE,OCPP_HTML file
    class ENV env
```

Databases in blue, services in purple, volumes (files) in orange.

## Service Port Mapping

| Service        | Internal Port | External Port | Description                    |
|----------------|---------------|---------------|--------------------------------|
| SSO            | 8080          | 8081          | OAuth2 Mock Server             |
| PostgreSQL     | 5432          | 5432          | Odoo & Backend Database        |
| MariaDB        | 3306          | 3306          | Steve Database                 |
| Odoo           | 8069          | 18069         | Odoo ERP System                |
| Steve          | 8180          | 8180          | EV Charging Station Management |
| Backend        | 3000          | 3000          | Node.js API Server             |
| OCPP Simulator | 80            | 8090          | Wallbox Simulator              |

## Environment Variables

- **ODOO_DB_DEVELOPMENT_PASSWORD**: Database password for Odoo
- **ODOO_DEVELOPMENT_ADMIN_API_KEY**: Admin API key for Odoo
- **STROHM_DB_PASSWORD**: Database password for Strohm backend

## Key Dependencies

1. **Backend Service** depends on:
    - PostgreSQL database (with health check)
    - Odoo service
    - Steve service
    - SSO service for authentication

2. **Odoo Service** depends on:
    - PostgreSQL database (with health check)

3. **Steve Service** depends on:
    - MariaDB database

4. **All services** share the same Docker network for internal communication
