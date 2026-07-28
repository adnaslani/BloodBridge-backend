const pool = require("../config/database");
const geoService = require("./geoService");
const {
  VALID_BLOOD_TYPES,
  requireFields,
  assertAllowedValue,
  assertNumber,
  assertCoordinate,
} = require("../utils/validation");

const compatibleDonorTypesByRecipient = {
  "O-": ["O-"],
  "O+": ["O-", "O+"],
  "A-": ["O-", "A-"],
  "A+": ["O-", "O+", "A-", "A+"],
  "B-": ["O-", "B-"],
  "B+": ["O-", "O+", "B-", "B+"],
  "AB-": ["O-", "A-", "B-", "AB-"],
  "AB+": ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"],
};

function getCompatibleDonorBloodTypes(recipientBloodType) {
  assertAllowedValue(recipientBloodType, VALID_BLOOD_TYPES, "bloodType");
  return compatibleDonorTypesByRecipient[recipientBloodType];
}

function getRadiusKm(value) {
  const radiusKm = value ? Number(value) : 10;

  if (!Number.isFinite(radiusKm) || radiusKm <= 0) {
    const error = new Error("radiusKm must be a positive number");
    error.statusCode = 400;
    throw error;
  }

  return radiusKm;
}

async function findMatchingDonors(bloodRequest, options = {}) {
  const radiusKm = getRadiusKm(options.radiusKm);

  const compatibleBloodTypes = getCompatibleDonorBloodTypes(
    bloodRequest.bloodType,
  );

  const result = await pool.query(
    `SELECT
       u.id,
       u.full_name,
       u.blood_type,
       dp.latitude,
       dp.longitude,
       dp.is_available,
       dp.notification_radius_km
     FROM users u
     JOIN donor_profiles dp ON dp.user_id = u.id
     WHERE u.role = 'donor'
       AND dp.is_available = TRUE
       AND dp.latitude IS NOT NULL
       AND dp.longitude IS NOT NULL
       AND u.blood_type = ANY($1::text[])`,
    [compatibleBloodTypes],
  );

  return result.rows
    .map((donor) => {
      const latitude = Number(donor.latitude);
      const longitude = Number(donor.longitude);

      const distanceKm = geoService.calculateDistanceKm(
        Number(bloodRequest.latitude),
        Number(bloodRequest.longitude),
        latitude,
        longitude,
      );

      return {
        id: donor.id,
        userId: donor.id,
        fullName: donor.full_name,
        bloodType: donor.blood_type,
        latitude,
        longitude,
        isAvailable: donor.is_available,
        notificationRadiusKm: donor.notification_radius_km,
        distanceKm: Number(distanceKm.toFixed(2)),
      };
    })
    .filter((donor) => donor.distanceKm <= radiusKm)
    .sort((first, second) => first.distanceKm - second.distanceKm);
}

async function findNearbyCompatibleDonors(query) {
  requireFields(query, ["bloodType", "lat", "lng"]);

  assertAllowedValue(query.bloodType, VALID_BLOOD_TYPES, "bloodType");
  assertNumber(query.lat, "lat");
  assertNumber(query.lng, "lng");
  assertCoordinate(query.lat, "lat", -90, 90);
  assertCoordinate(query.lng, "lng", -180, 180);

  return findMatchingDonors(
    {
      bloodType: query.bloodType,
      latitude: Number(query.lat),
      longitude: Number(query.lng),
    },
    { radiusKm: query.radiusKm },
  );
}

module.exports = {
  getCompatibleDonorBloodTypes,
  findMatchingDonors,
  findNearbyCompatibleDonors,
};