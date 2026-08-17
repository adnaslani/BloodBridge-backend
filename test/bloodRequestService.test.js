const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeUrgency,
  validateRequestInput,
  validateRequestStatus,
  updateBloodRequestStatus,
} = require("../src/services/bloodRequestService");
const pool = require("../src/config/database");

const validRequest = {
  bloodType: "O-",
  unitsNeeded: 2,
  urgency: "Critical",
  location: "Prishtina Regional Hospital",
  latitude: 42.6629,
  longitude: 21.1655,
};

test("normalizes a request urgency before persistence", () => {
  assert.equal(normalizeUrgency(" Critical "), "critical");
  assert.deepEqual(validateRequestInput(validRequest), {
    hospitalName: "Prishtina Regional Hospital",
    urgency: "critical",
  });
});

test("rejects missing request coordinates", () => {
  assert.throws(
    () => validateRequestInput({ ...validRequest, longitude: undefined }),
    { message: "Missing required fields: longitude", statusCode: 400 },
  );
});

test("rejects invalid units and blood types", () => {
  assert.throws(() => validateRequestInput({ ...validRequest, unitsNeeded: 0 }), /unitsNeeded must be an integer/);
  assert.throws(() => validateRequestInput({ ...validRequest, bloodType: "X" }), /bloodType must be one of/);
});

test("accepts case-insensitive request status updates", () => {
  assert.equal(validateRequestStatus(" Fulfilled "), "fulfilled");
});

test("rejects missing or unsupported request statuses", () => {
  assert.throws(() => validateRequestStatus(), /Missing required fields: status/);
  assert.throws(() => validateRequestStatus("pending"), /status must be one of/);
});

test("persists a normalized request status update with parameterized SQL", async () => {
  const originalConnect = pool.connect;
  const updatedRequest = { id: "request-1", status: "fulfilled" };
  let query;
  let values;
  const client = {
    query: async (sql, params) => {
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [] };
    query = sql;
    values = params;
    return { rows: [updatedRequest] };
    },
    release() {},
  };
  pool.connect = async () => client;

  try {
    assert.equal(await updateBloodRequestStatus("request-1", " Fulfilled "), updatedRequest);
    assert.match(query, /UPDATE blood_requests SET status = \$1/);
    assert.deepEqual(values, ["fulfilled", "request-1"]);
  } finally {
    pool.connect = originalConnect;
  }
});

test("returns a not-found error when updating a missing request", async () => {
  const originalConnect = pool.connect;
  const client = { query: async () => ({ rows: [] }), release() {} };
  pool.connect = async () => client;

  try {
    await assert.rejects(
      updateBloodRequestStatus("missing-request", "open"),
      { message: "Blood request not found", statusCode: 404 },
    );
  } finally {
    pool.connect = originalConnect;
  }
});

test("cancelling a request closes pending donor offers in the same transaction", async () => {
  const originalConnect = pool.connect;
  const calls = [];
  const client = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [] };
      if (sql.includes("UPDATE blood_requests")) return { rows: [{ id: "request-1", status: "cancelled" }] };
      if (sql.includes("UPDATE donor_offers")) return { rows: [{ id: "offer-1", donor_user_id: "donor-1" }] };
      if (sql.includes("FROM users WHERE id = ANY")) return { rows: [] };
      if (sql.includes("INSERT INTO audit_log")) return { rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    },
    release() {},
  };
  pool.connect = async () => client;

  try {
    await updateBloodRequestStatus("request-1", "cancelled", "open", "patient-1");
    assert.ok(calls.some(({ sql }) => sql.includes("UPDATE donor_offers")));
    assert.equal(calls.at(-1).sql, "COMMIT");
  } finally {
    pool.connect = originalConnect;
  }
});
