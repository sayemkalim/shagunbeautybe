const { toNumber, formatAddress } = require('../emailHelpers');

/**
 * Get status color and message
 */
const getStatusInfo = (status) => {
  const statusMap = {
    pending: {
      color: "#ffcb65",
      message: "Your order is pending confirmation.",
      emoji: "⏳"
    },
    confirmed: {
      color: "#5ec4ff",
      message: "Your order has been confirmed and will be processed soon.",
      emoji: "✓"
    },
    processing: {
      color: "#ff9065",
      message: "We're carefully preparing your items for shipment.",
      emoji: "📦"
    },
    shipped: {
      color: "#a78bfa",
      message: "Your order has been shipped and is on its way!",
      emoji: "🚚"
    },
    out_for_delivery: {
      color: "#8b5cf6",
      message: "Your order is out for delivery and will arrive soon!",
      emoji: "🛵"
    },
    delivered: {
      color: "#10b981",
      message: "Your order has been delivered successfully!",
      emoji: "✅"
    },
    cancelled: {
      color: "#ef4444",
      message: "Your order has been cancelled.",
      emoji: "❌"
    },
    return_requested: {
      color: "#f59e0b",
      message: "Your return request has been submitted and is under review.",
      emoji: "🔄"
    },
    returned: {
      color: "#10b981",
      message: "Your order return has been processed successfully.",
      emoji: "↩️"
    },
    refund_initiated: {
      color: "#f59e0b",
      message: "Your order refund has been initiated and is being processed. It will be credited soon.",
      emoji: "⏳"
    },
    refunded: {
      color: "#10b981",
      message: "Your order refund has been processed successfully.",
      emoji: "✅"
    },
    refund_failed: {
      color: "#ef4444",
      message: "Your order refund could not be completed. Please contact our support team.",
      emoji: "❌"
    },
  };

  return statusMap[status] || statusMap.pending;
};

/**
 * Generate order status update email for customer
 * @param {Object} order - Order object
 * @param {Object} user - User object
 * @param {string} previousStatus - Previous order status
 * @returns {string} HTML email content
 */
const generateCustomerStatusUpdate = (order, user, previousStatus) => {
  const statusInfo = getStatusInfo(order.status);
  const updateDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  
  const subtotal = toNumber(order.discountedTotalAmount);
  const shipping = toNumber(order.shippingCost);
  const total = toNumber(order.finalTotalAmount);
  const baseUrl = process.env.APP_URL || 'http://localhost:5000';

  let refundStatus = (order.refundStatus || "").toLowerCase().trim();
  if (!refundStatus) {
    if (order.status === "refund_failed" || order.paymentStatus === "refund_failed") {
      refundStatus = "failed";
    } else if (order.status === "refund_initiated" || order.paymentStatus === "refund_initiated") {
      refundStatus = "initiated";
    } else if (order.status === "refunded" || order.paymentStatus === "refunded") {
      refundStatus = "processed";
    }
  }

  const isRefunded =
    ["refund_initiated", "refunded", "refund_failed"].includes(order.status) ||
    ["refund_initiated", "refunded", "refund_failed"].includes(order.paymentStatus) ||
    Boolean(order.refundStatus) ||
    Boolean(refundStatus);

  const refundAmountFormatted = order.refundAmount ? Number(order.refundAmount).toFixed(2) : total.toFixed(2);

  let refundTitle = "Order Refunded 💳";
  let refundSubtitle = `A refund of ₹${refundAmountFormatted} has been processed for your order.`;
  let refundBadgeColor = "#8b5cf6";
  let refundStatusLabel = "Initiated";

  if (refundStatus === "initiated" || refundStatus === "pending" || refundStatus === "processing") {
    refundTitle = "Refund Initiated ⏳";
    refundSubtitle = `A refund of ₹${refundAmountFormatted} has been initiated and is being processed. It will be credited soon.`;
    refundBadgeColor = "#f59e0b";
    refundStatusLabel = "Initiated";
  } else if (refundStatus === "failed") {
    refundTitle = "Refund Failed ❌";
    refundSubtitle = `The refund of ₹${refundAmountFormatted} could not be completed.${order.refundReason ? ' Reason: ' + order.refundReason : ' Please contact our support team.'}`;
    refundBadgeColor = "#ef4444";
    refundStatusLabel = "Failed";
  } else if (refundStatus === "processed" || refundStatus === "completed") {
    refundTitle = "Refund Completed ✅";
    refundSubtitle = `A refund of ₹${refundAmountFormatted} has been successfully processed and credited.`;
    refundBadgeColor = "#10b981";
    refundStatusLabel = "Processed";
  }

  return `
    <!DOCTYPE html>
    <html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
    <head>
      <meta charset="UTF-8" />
      <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
      <meta http-equiv="X-UA-Compatible" content="IE=edge" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <link href="https://fonts.googleapis.com/css?family=Outfit:ital,wght@0,400;0,500;0,600" rel="stylesheet" />
      <title>${isRefunded ? refundTitle.replace(/[^\w\s]/gi, '').trim() : "Order Status Update"} - Shagun Beauty</title>
      <style>
        html, body { margin: 0 !important; padding: 0 !important; min-height: 100% !important; width: 100% !important; -webkit-font-smoothing: antialiased; }
        * { -ms-text-size-adjust: 100%; }
        table, td, th { mso-table-lspace: 0 !important; mso-table-rspace: 0 !important; border-collapse: collapse; }
        img { border: 0; outline: 0; line-height: 100%; text-decoration: none; -ms-interpolation-mode: bicubic; }
      </style>
    </head>
    <body style="width: 100% !important; min-height: 100% !important; margin: 0 !important; padding: 0 !important; background-color: #e3dad5;">
      <table style="width: 100%; min-width: 600px; background-color: #e3dad5;" bgcolor="#e3dad5" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <td align="center" valign="top">
            <table align="center" border="0" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding: 20px 0px;" align="left" valign="top">
                  <table border="0" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td valign="top">
                        
                        <!-- Header -->
                        <table width="600" border="0" cellspacing="0" cellpadding="0" align="center" style="width: 600px; max-width: 600px;">
                          <tr>
                            <td style="padding: 24px 40px 40px 40px; background-color: #1a110c;" bgcolor="#1a110c">
                              
                              <!-- Logo -->
                              <table width="100%" border="0" cellpadding="0" cellspacing="0">
                                <tr>
                                  <td align="center" valign="top" style="padding: 0px 0px 32px 0px;">
                                    <img src="https://res.cloudinary.com/dacwig3xk/image/upload/v1784474181/SBL_h4ixmj.png" width="164" height="41" alt="Shagun Beauty" 
                                         style="display: block; width: 164px; height: auto; max-width: 100%; border: 0;" />
                                  </td>
                                </tr>
                              </table>
                              
                              <!-- Title -->
                              <table width="100%" border="0" cellpadding="0" cellspacing="0">
                                <tr>
                                  <td align="center" valign="top" style="padding: 0px 0px 12px 0px;">
                                    <div style="line-height: 128%; letter-spacing: -0.2px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 38px; font-weight: 500; color: #ffffff; text-align: center;">
                                      ${isRefunded ? refundTitle : `Order Status Updated ${statusInfo.emoji}`}
                                    </div>
                                  </td>
                                </tr>
                              </table>
                              
                              <!-- Subtitle -->
                              <table width="100%" border="0" cellpadding="0" cellspacing="0">
                                <tr>
                                  <td align="center" valign="top" style="padding: 0px 0px 12px 0px;">
                                    <div style="line-height: 156%; letter-spacing: -0.2px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 19px; font-weight: normal; color: #ffffffcc; text-align: center;">
                                      ${isRefunded ? refundSubtitle : statusInfo.message}
                                    </div>
                                  </td>
                                </tr>
                              </table>
                              
                              <!-- Track Button -->
                              <table width="100%" border="0" cellpadding="0" cellspacing="0">
                                <tr>
                                  <td align="center" style="padding: 0px 0px 16px 0px;">
                                    <a style="display: inline-block; border-radius: 126px; background-color: ${isRefunded ? refundBadgeColor : statusInfo.color}; padding: 12px 24px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-weight: 600; font-size: 16px; line-height: 150%; letter-spacing: -0.2px; color: #1a110c; text-align: center; text-decoration: none;" 
                                       href="${baseUrl}/orders/${order._id}">
                                      View Order Details
                                    </a>
                                  </td>
                                </tr>
                              </table>
                              
                              <!-- Summary Box -->
                              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #ffffff0d; border-radius: 8px; margin-top: 24px;">
                                <tr>
                                  <td style="padding: 20px;">
                                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                                      <tr>
                                        <td valign="top" style="padding: 0px 0px 8px 0px;">
                                          <div style="line-height: 140%; letter-spacing: -0.2px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 20px; font-weight: 500; color: #ffcb65;">
                                            Summary
                                          </div>
                                        </td>
                                      </tr>
                                      <tr>
                                        <td valign="top" style="padding: 0px 0px 8px 0px;">
                                          <div style="line-height: 140%; letter-spacing: -0px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 16px; font-weight: 500; color: ${isRefunded ? refundBadgeColor : statusInfo.color};">
                                            ${isRefunded ? `Refund ${refundStatusLabel}` : (order.status.charAt(0).toUpperCase() + order.status.slice(1))}
                                          </div>
                                        </td>
                                      </tr>
                                      <tr>
                                        <td valign="top" style="padding: 0px 0px 8px 0px;">
                                          <div style="line-height: 140%; letter-spacing: -0px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 14px; font-weight: normal; color: #ffffffcc;">
                                            #${order._id.toString().slice(-4).toUpperCase()} • ${updateDate}
                                          </div>
                                        </td>
                                      </tr>
                                      <tr>
                                        <td valign="top">
                                          <div style="line-height: 140%; letter-spacing: -0px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 14px; font-weight: 600; color: #ffffff;">
                                            ₹${total.toFixed(2)}
                                          </div>
                                        </td>
                                      </tr>
                                    </table>
                                  </td>
                                  <td style="padding: 20px;">
                                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                                      <tr>
                                        <td valign="top" style="padding: 0px 0px 12px 0px;">
                                          <div style="line-height: 140%; letter-spacing: -0.2px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 20px; font-weight: 500; color: #ffcb65;">
                                            Shipping Address
                                          </div>
                                        </td>
                                      </tr>
                                      <tr>
                                        <td valign="top" style="padding: 0px 0px 8px 0px;">
                                          <div style="line-height: 140%; letter-spacing: -0.2px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 16px; font-weight: 600; color: #ffffff;">
                                            ${order.address?.name || 'Customer'}
                                          </div>
                                        </td>
                                      </tr>
                                      <tr>
                                        <td valign="top">
                                          <div style="line-height: 140%; letter-spacing: -0px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 14px; font-weight: normal; color: #ffffffcc;">
                                            ${formatAddress(order.address)}
                                          </div>
                                        </td>
                                      </tr>
                                    </table>
                                  </td>
                                </tr>
                              </table>
                              
                              ${isRefunded ? `
                              <!-- Refund Details Box -->
                              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #ffffff0d; border-radius: 8px; margin-top: 16px;">
                                <tr>
                                  <td style="padding: 20px;">
                                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                                      <tr>
                                        <td valign="top" style="padding: 0px 0px 10px 0px;">
                                          <div style="line-height: 140%; letter-spacing: -0.2px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 20px; font-weight: 500; color: #ffcb65;">
                                            Refund Details 💳
                                          </div>
                                        </td>
                                      </tr>
                                      <tr>
                                        <td valign="top">
                                          <table width="100%" border="0" cellpadding="4" cellspacing="0" style="font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 14px; color: #ffffffcc;">
                                            <tr>
                                              <td width="40%" style="color: #ffffffcc;">Refund Status:</td>
                                              <td>
                                                <span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 12px; font-weight: 600; background-color: ${refundBadgeColor}20; color: ${refundBadgeColor}; border: 1px solid ${refundBadgeColor}50; text-transform: uppercase;">
                                                  ${refundStatusLabel}
                                                </span>
                                              </td>
                                            </tr>
                                            <tr>
                                              <td width="40%" style="color: #ffffffcc;">Refund Amount:</td>
                                              <td style="font-weight: 600; color: #ffffff;">₹${order.refundAmount ? Number(order.refundAmount).toFixed(2) : total.toFixed(2)}</td>
                                            </tr>
                                            ${order.refundMode ? `
                                            <tr>
                                              <td style="color: #ffffffcc;">Refund Mode:</td>
                                              <td style="color: #ffffff; text-transform: capitalize;">${order.refundMode.replace(/_/g, ' ')}</td>
                                            </tr>` : ''}
                                            ${order.refundTransactionId ? `
                                            <tr>
                                              <td style="color: #ffffffcc;">UTR / Transaction ID:</td>
                                              <td style="color: #ffffff; font-family: monospace;">${order.refundTransactionId}</td>
                                            </tr>` : ''}
                                            ${order.refundTo ? `
                                            <tr>
                                              <td style="color: #ffffffcc;">Refunded To:</td>
                                              <td style="color: #ffffff;">${order.refundTo}</td>
                                            </tr>` : ''}
                                            ${order.refundReason ? `
                                            <tr>
                                              <td style="color: #ffffffcc;">Reason / Note:</td>
                                              <td style="color: #ffffff;">${order.refundReason}</td>
                                            </tr>` : ''}
                                          </table>
                                        </td>
                                      </tr>
                                    </table>
                                  </td>
                                </tr>
                              </table>
                              ` : ''}
                              
                            </td>
                          </tr>
                        </table>
                        
                        <!-- Ornament Top -->
                        <table width="600" border="0" cellspacing="0" cellpadding="0" align="center" style="width: 600px; max-width: 600px;">
                          <tr>
                            <td style="background-color: #ffffff;" bgcolor="#ffffff">
                              <img src="${baseUrl}/public/email-assets/image-17102359012892-013f76a5.png" width="600" height="auto" alt="" 
                                   style="display: block; width: 100%; height: auto; border: 0;" />
                            </td>
                          </tr>
                        </table>
                        
                        <!-- Contact Section -->
                        <table width="600" border="0" cellspacing="0" cellpadding="0" align="center" style="width: 600px; max-width: 600px;">
                          <tr>
                            <td style="padding: 40px 40px; background-color: #ffffff;" bgcolor="#ffffff">
                              
                              <table width="100%" border="0" cellpadding="0" cellspacing="0">
                                <tr>
                                  <td align="center" valign="top" style="padding: 0px 0px 28px 0px;">
                                    <div style="line-height: 128%; letter-spacing: -0.6px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 32px; font-weight: 500; color: #1a110c; text-align: center;">
                                      Any problems with your order?
                                    </div>
                                  </td>
                                </tr>
                              </table>
                              
                              <!-- Contact Cards -->
                              <table width="100%" border="0" cellpadding="0" cellspacing="0">
                                <tr>
                                  <td width="50%" valign="top" style="padding-right: 8px;">
                                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                                      <tr>
                                        <td style="padding: 12px; background-color: #fcedd0; border-radius: 12px;">
                                          <table border="0" cellpadding="0" cellspacing="0">
                                            <tr>
                                              <td valign="middle">
                                                <img src="${baseUrl}/public/email-assets/image-17102359013265-4c1af5f3.png" width="38" height="38" alt="Email" 
                                                     style="display: block; width: 38px; height: 38px; border: 0;" />
                                              </td>
                                              <td valign="middle" style="padding-left: 12px;">
                                                <div style="line-height: 133%; letter-spacing: -0.2px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 18px; font-weight: 500; color: #1b1b1b;">
                                                  Email Us
                                                </div>
                                                <div style="font-size: 14px; line-height: 143%; color: #2a1e19; font-family: 'Outfit', Arial, Helvetica, sans-serif;">
                                                  helpshagunbeauty@gmail.com
                                                </div>
                                              </td>
                                            </tr>
                                          </table>
                                        </td>
                                      </tr>
                                    </table>
                                  </td>
                                  <td width="50%" valign="top" style="padding-left: 8px;">
                                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                                      <tr>
                                        <td style="padding: 12px; background-color: #fcedd0; border-radius: 12px;">
                                          <table border="0" cellpadding="0" cellspacing="0">
                                            <tr>
                                              <td valign="middle">
                                                <img src="${baseUrl}/public/email-assets/image-17102359014306-18c6d4ff.png" width="38" height="38" alt="Phone" 
                                                     style="display: block; width: 38px; height: 38px; border: 0;" />
                                              </td>
                                              <td valign="middle" style="padding-left: 12px;">
                                                <div style="line-height: 133%; letter-spacing: -0.2px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 18px; font-weight: 500; color: #1b1b1b;">
                                                  Call Us
                                                </div>
                                                <div style="font-size: 14px; line-height: 143%; color: #2a1e19; font-family: 'Outfit', Arial, Helvetica, sans-serif;">
                                                  +91 98101 07887
                                                </div>
                                              </td>
                                            </tr>
                                          </table>
                                        </td>
                                      </tr>
                                    </table>
                                  </td>
                                </tr>
                              </table>
                              
                            </td>
                          </tr>
                        </table>
                        
                        <!-- Ornament Bottom -->
                        <table width="600" border="0" cellspacing="0" cellpadding="0" align="center" style="width: 600px; max-width: 600px;">
                          <tr>
                            <td style="background-color: #ffffff;" bgcolor="#ffffff">
                              <img src="${baseUrl}/public/email-assets/image-17102359016849-7afa6a57.png" width="600" height="auto" alt="" 
                                   style="display: block; width: 100%; height: auto; border: 0;" />
                            </td>
                          </tr>
                        </table>
                        
                        <!-- Footer -->
                        <table width="600" border="0" cellspacing="0" cellpadding="0" align="center" style="width: 600px; max-width: 600px;">
                          <tr>
                            <td style="padding: 40px 40px 40px 40px; background-color: #1a110c;" bgcolor="#1a110c">
                              
                              <!-- Logo -->
                              <table width="100%" border="0" cellpadding="0" cellspacing="0">
                                <tr>
                                  <td align="center" valign="top" style="padding: 0px 0px 20px 0px;">
                                    <img src="https://res.cloudinary.com/dacwig3xk/image/upload/v1784474181/SBL_h4ixmj.png" width="164" height="41" alt="Shagun Beauty" 
                                         style="display: block; width: 164px; height: auto; max-width: 100%; border: 0;" />
                                  </td>
                                </tr>
                              </table>
                              
                              <!-- Social -->
                              <table width="100%" border="0" cellpadding="0" cellspacing="0">
                                <tr>
                                  <td align="center" style="padding: 0px 0px 20px 0px;">
                                    <a href="https://instagram.com/celicstore" style="text-decoration: none; display: inline-block;">
                                      <img src="${baseUrl}/public/email-assets/193c7e94406b9a9160b8842fcba96582.png" width="20" height="20" alt="Instagram" 
                                           style="display: block; border: 0; width: 20px; height: 20px;" />
                                    </a>
                                  </td>
                                </tr>
                              </table>
                              
                              <!-- Address -->
                              <table width="100%" border="0" cellpadding="0" cellspacing="0">
                                <tr>
                                  <td align="center" valign="top" style="padding: 0px 0px 14px 0px;">
                                    <div style="font-size: 14px; line-height: 143%; text-align: center; color: #ffffffcc; font-family: 'Outfit', Arial, Helvetica, sans-serif;">
                                      A373, Defence Colony, New Delhi
                                    </div>
                                  </td>
                                </tr>
                              </table>
                              
                            </td>
                          </tr>
                        </table>
                        
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};

/**
 * Generate order status update email for company (same as customer - simple design)
 * @param {Object} order - Order object
 * @param {Object} user - User object
 * @param {string} previousStatus - Previous order status
 * @param {Object} updatedBy - Admin who updated the status
 * @returns {string} HTML email content
 */
const generateCompanyStatusUpdate = (order, user, previousStatus, updatedBy) => {
  // Use same template as customer - simple and clean
  return generateCustomerStatusUpdate(order, user, previousStatus);
};

module.exports = {
  generateCustomerStatusUpdate,
  generateCompanyStatusUpdate,
  getStatusInfo,
};
