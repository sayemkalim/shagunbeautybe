const { asyncHandler } = require("../../common/asyncHandler");
const mongoose = require("mongoose");
const Order = require("../../models/orderModel");

/**
 * Track email open via pixel
 * GET /api/email-tracking/pixel/:orderId/:emailType
 */
const trackEmailOpen = asyncHandler(async (req, res) => {
  const { orderId, emailType } = req.params;

  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    // Return 1x1 transparent pixel even on error
    return sendTrackingPixel(res);
  }

  try {
    if (emailType === "confirmation") {
      // Update confirmation email tracking
      await Order.findOneAndUpdate(
        { 
          _id: orderId,
          "emailTracking.confirmation.opened": false // Only mark as opened once (for first open time)
        },
        {
          $set: {
            "emailTracking.confirmation.opened": true,
            "emailTracking.confirmation.openedAt": new Date(),
          },
          $inc: {
            "emailTracking.confirmation.openCount": 1,
          },
        }
      );
      
      // Always increment count even if already opened
      await Order.findByIdAndUpdate(orderId, {
        $inc: {
          "emailTracking.confirmation.openCount": 1,
        },
      });
    } else if (emailType.startsWith("status-")) {
      // Extract status from emailType (e.g., "status-confirmed" → "confirmed")
      const status = emailType.replace("status-", "");
      
      // Update status update email tracking
      await Order.findOneAndUpdate(
        {
          _id: orderId,
          "emailTracking.statusUpdates.status": status,
          "emailTracking.statusUpdates.opened": false
        },
        {
          $set: {
            "emailTracking.statusUpdates.$.opened": true,
            "emailTracking.statusUpdates.$.openedAt": new Date(),
          },
        }
      );
      
      // Always increment count
      await Order.findOneAndUpdate(
        {
          _id: orderId,
          "emailTracking.statusUpdates.status": status,
        },
        {
          $inc: {
            "emailTracking.statusUpdates.$.openCount": 1,
          },
        }
      );
    }
  } catch (error) {
    console.error("Error tracking email open:", error);
    // Still return pixel even on error
  }

  // Return 1x1 transparent GIF pixel
  return sendTrackingPixel(res);
});

/**
 * Track email link click
 * GET /api/email-tracking/click/:orderId/:emailType?url=...
 */
const trackEmailClick = asyncHandler(async (req, res) => {
  const { orderId, emailType } = req.params;
  const { url } = req.query;

  if (!url) {
    return res.status(400).send("Missing redirect URL");
  }

  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    // Redirect anyway even on invalid order ID
    return res.redirect(decodeURIComponent(url));
  }

  try {
    if (emailType === "confirmation") {
      // Update confirmation email tracking
      await Order.findOneAndUpdate(
        {
          _id: orderId,
          "emailTracking.confirmation.clicked": false
        },
        {
          $set: {
            "emailTracking.confirmation.clicked": true,
            "emailTracking.confirmation.clickedAt": new Date(),
          },
        }
      );
      
      // Always increment count
      await Order.findByIdAndUpdate(orderId, {
        $inc: {
          "emailTracking.confirmation.clickCount": 1,
        },
      });
    } else if (emailType.startsWith("status-")) {
      const status = emailType.replace("status-", "");
      
      // Update status update email tracking
      await Order.findOneAndUpdate(
        {
          _id: orderId,
          "emailTracking.statusUpdates.status": status,
          "emailTracking.statusUpdates.clicked": false
        },
        {
          $set: {
            "emailTracking.statusUpdates.$.clicked": true,
            "emailTracking.statusUpdates.$.clickedAt": new Date(),
          },
        }
      );
      
      // Always increment count
      await Order.findOneAndUpdate(
        {
          _id: orderId,
          "emailTracking.statusUpdates.status": status,
        },
        {
          $inc: {
            "emailTracking.statusUpdates.$.clickCount": 1,
          },
        }
      );
    }
  } catch (error) {
    console.error("Error tracking email click:", error);
    // Redirect anyway even on error
  }

  // Redirect to the actual URL
  return res.redirect(decodeURIComponent(url));
});

/**
 * Helper to send 1x1 transparent GIF pixel
 */
function sendTrackingPixel(res) {
  // 1x1 transparent GIF in base64
  const pixel = Buffer.from(
    "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
    "base64"
  );
  
  res.writeHead(200, {
    "Content-Type": "image/gif",
    "Content-Length": pixel.length,
    "Cache-Control": "no-store, no-cache, must-revalidate, private",
    "Expires": "0",
    "Pragma": "no-cache",
  });
  
  return res.end(pixel);
}

module.exports = {
  trackEmailOpen,
  trackEmailClick,
};

