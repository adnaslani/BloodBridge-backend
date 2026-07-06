const { donors } = require("../data/inMemoryStore");
const geoService = require("./geoService");
const {
  VALID_BLOOD_TYPES,
  requireFields,
  assertAllowedValue,
  assertNumber,
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

function findMatchingDonors(bloodRequest, options = {}) {
  const radiusKm = options.radiusKm ? Number(options.radiusKm) : 10;
  const compatibleBloodTypes = getCompatibleDonorBloodTypes(bloodRequest.bloodType);

  return donors
    .filter((donor) => donor.isAvailable)
    .filter((donor) => compatibleBloodTypes.includes(donor.bloodType))
    .map((donor) => {
      const distanceKm = geoService.calculateDistanceKm(
        bloodRequest.latitude,
        bloodRequest.longitude,
        donor.latitude,
        donor.longitude,
      );

      return {
        ...donor,
        distanceKm: Number(distanceKm.toFixed(2)),
      };
    })
    .filter((donor) => donor.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

function findNearbyCompatibleDonors(query) {
  requireFields(query, ["bloodType", "lat", "lng"]);
  assertAllowedValue(query.bloodType, VALID_BLOOD_TYPES, "bloodType");
  assertNumber(query.lat, "lat");
  assertNumber(query.lng, "lng");

  const radiusKm = query.radiusKm ? Number(query.radiusKm) : 10;

  const bloodRequestLikeLocation = {
    bloodType: query.bloodType,
    latitude: Number(query.lat),
    longitude: Number(query.lng),
  };

  return findMatchingDonors(bloodRequestLikeLocation, { radiusKm });
}

module.exports = {
  getCompatibleDonorBloodTypes,
  findMatchingDonors,
  findNearbyCompatibleDonors,
};
