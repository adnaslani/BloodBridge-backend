const express = require("express");
const donorController = require("../controllers/donorController");

const router = express.Router();

router.get("/nearby", donorController.getNearbyDonors);

module.exports = router;