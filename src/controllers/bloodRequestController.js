const asyncHandler = require("../utils/asyncHandler");
const bloodRequestService = require("../services/bloodRequestService");
const matchingService = require("../services/matchingService");

const createBloodRequest = asyncHandler(async (req, res) => {
  const bloodRequest = bloodRequestService.createBloodRequest(req.body, req.user);
  res.status(201).json(bloodRequest);
});

const getBloodRequests = asyncHandler(async (req, res) => {
  const bloodRequests = await bloodRequestService.getBloodRequests(req.query);
  res.json(bloodRequests);
});

const getBloodRequestById = asyncHandler(async (req, res) => {
  const bloodRequest = bloodRequestService.getBloodRequestById(req.params.id);
  res.json(bloodRequest);
});

const updateBloodRequestStatus = asyncHandler(async (req, res) => {
  const existingRequest = bloodRequestService.getBloodRequestById(req.params.id);
  if (existingRequest.ownerId !== req.user.id) {
    return res.status(403).json({
      message: "Only the request owner can update its status",
    });
  }
  const bloodRequest = bloodRequestService.updateBloodRequestStatus(
    req.params.id,
    req.body.status,
  );

  res.json(bloodRequest);
});

const deleteBloodRequest = asyncHandler(async (req, res) => {
  const existingRequest = bloodRequestService.getBloodRequestById(req.params.id);
  if (existingRequest.ownerId !== req.user.id) {
    return res.status(403).json({
      message: "Only the request owner can delete it",
    });
  }
  bloodRequestService.deleteBloodRequest(req.params.id);
  res.status(204).send();
});

const getBloodRequestMatches = asyncHandler(async (req, res) => {
  const bloodRequest = bloodRequestService.getBloodRequestById(req.params.id);
  const matches = matchingService.findMatchingDonors(bloodRequest, req.query);
  res.json(matches);
});

module.exports = {
  createBloodRequest,
  getBloodRequests,
  getBloodRequestById,
  updateBloodRequestStatus,
  deleteBloodRequest,
  getBloodRequestMatches,
};
