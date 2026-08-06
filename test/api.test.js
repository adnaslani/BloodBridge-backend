const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const app = require("../src/app");
const pool = require("../src/config/database");
const { createAccessToken } = require("../src/utils/token");

test("GET /health returns API status", async () => {
  const response = await request(app).get("/api/health");

  assert.equal(response.status, 200);
});

test("POST /api/blood-requests rejects unauthenticated users", async () => {
  const response = await request(app)
    .post("/api/blood-requests")
    .send({
      bloodType: "O-",
      unitsNeeded: 2,
      urgency: "critical",
      location: "Prishtina Regional Hospital",
    });

  assert.equal(response.status, 401);
});

test("GET /api/blood-requests returns requests from the database", async () => {
  const originalQuery = pool.query;

  pool.query = async () => ({
    rows: [
      {
        id: "request-1",
        bloodType: "A+",
        urgency: "urgent",
        status: "open",
      },
    ],
  });

  try {
    const response = await request(app).get("/api/blood-requests");

    assert.equal(response.status, 200);
    assert.equal(response.body.length, 1);
    assert.equal(response.body[0].id, "request-1");
  } finally {
    pool.query = originalQuery;
  }
});

test("PATCH /api/blood-requests/:id/status rejects a different request owner", async () => {
  const originalQuery = pool.query;
  let updateAttempted = false;

  pool.query = async (sql) => {
    if (sql.includes("FROM users")) {
      return {
        rows: [{
          id: "patient-1",
          full_name: "Requesting Patient",
          email: "patient@example.com",
          blood_type: "O+",
          role: "patient",
        }],
      };
    }

    if (sql.includes("FROM blood_requests")) {
      return { rows: [{ id: "request-1", ownerId: "patient-2" }] };
    }

    if (sql.includes("UPDATE blood_requests")) {
      updateAttempted = true;
    }

    return { rows: [] };
  };

  try {
    const token = createAccessToken({ id: "patient-1", role: "patient" });
    const response = await request(app)
      .patch("/api/blood-requests/request-1/status")
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "fulfilled" });

    assert.equal(response.status, 403);
    assert.equal(response.body.message, "Only the request owner can update its status");
    assert.equal(updateAttempted, false);
  } finally {
    pool.query = originalQuery;
  }
});
