const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("initial migration creates the database schema used by the API", () => {
  const migration = fs.readFileSync(
    path.join(__dirname, "..", "db", "migrations", "001_initial_schema.sql"),
    "utf8",
  );

  for (const table of ["users", "donor_profiles", "blood_requests"]) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(migration, /REFERENCES users\(id\) ON DELETE CASCADE/);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS donor_profiles_available_idx/);
});

test("production migration adds the notification outbox and case-insensitive email protection", () => {
  const migration = fs.readFileSync(
    path.join(__dirname, "..", "db", "migrations", "004_production_workflow.sql"),
    "utf8",
  );
  assert.match(migration, /CREATE TABLE IF NOT EXISTS notification_outbox/);
  assert.match(migration, /users_email_lower_unique_idx/);
  assert.match(migration, /'hospital', 'admin'/);
});

test("operational hardening migration supports token revocation, auditing, and worker leases", () => {
  const migration = fs.readFileSync(
    path.join(__dirname, "..", "db", "migrations", "005_operational_hardening.sql"),
    "utf8",
  );
  for (const expected of ["token_version", "locked_at", "CREATE TABLE IF NOT EXISTS audit_log"]) {
    assert.match(migration, new RegExp(expected));
  }
});

test("exclusive donor-offer migration enforces one active offer per request", () => {
  const migration = fs.readFileSync(
    path.join(__dirname, "..", "db", "migrations", "006_exclusive_donor_offers.sql"),
    "utf8",
  );
  assert.match(migration, /CREATE TABLE IF NOT EXISTS donor_offers/);
  assert.match(migration, /donor_offers_one_pending_per_request_idx/);
  assert.match(migration, /'donor_offer_created'/);
});

test("donor offer cancellation migration enables cancellation notifications", () => {
  const migration = fs.readFileSync(
    path.join(__dirname, "..", "db", "migrations", "007_donor_offer_cancellation_notifications.sql"),
    "utf8",
  );
  assert.match(migration, /'donor_offer_cancelled'/);
});

test("Cognito migration links an external identity without replacing internal user UUIDs", () => {
  const migration = fs.readFileSync(
    path.join(__dirname, "..", "db", "migrations", "008_cognito_identity.sql"),
    "utf8",
  );
  assert.match(migration, /cognito_sub TEXT/);
  assert.match(migration, /users_cognito_sub_unique_idx/);
});

test("realtime migration supports websocket notification jobs and connection storage", () => {
  const migration = fs.readFileSync(
    path.join(__dirname, "..", "db", "migrations", "009_realtime_notification_delivery.sql"),
    "utf8",
  );
  assert.match(migration, /'websocket'/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS web_socket_connections/);
});
