const test = require("node:test");
const assert = require("node:assert/strict");
const { addDistances, findMatchingDonors, getCompatibleDonorBloodTypes, validateRadius } = require("../src/services/matchingService");

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

test("honors a donor's notification radius as well as the request radius", () => {
  const request = { bloodType: "O-", latitude: 42.6629, longitude: 21.1655 };
  const donors = [{ id: "outside-donor-radius", latitude: 42.68, longitude: 21.1655, notificationRadiusKm: 1 }];
  assert.deepEqual(addDistances(donors, request, 10), []);
});

test("allows a donor to be matched again when their only prior offer expired", async () => {
  let query;
  await findMatchingDonors(
    { id: "request-1", bloodType: "O-", latitude: 42.6629, longitude: 21.1655 },
    {
      excludePreviouslyOffered: true,
      client: {
        query: async (sql, values) => {
          query = { sql, values };
          return { rows: [] };
        },
      },
    },
  );

  assert.match(query.sql, /offer\.status <> 'expired'/);
  assert.equal(query.values[5], "request-1");
});
