const { randomUUID } = require("crypto");
const { bloodRequests } = require("../data/inMemoryStore");
const {
  VALID_BLOOD_TYPES,
  VALID_URGENCY_LEVELS,
  VALID_REQUEST_STATUSES,
  requireFields,
  assertAllowedValue,
  assertNumber,
} = require("../utils/validation");

function createBloodRequest(body) {
  requireFields(body, [
    "patientName",
    "bloodType",
    "unitsNeeded",
    "urgency",
    "hospitalName",
    "latitude",
    "longitude",
  ]);

  assertAllowedValue(body.bloodType, VALID_BLOOD_TYPES, "bloodType");
  assertAllowedValue(body.urgency, VALID_URGENCY_LEVELS, "urgency");
  assertNumber(body.unitsNeeded, "unitsNeeded");
  assertNumber(body.latitude, "latitude");
  assertNumber(body.longitude, "longitude");

  const bloodRequest = {
    id: randomUUID(),
    patientName: body.patientName,
    bloodType: body.bloodType,
    unitsNeeded: Number(body.unitsNeeded),
    urgency: body.urgency,
    hospitalName: body.hospitalName,
    latitude: Number(body.latitude),
    longitude: Number(body.longitude),
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
  assertAllowedValue(status, VALID_REQUEST_STATUSES, "status");

  const bloodRequest = getBloodRequestById(id);
  bloodRequest.status = status;
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
  createBloodRequest,
  getBloodRequests,
  getBloodRequestById,
  updateBloodRequestStatus,
  deleteBloodRequest,
};
