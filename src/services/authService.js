const pool = require("../config/database");
const {
  VALID_BLOOD_TYPES,
  VALID_ROLES,
  requireFields,
  assertAllowedValue,
  assertCoordinate,
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

  assertAllowedValue(body.bloodType, VALID_BLOOD_TYPES, "bloodType");
  assertAllowedValue(body.role, VALID_ROLES, "role");

  if (!/^\S+@\S+\.\S+$/.test(body.email)) {
    throw validationError("email must be a valid email address");
  }

  if (body.password.length < 8) {
    throw validationError("password must be at least 8 characters long");
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

module.exports = {
  register,
  login,
  getPublicUserById,
};