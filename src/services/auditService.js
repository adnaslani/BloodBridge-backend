async function record(client, { actorUserId, eventType, subjectType, subjectId, metadata = {} }) {
  await client.query(
    `INSERT INTO audit_log (actor_user_id, event_type, subject_type, subject_id, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [actorUserId || null, eventType, subjectType, subjectId, JSON.stringify(metadata)],
  );
}

module.exports = { record };
