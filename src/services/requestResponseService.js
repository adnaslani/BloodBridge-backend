const pool = require("../config/database");
const { assertIntegerInRange, assertAllowedValue } = require("../utils/validation");
const { getCompatibleDonorBloodTypes } = require("./matchingService");
const { enqueue } = require("./notificationService");
const { record } = require("./auditService");

const RESPONSE_STATUSES = ["interested", "accepted", "declined", "completed"];

function error(message, statusCode = 400) {
  const result = new Error(message);
  result.statusCode = statusCode;
  return result;
}

function publicResponse(row, includeContact = false) {
  const response = {
    id: row.id,
    status: row.status,
    unitsDonated: row.units_donated,
    respondedAt: row.responded_at,
    completedAt: row.completed_at,
  };
  if (includeContact && row.status === "accepted") {
    response.donor = { fullName: row.full_name, phone: row.phone, email: row.email };
  }
  return response;
}

async function createResponse(requestId, donor) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const requestResult = await client.query("SELECT * FROM blood_requests WHERE id = $1 FOR UPDATE", [requestId]);
    const bloodRequest = requestResult.rows[0];
    if (!bloodRequest) throw error("Blood request not found", 404);
    if (!["open", "matched"].includes(bloodRequest.status)) throw error("Only active blood requests can receive responses", 409);
    if (bloodRequest.created_by_user_id === donor.id) throw error("You cannot respond to your own blood request", 403);
    if (!getCompatibleDonorBloodTypes(bloodRequest.blood_type).includes(donor.bloodType)) {
      throw error("Your blood type is not compatible with this request", 409);
    }

    const donorResult = await client.query(
      `SELECT dp.is_available, dp.latitude, dp.longitude,
         u.email_notifications, u.sms_notifications
       FROM donor_profiles dp JOIN users u ON u.id = dp.user_id
       WHERE dp.user_id = $1 FOR UPDATE`,
      [donor.id],
    );
    const donorProfile = donorResult.rows[0];
    if (!donorProfile || !donorProfile.is_available || donorProfile.latitude === null || donorProfile.longitude === null) {
      throw error("An available donor profile with a location is required", 409);
    }

    const result = await client.query(
      `INSERT INTO request_responses (blood_request_id, donor_user_id)
       VALUES ($1, $2) RETURNING *`,
      [requestId, donor.id],
    );
    await record(client, {
      actorUserId: donor.id,
      eventType: "request_response.interested",
      subjectType: "request_response",
      subjectId: result.rows[0].id,
      metadata: { bloodRequestId: requestId },
    });
    await client.query("COMMIT");
    return publicResponse(result.rows[0]);
  } catch (caught) {
    await client.query("ROLLBACK");
    if (caught.code === "23505") throw error("You have already responded to this blood request", 409);
    throw caught;
  } finally {
    client.release();
  }
}

async function getResponsesForOwner(requestId) {
  const result = await pool.query(
    `SELECT rr.*, u.full_name, u.phone, u.email
     FROM request_responses rr JOIN users u ON u.id = rr.donor_user_id
     WHERE rr.blood_request_id = $1 ORDER BY rr.responded_at ASC`,
    [requestId],
  );
  return result.rows.map((row) => publicResponse(row, true));
}

async function updateResponse({ requestId, responseId, actor, requestOwnerId, status }) {
  assertAllowedValue(status, ["accepted", "declined"], "status");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const requestResult = await client.query("SELECT status, created_by_user_id FROM blood_requests WHERE id = $1 FOR UPDATE", [requestId]);
    const bloodRequest = requestResult.rows[0];
    if (!bloodRequest) throw error("Blood request not found", 404);
    if (["fulfilled", "cancelled"].includes(bloodRequest.status)) throw error("Responses cannot be updated for this blood request", 409);
    const responseResult = await client.query(
      "SELECT * FROM request_responses WHERE id = $1 AND blood_request_id = $2 FOR UPDATE",
      [responseId, requestId],
    );
    const response = responseResult.rows[0];
    if (!response) throw error("Request response not found", 404);
    const isOwner = actor.id === requestOwnerId;
    const isRespondingDonor = actor.id === response.donor_user_id;
    if (!isOwner && !isRespondingDonor) throw error("You do not have permission for this response", 403);
    if (status === "accepted" && !isOwner) throw error("Only the request owner can accept a response", 403);
    if (response.status !== "interested") throw error("Only pending responses can be updated", 409);

    const updated = await client.query(
      "UPDATE request_responses SET status = $1 WHERE id = $2 RETURNING *",
      [status, responseId],
    );
    if (status === "accepted") {
      await client.query("UPDATE blood_requests SET status = 'matched', updated_at = NOW() WHERE id = $1 AND status = 'open'", [requestId]);
      const donor = await client.query("SELECT email_notifications, sms_notifications FROM users WHERE id = $1", [response.donor_user_id]);
      const owner = await client.query("SELECT id, email_notifications, sms_notifications FROM users WHERE id = $1", [bloodRequest.created_by_user_id]);
      await enqueue(client, {
        eventType: "response_accepted",
        recipientUserId: response.donor_user_id,
        email: donor.rows[0]?.email_notifications,
        sms: donor.rows[0]?.sms_notifications,
        payload: { bloodRequestId: requestId, responseId },
      });
      if (owner.rows[0]) await enqueue(client, {
        eventType: "response_accepted",
        recipientUserId: owner.rows[0].id,
        email: owner.rows[0].email_notifications,
        sms: owner.rows[0].sms_notifications,
        payload: { bloodRequestId: requestId, responseId },
      });
    }
    await record(client, {
      actorUserId: actor.id,
      eventType: `request_response.${status}`,
      subjectType: "request_response",
      subjectId: responseId,
      metadata: { bloodRequestId: requestId },
    });
    await client.query("COMMIT");
    return publicResponse(updated.rows[0]);
  } catch (caught) {
    await client.query("ROLLBACK");
    throw caught;
  } finally {
    client.release();
  }
}

async function completeResponse({ requestId, responseId, unitsDonated, actor }) {
  assertIntegerInRange(unitsDonated, "unitsDonated", 1, 25);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const responseResult = await client.query(
      "SELECT * FROM request_responses WHERE id = $1 AND blood_request_id = $2 FOR UPDATE",
      [responseId, requestId],
    );
    const response = responseResult.rows[0];
    if (!response) throw error("Request response not found", 404);
    if (response.status !== "accepted") throw error("Only accepted responses can be completed", 409);
    const requestResult = await client.query("SELECT units_needed, status, created_by_user_id FROM blood_requests WHERE id = $1 FOR UPDATE", [requestId]);
    if (!requestResult.rows[0]) throw error("Blood request not found", 404);
    if (requestResult.rows[0].status !== "matched") throw error("Only matched blood requests can be completed", 409);
    const completed = await client.query(
      "SELECT COALESCE(SUM(units_donated), 0) AS total FROM request_responses WHERE blood_request_id = $1 AND status = 'completed'",
      [requestId],
    );
    if (Number(completed.rows[0].total) + Number(unitsDonated) > Number(requestResult.rows[0].units_needed)) {
      throw error("unitsDonated exceeds the remaining units needed", 409);
    }
    const updated = await client.query(
      `UPDATE request_responses SET status = 'completed', units_donated = $1, completed_at = NOW()
       WHERE id = $2 RETURNING *`,
      [Number(unitsDonated), responseId],
    );
    const totalAfterCompletion = Number(completed.rows[0].total) + Number(unitsDonated);
    if (totalAfterCompletion >= requestResult.rows[0].units_needed) {
      await client.query("UPDATE blood_requests SET status = 'fulfilled', updated_at = NOW() WHERE id = $1", [requestId]);
    }
    const recipients = await client.query(
      `SELECT id, email_notifications, sms_notifications FROM users
       WHERE id = ANY($1::uuid[])`,
      [[response.donor_user_id, requestResult.rows[0].created_by_user_id]],
    );
    await Promise.all(recipients.rows.map((recipient) => enqueue(client, {
      eventType: "donation_completed",
      recipientUserId: recipient.id,
      email: recipient.email_notifications,
      sms: recipient.sms_notifications,
      payload: { bloodRequestId: requestId, responseId, unitsDonated: Number(unitsDonated) },
    })));
    await record(client, {
      actorUserId: actor.id,
      eventType: "request_response.completed",
      subjectType: "request_response",
      subjectId: responseId,
      metadata: { bloodRequestId: requestId, unitsDonated: Number(unitsDonated) },
    });
    await client.query("COMMIT");
    return publicResponse(updated.rows[0]);
  } catch (caught) {
    await client.query("ROLLBACK");
    throw caught;
  } finally {
    client.release();
  }
}

module.exports = { createResponse, getResponsesForOwner, updateResponse, completeResponse };
