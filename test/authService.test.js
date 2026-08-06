const test = require("node:test");
const assert = require("node:assert/strict");
const { updateProfile } = require("../src/services/authService");
const pool = require("../src/config/database");

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
