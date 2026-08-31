# BloodBridge backend

Express API for patient and hospital blood requests, donor discovery, matching, donor responses, and a reliable notification outbox. PostgreSQL is the single source of truth for users, donor availability, requests, donation responses, and pending notifications.

## Requirements

- Node.js 18 or newer (the project was last verified with Node.js 25)
- npm
- PostgreSQL 14 or newer

All runtime and development dependencies are declared in
[`package.json`](package.json) and locked in
[`package-lock.json`](package-lock.json). Do not install packages globally.

## Run locally

1. Clone the repository and install the declared dependencies:

   ```bash
   git clone https://github.com/adnaslani/BloodBridge-backend.git
   cd BloodBridge-backend
   npm ci
   ```

2. Create a PostgreSQL database named `bloodbridge`, then create your local
   environment file. Keep `.env` private; it is intentionally not committed.

   ```bash
   cp .env.example .env
   ```

   Set `TOKEN_SECRET` to a unique value of at least 32 characters and update
   the `DB_*` values to match your PostgreSQL instance. For the standard local
   frontend setup, set these values in `.env`:

   ```dotenv
   PORT=5000
   FRONTEND_ORIGIN=http://localhost:3000
   ```

3. Apply the versioned schema migrations:

   ```bash
   npm run db:migrate
   ```

4. Start the API:

   ```bash
   npm run dev
   ```

   The API is now available at `http://localhost:5000`. Use
   `GET /api/health` to confirm that the process is running and
   `GET /api/ready` to confirm the database connection.

5. Run the test suite when needed:

   ```bash
   npm test
   ```

## Connect the static frontend locally

The frontend repository is [BloodBridge-frontend](https://github.com/Uresaa/BloodBridge-frontend).
Start it on the trusted origin configured in `.env`:

```bash
cd ../BloodBridge-frontend
node server.mjs
```

Then open `http://localhost:3000/html/index.html`. On `localhost`, the
frontend automatically targets `http://localhost:5000/api`. The registration
and login forms store the access token in browser local storage, and the
create request form sends an authenticated `POST /api/blood-requests` request
after geocoding the location. For another frontend host or port, add its exact
origin to `FRONTEND_ORIGIN` as a comma-separated value and restart the API.

For deployment, set `window.BLOODBRIDGE_API_URL` before loading `api.js`, for
example `https://api.example.com/api`; do not change the source files per
environment.

Migrations are recorded in `schema_migrations`, so a migration runs once. Back up production data before applying migrations.

## Cognito migration

The API continues to accept existing local JWTs while Cognito is introduced. Cognito access-token verification and profile provisioning are documented in [docs/cognito-frontend-contract.md](docs/cognito-frontend-contract.md). Apply migration `008_cognito_identity.sql` before enabling the `COGNITO_*` environment variables.

## Security and access model

- Set a unique `TOKEN_SECRET` of at least 32 characters in production; the process refuses to start otherwise.
- Set `FRONTEND_ORIGIN` to one or more comma-separated, trusted origins. It is never open to all browser origins by default.
- Authentication routes are rate limited, request bodies are limited to 100 KB, and security headers are enabled.
- All blood-request reads require authentication. Request lists and non-owner request details are anonymized; exact locations, notes, patient identity, and donor contact details are not exposed publicly.
- Public registration is limited to `donor` and `patient`. Create `hospital` and `admin` accounts through a controlled administrator/seeding process.
- `GET /api/health` is a liveness probe; `GET /api/ready` verifies the database connection and is the deployment readiness probe.
- `POST /api/auth/logout` revokes every currently issued access token for that user. Use it when signing out or responding to a suspected account compromise.

## Main API workflow

- Patients create requests and can list full details at `GET /api/blood-requests/mine`.
- Anyone can view `GET /api/blood-requests/public?limit=20`, which returns active requests without patient identity, facility, notes, phone, email, or coordinates.
- Donors manage availability, location, and notification radius at `GET/PATCH /api/profile/me/donor`.
- A request owner may inspect anonymous, distance-only compatible donors at `GET /api/donors/nearby?requestId=<request UUID>&radiusKm=10`; arbitrary coordinate searches are intentionally not supported.
- The request owner views accepted donor responses at `GET /api/blood-requests/:id/responses`.
- Direct donor responses at `POST /api/blood-requests/:id/responses` are disabled in favour of exclusive donor offers.
- The owner or an admin records an accepted donation at `POST /api/blood-requests/:id/responses/:responseId/complete` with `{ "unitsDonated": 1 }`. Hospital users can do this only for requests they own until hospital membership is modeled explicitly.

### Exclusive donor offers

New requests are offered to one compatible, available donor at a time, ordered by distance and constrained by the donor's notification radius. Donors use `GET /api/donor-offers/me`, then `POST /api/donor-offers/:offerId/accept` or `POST /api/donor-offers/:offerId/decline`. A pending offer expires after ten minutes. The API runs an expiry worker every 30 seconds by default; use `OFFER_EXPIRY_WORKER_ENABLED=false` to disable it, or set `OFFER_EXPIRY_WORKER_POLL_MS` between 5000 and 300000. `npm run offers:expire` remains available for a one-off run or a future EventBridge/Lambda schedule.

If the request owner cancels an open or matched request, every pending or accepted offer for that request is closed inside the same database transaction and each affected donor receives a cancellation notification.

- New requests, accepted responses, and completed donations are recorded in `notification_outbox` and audit logged in the same database transaction. Enable the worker only with a trusted notification relay: it claims jobs safely, retries failed deliveries with exponential backoff, and preserves failed jobs for review.

AWS SNS/SES email delivery and API Gateway WebSocket deployment are documented in [docs/aws-notifications-and-websocket.md](docs/aws-notifications-and-websocket.md).

Only cancellation is a manual request-status transition. Matching and fulfilment are managed by the response workflow.

## Database notes

Run `npm run db:migrate` rather than applying partial schema snippets manually. The migration runner takes a PostgreSQL advisory lock, preventing competing deploys from applying the same migration. Migration `004_production_workflow.sql` adds a case-insensitive email uniqueness index, coordinate protection, hospital/admin roles, matching indexes, and the notification outbox. Before applying it to an existing production database, resolve any duplicate email addresses that differ only by case.

## Database integration test

The exclusive-offer workflow test writes to a database only when all three safeguards are explicitly enabled: `RUN_DB_INTEGRATION_TESTS=true`, `NODE_ENV=test`, and a database name ending in `_test`. Apply migrations to that disposable database first, then run `npm test`. The test covers nearest-donor selection, decline-to-next-donor, acceptance, and cancellation notification.
