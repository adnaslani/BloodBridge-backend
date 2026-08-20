const express = require("express");
const bloodRequestController = require("../controllers/bloodRequestController");
const { requireAuth, allowRoles } = require("../middleware/authMiddleware");

const router = express.Router();

// This route intentionally exposes only anonymous, non-location request data.
router.get("/public", bloodRequestController.getPublicBloodRequests);

router
  .route("/")
  .post(requireAuth, allowRoles("patient", "hospital"), bloodRequestController.createBloodRequest)
  .get(requireAuth, bloodRequestController.getBloodRequests);

router.get("/mine", requireAuth, allowRoles("patient", "hospital"), bloodRequestController.getMyBloodRequests);

router
  .route("/:id")
  .get(requireAuth, bloodRequestController.getBloodRequestById);

router.patch("/:id/status", requireAuth, allowRoles("patient", "hospital"), bloodRequestController.updateBloodRequestStatus);
router.delete("/:id", requireAuth, allowRoles("patient", "hospital"), bloodRequestController.deleteBloodRequest);
router.get("/:id/matches", requireAuth, allowRoles("patient", "hospital"), bloodRequestController.getBloodRequestMatches);
router.route("/:id/responses")
  .post(requireAuth, allowRoles("donor"), bloodRequestController.respondToBloodRequest)
  .get(requireAuth, allowRoles("patient"), bloodRequestController.getBloodRequestResponses);
router.patch("/:id/responses/:responseId", requireAuth, bloodRequestController.updateRequestResponse);
router.post("/:id/responses/:responseId/complete", requireAuth, allowRoles("patient", "hospital", "admin"), bloodRequestController.completeRequestResponse);

module.exports = router;
