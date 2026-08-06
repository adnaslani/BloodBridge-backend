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
    hasLatitude: true,
  });
});

test("rejects incomplete request coordinates", () => {
  assert.throws(
    () => validateRequestInput({ ...validRequest, longitude: undefined }),
    { message: "latitude and longitude must be supplied together", statusCode: 400 },
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
  const originalQuery = pool.query;
  const updatedRequest = { id: "request-1", status: "fulfilled" };
  let query;
  let values;
  pool.query = async (sql, params) => {
    query = sql;
    values = params;
    return { rows: [updatedRequest] };
  };

  try {
    assert.equal(await updateBloodRequestStatus("request-1", " Fulfilled "), updatedRequest);
    assert.match(query, /UPDATE blood_requests SET status = \$1/);
    assert.deepEqual(values, ["fulfilled", "request-1"]);
  } finally {
    pool.query = originalQuery;
  }
});

test("returns a not-found error when updating a missing request", async () => {
  const originalQuery = pool.query;
  pool.query = async () => ({ rows: [] });

  try {
    await assert.rejects(
      updateBloodRequestStatus("missing-request", "open"),
      { message: "Blood request not found", statusCode: 404 },
    );
  } finally {
    pool.query = originalQuery;
  }
});
