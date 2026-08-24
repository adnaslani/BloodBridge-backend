const { SESv2Client, SendEmailCommand } = require("@aws-sdk/client-sesv2");

function emailContent(eventType, payload = {}) {
  const request = payload.bloodRequestId ? ` Request: ${payload.bloodRequestId}.` : "";
  const patientContact = payload.patientContact;
  const contactDetails = patientContact
    ? ` Contact: ${patientContact.name || "Patient"}${patientContact.facility ? ` at ${patientContact.facility}` : ""}${patientContact.email ? `, email ${patientContact.email}` : ""}${patientContact.phone ? `, phone ${patientContact.phone}` : "."}`
    : "";
  const content = {
    donor_offer_created: ["New BloodBridge donation offer", `A compatible blood donation request is available for you.${request}`],
    donor_interest: ["BloodBridge donor is awaiting your approval", `A donor is interested in your blood request. Review and accept the donor to share your contact details.${request}`],
    response_accepted: patientContact
      ? ["BloodBridge donation offer accepted — contact details", `Your donation offer was accepted.${contactDetails}${request}`]
      : ["BloodBridge donation offer accepted", `A donor offer was accepted.${request}`],
    donation_completed: ["BloodBridge donation completed", `A blood donation was recorded as completed.${request}`],
    donor_offer_cancelled: ["BloodBridge donation offer cancelled", `A blood request was cancelled.${request}`],
  };
  return content[eventType] || ["BloodBridge notification", `You have a new BloodBridge notification.${request}`];
}

async function handler(event, dependencies = {}) {
  const sender = process.env.SES_FROM_EMAIL;
  if (!sender) throw new Error("SES_FROM_EMAIL is required");
  const client = dependencies.client || new SESv2Client({ region: process.env.AWS_REGION });
  const records = event.Records || [];
  const deliveries = records.map(async (record) => {
    const message = JSON.parse(record.Sns.Message);
    if (message.channel !== "email") return;
    if (!message.recipient?.email) throw new Error("SNS email notification has no recipient email");
    const [subject, text] = emailContent(message.eventType, message.payload);
    await client.send(new SendEmailCommand({
      FromEmailAddress: sender,
      Destination: { ToAddresses: [message.recipient.email] },
      Content: { Simple: { Subject: { Data: subject }, Body: { Text: { Data: text } } } },
    }));
  });
  await Promise.all(deliveries);
}

module.exports = { handler, emailContent };
