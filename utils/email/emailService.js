const { sendEmail: sendEmailViaBrevo } = require("../../config/email");

/**
 * Create reusable transporter (deprecated - using Brevo API instead)
 */
const createTransporter = () => {
  // This function is kept for backward compatibility but not used
  return null;
};

/**
 * Send email
 * @param {Object} options - Email options
 * @param {string|Array} options.to - Recipient email(s)
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML content
 * @param {string} options.text - Plain text content (optional)
 * @returns {Promise}
 */
const sendEmail = async (options) => {
  console.log("\n📧 ========== EMAIL SEND ATTEMPT (BREVO API) ==========");
  console.log("📤 To:", options.to);
  console.log("📝 Subject:", options.subject);
  console.log("⏰ Time:", new Date().toISOString());
  
  try {
    console.log("🔧 Using Brevo API...");
    
    // Check if Brevo API key is set
    if (!process.env.BREVO_API_KEY) {
      console.error("❌ Brevo API key not set");
      return {
        success: false,
        error: "Brevo API key not configured",
      };
    }
    
    if (!process.env.EMAIL_FROM_EMAIL) {
      console.error("❌ Email FROM address not set");
      return {
        success: false,
        error: "Email FROM address not configured",
      };
    }

    const emailOptions = {
      from: process.env.EMAIL_FROM_EMAIL,
      fromName: process.env.EMAIL_FROM_NAME || "Shagun Beauty",
      to: Array.isArray(options.to) ? options.to[0] : options.to, // Brevo API handles single recipient
      subject: options.subject,
      html: options.html,
    };

    console.log("📨 From:", emailOptions.from);
    console.log("📨 From Name:", emailOptions.fromName);
    console.log("🚀 Sending via Brevo API...");

    // Send email via Brevo API
    const response = await sendEmailViaBrevo(emailOptions);
    
    console.log("✅ EMAIL SENT SUCCESSFULLY!");
    console.log("📬 Message ID:", response.messageId);
    console.log("=========================================\n");

    return {
      success: true,
      messageId: response.messageId,
    };
  } catch (error) {
    console.error("❌ ========== EMAIL SEND FAILED ==========");
    console.error("🐛 Error:", error.message);
    console.error("📋 Error Code:", error.code);
    console.error("🔍 Error Details:", error);
    console.error("=========================================\n");
    
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Send email to multiple recipients
 * @param {Array} recipients - Array of recipient emails
 * @param {string} subject - Email subject
 * @param {string} html - HTML content
 * @returns {Promise}
 */
const sendBulkEmail = async (recipients, subject, html) => {
  console.log(`📮 Sending bulk email to ${recipients.length} recipients via Brevo API`);
  
  // Send individual emails since Brevo API handles one recipient at a time
  const promises = recipients.map((recipient) =>
    sendEmail({ to: recipient, subject, html })
  );
  return Promise.allSettled(promises);
};

module.exports = {
  sendEmail,
  sendBulkEmail,
};

