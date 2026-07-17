const SibApiV3Sdk = require("@getbrevo/brevo");
const brevo = new SibApiV3Sdk.TransactionalEmailsApi();

// Set API key once
brevo.setApiKey(
  SibApiV3Sdk.TransactionalEmailsApiApiKeys.apiKey,
  process.env.BREVO_API_KEY
);

/**
 * Send email via Brevo Transactional Email API
 * @param {Object} emailOptions - { from, to, subject, html }
 */
exports.sendEmail = async (emailOptions) => {
  try {
    const sendSmtpEmail = {
      sender: {
        name: emailOptions.fromName || "Celic Store",
        email: emailOptions.from || process.env.EMAIL_FROM_EMAIL,
      },
      to: [{ email: emailOptions.to }],
      subject: emailOptions.subject,
      htmlContent: emailOptions.html,
    };

    const response = await brevo.sendTransacEmail(sendSmtpEmail);
    console.log("✅ Email sent successfully:", response.messageId);
    return response;
  } catch (error) {
    console.error("❌ Email sending failed:", error.message);
    throw new Error(`Email sending failed: ${error.message}`);
  }
};
