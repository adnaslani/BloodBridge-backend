const express = require("express");
const donorController = require("../controllers/donorController");
const { requireAuth, allowRoles } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/nearby", requireAuth, allowRoles("patient", "hospital"), donorController.getNearbyDonors);

module.exports = router;
