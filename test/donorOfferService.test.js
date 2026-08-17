const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_OFFER_TTL_MINUTES, offerExpiryMinutes } = require("../src/services/donorOfferService");

test("uses a ten-minute offer expiry by default", () => {
  assert.equal(DEFAULT_OFFER_TTL_MINUTES, 10);
  assert.equal(offerExpiryMinutes(), 10);
  assert.equal(offerExpiryMinutes(25), 25);
});

test("rejects unsafe offer-expiry values", () => {
  assert.throws(() => offerExpiryMinutes(0), /between 1 and 60/);
  assert.throws(() => offerExpiryMinutes(61), /between 1 and 60/);
  assert.throws(() => offerExpiryMinutes("ten"), /between 1 and 60/);
});
