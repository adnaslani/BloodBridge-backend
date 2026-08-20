const { expirePendingOffers } = require("./donorOfferService");

function startOfferExpiryWorker({ pollMilliseconds, expireOffers = expirePendingOffers }) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const outcomes = await expireOffers();
      if (outcomes.length > 0) {
        console.log(JSON.stringify({ level: "info", component: "offer-expiry-worker", expiredOffers: outcomes.length }));
      }
    } catch (error) {
      console.error(JSON.stringify({ level: "error", component: "offer-expiry-worker", message: error.message }));
    } finally {
      running = false;
    }
  };

  const timer = setInterval(run, pollMilliseconds);
  timer.unref();
  run();
  return () => clearInterval(timer);
}

module.exports = { startOfferExpiryWorker };
