const { SESv2Client, SendEmailCommand } = require("@aws-sdk/client-sesv2");
const config = require("../config/env");
const { emailContent } = require("../lambdas/emailNotificationHandler");

let sesClient = null;

function getSesClient() {
  if (!config.sesFromEmail || !config.awsRegion) return null;
  if (!sesClient) sesClient = new SESv2Client({ region: config.awsRegion });
  return sesClient;
}

function donorDashboardUrl() {
  const origin = (config.frontendOrigins || [])[0] || "";
  return origin ? `${origin.replace(/\/$/, "")}/html/donor-dashboard.html` : "";
}

async function deliverDonorOfferEmail(offer) {
  if (!offer?.donorEmail || offer.emailNotifications === false) return false;
  const client = getSesClient();
  if (!client) {
    console.warn(JSON.stringify({
      level: "warn",
      component: "email-delivery",
      message: "SES is not configured; donor offer email was skipped",
      offerId: offer.id,
    }));
    return false;
  }

  const payload = {
    bloodRequestId: offer.blood_request_id || offer.requestId,
    bloodType: offer.bloodType,
    urgency: offer.urgency,
    hospitalName: offer.hospitalName,
    dashboardUrl: donorDashboardUrl(),
  };
  const [subject, text] = emailContent("donor_offer_created", payload);

  try {
    await client.send(new SendEmailCommand({
      FromEmailAddress: config.sesFromEmail,
      Destination: { ToAddresses: [offer.donorEmail] },
      Content: { Simple: { Subject: { Data: subject }, Body: { Text: { Data: text } } } },
    }));
    return true;
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      component: "email-delivery",
      message: error.message,
      offerId: offer.id,
    }));
    return false;
  }
}

async function deliverDonorOfferEmails(offers = []) {
  await Promise.all(offers.filter(Boolean).map((offer) => deliverDonorOfferEmail(offer)));
}

module.exports = { deliverDonorOfferEmail, deliverDonorOfferEmails, donorDashboardUrl };
