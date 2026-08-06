const pool = require("../config/database");
const geoService = require("./geoService");
const { VALID_BLOOD_TYPES, requireFields, assertAllowedValue, assertNumber, assertCoordinate } = require("../utils/validation");

const compatibleDonorTypesByRecipient = {
  "O-": ["O-"], "O+": ["O-", "O+"], "A-": ["O-", "A-"], "A+": ["O-", "O+", "A-", "A+"],
  "B-": ["O-", "B-"], "B+": ["O-", "O+", "B-", "B+"], "AB-": ["O-", "A-", "B-", "AB-"],
  "AB+": ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"],
};

function getCompatibleDonorBloodTypes(recipientBloodType) {
  assertAllowedValue(recipientBloodType, VALID_BLOOD_TYPES, "bloodType");
  return compatibleDonorTypesByRecipient[recipientBloodType];
}

function validateRadius(radiusKm) {
  const radius = radiusKm === undefined || radiusKm === "" ? 10 : Number(radiusKm);
  if (!Number.isFinite(radius) || radius <= 0) {
    const error = new Error("radiusKm must be a positive number");
    error.statusCode = 400;
    throw error;
  }
  return radius;
}

function addDistances(donors, bloodRequest, radiusKm) {
  return donors.map((donor) => ({ ...donor, distanceKm: Number(geoService.calculateDistanceKm(bloodRequest.latitude, bloodRequest.longitude, donor.latitude, donor.longitude).toFixed(2)) }))
    .filter((donor) => donor.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

async function findMatchingDonors(bloodRequest, options = {}) {
  if (bloodRequest.latitude === null || bloodRequest.longitude === null) return [];
  const radiusKm = validateRadius(options.radiusKm);
  const result = await pool.query(
    `SELECT u.id, u.full_name AS "fullName", u.blood_type AS "bloodType", dp.latitude, dp.longitude, dp.is_available AS "isAvailable"
     FROM donor_profiles dp JOIN users u ON u.id = dp.user_id
     WHERE dp.is_available = TRUE AND dp.latitude IS NOT NULL AND dp.longitude IS NOT NULL
       AND u.blood_type = ANY($1::text[])`,
    [getCompatibleDonorBloodTypes(bloodRequest.bloodType)],
  );
  return addDistances(result.rows, bloodRequest, radiusKm);
}

async function findNearbyCompatibleDonors(query) {
  requireFields(query, ["bloodType", "lat", "lng"]);
  assertAllowedValue(query.bloodType, VALID_BLOOD_TYPES, "bloodType");
  assertNumber(query.lat, "lat"); assertNumber(query.lng, "lng");
  assertCoordinate(query.lat, "lat", -90, 90); assertCoordinate(query.lng, "lng", -180, 180);
  return findMatchingDonors({ bloodType: query.bloodType, latitude: Number(query.lat), longitude: Number(query.lng) }, { radiusKm: query.radiusKm });
}

module.exports = { getCompatibleDonorBloodTypes, findMatchingDonors, findNearbyCompatibleDonors, validateRadius, addDistances };
