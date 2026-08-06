const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const app = require("../src/app");
const pool = require("../src/config/database");

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