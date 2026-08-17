const asyncHandler = require("../utils/asyncHandler");
const donorOfferService = require("../services/donorOfferService");

const getMyActiveOffers = asyncHandler(async (req, res) => {
  res.json(await donorOfferService.getMyActiveOffers(req.user.id));
});

const acceptOffer = asyncHandler(async (req, res) => {
  res.json(await donorOfferService.acceptOffer(req.params.offerId, req.user));
});

const declineOffer = asyncHandler(async (req, res) => {
  res.json(await donorOfferService.declineOffer(req.params.offerId, req.user.id));
});

module.exports = { getMyActiveOffers, acceptOffer, declineOffer };
