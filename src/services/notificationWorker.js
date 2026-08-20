const { randomUUID } = require("crypto");
const { SNSClient, PublishCommand } = require("@aws-sdk/client-sns");
const { ApiGatewayManagementApiClient, PostToConnectionCommand } = require("@aws-sdk/client-apigatewaymanagementapi");

function nextAttemptAt(attempts, now = Date.now()) {
  const delayMilliseconds = Math.min(60 * 60 * 1000, 1000 * (2 ** Math.max(0, attempts - 1)));
  return new Date(now + delayMilliseconds);
}

async function recoverStaleJobs(pool) {
  await pool.query(
    `UPDATE notification_outbox
     SET status = 'pending', locked_at = NULL, locked_by = NULL,
         available_at = NOW(), last_error = 'Worker lease expired'
     WHERE status = 'processing' AND locked_at < NOW() - INTERVAL '10 minutes'`,
  );
}

async function claimJobs(pool, workerId, limit = 20) {
  const result = await pool.query(
    `WITH candidates AS (
       SELECT id FROM notification_outbox
       WHERE status = 'pending' AND available_at <= NOW()
       ORDER BY available_at, created_at
       FOR UPDATE SKIP LOCKED
       LIMIT $1
     )
     UPDATE notification_outbox job
     SET status = 'processing', locked_at = NOW(), locked_by = $2, attempts = attempts + 1
     FROM candidates
     WHERE job.id = candidates.id
     RETURNING job.*`,
    [limit, workerId],
  );
  return result.rows;
}

async function markSent(pool, id, workerId) {
  await pool.query(
    `UPDATE notification_outbox
     SET status = 'sent', sent_at = NOW(), locked_at = NULL, locked_by = NULL, last_error = NULL
     WHERE id = $1 AND status = 'processing' AND locked_by = $2`,
    [id, workerId],
  );
}

async function markFailed(pool, job, workerId, caught, maxAttempts) {
  const terminal = job.attempts >= maxAttempts;
  await pool.query(
    `UPDATE notification_outbox
     SET status = $1, available_at = $2, locked_at = NULL, locked_by = NULL, last_error = $3
     WHERE id = $4 AND status = 'processing' AND locked_by = $5`,
    [terminal ? "failed" : "pending", terminal ? new Date() : nextAttemptAt(job.attempts), String(caught.message || caught).slice(0, 2000), job.id, workerId],
  );
}

async function processNotificationBatch({ pool, deliver, workerId = randomUUID(), limit = 20, maxAttempts = 5 }) {
  await recoverStaleJobs(pool);
  const jobs = await claimJobs(pool, workerId, limit);
  for (const job of jobs) {
    try {
      await deliver(job);
      await markSent(pool, job.id, workerId);
    } catch (error) {
      await markFailed(pool, job, workerId, error, maxAttempts);
    }
  }
  return jobs.length;
}

function createWebhookDeliverer(webhookUrl) {
  return async (job) => {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: job.id, eventType: job.event_type, channel: job.channel, recipientUserId: job.recipient_user_id, payload: job.payload }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`Notification relay returned HTTP ${response.status}`);
  };
}

function notificationEnvelope(job, recipient = null) {
  return {
    id: job.id,
    eventType: job.event_type,
    channel: job.channel,
    recipientUserId: job.recipient_user_id,
    recipient: recipient ? { email: recipient.email } : undefined,
    payload: job.payload,
  };
}

function createSnsDeliverer({ pool, topicArn, region }) {
  const client = new SNSClient({ region });
  return async (job) => {
    let recipient = null;
    if (job.channel === "email") {
      const result = await pool.query("SELECT email FROM users WHERE id = $1", [job.recipient_user_id]);
      recipient = result.rows[0];
      if (!recipient?.email) throw new Error("Notification recipient email was not found");
    }
    await client.send(new PublishCommand({
      TopicArn: topicArn,
      Message: JSON.stringify(notificationEnvelope(job, recipient)),
      MessageAttributes: {
        channel: { DataType: "String", StringValue: job.channel },
        eventType: { DataType: "String", StringValue: job.event_type },
      },
    }));
  };
}

function createWebSocketDeliverer({ pool, endpoint, region }) {
  const client = new ApiGatewayManagementApiClient({ endpoint, region });
  return async (job) => {
    const result = await pool.query("SELECT connection_id FROM web_socket_connections WHERE user_id = $1", [job.recipient_user_id]);
    const message = Buffer.from(JSON.stringify(notificationEnvelope(job)));
    for (const connection of result.rows) {
      try {
        await client.send(new PostToConnectionCommand({ ConnectionId: connection.connection_id, Data: message }));
      } catch (error) {
        if (error?.$metadata?.httpStatusCode === 410) {
          await pool.query("DELETE FROM web_socket_connections WHERE connection_id = $1", [connection.connection_id]);
          continue;
        }
        throw error;
      }
    }
  };
}

function createConfiguredDeliverer({ pool, deliveryMode, webhookUrl, snsTopicArn, region, webSocketEndpoint }) {
  const primary = deliveryMode === "sns"
    ? createSnsDeliverer({ pool, topicArn: snsTopicArn, region })
    : createWebhookDeliverer(webhookUrl);
  const websocket = webSocketEndpoint ? createWebSocketDeliverer({ pool, endpoint: webSocketEndpoint, region }) : null;
  return async (job) => {
    if (job.channel === "websocket") {
      if (!websocket) throw new Error("WEBSOCKET_MANAGEMENT_ENDPOINT is required for websocket delivery");
      return websocket(job);
    }
    return primary(job);
  };
}

function startNotificationWorker({ pool, webhookUrl, pollMilliseconds, deliveryMode = "webhook", snsTopicArn, region, webSocketEndpoint }) {
  const workerId = randomUUID();
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await processNotificationBatch({
        pool,
        deliver: createConfiguredDeliverer({ pool, deliveryMode, webhookUrl, snsTopicArn, region, webSocketEndpoint }),
        workerId,
      });
    } catch (error) {
      console.error(JSON.stringify({ level: "error", component: "notification-worker", message: error.message }));
    } finally {
      running = false;
    }
  };
  const timer = setInterval(run, pollMilliseconds);
  timer.unref();
  run();
  return () => clearInterval(timer);
}

module.exports = { nextAttemptAt, claimJobs, processNotificationBatch, startNotificationWorker, createSnsDeliverer, createWebSocketDeliverer, createConfiguredDeliverer, notificationEnvelope };
