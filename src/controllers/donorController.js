const asyncHandler = require("../utils/asyncHandler");
const matchingService = require("../services/matchingService");

const getNearbyDonors = asyncHandler(async (req, res) => {
  const donors = await matchingService.findNearbyCompatibleDonors(req.query);
  res.json(donors.map(({ bloodType, distanceKm }) => ({ bloodType, distanceKm })));
});

module.exports = {
  getNearbyDonors,
};