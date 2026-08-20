# BloodBridge backend

Express API for patient and hospital blood requests, donor discovery, matching, donor responses, and a reliable notification outbox. PostgreSQL is the single source of truth for users, donor availability, requests, donation responses, and pending notifications.

## Run locally

1. Create a PostgreSQL database named `bloodbridge` and copy `.env.example` to `.env` with its connection details.
2. Apply the versioned schema migration:

   ```bash
   npm run db:migrate
   ```

3. Start the API with `npm run dev`, or run the unit tests with `npm test`.

## Connect the static frontend locally

The frontend in `../BloodBridge-frontend-main` calls this API at
`http://localhost:5002/api`. Start it from that directory on the trusted
origin configured in `.env`:

```bash
cd ../BloodBridge-frontend-main
python3 -m http.server 3000
```

Then open `http://localhost:3000/login_register.html`. The registration and
login forms store the access token in browser local storage, and the create
request form sends an authenticated `POST /api/blood-requests` request after
geocoding the location. For another frontend host or port, add its exact
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
- Donors manage availability, location, and notification radius at `GET/PATCH /api/profile/me/donor`.
- A request owner may inspect anonymous, distance-only compatible donors at `GET /api/donors/nearby?requestId=<request UUID>&radiusKm=10`; arbitrary coordinate searches are intentionally not supported.
- The request owner views accepted donor responses at `GET /api/blood-requests/:id/responses`.
- Direct donor responses at `POST /api/blood-requests/:id/responses` are disabled in favour of exclusive donor offers.
- The owner or an admin records an accepted donation at `POST /api/blood-requests/:id/responses/:responseId/complete` with `{ "unitsDonated": 1 }`. Hospital users can do this only for requests they own until hospital membership is modeled explicitly.

### Exclusive donor offers

New requests are offered to one compatible, available donor at a time, ordered by distance and constrained by the donor's notification radius. Donors use `GET /api/donor-offers/me`, then `POST /api/donor-offers/:offerId/accept` or `POST /api/donor-offers/:offerId/decline`. A pending offer expires after ten minutes; run `npm run offers:expire` periodically until the scheduled cloud worker is introduced.

If the request owner cancels an open or matched request, every pending or accepted offer for that request is closed inside the same database transaction and each affected donor receives a cancellation notification.

- New requests, accepted responses, and completed donations are recorded in `notification_outbox` and audit logged in the same database transaction. Enable the worker only with a trusted notification relay: it claims jobs safely, retries failed deliveries with exponential backoff, and preserves failed jobs for review.

Only cancellation is a manual request-status transition. Matching and fulfilment are managed by the response workflow.

## Database notes

Run `npm run db:migrate` rather than applying partial schema snippets manually. The migration runner takes a PostgreSQL advisory lock, preventing competing deploys from applying the same migration. Migration `004_production_workflow.sql` adds a case-insensitive email uniqueness index, coordinate protection, hospital/admin roles, matching indexes, and the notification outbox. Before applying it to an existing production database, resolve any duplicate email addresses that differ only by case.

## Database integration test

The exclusive-offer workflow test writes to a database only when all three safeguards are explicitly enabled: `RUN_DB_INTEGRATION_TESTS=true`, `NODE_ENV=test`, and a database name ending in `_test`. Apply migrations to that disposable database first, then run `npm test`. The test covers nearest-donor selection, decline-to-next-donor, acceptance, and cancellation notification.
