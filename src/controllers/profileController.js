const asyncHandler = require("../utils/asyncHandler");
const authService = require("../services/authService");

const getProfile = asyncHandler(async (req, res) => {
  const profile = await authService.getPublicUserById(req.user.id);
  res.json(profile);
});

const updateProfile = asyncHandler(async (req, res) => {
  const profile = await authService.updateProfile(req.user.id, req.body);
  res.json(profile);
});

const getDonorProfile = asyncHandler(async (req, res) => {
  res.json(await authService.getDonorProfile(req.user.id));
});

const updateDonorProfile = asyncHandler(async (req, res) => {
  res.json(await authService.updateDonorProfile(req.user.id, req.body));
});

module.exports = { getProfile, updateProfile, getDonorProfile, updateDonorProfile };

