const { randomUUID } = require("crypto");
const pool = require("../config/database");
const { findMatchingDonors } = require("./matchingService");
const { enqueue } = require("./notificationService");
const { record } = require("./auditService");

const DEFAULT_OFFER_TTL_MINUTES = 10;

function error(message, statusCode = 400) {
  const result = new Error(message);
  result.statusCode = statusCode;
  return result;
}

function offerExpiryMinutes(value = DEFAULT_OFFER_TTL_MINUTES) {
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60) {
    throw error("offerTtlMinutes must be an integer between 1 and 60");
  }
  return minutes;
}

function serializeOffer(offer) {
  return {
    id: offer.id,
    requestId: offer.blood_request_id,
    status: offer.status,
    distanceKm: Number(offer.distance_km),
    offeredAt: offer.offered_at,
    expiresAt: offer.expires_at,
    respondedAt: offer.responded_at,
  };
}

async function offerNextEligibleDonor(client, bloodRequest, options = {}) {
  if (bloodRequest.status !== "open") return null;
  const pending = await client.query(
    "SELECT id FROM donor_offers WHERE blood_request_id = $1 AND status = 'pending' FOR UPDATE",
    [bloodRequest.id],
  );
  if (pending.rows[0]) return null;

  const candidates = await findMatchingDonors(bloodRequest, {
    client,
    excludePreviouslyOffered: true,
    radiusKm: options.radiusKm,
  });
  const donor = candidates[0];
  if (!donor) return null;

  const offerResult = await client.query(
    `INSERT INTO donor_offers (id, blood_request_id, donor_user_id, expires_at, distance_km)
     VALUES ($1, $2, $3, NOW() + ($4 * INTERVAL '1 minute'), $5)
     RETURNING *`,
    [randomUUID(), bloodRequest.id, donor.id, offerExpiryMinutes(options.offerTtlMinutes), donor.distanceKm],
  );
  const offer = offerResult.rows[0];
  await enqueue(client, {
    eventType: "donor_offer_created",
    recipientUserId: donor.id,
    email: donor.emailNotifications,
    sms: donor.smsNotifications,
    payload: {
      offerId: offer.id,
      bloodRequestId: bloodRequest.id,
      urgency: bloodRequest.urgency,
      expiresAt: offer.expires_at,
    },
  });
  await record(client, {
    eventType: "donor_offer.created",
    subjectType: "donor_offer",
    subjectId: offer.id,
    metadata: { bloodRequestId: bloodRequest.id, donorUserId: donor.id, distanceKm: donor.distanceKm },
  });
  return offer;
}

async function createInitialOffer(client, bloodRequest) {
  return offerNextEligibleDonor(client, bloodRequest);
}

async function getMyActiveOffers(donorId) {
  await expirePendingOffers();
  const result = await pool.query(
    `SELECT o.*, br.blood_type, br.units_needed, br.urgency, br.hospital_name, br.latitude, br.longitude
     FROM donor_offers o
     JOIN blood_requests br ON br.id = o.blood_request_id
     WHERE o.donor_user_id = $1 AND o.status = 'pending' AND o.expires_at > NOW()
       AND br.status = 'open'
     ORDER BY o.expires_at ASC`,
    [donorId],
  );
  return result.rows.map((offer) => ({
    ...serializeOffer(offer),
    request: {
      id: offer.blood_request_id,
      bloodType: offer.blood_type,
      unitsNeeded: offer.units_needed,
      urgency: offer.urgency,
      hospitalName: offer.hospital_name,
      latitude: Number(offer.latitude),
      longitude: Number(offer.longitude),
    },
  }));
}

async function acceptOffer(offerId, donor) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const offerReference = await client.query("SELECT blood_request_id FROM donor_offers WHERE id = $1", [offerId]);
    if (!offerReference.rows[0]) throw error("Donor offer not found", 404);
    const requestResult = await client.query("SELECT * FROM blood_requests WHERE id = $1 FOR UPDATE", [offerReference.rows[0].blood_request_id]);
    const bloodRequest = requestResult.rows[0];
    if (!bloodRequest) throw error("Blood request not found", 404);
    const offerResult = await client.query("SELECT * FROM donor_offers WHERE id = $1 FOR UPDATE", [offerId]);
    const offer = offerResult.rows[0];
    if (!offer) throw error("Donor offer not found", 404);
    if (offer.donor_user_id !== donor.id) throw error("You can only accept your own offer", 403);
    if (offer.status !== "pending" || new Date(offer.expires_at) <= new Date()) throw error("This donor offer has expired or is no longer active", 409);
    if (bloodRequest.status !== "open") throw error("This blood request is no longer available", 409);

    await client.query("UPDATE donor_offers SET status = 'accepted', responded_at = NOW() WHERE id = $1", [offerId]);
    const responseResult = await client.query(
      `INSERT INTO request_responses (blood_request_id, donor_user_id, status)
       VALUES ($1, $2, 'interested')
       ON CONFLICT (blood_request_id, donor_user_id)
       DO UPDATE SET status = 'interested'
       RETURNING *`,
      [bloodRequest.id, donor.id],
    );
    const recipients = await client.query(
      `SELECT id, email_notifications, sms_notifications
       FROM users WHERE id = ANY($1::uuid[])`,
      [[donor.id, bloodRequest.created_by_user_id]],
    );
    const requestOwner = recipients.rows.find((recipient) => recipient.id === bloodRequest.created_by_user_id);
    if (requestOwner) await enqueue(client, {
      eventType: "donor_interest",
      recipientUserId: requestOwner.id,
      email: requestOwner.email_notifications,
      sms: requestOwner.sms_notifications,
      payload: { bloodRequestId: bloodRequest.id, responseId: responseResult.rows[0].id, offerId },
    });
    await record(client, {
      actorUserId: donor.id,
      eventType: "donor_offer.accepted",
      subjectType: "donor_offer",
      subjectId: offerId,
      metadata: { bloodRequestId: bloodRequest.id, requestResponseId: responseResult.rows[0].id, awaitingPatientApproval: true },
    });
    await client.query("COMMIT");
    return { offer: serializeOffer({ ...offer, status: "accepted", responded_at: new Date() }), response: responseResult.rows[0] };
  } catch (caught) {
    await client.query("ROLLBACK");
    throw caught;
  } finally {
    client.release();
  }
}

async function declineOffer(offerId, donorId = null) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const offerReference = await client.query("SELECT blood_request_id FROM donor_offers WHERE id = $1", [offerId]);
    if (!offerReference.rows[0]) throw error("Donor offer not found", 404);
    const requestResult = await client.query("SELECT * FROM blood_requests WHERE id = $1 FOR UPDATE", [offerReference.rows[0].blood_request_id]);
    const bloodRequest = requestResult.rows[0];
    const offerResult = await client.query("SELECT * FROM donor_offers WHERE id = $1 FOR UPDATE", [offerId]);
    const offer = offerResult.rows[0];
    if (!offer) throw error("Donor offer not found", 404);
    if (donorId && offer.donor_user_id !== donorId) throw error("You can only decline your own offer", 403);
    if (offer.status !== "pending") throw error("This donor offer is no longer active", 409);
    const status = new Date(offer.expires_at) <= new Date() ? "expired" : "declined";
    await client.query("UPDATE donor_offers SET status = $1, responded_at = NOW() WHERE id = $2", [status, offerId]);
    const nextOffer = bloodRequest?.status === "open" ? await offerNextEligibleDonor(client, bloodRequest) : null;
    await record(client, {
      actorUserId: donorId,
      eventType: `donor_offer.${status}`,
      subjectType: "donor_offer",
      subjectId: offerId,
      metadata: { bloodRequestId: offer.blood_request_id, nextOfferId: nextOffer?.id || null },
    });
    await client.query("COMMIT");
    return { offer: serializeOffer({ ...offer, status, responded_at: new Date() }), nextOffer: nextOffer ? serializeOffer(nextOffer) : null };
  } catch (caught) {
    await client.query("ROLLBACK");
    throw caught;
  } finally {
    client.release();
  }
}

async function cancelPendingOffersForRequest(client, bloodRequest, actorUserId = null) {
  const offers = await client.query(
    `UPDATE donor_offers
     SET status = 'cancelled', responded_at = NOW()
     WHERE blood_request_id = $1 AND status IN ('pending', 'accepted')
     RETURNING id, donor_user_id`,
    [bloodRequest.id],
  );
  if (offers.rows.length === 0) return [];

  const recipientIds = offers.rows.map((offer) => offer.donor_user_id);
  const recipients = await client.query(
    `SELECT id, email_notifications, sms_notifications
     FROM users WHERE id = ANY($1::uuid[])`,
    [recipientIds],
  );
  await Promise.all(recipients.rows.map((recipient) => {
    const offer = offers.rows.find((item) => item.donor_user_id === recipient.id);
    return enqueue(client, {
      eventType: "donor_offer_cancelled",
      recipientUserId: recipient.id,
      email: recipient.email_notifications,
      sms: recipient.sms_notifications,
      payload: { bloodRequestId: bloodRequest.id, offerId: offer.id },
    });
  }));
  await Promise.all(offers.rows.map((offer) => record(client, {
    actorUserId,
    eventType: "donor_offer.cancelled",
    subjectType: "donor_offer",
    subjectId: offer.id,
    metadata: { bloodRequestId: bloodRequest.id, reason: "blood_request_cancelled" },
  })));
  return offers.rows;
}

async function expirePendingOffers() {
  const result = await pool.query(
    `SELECT id FROM donor_offers
     WHERE status = 'pending' AND expires_at <= NOW()
     ORDER BY expires_at ASC LIMIT 100`,
  );
  const outcomes = [];
  for (const offer of result.rows) {
    try {
      outcomes.push(await declineOffer(offer.id));
    } catch (caught) {
      if (caught.statusCode !== 409) throw caught;
    }
  }
  return outcomes;
}

module.exports = {
  DEFAULT_OFFER_TTL_MINUTES,
  offerExpiryMinutes,
  createInitialOffer,
  getMyActiveOffers,
  acceptOffer,
  declineOffer,
  cancelPendingOffersForRequest,
  expirePendingOffers,
};
