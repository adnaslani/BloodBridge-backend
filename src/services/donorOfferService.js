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

// Broadcasts the request to every currently-eligible donor who does not yet
// have an offer row for it (any status). Unlike the old exclusive model,
// this creates one pending offer per matching donor instead of just one.
async function broadcastToEligibleDonors(client, bloodRequest, options = {}) {
  if (bloodRequest.status !== "open") return [];

  const candidates = await findMatchingDonors(bloodRequest, {
    client,
    excludePreviouslyOffered: true,
    radiusKm: options.radiusKm,
  });

  const created = [];
  for (const donor of candidates) {
    const offerResult = await client.query(
      `INSERT INTO donor_offers (id, blood_request_id, donor_user_id, expires_at, distance_km)
       VALUES ($1, $2, $3, NOW() + ($4 * INTERVAL '1 minute'), $5)
       ON CONFLICT (blood_request_id, donor_user_id) DO NOTHING
       RETURNING *`,
      [randomUUID(), bloodRequest.id, donor.id, offerExpiryMinutes(options.offerTtlMinutes), donor.distanceKm],
    );
    const offer = offerResult.rows[0];
    if (!offer) continue; // already had an offer row (raced with another broadcast call)

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
      metadata: { bloodRequestId: bloodRequest.id, donorUserId: donor.id, distanceKm: donor.distanceKm, mode: "broadcast" },
    });
    created.push(offer);
  }
  return created;
}

async function createInitialOffers(client, bloodRequest) {
  return broadcastToEligibleDonors(client, bloodRequest);
}

// Run whenever a donor becomes available/moves, or periodically: makes sure
// every open request has been broadcast to every currently-eligible donor.
async function offerUnfilledOpenRequests(client) {
  const database = client || pool;
  const result = await database.query(
    `SELECT id, created_by_user_id AS "ownerId", blood_type AS "bloodType",
            urgency, latitude, longitude, status
     FROM blood_requests
     WHERE status = 'open'
     ORDER BY created_at ASC`,
  );
  const created = [];
  for (const bloodRequest of result.rows) {
    try {
      created.push(...(await broadcastToEligibleDonors(database, bloodRequest)));
    } catch (error) {
      if (error.code !== "23505") throw error;
    }
  }
  return created;
}

async function getMyActiveOffers(donorId) {
  await expirePendingOffers();
  await offerUnfilledOpenRequests();
  const result = await pool.query(
    `SELECT o.*, br.blood_type, br.units_needed, br.urgency
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
    },
  }));
}

// First-accept-wins: the row lock on blood_requests is what makes this safe
// under concurrency. Two donors accepting at the same instant will serialize
// on this SELECT ... FOR UPDATE; the loser sees status !== 'open' and gets a 409.
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
    if (offer.status !== "pending" || new Date(offer.expires_at) <= new Date()) {
      throw error("This donor offer has expired or is no longer active", 409);
    }
    if (bloodRequest.status !== "open") {
      throw error("This blood request has already been matched with another donor", 409);
    }

    await client.query("UPDATE blood_requests SET status = 'matched', updated_at = NOW() WHERE id = $1", [bloodRequest.id]);
    await client.query("UPDATE donor_offers SET status = 'accepted', responded_at = NOW() WHERE id = $1", [offerId]);

    // First to accept wins outright — go straight to 'accepted', no separate patient approval step.
    const responseResult = await client.query(
      `INSERT INTO request_responses (blood_request_id, donor_user_id, status)
       VALUES ($1, $2, 'accepted')
       ON CONFLICT (blood_request_id, donor_user_id)
       DO UPDATE SET status = 'accepted'
       RETURNING *`,
      [bloodRequest.id, donor.id],
    );

    // Close out every other donor's still-pending offer for this request.
    const otherOffers = await client.query(
      `UPDATE donor_offers SET status = 'cancelled', responded_at = NOW()
       WHERE blood_request_id = $1 AND id <> $2 AND status = 'pending'
       RETURNING id, donor_user_id`,
      [bloodRequest.id, offerId],
    );

    const recipientIds = [donor.id, bloodRequest.created_by_user_id, ...otherOffers.rows.map((row) => row.donor_user_id)];
    const recipients = await client.query(
      `SELECT id, email, phone, full_name, email_notifications, sms_notifications FROM users WHERE id = ANY($1::uuid[])`,
      [recipientIds],
    );
    const byId = Object.fromEntries(recipients.rows.map((row) => [row.id, row]));
    const owner = byId[bloodRequest.created_by_user_id];
    const winningDonor = byId[donor.id];

    if (winningDonor) {
      await enqueue(client, {
        eventType: "response_accepted",
        recipientUserId: winningDonor.id,
        email: winningDonor.email_notifications,
        sms: winningDonor.sms_notifications,
        payload: {
          bloodRequestId: bloodRequest.id,
          responseId: responseResult.rows[0].id,
          patientContact: {
            name: bloodRequest.patient_name || owner?.full_name || "Patient",
            email: owner?.email || null,
            phone: owner?.phone || null,
            facility: bloodRequest.hospital_name || null,
          },
        },
      });
    }
    if (owner) {
      await enqueue(client, {
        eventType: "response_accepted",
        recipientUserId: owner.id,
        email: owner.email_notifications,
        sms: owner.sms_notifications,
        payload: { bloodRequestId: bloodRequest.id, responseId: responseResult.rows[0].id },
      });
    }
    await Promise.all(otherOffers.rows.map((row) => {
      const recipient = byId[row.donor_user_id];
      if (!recipient) return null;
      return enqueue(client, {
        eventType: "donor_offer_cancelled",
        recipientUserId: recipient.id,
        email: recipient.email_notifications,
        sms: recipient.sms_notifications,
        payload: { bloodRequestId: bloodRequest.id, offerId: row.id, reason: "matched_with_another_donor" },
      });
    }));

    await record(client, {
      actorUserId: donor.id,
      eventType: "donor_offer.accepted",
      subjectType: "donor_offer",
      subjectId: offerId,
      metadata: { bloodRequestId: bloodRequest.id, requestResponseId: responseResult.rows[0].id, closedOtherOffers: otherOffers.rows.length },
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

// No cascading needed anymore — everyone eligible was already offered.
async function declineOffer(offerId, donorId = null) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const offerResult = await client.query("SELECT * FROM donor_offers WHERE id = $1 FOR UPDATE", [offerId]);
    const offer = offerResult.rows[0];
    if (!offer) throw error("Donor offer not found", 404);
    if (donorId && offer.donor_user_id !== donorId) throw error("You can only decline your own offer", 403);
    if (offer.status !== "pending") throw error("This donor offer is no longer active", 409);

    const status = new Date(offer.expires_at) <= new Date() ? "expired" : "declined";
    await client.query("UPDATE donor_offers SET status = $1, responded_at = NOW() WHERE id = $2", [status, offerId]);
    await record(client, {
      actorUserId: donorId,
      eventType: `donor_offer.${status}`,
      subjectType: "donor_offer",
      subjectId: offerId,
      metadata: { bloodRequestId: offer.blood_request_id },
    });
    await client.query("COMMIT");
    return { offer: serializeOffer({ ...offer, status, responded_at: new Date() }) };
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
  createInitialOffers,
  broadcastToEligibleDonors,
  offerUnfilledOpenRequests,
  getMyActiveOffers,
  acceptOffer,
  declineOffer,
  cancelPendingOffersForRequest,
  expirePendingOffers,
};