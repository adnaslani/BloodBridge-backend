const pool = require("../config/database");

function cognitoSub(event) {
  return event.requestContext?.authorizer?.jwt?.claims?.sub
    || event.requestContext?.authorizer?.claims?.sub
    || null;
}

async function handler(event) {
  const connectionId = event.requestContext?.connectionId;
  if (!connectionId) return { statusCode: 400, body: "Missing WebSocket connection id" };
  if (event.requestContext?.routeKey === "$disconnect") {
    await pool.query("DELETE FROM web_socket_connections WHERE connection_id = $1", [connectionId]);
    return { statusCode: 200, body: "Disconnected" };
  }
  const sub = cognitoSub(event);
  if (!sub) return { statusCode: 401, body: "Cognito authorization is required" };
  const user = await pool.query("SELECT id FROM users WHERE cognito_sub = $1", [sub]);
  if (!user.rows[0]) return { statusCode: 403, body: "Cognito account is not linked to BloodBridge" };
  await pool.query(
    `INSERT INTO web_socket_connections (connection_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (connection_id) DO UPDATE SET user_id = EXCLUDED.user_id, last_seen_at = NOW()`,
    [connectionId, user.rows[0].id],
  );
  return { statusCode: 200, body: "Connected" };
}

module.exports = { handler, cognitoSub };
