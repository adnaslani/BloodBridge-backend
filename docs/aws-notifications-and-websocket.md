# AWS notifications and WebSocket deployment

This backend writes notifications to PostgreSQL first. The worker later delivers each job, so temporary AWS failures are retried safely.

## Email: outbox → SNS → Lambda → SES

1. In **SES** (Frankfurt), verify the sender email/domain used in `SES_FROM_EMAIL`. While SES is in its sandbox, also verify every test recipient.
2. Create a standard SNS topic, for example `bloodbridge-notifications`.
3. Package `src/lambdas/emailNotificationHandler.js` with production dependencies and deploy it as a Node.js Lambda in `eu-central-1`.
4. Subscribe the Lambda to the SNS topic. Give the Lambda permission to call `ses:SendEmail` and allow SNS to invoke it.
5. Set backend environment variables:

   ```env
   NOTIFICATION_WORKER_ENABLED=true
   NOTIFICATION_DELIVERY_MODE=sns
   AWS_REGION=eu-central-1
   SNS_NOTIFICATION_TOPIC_ARN=arn:aws:sns:eu-central-1:ACCOUNT_ID:bloodbridge-notifications
   SES_FROM_EMAIL=noreply@verified-domain.example
   ```

The application worker publishes only email/SMS jobs to SNS. The email Lambda ignores non-email jobs and sends email through SES.

## WebSocket: API Gateway → connection Lambda → PostgreSQL

1. Create an **API Gateway WebSocket API** in Frankfurt with `$connect` and `$disconnect` routes.
2. Attach `src/lambdas/websocketConnectionHandler.js` to both routes and configure a Cognito JWT authorizer for `$connect`.
3. Give the Lambda access to the same PostgreSQL database and apply migration `009_realtime_notification_delivery.sql`.
4. Set the backend value below to the API Gateway *management* endpoint (not the browser `wss://` URL):

   ```env
   WEBSOCKET_MANAGEMENT_ENDPOINT=https://API_ID.execute-api.eu-central-1.amazonaws.com/production
   ```

5. Give the backend runtime identity permission for `execute-api:ManageConnections` on this API.

WebSocket notifications are queued with `websocket: true` in `notificationService.enqueue`. The worker removes stale API Gateway connection IDs automatically after a `410 Gone` response.
