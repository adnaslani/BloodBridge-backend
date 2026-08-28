const asyncHandler = require("../utils/asyncHandler");
const bloodRequestService = require("../services/bloodRequestService");
const matchingService = require("../services/matchingService");
const requestResponseService = require("../services/requestResponseService");

function publicBloodRequest(bloodRequest) {
  return {
    id: bloodRequest.id,
    bloodType: bloodRequest.bloodType,
    unitsNeeded: bloodRequest.unitsNeeded,
    urgency: bloodRequest.urgency,
    status: bloodRequest.status,
    createdAt: bloodRequest.createdAt,
    updatedAt: bloodRequest.updatedAt,
  };
}

function anonymousPublicBloodRequest(bloodRequest) {
  return {
    id: bloodRequest.id,
    bloodType: bloodRequest.bloodType,
    unitsNeeded: bloodRequest.unitsNeeded,
    urgency: bloodRequest.urgency,
    status: bloodRequest.status,
    createdAt: bloodRequest.createdAt,
  };
}

const createBloodRequest = asyncHandler(async (req, res) => {
  const bloodRequest = await bloodRequestService.createBloodRequest(
    req.body,
    req.user,
  );

  res.status(201).json(bloodRequest);
});

const getBloodRequests = asyncHandler(async (req, res) => {
  const bloodRequests = await bloodRequestService.getBloodRequests(req.query);
  res.json({ ...bloodRequests, items: bloodRequests.items.map(publicBloodRequest) });
});

const getMyBloodRequests = asyncHandler(async (req, res) => {
  const bloodRequests = await bloodRequestService.getBloodRequests({ ...req.query, ownerId: req.user.id });
  res.json(bloodRequests);
});

const getBloodRequestById = asyncHandler(async (req, res) => {
  const bloodRequest = await bloodRequestService.getBloodRequestById(
    req.params.id,
  );

  res.json(bloodRequest.ownerId === req.user.id ? bloodRequest : publicBloodRequest(bloodRequest));
});

const updateBloodRequestStatus = asyncHandler(async (req, res) => {
  const existingRequest = await bloodRequestService.getBloodRequestById(
    req.params.id,
  );

  if (existingRequest.ownerId !== req.user.id) {
    return res.status(403).json({
      message: "Only the request owner can update its status",
    });
  }

  const bloodRequest = await bloodRequestService.updateBloodRequestStatus(
    req.params.id,
    req.body.status,
    existingRequest.status,
    req.user.id,
  );

  res.json(bloodRequest);
});

const respondToBloodRequest = asyncHandler(async (req, res) => {
  res.status(409).json({
    message: "Direct donor responses are disabled. Accept your donor offer instead.",
  });
});

const getPublicBloodRequests = asyncHandler(async (req, res) => {
  const bloodRequests = await bloodRequestService.getBloodRequests({
    ...req.query,
    status: "open",
  });
  res.json({ ...bloodRequests, items: bloodRequests.items.map(anonymousPublicBloodRequest) });
});

const getBloodRequestResponses = asyncHandler(async (req, res) => {
  const bloodRequest = await bloodRequestService.getBloodRequestById(req.params.id);
  if (bloodRequest.ownerId !== req.user.id) return res.status(403).json({ message: "Only the request owner can view responses" });
  res.json(await requestResponseService.getResponsesForOwner(req.params.id));
});

const updateRequestResponse = asyncHandler(async (req, res) => {
  const bloodRequest = await bloodRequestService.getBloodRequestById(req.params.id);
  res.json(await requestResponseService.updateResponse({
    requestId: req.params.id,
    responseId: req.params.responseId,
    actor: req.user,
    requestOwnerId: bloodRequest.ownerId,
    status: req.body.status,
  }));
});

const completeRequestResponse = asyncHandler(async (req, res) => {
  const bloodRequest = await bloodRequestService.getBloodRequestById(req.params.id);
  const canVerify = bloodRequest.ownerId === req.user.id || req.user.role === "admin";
  if (!canVerify) return res.status(403).json({ message: "Only the request owner or an admin can complete a donation" });
  res.json(await requestResponseService.completeResponse({ requestId: req.params.id, responseId: req.params.responseId, unitsDonated: req.body.unitsDonated, actor: req.user }));
});

const deleteBloodRequest = asyncHandler(async (req, res) => {
  const existingRequest = await bloodRequestService.getBloodRequestById(
    req.params.id,
  );

  if (existingRequest.ownerId !== req.user.id) {
    return res.status(403).json({
      message: "Only the request owner can delete it",
    });
  }

  await bloodRequestService.deleteBloodRequest(req.params.id);
  res.status(204).send();
});

const getBloodRequestMatches = asyncHandler(async (req, res) => {
  const bloodRequest = await bloodRequestService.getBloodRequestById(
    req.params.id,
  );

  if (bloodRequest.ownerId !== req.user.id) {
    return res.status(403).json({ message: "Only the request owner can view matching donors" });
  }

  const matches = await matchingService.findMatchingDonors(
    bloodRequest,
    req.query,
  );

  res.json(matches.map(({ bloodType, distanceKm }) => ({ bloodType, distanceKm })));
});

module.exports = {
  createBloodRequest,
  getPublicBloodRequests,
  getBloodRequests,
  getMyBloodRequests,
  getBloodRequestById,
  updateBloodRequestStatus,
  deleteBloodRequest,
  getBloodRequestMatches,
  respondToBloodRequest,
  getBloodRequestResponses,
  updateRequestResponse,
  completeRequestResponse,
};
