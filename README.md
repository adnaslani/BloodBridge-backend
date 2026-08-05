# BloodBridge backend

Express API for patient blood requests, donor discovery, and matching. PostgreSQL is the single source of truth for users, donor availability, and blood requests.

## Run locally

1. Create a PostgreSQL database named `bloodbridge` and copy `.env.example` to `.env` with its connection details.
2. Apply the versioned schema migration:

   ```bash
   npm run db:migrate
   ```

3. Start the API with `npm run dev`, or run the unit tests with `npm test`.

The migration is safe to re-run: it creates tables and indexes only when missing.
