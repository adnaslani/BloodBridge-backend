const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("crypto");
const pool = require("../src/config/database");
const { createBloodRequest, updateBloodRequestStatus } = require("../src/services/bloodRequestService");
const { declineOffer, acceptOffer } = require("../src/services/donorOfferService");

const isSafeIntegrationDatabase = process.env.RUN_DB_INTEGRATION_TESTS === "true"
  && process.env.NODE_ENV === "test"
  && /_test$/i.test(process.env.DB_NAME || "");

const integrationTest = isSafeIntegrationDatabase ? test : test.skip;

integrationTest("broadcast offer workflow notifies every eligible donor and enforces first-accept-wins", async (t) => {
  const patientId = randomUUID();
  const closestDonorId = randomUUID();
  const nextDonorId = randomUUID();
  let requestId;

  t.after(async () => {
    if (requestId) await pool.query("DELETE FROM blood_requests WHERE id = $1", [requestId]);
    await pool.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [[patientId, closestDonorId, nextDonorId]]);
  });

  await pool.query(
    `INSERT INTO users (id, full_name, email, password_hash, role, blood_type)
     VALUES ($1, 'Test Patient', $2, 'not-used', 'patient', 'O-'),
            ($3, 'Closest Donor', $4, 'not-used', 'donor', 'O-'),
            ($5, 'Next Donor', $6, 'not-used', 'donor', 'O-')`,
    [
      patientId, `patient-${patientId}@example.test`,
      closestDonorId, `closest-${closestDonorId}@example.test`,
      nextDonorId, `next-${nextDonorId}@example.test`,
    ],
  );
  await pool.query(
    `INSERT INTO donor_profiles (user_id, latitude, longitude, is_available, notification_radius_km)
     VALUES ($1, 42.6630, 21.1655, TRUE, 50),
            ($2, 42.6640, 21.1655, TRUE, 50)`,
    [closestDonorId, nextDonorId],
  );

  const created = await createBloodRequest({
    bloodType: "O-",
    unitsNeeded: 1,
    urgency: "critical",
    hospitalName: "Integration Test Hospital",
    latitude: 42.6629,
    longitude: 21.1655,
  }, { id: patientId, fullName: "Test Patient" });
  requestId = created.id;

const offers = await pool.query(
    "SELECT * FROM donor_offers WHERE blood_request_id = $1 AND status = 'pending' ORDER BY distance_km",
    [requestId],
  );
  //broadcast
  assert.equal(offers.rows.length, 2);
  assert.equal(offers.rows[0].donor_user_id, closestDonorId);
  assert.equal(offers.rows[1].donor_user_id, nextDonorId);

  // Dalji (nextDonor) prihvata prvi.
  await acceptOffer(offers.rows[1].id, { id: nextDonorId });
  const matched = await pool.query("SELECT status FROM blood_requests WHERE id = $1", [requestId]);
  assert.equal(matched.rows[0].status, "matched");

  // closestDonor je prekasno — ponuda mu je zatvorena i pokušaj prihvatanja pada.
  const closestOfferAfter = await pool.query("SELECT status FROM donor_offers WHERE id = $1", [offers.rows[0].id]);
  assert.equal(closestOfferAfter.rows[0].status, "cancelled");
  await assert.rejects(acceptOffer(offers.rows[0].id, { id: closestDonorId }), { statusCode: 409 });

  await updateBloodRequestStatus(requestId, "cancelled", "matched", patientId);
  const cancelledOffer = await pool.query("SELECT status FROM donor_offers WHERE id = $1", [secondOffer.rows[0].id]);
  assert.equal(cancelledOffer.rows[0].status, "cancelled");
  const cancellationNotification = await pool.query(
    `SELECT 1 FROM notification_outbox
     WHERE event_type = 'donor_offer_cancelled' AND recipient_user_id = $1
       AND payload->>'bloodRequestId' = $2`,
    [nextDonorId, requestId],
  );
  assert.equal(cancellationNotification.rows.length, 1);
});
