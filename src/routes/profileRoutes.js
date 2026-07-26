const express = require("express");
const profileController = require("../controllers/profileController");
const { requireAuth } = require("../middleware/authMiddleware");

const router = express.Router();
router.use(requireAuth);
router.route("/me").get(profileController.getProfile).patch(profileController.updateProfile);

module.exports = router;