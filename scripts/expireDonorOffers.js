const { expirePendingOffers } = require("../src/services/donorOfferService");
const pool = require("../src/config/database");

expirePendingOffers()
  .then((outcomes) => console.log(`Processed ${outcomes.length} expired donor offers.`))
  .catch((error) => {
    console.error("Offer expiry failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
