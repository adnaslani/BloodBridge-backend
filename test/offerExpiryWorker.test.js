const test = require("node:test");
const assert = require("node:assert/strict");
const { startOfferExpiryWorker } = require("../src/services/offerExpiryWorker");

test("offer expiry worker starts and can be stopped", async () => {
  let runs = 0;
  const stop = startOfferExpiryWorker({
    pollMilliseconds: 5000,
    expireOffers: async () => { runs += 1; return []; },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(typeof stop, "function");
  assert.equal(runs, 1);
  stop();
});
