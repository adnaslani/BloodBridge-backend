const { randomUUID } = require("crypto");
const { users, donors } = require("../data/inMemoryStore");
const { VALID_BLOOD_TYPES, VALID_ROLES, requireFields, assertAllowedValue, assertCoordinate } = require("../utils/validation");
const { hashPassword, verifyPassword } = require("../utils/password");
const { createAccessToken } = require("../utils/token");

function publicUser(user) {
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

function validationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

async function register(body) {
  requireFields(body, ["fullName", "email", "bloodType", "role", "password"]);
  assertAllowedValue(body.bloodType, VALID_BLOOD_TYPES, "bloodType");
  assertAllowedValue(body.role, VALID_ROLES, "role");
  if (!/^\S+@\S+\.\S+$/.test(body.email)) throw validationError("email must be a valid email address");
  if (body.password.length < 8) throw validationError("password must be at least 8 characters long");
  const hasLatitude = body.latitude !== undefined && body.latitude !== "";
  const hasLongitude = body.longitude !== undefined && body.longitude !== "";
  if (hasLatitude !== hasLongitude) throw validationError("latitude and longitude must be supplied together");
  if (hasLatitude) {
    assertCoordinate(body.latitude, "latitude", -90, 90);
    assertCoordinate(body.longitude, "longitude", -180, 180);
  }

  const email = body.email.trim().toLowerCase();
  if (users.some((user) => user.email === email)) {
    const error = new Error("An account with this email already exists");
    error.statusCode = 409;
    throw error;
  }
  const user = {
    id: randomUUID(), fullName: body.fullName.trim(), email, bloodType: body.bloodType, role: body.role,
    passwordHash: await hashPassword(body.password), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  users.push(user);
  if (user.role === "donor") {
    donors.push({ id: user.id, userId: user.id, fullName: user.fullName, bloodType: user.bloodType,
      latitude: hasLatitude ? Number(body.latitude) : null, longitude: hasLongitude ? Number(body.longitude) : null,
      isAvailable: body.isAvailable !== false });
  }
  return { user: publicUser(user), accessToken: createAccessToken(user) };
}

async function login(body) {
  requireFields(body, ["email", "password"]);
  const user = users.find((candidate) => candidate.email === body.email.trim().toLowerCase());
  if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
    const error = new Error("Invalid email or password");
    error.statusCode = 401;
    throw error;
  }
  return { user: publicUser(user), accessToken: createAccessToken(user) };
}

function getUserById(id) {
  const user = users.find((candidate) => candidate.id === id);
  if (!user) { const error = new Error("User not found"); error.statusCode = 404; throw error; }
  return user;
}

function getPublicUserById(id) { return publicUser(getUserById(id)); }

function updateProfile(id, body) {
  const user = getUserById(id);
  if (body.fullName !== undefined) user.fullName = String(body.fullName).trim();
  if (body.bloodType !== undefined) { assertAllowedValue(body.bloodType, VALID_BLOOD_TYPES, "bloodType"); user.bloodType = body.bloodType; }
  user.updatedAt = new Date().toISOString();
  const donor = donors.find((candidate) => candidate.userId === id);
  if (donor) {
    donor.fullName = user.fullName; donor.bloodType = user.bloodType;
    if (body.latitude !== undefined) { assertCoordinate(body.latitude, "latitude", -90, 90); donor.latitude = Number(body.latitude); }
    if (body.longitude !== undefined) { assertCoordinate(body.longitude, "longitude", -180, 180); donor.longitude = Number(body.longitude); }
    if (body.isAvailable !== undefined) donor.isAvailable = Boolean(body.isAvailable);
  }
  return publicUser(user);
}

module.exports = { register, login, getPublicUserById, updateProfile };