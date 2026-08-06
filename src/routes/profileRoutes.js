const express = require("express");
const profileController = require("../controllers/profileController");
const { requireAuth, allowRoles } = require("../middleware/authMiddleware");

const router = express.Router();
router.use(requireAuth);
router.route("/me").get(profileController.getProfile).patch(profileController.updateProfile);
router.route("/me/donor").get(allowRoles("donor"), profileController.getDonorProfile).patch(allowRoles("donor"), profileController.updateDonorProfile);

module.exports = router;
