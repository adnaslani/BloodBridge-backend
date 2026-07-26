const asyncHandler = require("../utils/asyncHandler");
const authService = require("../services/authService");

const getProfile = asyncHandler(async (req, res) => res.json(authService.getPublicUserById(req.user.id)));
const updateProfile = asyncHandler(async (req, res) => res.json(authService.updateProfile(req.user.id, req.body)));

module.exports = { getProfile, updateProfile };