const pool = require("../config/database");
const {
  VALID_BLOOD_TYPES,
  VALID_ROLES,
  requireFields,
  assertAllowedValue,
  assertCoordinate,
  assertIntegerInRange,
  assertStringLength,
} = require("../utils/validation");
const { hashPassword, verifyPassword } = require("../utils/password");
const { createAccessToken } = require("../utils/token");

function validationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function publicUser(user) {
  return {
    id: user.id,
    fullName: user.full_name,
    email: user.email,
    bloodType: user.blood_type,
    role: user.role,
    phone: user.phone,
    city: user.city,
    emailNotifications: user.email_notifications,
    smsNotifications: user.sms_notifications,
    shareLocationAutomatically: user.share_location_automatically,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

async function register(body) {
  requireFields(body, ["fullName", "email", "bloodType", "role", "password"]);

  assertStringLength(body.fullName, "fullName", 120);
  assertStringLength(body.email, "email", 254);
  if (typeof body.password !== "string" || body.password.length > 128) {
    throw validationError("password must be between 8 and 128 characters long");
  }

  assertAllowedValue(body.bloodType, VALID_BLOOD_TYPES, "bloodType");
  assertAllowedValue(body.role, VALID_ROLES, "role");
  if (!["donor", "patient"].includes(body.role)) {
    throw validationError("Public registration is only available for donor and patient accounts");
  }

  if (!/^\S+@\S+\.\S+$/.test(body.email)) {
    throw validationError("email must be a valid email address");
  }

  if (body.password.length < 8) {
    throw validationError("password must be between 8 and 128 characters long");
  }

  const hasLatitude = body.latitude !== undefined && body.latitude !== "";
  const hasLongitude = body.longitude !== undefined && body.longitude !== "";

  if (hasLatitude !== hasLongitude) {
    throw validationError("latitude and longitude must be supplied together");
  }

  if (hasLatitude) {
    assertCoordinate(body.latitude, "latitude", -90, 90);
    assertCoordinate(body.longitude, "longitude", -180, 180);
  }

  const email = body.email.trim().toLowerCase();
  const existingUser = await pool.query(
    "SELECT id FROM users WHERE email = $1",
    [email],
  );

  if (existingUser.rowCount > 0) {
    const error = new Error("An account with this email already exists");
    error.statusCode = 409;
    throw error;
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const passwordHash = await hashPassword(body.password);

    const createdUser = await client.query(
      `INSERT INTO users (
        full_name, email, password_hash, role, blood_type
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *`,
      [
        body.fullName.trim(),
        email,
        passwordHash,
        body.role,
        body.bloodType,
      ],
    );

    const user = createdUser.rows[0];

    if (user.role === "donor") {
      await client.query(
        `INSERT INTO donor_profiles (
          user_id, latitude, longitude, is_available
        )
        VALUES ($1, $2, $3, $4)`,
        [
          user.id,
          hasLatitude ? Number(body.latitude) : null,
          hasLongitude ? Number(body.longitude) : null,
          body.isAvailable !== false,
        ],
      );
    }

    await client.query("COMMIT");

    return {
      user: publicUser(user),
      accessToken: createAccessToken(publicUser(user)),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") {
      const conflict = new Error("An account with this email already exists");
      conflict.statusCode = 409;
      throw conflict;
    }
    throw error;
  } finally {
    client.release();
  }
}

async function login(body) {
  requireFields(body, ["email", "password"]);

  const result = await pool.query(
    "SELECT * FROM users WHERE email = $1",
    [body.email.trim().toLowerCase()],
  );

  const user = result.rows[0];

  if (!user || !(await verifyPassword(body.password, user.password_hash))) {
    const error = new Error("Invalid email or password");
    error.statusCode = 401;
    throw error;
  }

  return {
    user: publicUser(user),
    accessToken: createAccessToken(publicUser(user)),
  };
}

async function getUserById(id) {
  const result = await pool.query(
    "SELECT * FROM users WHERE id = $1",
    [id],
  );

  const user = result.rows[0];

  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  return user;
}

async function getPublicUserById(id) {
  return publicUser(await getUserById(id));
}

async function getAuthenticatedUserById(id) {
  const user = await getUserById(id);
  return { ...publicUser(user), tokenVersion: Number(user.token_version || 0) };
}

async function invalidateSessions(id) {
  const result = await pool.query(
    "UPDATE users SET token_version = token_version + 1, updated_at = NOW() WHERE id = $1 RETURNING *",
    [id],
  );
  if (!result.rows[0]) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }
}

async function updateProfile(id, body) {
  const updates = [];
  const values = [];

  function addUpdate(column, value) {
    values.push(value);
    updates.push(`${column} = $${values.length}`);
  }

  if (Object.prototype.hasOwnProperty.call(body, "fullName")) {
    if (!body.fullName || !String(body.fullName).trim()) {
      throw validationError("fullName must not be empty");
    }
    assertStringLength(body.fullName, "fullName", 120);

    addUpdate("full_name", String(body.fullName).trim());
  }

  if (Object.prototype.hasOwnProperty.call(body, "phone")) {
    if (body.phone !== null && (typeof body.phone !== "string" || body.phone.trim().length > 30)) throw validationError("phone must be a string up to 30 characters long");
    addUpdate("phone", body.phone ? String(body.phone).trim() : null);
  }

  if (Object.prototype.hasOwnProperty.call(body, "city")) {
    if (body.city !== null && (typeof body.city !== "string" || body.city.trim().length > 120)) throw validationError("city must be a string up to 120 characters long");
    addUpdate("city", body.city ? String(body.city).trim() : null);
  }

  const booleanFields = [
    ["emailNotifications", "email_notifications"],
    ["smsNotifications", "sms_notifications"],
    ["shareLocationAutomatically", "share_location_automatically"],
  ];

  for (const [bodyField, databaseColumn] of booleanFields) {
    if (Object.prototype.hasOwnProperty.call(body, bodyField)) {
      if (typeof body[bodyField] !== "boolean") {
        throw validationError(`${bodyField} must be a boolean`);
      }

      addUpdate(databaseColumn, body[bodyField]);
    }
  }

  if (updates.length === 0) {
    throw validationError("No valid profile fields supplied");
  }

  values.push(id);

  const result = await pool.query(
    `UPDATE users
     SET ${updates.join(", ")}, updated_at = NOW()
     WHERE id = $${values.length}
     RETURNING *`,
    values,
  );

  const user = result.rows[0];

  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  return publicUser(user);
}

function publicDonorProfile(profile) {
  return {
    latitude: profile.latitude,
    longitude: profile.longitude,
    isAvailable: profile.is_available,
    notificationRadiusKm: profile.notification_radius_km,
    updatedAt: profile.updated_at,
  };
}

async function getDonorProfile(id) {
  const result = await pool.query("SELECT * FROM donor_profiles WHERE user_id = $1", [id]);
  if (!result.rows[0]) {
    const error = new Error("Donor profile not found");
    error.statusCode = 404;
    throw error;
  }
  return publicDonorProfile(result.rows[0]);
}

async function updateDonorProfile(id, body) {
  const updates = [];
  const values = [];
  const addUpdate = (column, value) => {
    values.push(value);
    updates.push(`${column} = $${values.length}`);
  };
  const hasLatitude = Object.prototype.hasOwnProperty.call(body, "latitude");
  const hasLongitude = Object.prototype.hasOwnProperty.call(body, "longitude");

  if (hasLatitude !== hasLongitude) throw validationError("latitude and longitude must be updated together");
  if (hasLatitude) {
    if (body.latitude === null && body.longitude === null) {
      addUpdate("latitude", null);
      addUpdate("longitude", null);
    } else {
      assertCoordinate(body.latitude, "latitude", -90, 90);
      assertCoordinate(body.longitude, "longitude", -180, 180);
      addUpdate("latitude", Number(body.latitude));
      addUpdate("longitude", Number(body.longitude));
    }
  }
  if (Object.prototype.hasOwnProperty.call(body, "isAvailable")) {
    if (typeof body.isAvailable !== "boolean") throw validationError("isAvailable must be a boolean");
    addUpdate("is_available", body.isAvailable);
  }
  if (Object.prototype.hasOwnProperty.call(body, "notificationRadiusKm")) {
    assertIntegerInRange(body.notificationRadiusKm, "notificationRadiusKm", 5, 50);
    addUpdate("notification_radius_km", Number(body.notificationRadiusKm));
  }
  if (updates.length === 0) throw validationError("No valid donor profile fields supplied");

  values.push(id);
  const result = await pool.query(
    `UPDATE donor_profiles SET ${updates.join(", ")}, updated_at = NOW()
     WHERE user_id = $${values.length} RETURNING *`,
    values,
  );
  if (!result.rows[0]) {
    const error = new Error("Donor profile not found");
    error.statusCode = 404;
    throw error;
  }
  return publicDonorProfile(result.rows[0]);
}

module.exports = {
  register,
  login,
  getPublicUserById,
  getAuthenticatedUserById,
  invalidateSessions,
  updateProfile,
  getDonorProfile,
  updateDonorProfile,
};
