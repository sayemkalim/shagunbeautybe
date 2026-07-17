const { asyncHandler } = require("../../common/asyncHandler");
const ApiResponse = require("../../utils/ApiResponse");
const {
  sendOrderConfirmationEmails,
  sendStatusUpdateEmails,
  sendWelcomeEmail,
  sendForgotPasswordEmail,
  sendCustomEmail,
} = require("../../utils/email/directEmailService");
const Order = require("../../models/orderModel");
const User = require("../../models/userModel");
const Admin = require("../../models/adminModel");
const mongoose = require("mongoose");

/**
 * Send custom email manually
 */
const sendCustomEmailManual = asyncHandler(async (req, res) => {
  const { to, subject, html, text } = req.body;

  if (!to || !subject || (!html && !text)) {
    return res
      .status(400)
      .json(
        new ApiResponse(
          400,
          null,
          "Missing required fields: to, subject, and html/text",
          false
        )
      );
  }

  try {
    const result = await sendCustomEmail({
      to,
      subject,
      html,
      text,
    });

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { messageId: result.messageId },
          "Email sent successfully",
          true
        )
      );
  } catch (error) {
    console.error("❌ Manual email send failed:", error.message);
    return res
      .status(500)
      .json(
        new ApiResponse(
          500,
          null,
          `Email failed to send: ${error.message}`,
          false
        )
      );
  }
});

/**
 * Resend order confirmation email manually
 */
const resendOrderConfirmation = asyncHandler(async (req, res) => {
  const { orderId } = req.body;

  if (!orderId) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "orderId is required", false));
  }

  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Invalid order ID", false));
  }

  try {
    const order = await Order.findById(orderId);
    if (!order) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Order not found", false));
    }

    const user = await User.findById(order.user);
    if (!user) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "User not found", false));
    }

    await sendOrderConfirmationEmails({
      order: order.toObject(),
      user: user.toObject(),
    });

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          null,
          "Order confirmation email resent successfully",
          true
        )
      );
  } catch (error) {
    console.error("❌ Resend order confirmation failed:", error.message);
    return res
      .status(500)
      .json(
        new ApiResponse(
          500,
          null,
          `Failed to resend order confirmation: ${error.message}`,
          false
        )
      );
  }
});

/**
 * Resend status update email manually
 */
const resendStatusUpdate = asyncHandler(async (req, res) => {
  const { orderId, status } = req.body;

  if (!orderId || !status) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "orderId and status are required", false));
  }

  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Invalid order ID", false));
  }

  try {
    const order = await Order.findById(orderId);
    if (!order) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Order not found", false));
    }

    const user = await User.findById(order.user);
    if (!user) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "User not found", false));
    }

    // Check if the order has the requested status
    if (order.status !== status) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            `Order status is ${order.status}, not ${status}. Cannot resend status update email.`,
            false
          )
        );
    }

    // Find the specific status update entry or create one if it doesn't exist
    let statusUpdate = order.emailTracking?.statusUpdates?.find(
      (update) => update.status === status
    );

    // If status update entry doesn't exist, create one
    if (!statusUpdate) {
      if (!order.emailTracking) {
        order.emailTracking = { confirmation: {}, statusUpdates: [] };
      }
      
      statusUpdate = {
        status: status,
        emailStatus: "queued",
        queuedAt: new Date(),
        attempts: 0
      };
      
      order.emailTracking.statusUpdates.push(statusUpdate);
      await order.save();
    }

    await sendStatusUpdateEmails({
      order: order.toObject(),
      user: user.toObject(),
      previousStatus: "unknown", // We don't have previous status for manual resend
      updatedBy: req.admin ? req.admin.toObject() : null,
    });

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          null,
          `Status update email for ${status} resent successfully`,
          true
        )
      );
  } catch (error) {
    console.error("❌ Resend status update failed:", error.message);
    return res
      .status(500)
      .json(
        new ApiResponse(
          500,
          null,
          `Failed to resend status update: ${error.message}`,
          false
        )
      );
  }
});

/**
 * Resend welcome email manually
 */
const resendWelcomeEmail = asyncHandler(async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "userId is required", false));
  }

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Invalid user ID", false));
  }

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "User not found", false));
    }

    await sendWelcomeEmail({
      user: user.toObject(),
    });

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          null,
          "Welcome email resent successfully",
          true
        )
      );
  } catch (error) {
    console.error("❌ Resend welcome email failed:", error.message);
    return res
      .status(500)
      .json(
        new ApiResponse(
          500,
          null,
          `Failed to resend welcome email: ${error.message}`,
          false
        )
      );
  }
});

/**
 * Get failed emails for manual resending
 */
const getFailedEmails = asyncHandler(async (req, res) => {
  try {
    // Get orders with failed confirmation emails
    const ordersWithFailedConfirmation = await Order.find({
      "emailTracking.confirmation.status": "failed",
    })
      .populate("user", "name email")
      .select("_id user emailTracking.confirmation createdAt");

    // Get orders with failed status update emails
    const ordersWithFailedStatusUpdates = await Order.find({
      "emailTracking.statusUpdates.emailStatus": "failed",
    })
      .populate("user", "name email")
      .select("_id user emailTracking.statusUpdates createdAt");

    const failedEmails = {
      confirmation: ordersWithFailedConfirmation.map((order) => ({
        orderId: order._id,
        user: order.user,
        failedAt: order.emailTracking.confirmation.failedAt,
        error: order.emailTracking.confirmation.error,
        attempts: order.emailTracking.confirmation.attempts,
      })),
      statusUpdates: ordersWithFailedStatusUpdates.flatMap((order) =>
        order.emailTracking.statusUpdates
          .filter((update) => update.emailStatus === "failed")
          .map((update) => ({
            orderId: order._id,
            user: order.user,
            status: update.status,
            failedAt: update.failedAt,
            error: update.error,
            attempts: update.attempts,
          }))
      ),
    };

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          failedEmails,
          "Failed emails retrieved successfully",
          true
        )
      );
  } catch (error) {
    console.error("❌ Get failed emails failed:", error.message);
    return res
      .status(500)
      .json(
        new ApiResponse(
          500,
          null,
          `Failed to retrieve failed emails: ${error.message}`,
          false
        )
      );
  }
});

/**
 * Send test email
 */
const sendTestEmail = asyncHandler(async (req, res) => {
  const { to } = req.body;

  if (!to) {
    return res
      .status(400)
      .json(
        new ApiResponse(400, null, "Email address is required", false)
      );
  }

  try {
    const testHTML = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Test Email from Celic Store</h2>
        <p>This is a test email to verify email functionality.</p>
        <p>If you received this email, the email system is working correctly.</p>
        <hr style="margin: 20px 0;">
        <p style="color: #666; font-size: 12px;">
          Sent at: ${new Date().toISOString()}
        </p>
      </div>
    `;

    const result = await sendCustomEmail({
      to,
      subject: "Test Email - Celic Store",
      html: testHTML,
    });

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { messageId: result.messageId },
          "Test email sent successfully",
          true
        )
      );
  } catch (error) {
    console.error("❌ Test email send failed:", error.message);
    return res
      .status(500)
      .json(
        new ApiResponse(
          500,
          null,
          `Test email failed to send: ${error.message}`,
          false
        )
      );
  }
});

module.exports = {
  sendCustomEmailManual,
  resendOrderConfirmation,
  resendStatusUpdate,
  resendWelcomeEmail,
  getFailedEmails,
  sendTestEmail,
};
