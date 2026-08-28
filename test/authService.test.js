const test = require("node:test");
const assert = require("node:assert/strict");
const { updateProfile, login, register } = require("../src/services/authService");
const pool = require("../src/config/database");
const { hashPassword } = require("../src/utils/password");
const { verifyAccessToken } = require("../src/utils/token");

test("rejects registration without accepted terms", async () => {
  await assert.rejects(
    register({
      fullName: "Ada Lovelace",
      email: "ada@example.com",
      bloodType: "A+",
      role: "donor",
      password: "Password1!",
    }),
    { message: "You must accept the Terms and Conditions to create an account", statusCode: 400 },
  );
});

test("rejects profile updates with no supported fields", async () => {
  await assert.rejects(
    updateProfile("user-1", { role: "donor" }),
    { message: "No valid profile fields supplied", statusCode: 400 },
  );
});

test("rejects invalid profile values", async () => {
  await assert.rejects(
    updateProfile("user-1", { fullName: "   " }),
    { message: "fullName must not be empty", statusCode: 400 },
  );
  await assert.rejects(
    updateProfile("user-1", { smsNotifications: "yes" }),
    { message: "smsNotifications must be a boolean", statusCode: 400 },
  );
});

test("updates profile fields using parameterized SQL", async () => {
  const originalQuery = pool.query;
  let query;
  let values;

  pool.query = async (sql, params) => {
    query = sql;
    values = params;
    return {
      rows: [{
        id: "user-1",
        full_name: "Ada Lovelace",
        email: "ada@example.com",
        blood_type: "A+",
        role: "donor",
        phone: null,
        city: "Prishtina",
        email_notifications: true,
        sms_notifications: false,
        share_location_automatically: true,
      }],
    };
  };

  try {
    const profile = await updateProfile("user-1", {
      fullName: "  Ada Lovelace  ",
      city: "Prishtina",
      shareLocationAutomatically: true,
    });

    assert.match(query, /UPDATE users/);
    assert.match(query, /full_name = \$1/);
    assert.match(query, /city = \$2/);
    assert.match(query, /share_location_automatically = \$3/);
    assert.deepEqual(values, ["Ada Lovelace", "Prishtina", true, "user-1"]);
    assert.equal(profile.fullName, "Ada Lovelace");
    assert.equal(profile.shareLocationAutomatically, true);
  } finally {
    pool.query = originalQuery;
  }
});

test("updates a donor location label and source with parameterized SQL", async () => {
  const originalConnect = pool.connect;
  let query;
  let values;
  pool.connect = async () => ({
    query: async (sql, params) => {
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [] };
      if (typeof sql === "string" && sql.includes("UPDATE donor_profiles")) {
        query = sql;
        values = params;
        return {
          rows: [{
            latitude: 50.1109,
            longitude: 8.6821,
            location_label: "Frankfurt",
            location_source: "manual",
            is_available: true,
            notification_radius_km: 15,
            updated_at: new Date(),
          }],
        };
      }
      return { rows: [] };
    },
    release() {},
  });

  try {
    const { updateDonorProfile } = require("../src/services/authService");
    const profile = await updateDonorProfile("user-1", {
      latitude: 50.1109,
      longitude: 8.6821,
      locationLabel: "Frankfurt",
      locationSource: "manual",
    });
    assert.match(query, /UPDATE donor_profiles/);
    assert.match(query, /location_label = \$3/);
    assert.match(query, /location_source = \$4/);
    assert.equal(values[2], "Frankfurt");
    assert.equal(values[3], "manual");
    assert.equal(profile.locationLabel, "Frankfurt");
    assert.equal(profile.locationSource, "manual");
  } finally {
    pool.connect = originalConnect;
  }
});

test("issues a fresh login token with the user's current session version", async () => {
  const originalQuery = pool.query;
  const passwordHash = await hashPassword("Password123");
  pool.query = async () => ({
    rows: [{
      id: "user-1",
      full_name: "Ada Lovelace",
      email: "ada@example.com",
      password_hash: passwordHash,
      blood_type: "A+",
      role: "donor",
      token_version: 4,
      email_notifications: true,
      sms_notifications: false,
      share_location_automatically: false,
    }],
  });

  try {
    const session = await login({ email: "ada@example.com", password: "Password123" });
    assert.equal(verifyAccessToken(session.accessToken).ver, 4);
  } finally {
    pool.query = originalQuery;
  }
});
