const express = require("express");
const donorOfferController = require("../controllers/donorOfferController");
const { requireAuth, allowRoles } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(requireAuth, allowRoles("donor"));
router.get("/me", donorOfferController.getMyActiveOffers);
router.post("/:offerId/accept", donorOfferController.acceptOffer);
router.post("/:offerId/decline", donorOfferController.declineOffer);

module.exports = router;
