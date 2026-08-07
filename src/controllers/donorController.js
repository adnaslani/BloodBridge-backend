const asyncHandler = require("../utils/asyncHandler");
const matchingService = require("../services/matchingService");
const bloodRequestService = require("../services/bloodRequestService");

const getNearbyDonors = asyncHandler(async (req, res) => {
  const bloodRequest = await bloodRequestService.getBloodRequestById(req.query.requestId);
  if (bloodRequest.ownerId !== req.user.id) {
    return res.status(403).json({ message: "Only the request owner can search its matching donors" });
  }
  const donors = await matchingService.findMatchingDonors(bloodRequest, req.query);
  res.json(donors.map(({ bloodType, distanceKm }) => ({ bloodType, distanceKm })));
});

module.exports = {
  getNearbyDonors,
};
