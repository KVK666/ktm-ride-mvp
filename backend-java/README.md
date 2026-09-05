# RidePulse Java API

Spring Boot backend for the RidePulse mobile and web apps.

Controllers are intentionally thin and return the standard response wrapper. Business flow lives in `service`, repository interfaces live under `repository`, and JDBC implementations live under `repository/jdbc`. Runtime SQL lives in `src/main/resources/db-queries.properties` with named parameters and `.pojo` mapping keys. Repositories use `NamedParameterJdbcTemplate`, with separate read-only and read-write datasource beans. Flyway applies versioned schema migrations from `src/main/resources/db/migration` before application startup completes.

## Backend responsibilities

- `RideService`: ride creation, detail, review, ownership and deletion.
- `RideListService` / `RidePhotoService`: pagination/search and private photo operations.
- `RideAiIntelligenceService`: durable job orchestration and atomic completion. Provider HTTP calls, destination matching, fallback rules and trip automation live in separate classes.
- `GoogleTimelineImportService`: import transactions; `GoogleTimelinePayload` validates and normalizes input, and `GoogleTimelineOverlapPolicy` checks intervals.
- `PasswordResetService`: reset workflow; token issuance commits before the separate email sender runs. HTML is a resource template, and SMTP connection/read/write timeouts are bounded.
- `dto`: shared typed data such as photo payloads and AI job claims, independent of service implementations. Existing JSON names and response envelopes remain compatible.

## Requirements

- Java 17
- Maven 3.9+
- PostgreSQL 16 (an empty database or the existing RidePulse schema)

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

The database regression suite uses a dedicated PostgreSQL database and creates/removes uniquely named test schemas. Never point it at production:

```powershell
$env:RIDEPULSE_TEST_DATABASE_URL="jdbc:postgresql://localhost:5432/ridepulse_test?user=postgres"
mvn -Ppostgres-it verify
```

It exercises fresh/legacy migrations, concurrent ride retries, transaction rollback, AI lease recovery, stale-worker fencing and atomic trip automation. PR CI provisions PostgreSQL and runs this suite.

## Schema upgrades and AI recovery

Flyway baselines an existing non-empty schema at version `0`, then applies V1 (non-destructive core table creation), V2 (the former additive updates), and V3 (AI leases). Existing tables and records are preserved. Select the intended database/schema using `DATABASE_URL` and `DB_SCHEMA`, and take the normal deployment backup before the first migration. The database role needs DDL permissions. Future schema changes belong in a new migration file; do not edit applied migrations or disable checksum validation.

Ride creation saves `pending` AI status in the same transaction as the route, so a restart cannot lose the job. Two bounded workers poll every five seconds. A claim expires after five minutes; unfinished work is reclaimed after that interval. A claim token prevents a replaced worker from committing, and trip changes and the intelligence result commit together. Missing provider configuration still produces deterministic fallback intelligence. Set `ridepulse.ai.worker-enabled=false` to pause workers while retaining pending work.

Migrations use PostgreSQL's built-in `gen_random_uuid()`; they do not require installing UUID extensions in a particular schema.

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
