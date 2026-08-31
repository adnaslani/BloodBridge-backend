const pool = require("../config/database");
const geoService = require("./geoService");
const { VALID_BLOOD_TYPES, assertAllowedValue } = require("../utils/validation");

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
  if (!Number.isFinite(radius) || radius <= 0 || radius > 100) {
    const error = new Error("radiusKm must be a positive number no greater than 100");
    error.statusCode = 400;
    throw error;
  }
  return radius;
}

function addDistances(donors, bloodRequest, radiusKm) {
  return donors.map((donor) => ({ ...donor, distanceKm: Number(geoService.calculateDistanceKm(bloodRequest.latitude, bloodRequest.longitude, donor.latitude, donor.longitude).toFixed(2)) }))
    .filter((donor) => donor.distanceKm <= Math.min(radiusKm, Number(donor.notificationRadiusKm || radiusKm)))
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

async function findMatchingDonors(bloodRequest, options = {}) {
  if (bloodRequest.latitude === null || bloodRequest.longitude === null) return [];
  const database = options.client || pool;
  const radiusKm = validateRadius(options.radiusKm);
  const latitudeDelta = radiusKm / 111.32;
  const longitudeDelta = radiusKm / Math.max(111.32 * Math.cos((Number(bloodRequest.latitude) * Math.PI) / 180), 0.01);
  const values = [
    getCompatibleDonorBloodTypes(bloodRequest.bloodType || bloodRequest.blood_type),
    Number(bloodRequest.latitude) - latitudeDelta,
    Number(bloodRequest.latitude) + latitudeDelta,
    Number(bloodRequest.longitude) - longitudeDelta,
    Number(bloodRequest.longitude) + longitudeDelta,
  ];
  const excludePreviouslyOffered = options.excludePreviouslyOffered
    ? ` AND NOT EXISTS (
          SELECT 1 FROM donor_offers offer
          WHERE offer.blood_request_id = $6 AND offer.donor_user_id = u.id
            AND offer.status <> 'expired'
        )`
    : "";
  if (options.excludePreviouslyOffered) values.push(bloodRequest.id);
  const result = await database.query(
    `SELECT u.id, u.full_name AS "fullName", u.email, u.blood_type AS "bloodType", dp.latitude, dp.longitude,
       dp.is_available AS "isAvailable", dp.notification_radius_km AS "notificationRadiusKm",
       u.email_notifications AS "emailNotifications", u.sms_notifications AS "smsNotifications"
     FROM donor_profiles dp JOIN users u ON u.id = dp.user_id
     WHERE dp.is_available = TRUE AND dp.latitude IS NOT NULL AND dp.longitude IS NOT NULL
       AND u.blood_type = ANY($1::text[])
       AND dp.latitude BETWEEN $2 AND $3
       AND dp.longitude BETWEEN $4 AND $5${excludePreviouslyOffered}`,
    values,
  );
  return addDistances(result.rows, bloodRequest, radiusKm);
}

module.exports = { getCompatibleDonorBloodTypes, findMatchingDonors, validateRadius, addDistances };
