function smsContent(eventType, payload = {}) {
  const messages = {
    donor_offer_created: `BloodBridge: New ${payload.bloodType || ""} blood request nearby${payload.urgency ? ` (${payload.urgency})` : ""}. Open the app to accept or decline.`,
    donor_interest: "BloodBridge: A donor is interested in your blood request. Open the app to review.",
    response_accepted: "BloodBridge: Your donation offer was accepted. Open the app for contact details.",
    donation_completed: "BloodBridge: A blood donation was recorded as completed. Thank you!",
    donor_offer_cancelled: "BloodBridge: A blood request you were offered has been cancelled.",
  };
  return messages[eventType] || "BloodBridge: You have a new notification. Open the app for details.";
}

module.exports = { smsContent };