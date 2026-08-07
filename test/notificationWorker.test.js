const test = require("node:test");
const assert = require("node:assert/strict");
const { nextAttemptAt, processNotificationBatch } = require("../src/services/notificationWorker");

test("notification retries use exponential backoff capped at one hour", () => {
  assert.equal(nextAttemptAt(1, 0).getTime(), 1000);
  assert.equal(nextAttemptAt(3, 0).getTime(), 4000);
  assert.equal(nextAttemptAt(20, 0).getTime(), 60 * 60 * 1000);
});

test("notification worker marks a delivered job as sent", async () => {
  const calls = [];
  const pool = {
    query: async (sql, values) => {
      calls.push({ sql, values });
      if (sql.includes("FROM candidates")) {
        return { rows: [{ id: "job-1", event_type: "new_request", channel: "email", attempts: 1, payload: {} }] };
      }
      return { rows: [] };
    },
  };
  const processed = await processNotificationBatch({ pool, workerId: "worker-1", deliver: async () => {} });
  assert.equal(processed, 1);
  assert.ok(calls.some(({ sql }) => sql.includes("SET status = 'sent'")));
});
