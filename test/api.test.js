const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const app = require("../src/app");
const pool = require("../src/config/database");
const { createAccessToken } = require("../src/utils/token");

test("GET /health returns API status", async () => {
  const originalQuery = pool.query;
  pool.query = async () => ({ rows: [{ ok: 1 }] });
  try {
    const response = await request(app).get("/api/health");
    assert.equal(response.status, 200);
  } finally {
    pool.query = originalQuery;
  }
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
    const token = createAccessToken({ id: "user-1", role: "donor" });
    const response = await request(app)
      .get("/api/blood-requests")
      .set("Authorization", `Bearer ${token}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.items.length, 1);
    assert.equal(response.body.items[0].id, "request-1");
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

test("GET /api/blood-requests/public is anonymous and does not require a token", async () => {
  const originalQuery = pool.query;
  pool.query = async () => ({
    rows: [{
      id: "request-1",
      bloodType: "A+",
      unitsNeeded: 2,
      urgency: "urgent",
      status: "open",
      createdAt: "2026-08-20T12:00:00.000Z",
      hospitalName: "Private Hospital",
      latitude: 42.6,
      notes: "Private note",
    }],
  });
  try {
    const response = await request(app).get("/api/blood-requests/public");
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.items[0], {
      id: "request-1",
      bloodType: "A+",
      unitsNeeded: 2,
      urgency: "urgent",
      status: "open",
      createdAt: "2026-08-20T12:00:00.000Z",
    });
  } finally {
    pool.query = originalQuery;
  }
});

test("POST /api/blood-requests/:id/responses cannot bypass exclusive donor offers", async () => {
  const originalQuery = pool.query;
  pool.query = async (sql) => {
    if (sql.includes("FROM users")) {
      return { rows: [{
        id: "donor-1",
        full_name: "Nearby Donor",
        email: "donor@example.com",
        blood_type: "O-",
        role: "donor",
        token_version: 0,
      }] };
    }
    return { rows: [] };
  };

  try {
    const token = createAccessToken({ id: "donor-1", role: "donor" });
    const response = await request(app)
      .post("/api/blood-requests/request-1/responses")
      .set("Authorization", `Bearer ${token}`);

    assert.equal(response.status, 409);
    assert.match(response.body.message, /exclusive offer/);
  } finally {
    pool.query = originalQuery;
  }
});

test("donor offer routes require authentication", async () => {
  const response = await request(app).get("/api/donor-offers/me");
  assert.equal(response.status, 401);
});
