const pool = require("../config/database");

async function enqueue(client, { eventType, recipientUserId, email, sms, websocket, payload }) {
  const jobs = [];
  if (email) jobs.push([eventType, "email", recipientUserId, JSON.stringify(payload)]);
  if (sms) jobs.push([eventType, "sms", recipientUserId, JSON.stringify(payload)]);
  if (websocket) jobs.push([eventType, "websocket", recipientUserId, JSON.stringify(payload)]);
  await Promise.all(jobs.map((values) => client.query(
    `INSERT INTO notification_outbox (event_type, channel, recipient_user_id, payload)
     VALUES ($1, $2, $3, $4::jsonb)`,
    values,
  )));
}

async function enqueueRequestNotifications(client, bloodRequest) {
  const result = await client.query(
    `SELECT u.id, u.email_notifications, u.sms_notifications
     FROM donor_profiles dp
     JOIN users u ON u.id = dp.user_id
     WHERE dp.is_available = TRUE
       AND dp.latitude IS NOT NULL AND dp.longitude IS NOT NULL
       AND u.blood_type = ANY($1::text[])
       AND u.id <> $2
       AND 6371 * acos(LEAST(1, GREATEST(-1,
         cos(radians($3)) * cos(radians(dp.latitude)) * cos(radians(dp.longitude) - radians($4))
         + sin(radians($3)) * sin(radians(dp.latitude))
       ))) <= dp.notification_radius_km`,
    [bloodRequest.compatibleBloodTypes, bloodRequest.ownerId, bloodRequest.latitude, bloodRequest.longitude],
  );
  await Promise.all(result.rows.map((donor) => enqueue(client, {
    eventType: "new_request",
    recipientUserId: donor.id,
    email: donor.email_notifications,
    sms: donor.sms_notifications,
    payload: { bloodRequestId: bloodRequest.id, urgency: bloodRequest.urgency },
  })));
}

module.exports = { enqueue, enqueueRequestNotifications };
