const { randomUUID } = require("crypto");
const { bloodRequests } = require("../data/inMemoryStore");
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
  id, owner_id AS "ownerId", patient_name AS "patientName", blood_type AS "bloodType",
  units_needed AS "unitsNeeded", urgency, hospital_name AS "hospitalName", latitude,
  longitude, notes, status, created_at AS "createdAt", updated_at AS "updatedAt"`;

function normalizeUrgency(urgency) {
  return typeof urgency === "string" ? urgency.trim().toLowerCase() : urgency;
}

function createBloodRequest(body, owner) {
  const hospitalName = body.hospitalName || body.location;
  requireFields(body, [
    "bloodType",
    "unitsNeeded",
    "urgency",
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

  const bloodRequest = {
    id: randomUUID(),
    patientName: body.patientName || owner.fullName,
    ownerId: owner.id,
    bloodType: body.bloodType,
    unitsNeeded: Number(body.unitsNeeded),
    urgency,
    hospitalName: String(hospitalName).trim(),
    latitude: hasLatitude ? Number(body.latitude) : null,
    longitude: hasLongitude ? Number(body.longitude) : null,
    notes: body.notes || "",
    status: "open",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  bloodRequests.push(bloodRequest);
  return bloodRequest;
}

function getBloodRequests(filters = {}) {
  return bloodRequests.filter((request) => {
    if (filters.status && request.status !== filters.status) return false;
    if (filters.bloodType && request.bloodType !== filters.bloodType) return false;
    if (filters.urgency && request.urgency !== filters.urgency) return false;
    return true;
  });
}

function getBloodRequestById(id) {
  const bloodRequest = bloodRequests.find((request) => request.id === id);

  if (!bloodRequest) {
    const error = new Error("Blood request not found");
    error.statusCode = 404;
    throw error;
  }

  return bloodRequest;
}

function updateBloodRequestStatus(id, status) {
  requireFields({ status }, ["status"]);
  assertAllowedValue(String(status).toLowerCase(), VALID_REQUEST_STATUSES, "status");

  const bloodRequest = getBloodRequestById(id);
  bloodRequest.status = String(status).toLowerCase();
  bloodRequest.updatedAt = new Date().toISOString();

  return bloodRequest;
}

function deleteBloodRequest(id) {
  const index = bloodRequests.findIndex((request) => request.id === id);

  if (index === -1) {
    const error = new Error("Blood request not found");
    error.statusCode = 404;
    throw error;
  }

  bloodRequests.splice(index, 1);
}

module.exports = {
  createBloodRequest, getBloodRequests, getBloodRequestById, updateBloodRequestStatus,
  deleteBloodRequest, normalizeUrgency, validateRequestInput, validateRequestStatus,
};
