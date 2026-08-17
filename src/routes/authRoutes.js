const express = require("express");
const authController = require("../controllers/authController");
const { requireAuth, requireCognitoAuth } = require("../middleware/authMiddleware");

const router = express.Router();
router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/logout", requireAuth, authController.logout);
router.post("/cognito/sync", requireCognitoAuth, authController.syncCognitoUser);

module.exports = router;
