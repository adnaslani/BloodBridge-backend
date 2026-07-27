const express = require("express");
const bloodRequestController = require("../controllers/bloodRequestController");
const { requireAuth, allowRoles } = require("../middleware/authMiddleware");

const router = express.Router();

router
  .route("/")
  .post(requireAuth, allowRoles("patient"), bloodRequestController.createBloodRequest)
  .get(bloodRequestController.getBloodRequests);

router
  .route("/:id")
  .get(bloodRequestController.getBloodRequestById);

router.patch("/:id/status", requireAuth, allowRoles("patient"), bloodRequestController.updateBloodRequestStatus);
router.delete("/:id", requireAuth, allowRoles("patient"), bloodRequestController.deleteBloodRequest);
router.get("/:id/matches", bloodRequestController.getBloodRequestMatches);

module.exports = router;