const express = require("express");
const bloodRequestController = require("../controllers/bloodRequestController");

const router = express.Router();

router
  .route("/")
  .post(bloodRequestController.createBloodRequest)
  .get(bloodRequestController.getBloodRequests);

router
  .route("/:id")
  .get(bloodRequestController.getBloodRequestById)
  .delete(bloodRequestController.deleteBloodRequest);

router.patch("/:id/status", bloodRequestController.updateBloodRequestStatus);
router.get("/:id/matches", bloodRequestController.getBloodRequestMatches);

module.exports = router;
