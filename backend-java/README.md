# RidePulse Java API

Spring Boot backend for the RidePulse mobile and web apps.

Controllers are intentionally thin and return the standard response wrapper. Business flow lives in `service`, repository interfaces live under `repository`, and JDBC implementations live under `repository/jdbc`. SQL lives in `src/main/resources/db-queries.properties` with named parameters and `.pojo` mapping keys. Repositories use `NamedParameterJdbcTemplate`, with separate read-only and read-write datasource beans; schema bootstrap scripts are property-backed and called from `SchemaService`.

## Requirements

- Java 17
- Maven 3.9+
- PostgreSQL connection compatible with the existing RidePulse schema

## Local Run

Set the local runtime variables:

```powershell
$env:DATABASE_URL="postgres://ktm:ktm@localhost:5432/ktm_ride"
$env:JWT_SECRET="local-dev-secret"
$env:CORS_ORIGIN="*"
mvn spring-boot:run
```

For a custom PostgreSQL schema, set `DB_SCHEMA`. AWS RDS deployments that use a schema named `ridepulse_db` should use `DB_SCHEMA=ridepulse_db,public` so extension functions remain visible.

The Java API listens on `PORT` or `4001` by default.

## Verification

```powershell
mvn test
```

Smoke test against a non-production account:

- `GET /health`
- register, login, `GET /api/auth/me`
- create, list, fetch, patch, and delete a ride
- dashboard, home, journal, analytics, and reports
- profile photo add/fetch/remove
- ride album photo add/list/remove
- forgot-password and reset-password with Render-managed SMTP secrets

## Deployment

Deploy this service to Render with Docker.

```yaml
services:
  - type: web
    runtime: docker
    name: ktm-ride-api-java
    rootDir: backend-java
    plan: starter
    region: singapore
    healthCheckPath: /health
```

Java is deployed through Render's Docker runtime. Configure `DATABASE_URL`, `DATABASE_SSL`, optional `DB_SCHEMA`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `CORS_ORIGIN`, `PASSWORD_RESET_URL_BASE`, and SMTP variables in Render.
