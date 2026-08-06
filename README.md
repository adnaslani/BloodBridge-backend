# BloodBridge backend

Express API for patient and hospital blood requests, donor discovery, matching, donor responses, and a reliable notification outbox. PostgreSQL is the single source of truth for users, donor availability, requests, donation responses, and pending notifications.

## Run locally

1. Create a PostgreSQL database named `bloodbridge` and copy `.env.example` to `.env` with its connection details.
2. Apply the versioned schema migration:

   ```bash
   npm run db:migrate
   ```

3. Start the API with `npm run dev`, or run the unit tests with `npm test`.

Migrations are recorded in `schema_migrations`, so a migration runs once. Back up production data before applying migrations.

## Security and access model

- Set a unique `TOKEN_SECRET` of at least 32 characters in production; the process refuses to start otherwise.
- Set `FRONTEND_ORIGIN` to one or more comma-separated, trusted origins. It is never open to all browser origins by default.
- Authentication routes are rate limited, request bodies are limited to 100 KB, and security headers are enabled.
- All blood-request reads require authentication. Request lists and non-owner request details are anonymized; exact locations, notes, patient identity, and donor contact details are not exposed publicly.
- Public registration is limited to `donor` and `patient`. Create `hospital` and `admin` accounts through a controlled administrator/seeding process.
- `GET /api/health` verifies the database connection. A healthy process is not considered ready when PostgreSQL is unavailable.

## Main API workflow

- Patients create requests and can list full details at `GET /api/blood-requests/mine`.
- Donors manage availability, location, and notification radius at `GET/PATCH /api/profile/me/donor`.
- A donor expresses interest with `POST /api/blood-requests/:id/responses`.
- The request owner views responses at `GET /api/blood-requests/:id/responses` and accepts or declines a pending response with `PATCH /api/blood-requests/:id/responses/:responseId`.
- The owner, a hospital, or an admin records an accepted donation at `POST /api/blood-requests/:id/responses/:responseId/complete` with `{ "unitsDonated": 1 }`. Multiple donors can respond while a request is active; completed units cannot exceed the requested amount, and the request becomes fulfilled automatically once its requirement is met.
- New requests, accepted responses, and completed donations are recorded in `notification_outbox` in the same database transaction. A worker can safely claim and deliver these email/SMS jobs with the selected provider.

Only cancellation is a manual request-status transition. Matching and fulfilment are managed by the response workflow.

## Database notes

Run `npm run db:migrate` rather than applying partial schema snippets manually. Migration `004_production_workflow.sql` adds a case-insensitive email uniqueness index, coordinate protection, hospital/admin roles, matching indexes, and the notification outbox. Before applying it to an existing production database, resolve any duplicate email addresses that differ only by case.