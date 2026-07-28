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

function normalizeUrgency(urgency) {
  return typeof urgency === "string" ? urgency.trim().toLowerCase() : urgency;
}

function mapBloodRequest(row) {
  return {
    id: row.id,
    patientName: row.patient_name,
    ownerId: row.created_by_user_id,
    bloodType: row.blood_type,
    unitsNeeded: row.units_needed,
    urgency: row.urgency,
    hospitalName: row.hospital_name,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    notes: row.notes,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function createBloodRequest(body, owner) {
  const hospitalName = body.hospitalName || body.location;

  requireFields(body, [
    "bloodType",
    "unitsNeeded",
    "urgency",
    "latitude",
    "longitude",
  ]);

  if (!hospitalName || !String(hospitalName).trim()) {
    const error = new Error("Missing required fields: hospitalName or location");
    error.statusCode = 400;
    throw error;
  }

  assertAllowedValue(body.bloodType, VALID_BLOOD_TYPES, "bloodType");

  const urgency = normalizeUrgency(body.urgency);
  assertAllowedValue(urgency, VALID_URGENCY_LEVELS, "urgency");

  assertIntegerInRange(body.unitsNeeded, "unitsNeeded", 1, 25);
  assertCoordinate(body.latitude, "latitude", -90, 90);
  assertCoordinate(body.longitude, "longitude", -180, 180);

  const result = await pool.query(
    `INSERT INTO blood_requests (
      created_by_user_id,
      patient_name,
      blood_type,
      units_needed,
      urgency,
      hospital_name,
      latitude,
      longitude,
      notes
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *`,
    [
      owner.id,
      String(body.patientName || owner.fullName).trim(),
      body.bloodType,
      Number(body.unitsNeeded),
      urgency,
      String(hospitalName).trim(),
      Number(body.latitude),
      Number(body.longitude),
      String(body.notes || ""),
    ],
  );

  return mapBloodRequest(result.rows[0]);
}

async function getBloodRequests(filters = {}) {
  const conditions = [];
  const values = [];

  if (filters.status) {
    values.push(String(filters.status).toLowerCase());
    conditions.push(`status = $${values.length}`);
  }

  if (filters.bloodType) {
    values.push(filters.bloodType);
    conditions.push(`blood_type = $${values.length}`);
  }

  if (filters.urgency) {
    values.push(normalizeUrgency(filters.urgency));
    conditions.push(`urgency = $${values.length}`);
  }

  const whereClause = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const result = await pool.query(
    `SELECT * FROM blood_requests
     ${whereClause}
     ORDER BY created_at DESC`,
    values,
  );

  return result.rows.map(mapBloodRequest);
}

async function getBloodRequestById(id) {
  const result = await pool.query(
    "SELECT * FROM blood_requests WHERE id = $1",
    [id],
  );

  if (result.rowCount === 0) {
    const error = new Error("Blood request not found");
    error.statusCode = 404;
    throw error;
  }

  return mapBloodRequest(result.rows[0]);
}

async function updateBloodRequestStatus(id, status) {
  requireFields({ status }, ["status"]);

  const normalizedStatus = String(status).toLowerCase();
  assertAllowedValue(
    normalizedStatus,
    VALID_REQUEST_STATUSES,
    "status",
  );

  const result = await pool.query(
    `UPDATE blood_requests
     SET status = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [normalizedStatus, id],
  );

  if (result.rowCount === 0) {
    const error = new Error("Blood request not found");
    error.statusCode = 404;
    throw error;
  }

  return mapBloodRequest(result.rows[0]);
}

async function deleteBloodRequest(id) {
  const result = await pool.query(
    "DELETE FROM blood_requests WHERE id = $1",
    [id],
  );

  if (result.rowCount === 0) {
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
};