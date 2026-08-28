const { randomUUID } = require("crypto");
const pool = require("../config/database");
const { record } = require("./auditService");
const { createInitialOffers, cancelPendingOffersForRequest } = require("./donorOfferService");
const {
  VALID_BLOOD_TYPES,
  VALID_URGENCY_LEVELS,
  VALID_REQUEST_STATUSES,
  requireFields,
  assertAllowedValue,
  assertIntegerInRange,
  assertCoordinate,
  assertStringLength,
} = require("../utils/validation");

const requestColumns = `
  id,
  created_by_user_id AS "ownerId",
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

  assertStringLength(hospitalName, "hospitalName", 200);
  if (body.patientName !== undefined) assertStringLength(body.patientName, "patientName", 120);
  if (body.notes !== undefined) assertStringLength(body.notes, "notes", 2000, { allowEmpty: true });

  assertAllowedValue(body.bloodType, VALID_BLOOD_TYPES, "bloodType");

  const urgency = normalizeUrgency(body.urgency);
  assertAllowedValue(urgency, VALID_URGENCY_LEVELS, "urgency");

  assertIntegerInRange(body.unitsNeeded, "unitsNeeded", 1, 25);

  assertCoordinate(body.latitude, "latitude", -90, 90);
  assertCoordinate(body.longitude, "longitude", -180, 180);

  return {
    hospitalName: String(hospitalName).trim(),
    urgency,
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
  const { hospitalName, urgency } = validateRequestInput(body);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
    `INSERT INTO blood_requests (
      id,
      created_by_user_id,
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
      Number(body.latitude),
      Number(body.longitude),
      body.notes ? String(body.notes) : "",
      "open",
    ],
    );
    const bloodRequest = result.rows[0];
const initialOffers = await createInitialOffers(client, bloodRequest);
await record(client, {
  actorUserId: owner.id,
  eventType: "blood_request.created",
  subjectType: "blood_request",
  subjectId: bloodRequest.id,
  metadata: { urgency: bloodRequest.urgency, unitsNeeded: bloodRequest.unitsNeeded, donorsNotified: initialOffers.length },
});
if (initialOffers.length === 0) {
  await record(client, {
    actorUserId: null,
    eventType: "donor_offer.unavailable",
    subjectType: "blood_request",
    subjectId: bloodRequest.id,
    metadata: { reason: "no_compatible_available_donor" },
  });
}
    await client.query("COMMIT");
    return bloodRequest;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
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

  if (filters.ownerId) {
    values.push(filters.ownerId);
    conditions.push(`created_by_user_id = $${values.length}`);
  }

  const limit = filters.limit === undefined ? 20 : Number(filters.limit);
  const offset = filters.offset === undefined ? 0 : Number(filters.offset);
  assertIntegerInRange(limit, "limit", 1, 100);
  assertIntegerInRange(offset, "offset", 0, Number.MAX_SAFE_INTEGER);

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await pool.query(
    `SELECT ${requestColumns}
     FROM blood_requests
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, limit + 1, offset],
  );

  return {
    items: result.rows.slice(0, limit),
    pagination: { limit, offset, hasMore: result.rows.length > limit },
  };
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

async function updateBloodRequestStatus(id, status, currentStatus, actorUserId = null) {
  const normalizedStatus = validateRequestStatus(status);
  const allowedTransitions = {
    open: ["cancelled"],
    matched: ["cancelled"],
    fulfilled: [],
    cancelled: [],
  };
  if (currentStatus !== undefined && !allowedTransitions[currentStatus]?.includes(normalizedStatus)) {
    const error = new Error("This request status can only be changed by the donation workflow");
    error.statusCode = 409;
    throw error;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
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
    if (normalizedStatus === "cancelled") {
      await cancelPendingOffersForRequest(client, bloodRequest, actorUserId);
    }
    await client.query("COMMIT");
    return bloodRequest;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function deleteBloodRequest(id) {
  const existing = await getBloodRequestById(id);
  if (!['open', 'cancelled'].includes(existing.status)) {
    const error = new Error("Only open or cancelled blood requests can be deleted");
    error.statusCode = 409;
    throw error;
  }
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
