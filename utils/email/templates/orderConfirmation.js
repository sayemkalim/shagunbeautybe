const { toNumber, formatAddress } = require('../emailHelpers');

/**
 * Generate order confirmation email for customer
 * @param {Object} order - Order object
 * @param {Object} user - User object
 * @returns {string} HTML email content
 */
const generateCustomerOrderConfirmation = (order, user) => {
  const orderDate = new Date(order.createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const subtotal = toNumber(order.discountedTotalAmount);
  const shipping = toNumber(order.shippingCost);
  const discount = toNumber(order.totalAmount) - toNumber(order.discountedTotalAmount);
  const total = toNumber(order.finalTotalAmount);
  const baseUrl = process.env.APP_URL || 'http://localhost:8000';

  // Generate items HTML
  const itemsHTML = order.items.map((item) => {
    const itemName = item.type === "product" ? item.product.name : item.bundle.name;
    const itemImage = item.type === "product" ? item.product.banner_image : (item.bundle.images && item.bundle.images[0]);
    const itemPrice = toNumber(item.discounted_total_amount);
    const itemDescription = item.type === "product" ? 
      (item.product.small_description || "Premium quality product") : 
      (item.bundle.description || "Premium bundle");
    
    return `
    <tr>
      <td class="pc-w620-width-100pc" align="left" valign="middle" style="padding: 0px 0px 8px 0px; width: 86px;">
        <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td align="left" valign="top">
              <img src="${itemImage || baseUrl + '/public/email-assets/image-17102359013263-56a04970.png'}" 
                   width="86" height="86" alt="${itemName}" 
                   style="display: block; outline: 0; line-height: 100%; -ms-interpolation-mode: bicubic; width: 86px; height: 86px; border-radius: 8px; border: 0;" />
            </td>
          </tr>
        </table>
      </td>
      <td align="left" valign="middle" style="padding: 10px 10px 10px 10px; height: auto;">
        <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td align="left" valign="top" style="padding: 0px 0px 4px 0px;">
              <div style="line-height: 28px; letter-spacing: -0px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 18px; font-weight: 600; color: #1b110c;">
                ${itemName}
              </div>
            </td>
          </tr>
          <tr>
            <td align="left" valign="top" style="padding: 0px 0px 4px 0px;">
              <div style="line-height: 24px; letter-spacing: -0px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 16px; font-weight: normal; color: #2a1e19cc;">
                ${itemDescription.substring(0, 50)}${itemDescription.length > 50 ? '...' : ''}
              </div>
            </td>
          </tr>
          <tr>
            <td align="left" valign="top" style="padding: 0px 0px 4px 0px;">
              <div style="line-height: 24px; letter-spacing: -0px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 14px; font-weight: normal; color: #2a1e19cc;">
                Qty: ${item.quantity}
              </div>
            </td>
          </tr>
          <tr>
            <td align="left" valign="top">
              <div style="line-height: 24px; letter-spacing: -0.2px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 18px; font-weight: 600; color: #039133;">
                ₹${itemPrice.toFixed(2)}
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
    <head>
      <meta charset="UTF-8" />
      <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
      <meta http-equiv="X-UA-Compatible" content="IE=edge" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta name="format-detection" content="telephone=no, date=no, address=no, email=no" />
      <link href="https://fonts.googleapis.com/css?family=Outfit:ital,wght@0,400;0,500;0,600" rel="stylesheet" />
      <title>Order Confirmation - Celic Store</title>
      <style>
        html, body { margin: 0 !important; padding: 0 !important; min-height: 100% !important; width: 100% !important; -webkit-font-smoothing: antialiased; }
        * { -ms-text-size-adjust: 100%; }
        table, td, th { mso-table-lspace: 0 !important; mso-table-rspace: 0 !important; border-collapse: collapse; }
        img { border: 0; outline: 0; line-height: 100%; text-decoration: none; -ms-interpolation-mode: bicubic; }
      </style>
    </head>
    <body style="width: 100% !important; min-height: 100% !important; margin: 0 !important; padding: 0 !important; font-weight: normal; color: #2D3A41; -webkit-font-smoothing: antialiased; background-color: #e3dad5;">
      <table style="table-layout: fixed; width: 100%; min-width: 600px; background-color: #e3dad5;" bgcolor="#e3dad5" border="0" cellspacing="0" cellpadding="0" role="presentation">
        <tr>
          <td align="center" valign="top">
            <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation">
              <tr>
                <td style="padding: 20px 0px 20px 0px;" align="left" valign="top">
                  <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%">
                    <tr>
                      <td valign="top">
                        
                        <!-- Header -->
                        <table width="600" border="0" cellspacing="0" cellpadding="0" role="presentation" align="center" style="width: 600px; max-width: 600px;">
                          <tr>
                            <td width="100%" border="0" cellspacing="0" cellpadding="0" role="presentation">
                              <table width="100%" align="center" border="0" cellspacing="0" cellpadding="0" role="presentation">
                                <tr>
                                  <td valign="top" style="padding: 24px 40px 40px 40px; background-color: #1a110c;" bgcolor="#1a110c">
                                    
                                    <!-- Logo -->
                                    <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                      <tr>
                                        <td align="center" valign="top" style="padding: 0px 0px 32px 0px;">
                                          <img src="https://theceliacstore-fe-git-main-madhav-sethis-projects.vercel.app/_next/image?url=%2F193c7e94406b9a9160b8842fcba96582.png&w=384&q=75" width="164" height="41" alt="Celic Store" 
                                               style="display: block; outline: 0; line-height: 100%; -ms-interpolation-mode: bicubic; width: 164px; height: auto; max-width: 100%; border: 0;" />
                                        </td>
                                      </tr>
                                    </table>
                                    
                                    <!-- Title -->
                                    <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                      <tr>
                                        <td align="center" valign="top" style="padding: 0px 0px 12px 0px;">
                                          <div style="line-height: 128%; letter-spacing: -0.2px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 38px; font-weight: 500; color: #ffffff; text-align: center;">
                                            Thank You for Order
                                          </div>
                                        </td>
                                      </tr>
                                    </table>
                                    
                                    <!-- Subtitle -->
                                    <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                      <tr>
                                        <td align="center" valign="top" style="padding: 0px 0px 12px 0px;">
                                          <div style="line-height: 156%; letter-spacing: -0.2px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 19px; font-weight: normal; color: #ffffffcc; text-align: center;">
                                            Your order's in. We're working to get it packed up and out the door expect a dispatch confirmation email soon.
                                          </div>
                                        </td>
                                      </tr>
                                    </table>
                                    
                                    <!-- Track Button -->
                                    <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                      <tr>
                                        <td align="center" style="padding: 0px 0px 16px 0px;">
                                          <a style="display: inline-block; border-radius: 126px; background-color: #ffcb65; padding: 12px 24px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-weight: 600; font-size: 16px; line-height: 150%; letter-spacing: -0.2px; color: #1a110c; text-align: center; text-decoration: none;" 
                                             href="${baseUrl}/orders/${order._id}">
                                            Track Your Order
                                          </a>
                                        </td>
                                      </tr>
                                    </table>
                                    
                                    <!-- Note -->
                                    <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                      <tr>
                                        <td align="center" valign="top" style="padding: 0px 0px 40px 0px;">
                                          <div style="line-height: 156%; letter-spacing: -0.2px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 16px; font-weight: normal; color: #ffffffb3; text-align: center;">
                                            Please allow 24 hours to track your order.
                                          </div>
                                        </td>
                                      </tr>
                                    </table>
                                    
                                    <!-- Summary Box -->
                                    <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #ffffff0d; border-radius: 8px;">
                                      <tr>
                                        <td style="padding: 20px;">
                                          <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                            <tr>
                                              <td valign="top" style="padding: 0px 0px 8px 0px;">
                                                <div style="line-height: 140%; letter-spacing: -0.2px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 20px; font-weight: 500; color: #ffcb65;">
                                                  Summary
                                                </div>
                                              </td>
                                            </tr>
                                            <tr>
                                              <td valign="top" style="padding: 0px 0px 8px 0px;">
                                                <div style="line-height: 140%; letter-spacing: -0px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 16px; font-weight: 500; color: #ff9065;">
                                                  ${order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                                                </div>
                                              </td>
                                            </tr>
                                            <tr>
                                              <td valign="top" style="padding: 0px 0px 8px 0px;">
                                                <div style="line-height: 140%; letter-spacing: -0px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 14px; font-weight: normal; color: #ffffffcc;">
                                                  #${order.orderNumber || order._id.toString().slice(-4).toUpperCase()} • ${orderDate}
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
                                          <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
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
                                                  ${order.address.name}
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
                                    
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>
                        
                        <!-- Ornament Top -->
                        <table width="600" border="0" cellspacing="0" cellpadding="0" role="presentation" align="center" style="width: 600px; max-width: 600px;">
                          <tr>
                            <td style="background-color: #ffffff;" bgcolor="#ffffff">
                              <img src="${baseUrl}/public/email-assets/image-17102359012892-013f76a5.png" width="600" height="auto" alt="" 
                                   style="display: block; outline: 0; line-height: 100%; -ms-interpolation-mode: bicubic; width: 100%; height: auto; border: 0;" />
                            </td>
                          </tr>
                        </table>
                        
                        <!-- Order Details -->
                        <table width="600" border="0" cellspacing="0" cellpadding="0" role="presentation" align="center" style="width: 600px; max-width: 600px;">
                          <tr>
                            <td style="padding: 40px 40px 24px 40px; background-color: #ffffff;" bgcolor="#ffffff">
                              
                              <!-- Title -->
                              <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                <tr>
                                  <td align="center" valign="top" style="padding: 0px 0px 4px 0px;">
                                    <div style="line-height: 128%; letter-spacing: -0.6px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 32px; font-weight: 500; color: #1b110c; text-align: center;">
                                      Your item in this order
                                    </div>
                                  </td>
                                </tr>
                              </table>
                              
                              <!-- Order Number -->
                              <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                <tr>
                                  <td align="center" valign="top" style="padding: 0px 0px 24px 0px;">
                                    <div style="line-height: 128%; letter-spacing: -0px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 16px; font-weight: normal; color: #2a1e19cc; text-align: center;">
                                      Order number: #${order.orderNumber || order._id.toString().slice(-4).toUpperCase()}
                                    </div>
                                  </td>
                                </tr>
                              </table>
                              
                              <!-- Items -->
                              <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                ${itemsHTML}
                              </table>
                              
                              <!-- Pricing -->
                              <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="margin-top: 8px;">
                                <tr>
                                  <td align="left" valign="middle" style="padding: 8px 0px;">
                                    <div style="line-height: 28px; letter-spacing: -0.2px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 16px; font-weight: normal; color: #1b110ccc;">
                                      Subtotal
                                    </div>
                                  </td>
                                  <td align="right" valign="middle" style="padding: 8px 0px;">
                                    <div style="line-height: 28px; letter-spacing: -0.2px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 16px; font-weight: 500; color: #19110d;">
                                      ₹${subtotal.toFixed(2)}
                                    </div>
                                  </td>
                                </tr>
                                ${discount > 0 ? `
                                <tr>
                                  <td align="left" valign="middle" style="padding: 8px 0px;">
                                    <div style="line-height: 28px; letter-spacing: -0.2px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 16px; font-weight: normal; color: #1b110ccc;">
                                      Discount
                                    </div>
                                  </td>
                                  <td align="right" valign="middle" style="padding: 8px 0px;">
                                    <div style="line-height: 28px; letter-spacing: -0.2px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 16px; font-weight: 500; color: #00af48;">
                                      -₹${discount.toFixed(2)}
                                    </div>
                                  </td>
                                </tr>
                                ` : ''}
                                <tr>
                                  <td align="left" valign="middle" style="padding: 8px 0px; border-bottom: 1px solid #e5e5e5;">
                                    <div style="line-height: 28px; letter-spacing: -0.2px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 16px; font-weight: normal; color: #1b110ccc;">
                                      ${shipping === 0 ? 'Delivery (FREE)' : 'Standard Delivery'}
                                    </div>
                                  </td>
                                  <td align="right" valign="middle" style="padding: 8px 0px; border-bottom: 1px solid #e5e5e5;">
                                    <div style="line-height: 28px; letter-spacing: -0.2px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 16px; font-weight: 500; color: ${shipping === 0 ? '#00af48' : '#19110d'};">
                                      ${shipping === 0 ? 'FREE' : '₹' + shipping.toFixed(2)}
                                    </div>
                                  </td>
                                </tr>
                                <tr>
                                  <td align="left" valign="middle" style="padding: 8px 0px;">
                                    <div style="line-height: 34px; letter-spacing: -0px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 18px; font-weight: 600; color: #1b110c;">
                                      Total:
                                    </div>
                                  </td>
                                  <td align="right" valign="middle" style="padding: 8px 0px;">
                                    <div style="line-height: 34px; letter-spacing: -0px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 18px; font-weight: 600; color: #1b110c;">
                                      ₹${total.toFixed(2)}
                                    </div>
                                  </td>
                                </tr>
                              </table>
                              
                            </td>
                          </tr>
                        </table>
                        
                        <!-- Contact Section -->
                        <table width="600" border="0" cellspacing="0" cellpadding="0" role="presentation" align="center" style="width: 600px; max-width: 600px;">
                          <tr>
                            <td style="padding: 10px 40px 20px 40px; background-color: #ffffff;" bgcolor="#ffffff">
                              
                              <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                <tr>
                                  <td align="center" valign="top" style="padding: 0px 0px 28px 0px;">
                                    <div style="line-height: 128%; letter-spacing: -0.6px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 32px; font-weight: 500; color: #1a110c; text-align: center;">
                                      Any problems with your order?
                                    </div>
                                  </td>
                                </tr>
                              </table>
                              
                              <!-- Contact Cards -->
                              <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                <tr>
                                  <td width="50%" valign="top" style="padding-right: 8px;">
                                    <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                      <tr>
                                        <td style="padding: 12px; background-color: #fcedd0; border-radius: 12px;">
                                          <table border="0" cellpadding="0" cellspacing="0" role="presentation">
                                            <tr>
                                              <td valign="middle">
                                                <img src="${baseUrl}/public/email-assets/image-17102359013265-4c1af5f3.png" width="38" height="38" alt="Email" 
                                                     style="display: block; width: 38px; height: 38px; border: 0;" />
                                              </td>
                                              <td valign="middle" style="padding-left: 12px;">
                                                <div style="line-height: 133%; letter-spacing: -0.2px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 18px; font-weight: 500; color: #1b1b1b;">
                                                  Email Us
                                                </div>
                                                <div style="font-size: 14px; line-height: 143%; color: #2a1e19; font-family: 'Outfit', Arial, Helvetica, sans-serif; letter-spacing: -0.2px;">
                                                  theceliacstore@gmail.com
                                                </div>
                                              </td>
                                            </tr>
                                          </table>
                                        </td>
                                      </tr>
                                    </table>
                                  </td>
                                  <td width="50%" valign="top" style="padding-left: 8px;">
                                    <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                      <tr>
                                        <td style="padding: 12px; background-color: #fcedd0; border-radius: 12px;">
                                          <table border="0" cellpadding="0" cellspacing="0" role="presentation">
                                            <tr>
                                              <td valign="middle">
                                                <img src="${baseUrl}/public/email-assets/image-17102359014306-18c6d4ff.png" width="38" height="38" alt="Phone" 
                                                     style="display: block; width: 38px; height: 38px; border: 0;" />
                                              </td>
                                              <td valign="middle" style="padding-left: 12px;">
                                                <div style="line-height: 133%; letter-spacing: -0.2px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 18px; font-weight: 500; color: #1b1b1b;">
                                                  Call Us
                                                </div>
                                                <div style="font-size: 14px; line-height: 143%; color: #2a1e19; font-family: 'Outfit', Arial, Helvetica, sans-serif; letter-spacing: -0.2px;">
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
                        
                        <!-- Business Section -->
                        <table width="600" border="0" cellspacing="0" cellpadding="0" role="presentation" align="center" style="width: 600px; max-width: 600px;">
                          <tr>
                            <td style="padding: 40px 40px 40px 40px; background-color: #fcedd0;" bgcolor="#fcedd0">
                              <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                <tr>
                                  <td align="center" valign="middle">
                                    <table border="0" cellpadding="0" cellspacing="0" role="presentation">
                                      <tr>
                                        <td valign="middle" style="padding-right: 16px;">
                                          <img src="${baseUrl}/public/email-assets/image-17102359016838-2317bf8d.png" width="80" height="80" alt="" 
                                               style="display: block; width: 80px; height: 80px; border-radius: 8px; border: 0;" />
                                        </td>
                                        <td valign="middle">
                                          <table border="0" cellpadding="0" cellspacing="0" role="presentation">
                                            <tr>
                                              <td style="padding: 0px 0px 4px 0px;">
                                                <div style="line-height: 150%; letter-spacing: -0.1px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 24px; font-weight: 500; color: #1b110c;">
                                                  Want to talk business with us?
                                                </div>
                                              </td>
                                            </tr>
                                            <tr>
                                              <td>
                                                <div style="font-size: 15px; line-height: 143%; color: #585858; font-family: 'Outfit', Arial, Helvetica, sans-serif; letter-spacing: 0px;">
                                                  Feel free to reach out to us at <strong style="color: #1a110c;">theceliacstore@gmail.com</strong>
                                                  <br/>We open opportunities for all forms of business collaboration
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
                        <table width="600" border="0" cellspacing="0" cellpadding="0" role="presentation" align="center" style="width: 600px; max-width: 600px;">
                          <tr>
                            <td style="background-color: #ffffff;" bgcolor="#ffffff">
                              <img src="${baseUrl}/public/email-assets/image-17102359016849-7afa6a57.png" width="600" height="auto" alt="" 
                                   style="display: block; outline: 0; line-height: 100%; -ms-interpolation-mode: bicubic; width: 100%; height: auto; border: 0;" />
                            </td>
                          </tr>
                        </table>
                        
                        <!-- Footer -->
                        <table width="600" border="0" cellspacing="0" cellpadding="0" role="presentation" align="center" style="width: 600px; max-width: 600px;">
                          <tr>
                            <td style="padding: 40px 40px 40px 40px; background-color: #1a110c;" bgcolor="#1a110c">
                              
                              <!-- Logo -->
                              <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                <tr>
                                  <td align="center" valign="top" style="padding: 0px 0px 20px 0px;">
                                    <img src="https://theceliacstore-fe-git-main-madhav-sethis-projects.vercel.app/_next/image?url=%2F193c7e94406b9a9160b8842fcba96582.png&w=384&q=75" width="164" height="41" alt="Celic Store" 
                                         style="display: block; outline: 0; line-height: 100%; width: 164px; height: auto; max-width: 100%; border: 0;" />
                                  </td>
                                </tr>
                              </table>
                              
                              <!-- Social -->
                              <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
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
                              <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                <tr>
                                  <td align="center" valign="top" style="padding: 0px 0px 14px 0px;">
                                    <div style="font-size: 14px; line-height: 143%; text-align: center; color: #ffffffcc; font-family: 'Outfit', Arial, Helvetica, sans-serif; letter-spacing: -0.2px;">
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
 * Generate order confirmation email for company
 * @param {Object} order - Order object
 * @param {Object} user - User object
 * @returns {string} HTML email content
 */
const generateCompanyOrderNotification = (order, user) => {
  const orderDate = new Date(order.createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  
  const orderTime = new Date(order.createdAt).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const itemsHTML = order.items
    .map(
      (item) => {
        const itemName = item.type === "product" ? item.product.name : item.bundle.name;
        const itemPrice = toNumber(item.discounted_total_amount);
        
        return `
        <tr>
          <td style="padding: 14px; border-bottom: 1px solid #e5e7eb;">
            <div style="font-weight: 600; color: #111827; font-size: 14px; margin-bottom: 4px;">
              ${itemName}
            </div>
            <div style="color: #6b7280; font-size: 12px;">
              ${item.type === "product" ? "📦 Product" : "🎁 Bundle"}
            </div>
          </td>
          <td style="padding: 14px; border-bottom: 1px solid #e5e7eb; text-align: center; color: #374151; font-weight: 500;">
            × ${item.quantity}
          </td>
          <td style="padding: 14px; border-bottom: 1px solid #e5e7eb; text-align: right; color: #111827; font-weight: 600;">
            ₹${itemPrice.toFixed(2)}
          </td>
        </tr>
      `;
      }
    )
    .join("");

  const subtotal = toNumber(order.discountedTotalAmount);
  const shipping = toNumber(order.shippingCost);
  const total = toNumber(order.finalTotalAmount);

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>New Order Alert - Celic Store Admin</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #f3f4f6; padding: 40px 0;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07); overflow: hidden; max-width: 600px;">
              
              <!-- Alert Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 32px; text-align: center;">
                  <div style="background-color: rgba(255,255,255,0.2); display: inline-block; padding: 12px; border-radius: 50%; margin-bottom: 12px;">
                    <span style="font-size: 40px;">🛒</span>
                  </div>
                  <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">
                    New Order Alert
                  </h1>
                  <p style="margin: 8px 0 0 0; color: #fecaca; font-size: 14px;">
                    Action Required - Process Order
                  </p>
                </td>
              </tr>
              
              <!-- Urgent Notice -->
              <tr>
                <td style="padding: 24px 32px;">
                  <div style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-radius: 12px; padding: 20px; border-left: 4px solid #f59e0b;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="50%">
                          <div style="font-size: 11px; color: #92400e; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; margin-bottom: 6px;">⚡ Order ID</div>
                          <div style="font-size: 18px; color: #78350f; font-weight: 800; font-family: 'Courier New', monospace;">#${order.orderNumber || order._id.toString().slice(-8).toUpperCase()}</div>
                        </td>
                        <td width="50%" align="right">
                          <div style="font-size: 11px; color: #92400e; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; margin-bottom: 6px;">💰 Total</div>
                          <div style="font-size: 24px; color: #78350f; font-weight: 800;">₹${total.toFixed(2)}</div>
                        </td>
                      </tr>
                    </table>
                  </div>
                </td>
              </tr>
              
              <!-- Customer Info -->
              <tr>
                <td style="padding: 0 32px 24px;">
                  <div style="background-color: #f9fafb; border-radius: 12px; padding: 20px; border: 1px solid #e5e7eb;">
                    <h3 style="margin: 0 0 16px 0; color: #111827; font-size: 16px; font-weight: 700; border-bottom: 2px solid #e5e7eb; padding-bottom: 12px;">
                      👤 Customer Information
                    </h3>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding: 8px 0; color: #6b7280; font-size: 13px; width: 100px;">Name</td>
                        <td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 600;">${user.name || "N/A"}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #6b7280; font-size: 13px;">Email</td>
                        <td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 500;">
                          <a href="mailto:${user.email}" style="color: #3b82f6; text-decoration: none;">${user.email || "N/A"}</a>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #6b7280; font-size: 13px;">Phone</td>
                        <td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 500;">
                          <a href="tel:${order.address.mobile}" style="color: #3b82f6; text-decoration: none;">${order.address.mobile}</a>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #6b7280; font-size: 13px;">Order Date</td>
                        <td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 500;">${orderDate} at ${orderTime}</td>
                      </tr>
                    </table>
                  </div>
                </td>
              </tr>
              
              <!-- Order Items -->
              <tr>
                <td style="padding: 0 32px 24px;">
                  <h3 style="margin: 0 0 16px 0; color: #111827; font-size: 18px; font-weight: 700;">
                    📦 Order Items
                  </h3>
                  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
                    <thead>
                      <tr style="background-color: #f9fafb;">
                        <th style="padding: 12px 14px; text-align: left; font-size: 12px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #e5e7eb;">Item</th>
                        <th style="padding: 12px 14px; text-align: center; font-size: 12px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #e5e7eb;">Qty</th>
                        <th style="padding: 12px 14px; text-align: right; font-size: 12px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #e5e7eb;">Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${itemsHTML}
                    </tbody>
                  </table>
                </td>
              </tr>
              
              <!-- Pricing Breakdown -->
              <tr>
                <td style="padding: 0 32px 24px;">
                  <div style="background-color: #f9fafb; border-radius: 12px; padding: 20px; border: 1px solid #e5e7eb;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Subtotal</td>
                        <td align="right" style="padding: 8px 0; color: #374151; font-size: 14px; font-weight: 500;">₹${subtotal.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">
                          Shipping ${order.shippingDetails?.isManual ? '<span style="color: #f59e0b; font-weight: 600; font-size: 11px;">(MANUAL)</span>' : '<span style="color: #10b981; font-size: 11px;">(AUTO)</span>'}
                        </td>
                        <td align="right" style="padding: 8px 0; color: #374151; font-size: 14px; font-weight: 500;">₹${shipping.toFixed(2)}</td>
                      </tr>
                      <tr style="border-top: 2px solid #d1d5db;">
                        <td style="padding: 16px 0 4px 0; color: #111827; font-size: 16px; font-weight: 700;">Total Amount</td>
                        <td align="right" style="padding: 16px 0 4px 0;">
                          <div style="font-size: 24px; font-weight: 800; color: #dc2626;">₹${total.toFixed(2)}</div>
                        </td>
                      </tr>
                    </table>
                  </div>
                </td>
              </tr>
              
              <!-- Shipping Address -->
              <tr>
                <td style="padding: 0 32px 24px;">
                  <h3 style="margin: 0 0 16px 0; color: #111827; font-size: 18px; font-weight: 700;">
                    📍 Shipping Address
                  </h3>
                  <div style="background-color: #f9fafb; border-radius: 12px; padding: 20px; border: 1px solid #e5e7eb;">
                    <div style="font-weight: 700; color: #111827; font-size: 15px; margin-bottom: 12px;">${order.address.name || ''}</div>
                    <div style="color: #4b5563; font-size: 14px; line-height: 1.7;">
                      ${formatAddress(order.address)}
                    </div>
                    ${order.address.landmark ? `<div style="color: #6b7280; font-size: 13px; margin-top: 8px;">Landmark: ${order.address.landmark}</div>` : ""}
                    <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
                      <div style="color: #374151; font-size: 14px; margin-bottom: 6px;">
                        <strong>📞 Primary:</strong> <a href="tel:${order.address.mobile}" style="color: #3b82f6; text-decoration: none; font-weight: 600;">${order.address.mobile}</a>
                      </div>
                      ${order.address.alternatePhone ? `
                      <div style="color: #374151; font-size: 14px;">
                        <strong>📱 Alternate:</strong> <a href="tel:${order.address.alternatePhone}" style="color: #3b82f6; text-decoration: none; font-weight: 600;">${order.address.alternatePhone}</a>
                      </div>
                      ` : ""}
                    </div>
                  </div>
                </td>
              </tr>
              
              ${order.shippingDetails ? `
              <!-- Shipping Details -->
              <tr>
                <td style="padding: 0 32px 24px;">
                  <div style="background-color: #eff6ff; border-radius: 12px; padding: 18px; border-left: 4px solid #3b82f6;">
                    <h4 style="margin: 0 0 12px 0; color: #1e40af; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
                      🚚 Shipping Details
                    </h4>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding: 6px 0; color: #1e3a8a; font-size: 13px;">Zone</td>
                        <td align="right" style="padding: 6px 0; color: #1e40af; font-size: 13px; font-weight: 600;">${order.shippingDetails.zoneName || "N/A"}</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #1e3a8a; font-size: 13px;">Pricing</td>
                        <td align="right" style="padding: 6px 0; color: #1e40af; font-size: 13px; font-weight: 600;">${order.shippingDetails.pricingType || "N/A"}</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #1e3a8a; font-size: 13px;">Override</td>
                        <td align="right" style="padding: 6px 0;">
                          ${order.shippingDetails.isManual 
                            ? '<span style="background-color: #fbbf24; color: #78350f; padding: 4px 12px; border-radius: 12px; font-size: 11px; font-weight: 700;">MANUAL</span>' 
                            : '<span style="background-color: #10b981; color: white; padding: 4px 12px; border-radius: 12px; font-size: 11px; font-weight: 700;">AUTO</span>'
                          }
                        </td>
                      </tr>
                    </table>
                  </div>
                </td>
              </tr>
              ` : ""}
              
              <!-- Action Required -->
              <tr>
                <td style="padding: 0 32px 32px;">
                  <div style="background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%); border-radius: 12px; padding: 24px; border-left: 4px solid #ef4444; text-align: center;">
                    <div style="font-size: 18px; font-weight: 700; color: #991b1b; margin-bottom: 8px;">
                      ⚡ Action Required
                    </div>
                    <p style="margin: 0; color: #7f1d1d; font-size: 14px; line-height: 1.6;">
                      Please process this order and update the status in the admin panel
                    </p>
                  </div>
                </td>
              </tr>
              
              <!-- Quick Stats -->
              <tr>
                <td style="padding: 0 32px 32px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td width="33%" style="text-align: center; padding: 16px; background-color: #f9fafb; border-radius: 8px;">
                        <div style="font-size: 24px; font-weight: 800; color: #111827; margin-bottom: 4px;">${order.items.length}</div>
                        <div style="font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Items</div>
                      </td>
                      <td width="4%"></td>
                      <td width="33%" style="text-align: center; padding: 16px; background-color: #f9fafb; border-radius: 8px;">
                        <div style="font-size: 24px; font-weight: 800; color: #111827; margin-bottom: 4px;">${order.items.reduce((sum, item) => sum + item.quantity, 0)}</div>
                        <div style="font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Qty</div>
                      </td>
                      <td width="4%"></td>
                      <td width="33%" style="text-align: center; padding: 16px; background-color: #f9fafb; border-radius: 8px;">
                        <div style="font-size: 20px; font-weight: 800; color: #dc2626; margin-bottom: 4px;">${order.status.toUpperCase()}</div>
                        <div style="font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Status</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              
              <!-- Order Items Section -->
              <tr>
                <td style="padding: 0 32px 32px;">
                  <h3 style="margin: 0 0 16px 0; color: #111827; font-size: 18px; font-weight: 700;">Order Items</h3>
                  <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
                    <thead>
                      <tr style="background-color: #f9fafb;">
                        <th style="padding: 12px 14px; text-align: left; font-size: 11px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Product</th>
                        <th style="padding: 12px 14px; text-align: center; font-size: 11px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Quantity</th>
                        <th style="padding: 12px 14px; text-align: right; font-size: 11px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${itemsHTML}
                    </tbody>
                  </table>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="background-color: #f9fafb; padding: 24px 32px; text-align: center; border-top: 1px solid #e5e7eb;">
                  <p style="margin: 0; color: #6b7280; font-size: 12px;">
                    This is an automated notification from Celic Store Admin System
                  </p>
                  <p style="margin: 12px 0 0 0; color: #9ca3af; font-size: 11px;">
                    Sent at ${new Date().toLocaleString()} • Order Management System
                  </p>
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

const generateCustomerOrderUpdate = (order, user) => {
  const orderDate = new Date(order.createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const subtotal = toNumber(order.discountedTotalAmount);
  const shipping = toNumber(order.shippingCost);
  const discount = toNumber(order.totalAmount) - toNumber(order.discountedTotalAmount);
  const total = toNumber(order.finalTotalAmount);
  const baseUrl = process.env.APP_URL || 'http://localhost:8000';

  // Generate items HTML
  const itemsHTML = order.items.map((item) => {
    const itemName = item.type === "product" ? item.product.name : item.bundle.name;
    const itemImage = item.type === "product" ? item.product.banner_image : (item.bundle.images && item.bundle.images[0]);
    const itemPrice = toNumber(item.discounted_total_amount);
    const itemDescription = item.type === "product" ? 
      (item.product.small_description || "Premium quality product") : 
      (item.bundle.description || "Premium bundle");
    
    return `
    <tr>
      <td class="pc-w620-width-100pc" align="left" valign="middle" style="padding: 0px 0px 8px 0px; width: 86px;">
        <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td align="left" valign="top">
              <img src="${itemImage || baseUrl + '/public/email-assets/image-17102359013263-56a04970.png'}" 
                   width="86" height="86" alt="${itemName}" 
                   style="display: block; outline: 0; line-height: 100%; -ms-interpolation-mode: bicubic; width: 86px; height: 86px; border-radius: 8px; border: 0;" />
            </td>
          </tr>
        </table>
      </td>
      <td align="left" valign="middle" style="padding: 10px 10px 10px 10px; height: auto;">
        <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td align="left" valign="top" style="padding: 0px 0px 4px 0px;">
              <div style="line-height: 28px; letter-spacing: -0px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 18px; font-weight: 600; color: #1b110c;">
                ${itemName}
              </div>
            </td>
          </tr>
          <tr>
            <td align="left" valign="top" style="padding: 0px 0px 4px 0px;">
              <div style="line-height: 24px; letter-spacing: -0px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 16px; font-weight: normal; color: #2a1e19cc;">
                ${itemDescription.substring(0, 50)}${itemDescription.length > 50 ? '...' : ''}
              </div>
            </td>
          </tr>
          <tr>
            <td align="left" valign="top" style="padding: 0px 0px 4px 0px;">
              <div style="line-height: 24px; letter-spacing: -0px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 14px; font-weight: normal; color: #2a1e19cc;">
                Qty: ${item.quantity}
              </div>
            </td>
          </tr>
          <tr>
            <td align="left" valign="top">
              <div style="line-height: 24px; letter-spacing: -0.2px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 18px; font-weight: 600; color: #039133;">
                ₹${itemPrice.toFixed(2)}
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
    <head>
      <meta charset="UTF-8" />
      <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
      <meta http-equiv="X-UA-Compatible" content="IE=edge" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta name="format-detection" content="telephone=no, date=no, address=no, email=no" />
      <link href="https://fonts.googleapis.com/css?family=Outfit:ital,wght@0,400;0,500;0,600" rel="stylesheet" />
      <title>Order Updated - Celic Store</title>
      <style>
        html, body { margin: 0 !important; padding: 0 !important; min-height: 100% !important; width: 100% !important; -webkit-font-smoothing: antialiased; }
        * { -ms-text-size-adjust: 100%; }
        table, td, th { mso-table-lspace: 0 !important; mso-table-rspace: 0 !important; border-collapse: collapse; }
        img { border: 0; outline: 0; line-height: 100%; text-decoration: none; -ms-interpolation-mode: bicubic; }
      </style>
    </head>
    <body style="width: 100% !important; min-height: 100% !important; margin: 0 !important; padding: 0 !important; font-weight: normal; color: #2D3A41; -webkit-font-smoothing: antialiased; background-color: #e3dad5;">
      <table style="table-layout: fixed; width: 100%; min-width: 600px; background-color: #e3dad5;" bgcolor="#e3dad5" border="0" cellspacing="0" cellpadding="0" role="presentation">
        <tr>
          <td align="center" valign="top">
            <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation">
              <tr>
                <td style="padding: 20px 0px 20px 0px;" align="left" valign="top">
                  <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%">
                    <tr>
                      <td valign="top">
                        
                        <!-- Header -->
                        <table width="600" border="0" cellspacing="0" cellpadding="0" role="presentation" align="center" style="width: 600px; max-width: 600px;">
                          <tr>
                            <td width="100%" border="0" cellspacing="0" cellpadding="0" role="presentation">
                              <table width="100%" align="center" border="0" cellspacing="0" cellpadding="0" role="presentation">
                                <tr>
                                  <td valign="top" style="padding: 24px 40px 40px 40px; background-color: #1a110c;" bgcolor="#1a110c">
                                    
                                    <!-- Logo -->
                                    <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                      <tr>
                                        <td align="center" valign="top" style="padding: 0px 0px 32px 0px;">
                                          <img src="https://theceliacstore-fe-git-main-madhav-sethis-projects.vercel.app/_next/image?url=%2F193c7e94406b9a9160b8842fcba96582.png&w=384&q=75" width="164" height="41" alt="Celic Store" 
                                               style="display: block; outline: 0; line-height: 100%; -ms-interpolation-mode: bicubic; width: 164px; height: auto; max-width: 100%; border: 0;" />
                                        </td>
                                      </tr>
                                    </table>
                                    
                                    <!-- Title -->
                                    <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                      <tr>
                                        <td align="center" valign="top" style="padding: 0px 0px 12px 0px;">
                                          <div style="line-height: 128%; letter-spacing: -0.2px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 38px; font-weight: 500; color: #ffffff; text-align: center;">
                                            Order Updated
                                          </div>
                                        </td>
                                      </tr>
                                    </table>
                                    
                                    <!-- Subtitle -->
                                    <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                      <tr>
                                        <td align="center" valign="top" style="padding: 0px 0px 12px 0px;">
                                          <div style="line-height: 156%; letter-spacing: -0.2px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 19px; font-weight: normal; color: #ffffffcc; text-align: center;">
                                            Your order has been updated. Please check the order details below.
                                          </div>
                                        </td>
                                      </tr>
                                    </table>
                                  
                                    
                                    <!-- Note -->
                                    <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                      <tr>
                                        <td align="center" valign="top" style="padding: 0px 0px 40px 0px;">
                                          <div style="line-height: 156%; letter-spacing: -0.2px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 16px; font-weight: normal; color: #ffffffb3; text-align: center;">
                                            Please check the order details below.
                                          </div>
                                        </td>
                                      </tr>
                                    </table>
                                    
                                    <!-- Summary Box -->
                                    <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #ffffff0d; border-radius: 8px;">
                                      <tr>
                                        <td style="padding: 20px;">
                                          <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                            <tr>
                                              <td valign="top" style="padding: 0px 0px 8px 0px;">
                                                <div style="line-height: 140%; letter-spacing: -0.2px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 20px; font-weight: 500; color: #ffcb65;">
                                                  Summary
                                                </div>
                                              </td>
                                            </tr>
                                            <tr>
                                              <td valign="top" style="padding: 0px 0px 8px 0px;">
                                                <div style="line-height: 140%; letter-spacing: -0px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 16px; font-weight: 500; color: #ff9065;">
                                                  ${order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                                                </div>
                                              </td>
                                            </tr>
                                            <tr>
                                              <td valign="top" style="padding: 0px 0px 8px 0px;">
                                                <div style="line-height: 140%; letter-spacing: -0px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 14px; font-weight: normal; color: #ffffffcc;">
                                                  #${order.orderNumber || order._id.toString().slice(-4).toUpperCase()} • ${orderDate}
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
                                          <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
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
                                                  ${order.address.name}
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
                                    
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>
                        
                        <!-- Ornament Top -->
                        <table width="600" border="0" cellspacing="0" cellpadding="0" role="presentation" align="center" style="width: 600px; max-width: 600px;">
                          <tr>
                            <td style="background-color: #ffffff;" bgcolor="#ffffff">
                              <img src="${baseUrl}/public/email-assets/image-17102359012892-013f76a5.png" width="600" height="auto" alt="" 
                                   style="display: block; outline: 0; line-height: 100%; -ms-interpolation-mode: bicubic; width: 100%; height: auto; border: 0;" />
                            </td>
                          </tr>
                        </table>
                        
                        <!-- Order Details -->
                        <table width="600" border="0" cellspacing="0" cellpadding="0" role="presentation" align="center" style="width: 600px; max-width: 600px;">
                          <tr>
                            <td style="padding: 40px 40px 24px 40px; background-color: #ffffff;" bgcolor="#ffffff">
                              
                              <!-- Title -->
                              <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                <tr>
                                  <td align="center" valign="top" style="padding: 0px 0px 4px 0px;">
                                    <div style="line-height: 128%; letter-spacing: -0.6px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 32px; font-weight: 500; color: #1b110c; text-align: center;">
                                      Your item in this order
                                    </div>
                                  </td>
                                </tr>
                              </table>
                              
                              <!-- Order Number -->
                              <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                <tr>
                                  <td align="center" valign="top" style="padding: 0px 0px 24px 0px;">
                                    <div style="line-height: 128%; letter-spacing: -0px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 16px; font-weight: normal; color: #2a1e19cc; text-align: center;">
                                      Order number: #${order.orderNumber || order._id.toString().slice(-4).toUpperCase()}
                                    </div>
                                  </td>
                                </tr>
                              </table>
                              
                              <!-- Items -->
                              <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                ${itemsHTML}
                              </table>
                              
                              <!-- Pricing -->
                              <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="margin-top: 8px;">
                                <tr>
                                  <td align="left" valign="middle" style="padding: 8px 0px;">
                                    <div style="line-height: 28px; letter-spacing: -0.2px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 16px; font-weight: normal; color: #1b110ccc;">
                                      Subtotal
                                    </div>
                                  </td>
                                  <td align="right" valign="middle" style="padding: 8px 0px;">
                                    <div style="line-height: 28px; letter-spacing: -0.2px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 16px; font-weight: 500; color: #19110d;">
                                      ₹${subtotal.toFixed(2)}
                                    </div>
                                  </td>
                                </tr>
                                ${discount > 0 ? `
                                <tr>
                                  <td align="left" valign="middle" style="padding: 8px 0px;">
                                    <div style="line-height: 28px; letter-spacing: -0.2px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 16px; font-weight: normal; color: #1b110ccc;">
                                      Discount
                                    </div>
                                  </td>
                                  <td align="right" valign="middle" style="padding: 8px 0px;">
                                    <div style="line-height: 28px; letter-spacing: -0.2px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 16px; font-weight: 500; color: #00af48;">
                                      -₹${discount.toFixed(2)}
                                    </div>
                                  </td>
                                </tr>
                                ` : ''}
                                <tr>
                                  <td align="left" valign="middle" style="padding: 8px 0px; border-bottom: 1px solid #e5e5e5;">
                                    <div style="line-height: 28px; letter-spacing: -0.2px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 16px; font-weight: normal; color: #1b110ccc;">
                                      ${shipping === 0 ? 'Delivery (FREE)' : 'Standard Delivery'}
                                    </div>
                                  </td>
                                  <td align="right" valign="middle" style="padding: 8px 0px; border-bottom: 1px solid #e5e5e5;">
                                    <div style="line-height: 28px; letter-spacing: -0.2px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 16px; font-weight: 500; color: ${shipping === 0 ? '#00af48' : '#19110d'};">
                                      ${shipping === 0 ? 'FREE' : '₹' + shipping.toFixed(2)}
                                    </div>
                                  </td>
                                </tr>
                                <tr>
                                  <td align="left" valign="middle" style="padding: 8px 0px;">
                                    <div style="line-height: 34px; letter-spacing: -0px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 18px; font-weight: 600; color: #1b110c;">
                                      Total:
                                    </div>
                                  </td>
                                  <td align="right" valign="middle" style="padding: 8px 0px;">
                                    <div style="line-height: 34px; letter-spacing: -0px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 18px; font-weight: 600; color: #1b110c;">
                                      ₹${total.toFixed(2)}
                                    </div>
                                  </td>
                                </tr>
                              </table>
                              
                            </td>
                          </tr>
                        </table>
                        
                        <!-- Contact Section -->
                        <table width="600" border="0" cellspacing="0" cellpadding="0" role="presentation" align="center" style="width: 600px; max-width: 600px;">
                          <tr>
                            <td style="padding: 10px 40px 20px 40px; background-color: #ffffff;" bgcolor="#ffffff">
                              
                              <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                <tr>
                                  <td align="center" valign="top" style="padding: 0px 0px 28px 0px;">
                                    <div style="line-height: 128%; letter-spacing: -0.6px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 32px; font-weight: 500; color: #1a110c; text-align: center;">
                                      Any problems with your order?
                                    </div>
                                  </td>
                                </tr>
                              </table>
                              
                              <!-- Contact Cards -->
                              <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                <tr>
                                  <td width="50%" valign="top" style="padding-right: 8px;">
                                    <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                      <tr>
                                        <td style="padding: 12px; background-color: #fcedd0; border-radius: 12px;">
                                          <table border="0" cellpadding="0" cellspacing="0" role="presentation">
                                            <tr>
                                              <td valign="middle">
                                                <img src="${baseUrl}/public/email-assets/image-17102359013265-4c1af5f3.png" width="38" height="38" alt="Email" 
                                                     style="display: block; width: 38px; height: 38px; border: 0;" />
                                              </td>
                                              <td valign="middle" style="padding-left: 12px;">
                                                <div style="line-height: 133%; letter-spacing: -0.2px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 18px; font-weight: 500; color: #1b1b1b;">
                                                  Email Us
                                                </div>
                                                <div style="font-size: 14px; line-height: 143%; color: #2a1e19; font-family: 'Outfit', Arial, Helvetica, sans-serif; letter-spacing: -0.2px;">
                                                  theceliacstore@gmail.com
                                                </div>
                                              </td>
                                            </tr>
                                          </table>
                                        </td>
                                      </tr>
                                    </table>
                                  </td>
                                  <td width="50%" valign="top" style="padding-left: 8px;">
                                    <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                      <tr>
                                        <td style="padding: 12px; background-color: #fcedd0; border-radius: 12px;">
                                          <table border="0" cellpadding="0" cellspacing="0" role="presentation">
                                            <tr>
                                              <td valign="middle">
                                                <img src="${baseUrl}/public/email-assets/image-17102359014306-18c6d4ff.png" width="38" height="38" alt="Phone" 
                                                     style="display: block; width: 38px; height: 38px; border: 0;" />
                                              </td>
                                              <td valign="middle" style="padding-left: 12px;">
                                                <div style="line-height: 133%; letter-spacing: -0.2px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 18px; font-weight: 500; color: #1b1b1b;">
                                                  Call Us
                                                </div>
                                                <div style="font-size: 14px; line-height: 143%; color: #2a1e19; font-family: 'Outfit', Arial, Helvetica, sans-serif; letter-spacing: -0.2px;">
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
                        
                        <!-- Business Section -->
                        <table width="600" border="0" cellspacing="0" cellpadding="0" role="presentation" align="center" style="width: 600px; max-width: 600px;">
                          <tr>
                            <td style="padding: 40px 40px 40px 40px; background-color: #fcedd0;" bgcolor="#fcedd0">
                              <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                <tr>
                                  <td align="center" valign="middle">
                                    <table border="0" cellpadding="0" cellspacing="0" role="presentation">
                                      <tr>
                                        <td valign="middle" style="padding-right: 16px;">
                                          <img src="${baseUrl}/public/email-assets/image-17102359016838-2317bf8d.png" width="80" height="80" alt="" 
                                               style="display: block; width: 80px; height: 80px; border-radius: 8px; border: 0;" />
                                        </td>
                                        <td valign="middle">
                                          <table border="0" cellpadding="0" cellspacing="0" role="presentation">
                                            <tr>
                                              <td style="padding: 0px 0px 4px 0px;">
                                                <div style="line-height: 150%; letter-spacing: -0.1px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 24px; font-weight: 500; color: #1b110c;">
                                                  Want to talk business with us?
                                                </div>
                                              </td>
                                            </tr>
                                            <tr>
                                              <td>
                                                <div style="font-size: 15px; line-height: 143%; color: #585858; font-family: 'Outfit', Arial, Helvetica, sans-serif; letter-spacing: 0px;">
                                                  Feel free to reach out to us at <strong style="color: #1a110c;">theceliacstore@gmail.com</strong>
                                                  <br/>We open opportunities for all forms of business collaboration
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
                        <table width="600" border="0" cellspacing="0" cellpadding="0" role="presentation" align="center" style="width: 600px; max-width: 600px;">
                          <tr>
                            <td style="background-color: #ffffff;" bgcolor="#ffffff">
                              <img src="${baseUrl}/public/email-assets/image-17102359016849-7afa6a57.png" width="600" height="auto" alt="" 
                                   style="display: block; outline: 0; line-height: 100%; -ms-interpolation-mode: bicubic; width: 100%; height: auto; border: 0;" />
                            </td>
                          </tr>
                        </table>
                        
                        <!-- Footer -->
                        <table width="600" border="0" cellspacing="0" cellpadding="0" role="presentation" align="center" style="width: 600px; max-width: 600px;">
                          <tr>
                            <td style="padding: 40px 40px 40px 40px; background-color: #1a110c;" bgcolor="#1a110c">
                              
                              <!-- Logo -->
                              <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                <tr>
                                  <td align="center" valign="top" style="padding: 0px 0px 20px 0px;">
                                    <img src="https://theceliacstore-fe-git-main-madhav-sethis-projects.vercel.app/_next/image?url=%2F193c7e94406b9a9160b8842fcba96582.png&w=384&q=75" width="164" height="41" alt="Celic Store" 
                                         style="display: block; outline: 0; line-height: 100%; width: 164px; height: auto; max-width: 100%; border: 0;" />
                                  </td>
                                </tr>
                              </table>
                              
                              <!-- Social -->
                              <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
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
                              <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                                <tr>
                                  <td align="center" valign="top" style="padding: 0px 0px 14px 0px;">
                                    <div style="font-size: 14px; line-height: 143%; text-align: center; color: #ffffffcc; font-family: 'Outfit', Arial, Helvetica, sans-serif; letter-spacing: -0.2px;">
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

const generateCompanyOrderUpdate = (order, user) => {
  const orderDate = new Date(order.createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  
  const orderTime = new Date(order.createdAt).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const itemsHTML = order.items
    .map(
      (item) => {
        const itemName = item.type === "product" ? item.product.name : item.bundle.name;
        const itemPrice = toNumber(item.discounted_total_amount);
        
        return `
        <tr>
          <td style="padding: 14px; border-bottom: 1px solid #e5e7eb;">
            <div style="font-weight: 600; color: #111827; font-size: 14px; margin-bottom: 4px;">
              ${itemName}
            </div>
            <div style="color: #6b7280; font-size: 12px;">
              ${item.type === "product" ? "📦 Product" : "🎁 Bundle"}
            </div>
          </td>
          <td style="padding: 14px; border-bottom: 1px solid #e5e7eb; text-align: center; color: #374151; font-weight: 500;">
            × ${item.quantity}
          </td>
          <td style="padding: 14px; border-bottom: 1px solid #e5e7eb; text-align: right; color: #111827; font-weight: 600;">
            ₹${itemPrice.toFixed(2)}
          </td>
        </tr>
      `;
      }
    )
    .join("");

  const subtotal = toNumber(order.discountedTotalAmount);
  const shipping = toNumber(order.shippingCost);
  const total = toNumber(order.finalTotalAmount);

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Order Updated Alert - Celic Store Admin</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #f3f4f6; padding: 40px 0;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07); overflow: hidden; max-width: 600px;">
              
              <!-- Alert Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 32px; text-align: center;">
                  <div style="background-color: rgba(255,255,255,0.2); display: inline-block; padding: 12px; border-radius: 50%; margin-bottom: 12px;">
                    <span style="font-size: 40px;">🛒</span>
                  </div>
                  <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">
                    Order Updated Alert
                  </h1>
                  <p style="margin: 8px 0 0 0; color: #fecaca; font-size: 14px;">
                    Action Required - Update Order
                  </p>
                </td>
              </tr>
              
              <!-- Urgent Notice -->
              <tr>
                <td style="padding: 24px 32px;">
                  <div style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-radius: 12px; padding: 20px; border-left: 4px solid #f59e0b;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="50%">
                          <div style="font-size: 11px; color: #92400e; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; margin-bottom: 6px;">⚡ Order ID</div>
                          <div style="font-size: 18px; color: #78350f; font-weight: 800; font-family: 'Courier New', monospace;">#${order.orderNumber || order._id.toString().slice(-8).toUpperCase()}</div>
                        </td>
                        <td width="50%" align="right">
                          <div style="font-size: 11px; color: #92400e; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; margin-bottom: 6px;">💰 Total</div>
                          <div style="font-size: 24px; color: #78350f; font-weight: 800;">₹${total.toFixed(2)}</div>
                        </td>
                      </tr>
                    </table>
                  </div>
                </td>
              </tr>
              
              <!-- Customer Info -->
              <tr>
                <td style="padding: 0 32px 24px;">
                  <div style="background-color: #f9fafb; border-radius: 12px; padding: 20px; border: 1px solid #e5e7eb;">
                    <h3 style="margin: 0 0 16px 0; color: #111827; font-size: 16px; font-weight: 700; border-bottom: 2px solid #e5e7eb; padding-bottom: 12px;">
                      👤 Customer Information
                    </h3>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding: 8px 0; color: #6b7280; font-size: 13px; width: 100px;">Name</td>
                        <td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 600;">${user.name || "N/A"}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #6b7280; font-size: 13px;">Email</td>
                        <td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 500;">
                          <a href="mailto:${user.email}" style="color: #3b82f6; text-decoration: none;">${user.email || "N/A"}</a>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #6b7280; font-size: 13px;">Phone</td>
                        <td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 500;">
                          <a href="tel:${order.address.mobile}" style="color: #3b82f6; text-decoration: none;">${order.address.mobile}</a>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #6b7280; font-size: 13px;">Order Date</td>
                        <td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 500;">${orderDate} at ${orderTime}</td>
                      </tr>
                    </table>
                  </div>
                </td>
              </tr>
              
              <!-- Order Items -->
              <tr>
                <td style="padding: 0 32px 24px;">
                  <h3 style="margin: 0 0 16px 0; color: #111827; font-size: 18px; font-weight: 700;">
                    📦 Order Items
                  </h3>
                  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
                    <thead>
                      <tr style="background-color: #f9fafb;">
                        <th style="padding: 12px 14px; text-align: left; font-size: 12px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #e5e7eb;">Item</th>
                        <th style="padding: 12px 14px; text-align: center; font-size: 12px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #e5e7eb;">Qty</th>
                        <th style="padding: 12px 14px; text-align: right; font-size: 12px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #e5e7eb;">Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${itemsHTML}
                    </tbody>
                  </table>
                </td>
              </tr>
              
              <!-- Pricing Breakdown -->
              <tr>
                <td style="padding: 0 32px 24px;">
                  <div style="background-color: #f9fafb; border-radius: 12px; padding: 20px; border: 1px solid #e5e7eb;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Subtotal</td>
                        <td align="right" style="padding: 8px 0; color: #374151; font-size: 14px; font-weight: 500;">₹${subtotal.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">
                          Shipping ${order.shippingDetails?.isManual ? '<span style="color: #f59e0b; font-weight: 600; font-size: 11px;">(MANUAL)</span>' : '<span style="color: #10b981; font-size: 11px;">(AUTO)</span>'}
                        </td>
                        <td align="right" style="padding: 8px 0; color: #374151; font-size: 14px; font-weight: 500;">₹${shipping.toFixed(2)}</td>
                      </tr>
                      <tr style="border-top: 2px solid #d1d5db;">
                        <td style="padding: 16px 0 4px 0; color: #111827; font-size: 16px; font-weight: 700;">Total Amount</td>
                        <td align="right" style="padding: 16px 0 4px 0;">
                          <div style="font-size: 24px; font-weight: 800; color: #dc2626;">₹${total.toFixed(2)}</div>
                        </td>
                      </tr>
                    </table>
                  </div>
                </td>
              </tr>
              
              <!-- Shipping Address -->
              <tr>
                <td style="padding: 0 32px 24px;">
                  <h3 style="margin: 0 0 16px 0; color: #111827; font-size: 18px; font-weight: 700;">
                    📍 Shipping Address
                  </h3>
                  <div style="background-color: #f9fafb; border-radius: 12px; padding: 20px; border: 1px solid #e5e7eb;">
                    <div style="font-weight: 700; color: #111827; font-size: 15px; margin-bottom: 12px;">${order.address.name || ''}</div>
                    <div style="color: #4b5563; font-size: 14px; line-height: 1.7;">
                      ${formatAddress(order.address)}
                    </div>
                    ${order.address.landmark ? `<div style="color: #6b7280; font-size: 13px; margin-top: 8px;">Landmark: ${order.address.landmark}</div>` : ""}
                    <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
                      <div style="color: #374151; font-size: 14px; margin-bottom: 6px;">
                        <strong>📞 Primary:</strong> <a href="tel:${order.address.mobile}" style="color: #3b82f6; text-decoration: none; font-weight: 600;">${order.address.mobile}</a>
                      </div>
                      ${order.address.alternatePhone ? `
                      <div style="color: #374151; font-size: 14px;">
                        <strong>📱 Alternate:</strong> <a href="tel:${order.address.alternatePhone}" style="color: #3b82f6; text-decoration: none; font-weight: 600;">${order.address.alternatePhone}</a>
                      </div>
                      ` : ""}
                    </div>
                  </div>
                </td>
              </tr>
              
              ${order.shippingDetails ? `
              <!-- Shipping Details -->
              <tr>
                <td style="padding: 0 32px 24px;">
                  <div style="background-color: #eff6ff; border-radius: 12px; padding: 18px; border-left: 4px solid #3b82f6;">
                    <h4 style="margin: 0 0 12px 0; color: #1e40af; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
                      🚚 Shipping Details
                    </h4>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding: 6px 0; color: #1e3a8a; font-size: 13px;">Zone</td>
                        <td align="right" style="padding: 6px 0; color: #1e40af; font-size: 13px; font-weight: 600;">${order.shippingDetails.zoneName || "N/A"}</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #1e3a8a; font-size: 13px;">Pricing</td>
                        <td align="right" style="padding: 6px 0; color: #1e40af; font-size: 13px; font-weight: 600;">${order.shippingDetails.pricingType || "N/A"}</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #1e3a8a; font-size: 13px;">Override</td>
                        <td align="right" style="padding: 6px 0;">
                          ${order.shippingDetails.isManual 
                            ? '<span style="background-color: #fbbf24; color: #78350f; padding: 4px 12px; border-radius: 12px; font-size: 11px; font-weight: 700;">MANUAL</span>' 
                            : '<span style="background-color: #10b981; color: white; padding: 4px 12px; border-radius: 12px; font-size: 11px; font-weight: 700;">AUTO</span>'
                          }
                        </td>
                      </tr>
                    </table>
                  </div>
                </td>
              </tr>
              ` : ""}
              
              <!-- Action Required -->
              <tr>
                <td style="padding: 0 32px 32px;">
                  <div style="background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%); border-radius: 12px; padding: 24px; border-left: 4px solid #ef4444; text-align: center;">
                    <div style="font-size: 18px; font-weight: 700; color: #991b1b; margin-bottom: 8px;">
                      ⚡ Action Required
                    </div>
                    <p style="margin: 0; color: #7f1d1d; font-size: 14px; line-height: 1.6;">
                      Please process this order and update the status in the admin panel
                    </p>
                  </div>
                </td>
              </tr>
              
              <!-- Quick Stats -->
              <tr>
                <td style="padding: 0 32px 32px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td width="33%" style="text-align: center; padding: 16px; background-color: #f9fafb; border-radius: 8px;">
                        <div style="font-size: 24px; font-weight: 800; color: #111827; margin-bottom: 4px;">${order.items.length}</div>
                        <div style="font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Items</div>
                      </td>
                      <td width="4%"></td>
                      <td width="33%" style="text-align: center; padding: 16px; background-color: #f9fafb; border-radius: 8px;">
                        <div style="font-size: 24px; font-weight: 800; color: #111827; margin-bottom: 4px;">${order.items.reduce((sum, item) => sum + item.quantity, 0)}</div>
                        <div style="font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Qty</div>
                      </td>
                      <td width="4%"></td>
                      <td width="33%" style="text-align: center; padding: 16px; background-color: #f9fafb; border-radius: 8px;">
                        <div style="font-size: 20px; font-weight: 800; color: #dc2626; margin-bottom: 4px;">${order.status.toUpperCase()}</div>
                        <div style="font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Status</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              
              <!-- Order Items Section -->
              <tr>
                <td style="padding: 0 32px 32px;">
                  <h3 style="margin: 0 0 16px 0; color: #111827; font-size: 18px; font-weight: 700;">Order Items</h3>
                  <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
                    <thead>
                      <tr style="background-color: #f9fafb;">
                        <th style="padding: 12px 14px; text-align: left; font-size: 11px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Product</th>
                        <th style="padding: 12px 14px; text-align: center; font-size: 11px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Quantity</th>
                        <th style="padding: 12px 14px; text-align: right; font-size: 11px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${itemsHTML}
                    </tbody>
                  </table>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="background-color: #f9fafb; padding: 24px 32px; text-align: center; border-top: 1px solid #e5e7eb;">
                  <p style="margin: 0; color: #6b7280; font-size: 12px;">
                    This is an automated notification from Celic Store Admin System
                  </p>
                  <p style="margin: 12px 0 0 0; color: #9ca3af; font-size: 11px;">
                    Sent at ${new Date().toLocaleString()} • Order Management System
                  </p>
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

module.exports = {
  generateCustomerOrderConfirmation,
  generateCompanyOrderNotification,
  generateCustomerOrderUpdate,
  generateCompanyOrderUpdate,
};

