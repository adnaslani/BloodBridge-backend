const test = require("node:test");
const assert = require("node:assert/strict");
const { addDistances, getCompatibleDonorBloodTypes, validateRadius } = require("../src/services/matchingService");

test("returns only compatible donors inside the requested radius when distances are calculated", () => {
  const request = { bloodType: "O-", latitude: 42.6629, longitude: 21.1655 };
  const donors = [
    { id: "near", bloodType: "O-", latitude: 42.6630, longitude: 21.1655, isAvailable: true },
    { id: "far", bloodType: "O-", latitude: 43, longitude: 21.1655, isAvailable: true },
  ];
  assert.deepEqual(addDistances(donors, request, 1).map((donor) => donor.id), ["near"]);
  assert.deepEqual(getCompatibleDonorBloodTypes("A+"), ["O-", "O+", "A-", "A+"]);
});

test("validates a matching radius", () => {
  assert.equal(validateRadius(undefined), 10);
  assert.throws(() => validateRadius("nope"), /radiusKm must be a positive number/);
  assert.throws(() => validateRadius(0), /radiusKm must be a positive number/);
});