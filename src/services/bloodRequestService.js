const { randomUUID } = require("crypto");
const pool = require("../config/database");
const {
  VALID_BLOOD_TYPES,
  VALID_URGENCY_LEVELS,
  VALID_REQUEST_STATUSES,
  requireFields,
  assertAllowedValue,
  assertIntegerInRange,
  assertCoordinate,
} = require("../utils/validation");

const requestColumns = `
  id,
  owner_id AS "ownerId",
  patient_name AS "patientName",
  blood_type AS "bloodType",
  units_needed AS "unitsNeeded",
  urgency,
  hospital_name AS "hospitalName",
  latitude,
  longitude,
  notes,
  status,
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

function normalizeUrgency(urgency) {
  return typeof urgency === "string" ? urgency.trim().toLowerCase() : urgency;
}

function validateRequestInput(body) {
  const hospitalName = body.hospitalName || body.location;

  requireFields(body, ["bloodType", "unitsNeeded", "urgency"]);

  if (!hospitalName || !String(hospitalName).trim()) {
    const error = new Error("Missing required fields: hospitalName or location");
    error.statusCode = 400;
    throw error;
  }

  assertAllowedValue(body.bloodType, VALID_BLOOD_TYPES, "bloodType");

  const urgency = normalizeUrgency(body.urgency);
  assertAllowedValue(urgency, VALID_URGENCY_LEVELS, "urgency");

  assertIntegerInRange(body.unitsNeeded, "unitsNeeded", 1, 25);

  const hasLatitude = body.latitude !== undefined && body.latitude !== "";
  const hasLongitude = body.longitude !== undefined && body.longitude !== "";

  if (hasLatitude !== hasLongitude) {
    const error = new Error("latitude and longitude must be supplied together");
    error.statusCode = 400;
    throw error;
  }

  if (hasLatitude) {
    assertCoordinate(body.latitude, "latitude", -90, 90);
    assertCoordinate(body.longitude, "longitude", -180, 180);
  }

  return {
    hospitalName: String(hospitalName).trim(),
    urgency,
    hasLatitude,
  };
}

function validateRequestStatus(status) {
  requireFields({ status }, ["status"]);

  const normalizedStatus = String(status).trim().toLowerCase();
  assertAllowedValue(
    normalizedStatus,
    VALID_REQUEST_STATUSES,
    "status",
  );

  return normalizedStatus;
}

async function createBloodRequest(body, owner) {
  const { hospitalName, urgency, hasLatitude } = validateRequestInput(body);

  const result = await pool.query(
    `INSERT INTO blood_requests (
      id,
      owner_id,
      patient_name,
      blood_type,
      units_needed,
      urgency,
      hospital_name,
      latitude,
      longitude,
      notes,
      status
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING ${requestColumns}`,
    [
      randomUUID(),
      owner.id,
      String(body.patientName || owner.fullName).trim(),
      body.bloodType,
      Number(body.unitsNeeded),
      urgency,
      hospitalName,
      hasLatitude ? Number(body.latitude) : null,
      hasLatitude ? Number(body.longitude) : null,
      body.notes ? String(body.notes) : "",
      "open",
    ],
  );

  return result.rows[0];
}

async function getBloodRequests(filters = {}) {
  const conditions = [];
  const values = [];

  if (filters.status) {
    values.push(validateRequestStatus(filters.status));
    conditions.push(`status = $${values.length}`);
  }

  if (filters.bloodType) {
    assertAllowedValue(filters.bloodType, VALID_BLOOD_TYPES, "bloodType");
    values.push(filters.bloodType);
    conditions.push(`blood_type = $${values.length}`);
  }

  if (filters.urgency) {
    const urgency = normalizeUrgency(filters.urgency);
    assertAllowedValue(urgency, VALID_URGENCY_LEVELS, "urgency");
    values.push(urgency);
    conditions.push(`urgency = $${values.length}`);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await pool.query(
    `SELECT ${requestColumns}
     FROM blood_requests
     ${whereClause}
     ORDER BY created_at DESC`,
    values,
  );

  return result.rows;
}

async function getBloodRequestById(id) {
  const result = await pool.query(
    `SELECT ${requestColumns}
     FROM blood_requests
     WHERE id = $1`,
    [id],
  );

  const bloodRequest = result.rows[0];

  if (!bloodRequest) {
    const error = new Error("Blood request not found");
    error.statusCode = 404;
    throw error;
  }

  return bloodRequest;
}

async function updateBloodRequestStatus(id, status) {
  const normalizedStatus = validateRequestStatus(status);

  const result = await pool.query(
    `UPDATE blood_requests SET status = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING ${requestColumns}`,
    [normalizedStatus, id],
  );

  const bloodRequest = result.rows[0];

  if (!bloodRequest) {
    const error = new Error("Blood request not found");
    error.statusCode = 404;
    throw error;
  }

  return bloodRequest;
}

async function deleteBloodRequest(id) {
  const result = await pool.query(
    "DELETE FROM blood_requests WHERE id = $1 RETURNING id",
    [id],
  );

  if (!result.rows[0]) {
    const error = new Error("Blood request not found");
    error.statusCode = 404;
    throw error;
  }
}

module.exports = {
  createBloodRequest,
  getBloodRequests,
  getBloodRequestById,
  updateBloodRequestStatus,
  deleteBloodRequest,
  normalizeUrgency,
  validateRequestInput,
  validateRequestStatus,
};
