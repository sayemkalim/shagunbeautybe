const { toNumber } = require('../emailHelpers');

/**
 * Generate welcome email for new user
 * @param {Object} user - User object
 * @returns {string} HTML email content
 */
const generateWelcomeEmail = (user) => {
  const joinDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const baseUrl = process.env.APP_URL || 'http://localhost:8000';

  return `
    <!DOCTYPE html>
    <html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
    <head>
      <meta charset="UTF-8" />
      <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
      <meta http-equiv="X-UA-Compatible" content="IE=edge" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <link href="https://fonts.googleapis.com/css?family=Outfit:ital,wght@0,400;0,500;0,600" rel="stylesheet" />
      <title>Welcome to Celic Store!</title>
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
                                    <img src="https://theceliacstore-fe-git-main-madhav-sethis-projects.vercel.app/_next/image?url=%2F193c7e94406b9a9160b8842fcba96582.png&w=384&q=75" width="164" height="41" alt="Celic Store" 
                                         style="display: block; width: 164px; height: auto; max-width: 100%; border: 0;" />
                                  </td>
                                </tr>
                              </table>
                              
                              <!-- Title -->
                              <table width="100%" border="0" cellpadding="0" cellspacing="0">
                                <tr>
                                  <td align="center" valign="top" style="padding: 0px 0px 12px 0px;">
                                    <div style="line-height: 128%; letter-spacing: -0.2px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 38px; font-weight: 500; color: #ffffff; text-align: center;">
                                      Welcome to Celic Store! 🎉
                                    </div>
                                  </td>
                                </tr>
                              </table>
                              
                              <!-- Subtitle -->
                              <table width="100%" border="0" cellpadding="0" cellspacing="0">
                                <tr>
                                  <td align="center" valign="top" style="padding: 0px 0px 12px 0px;">
                                    <div style="line-height: 156%; letter-spacing: -0.2px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 19px; font-weight: normal; color: #ffffffcc; text-align: center;">
                                      Your account has been created successfully
                                    </div>
                                  </td>
                                </tr>
                              </table>
                              
                              <!-- Welcome Button -->
                              <table width="100%" border="0" cellpadding="0" cellspacing="0">
                                <tr>
                                  <td align="center" style="padding: 0px 0px 16px 0px;">
                                    <a style="display: inline-block; border-radius: 126px; background-color: #ffcb65; padding: 12px 24px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-weight: 600; font-size: 16px; line-height: 150%; letter-spacing: -0.2px; color: #1a110c; text-align: center; text-decoration: none;" 
                                       href="${baseUrl}/products">
                                      Start Shopping Now
                                    </a>
                                  </td>
                                </tr>
                              </table>
                              
                              <!-- Account Summary Box -->
                              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #ffffff0d; border-radius: 8px; margin-top: 24px;">
                                <tr>
                                  <td style="padding: 20px;">
                                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                                      <tr>
                                        <td valign="top" style="padding: 0px 0px 8px 0px;">
                                          <div style="line-height: 140%; letter-spacing: -0.2px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 20px; font-weight: 500; color: #ffcb65;">
                                            Account Details
                                          </div>
                                        </td>
                                      </tr>
                                      <tr>
                                        <td valign="top" style="padding: 0px 0px 8px 0px;">
                                          <div style="line-height: 140%; letter-spacing: -0px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 16px; font-weight: 600; color: #ffffff;">
                                            ${user.name || "N/A"}
                                          </div>
                                        </td>
                                      </tr>
                                      <tr>
                                        <td valign="top" style="padding: 0px 0px 8px 0px;">
                                          <div style="line-height: 140%; letter-spacing: -0px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 14px; font-weight: normal; color: #ffffffcc;">
                                            ${user.email}
                                          </div>
                                        </td>
                                      </tr>
                                      <tr>
                                        <td valign="top">
                                          <div style="line-height: 140%; letter-spacing: -0px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 14px; font-weight: normal; color: #ffffffcc;">
                                            Joined ${joinDate}
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
                        
                        <!-- Ornament Top -->
                        <table width="600" border="0" cellspacing="0" cellpadding="0" align="center" style="width: 600px; max-width: 600px;">
                          <tr>
                            <td style="background-color: #ffffff;" bgcolor="#ffffff">
                              <img src="${baseUrl}/public/email-assets/image-17102359012892-013f76a5.png" width="600" height="auto" alt="" 
                                   style="display: block; width: 100%; height: auto; border: 0;" />
                            </td>
                          </tr>
                        </table>
                        
                        <!-- Main Content -->
                        <table width="600" border="0" cellspacing="0" cellpadding="0" align="center" style="width: 600px; max-width: 600px;">
                          <tr>
                            <td style="padding: 40px 40px; background-color: #ffffff;" bgcolor="#ffffff">
                              
                              <!-- Welcome Message -->
                              <table width="100%" border="0" cellpadding="0" cellspacing="0">
                                <tr>
                                  <td align="center" valign="top" style="padding: 0px 0px 28px 0px;">
                                    <div style="line-height: 128%; letter-spacing: -0.6px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 32px; font-weight: 500; color: #1a110c; text-align: center;">
                                      What's Next?
                                    </div>
                                  </td>
                                </tr>
                              </table>
                              
                              <!-- Feature Cards -->
                              <table width="100%" border="0" cellpadding="0" cellspacing="0">
                                <tr>
                                  <td width="50%" valign="top" style="padding-right: 8px;">
                                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                                      <tr>
                                        <td style="padding: 12px; background-color: #fcedd0; border-radius: 12px;">
                                          <table border="0" cellpadding="0" cellspacing="0">
                                            <tr>
                                              <td valign="middle">
                                                <div style="font-size: 32px; margin-right: 12px;">🛍️</div>
                                              </td>
                                              <td valign="middle">
                                                <div style="line-height: 133%; letter-spacing: -0.2px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 18px; font-weight: 500; color: #1b1b1b;">
                                                  Start Shopping
                                                </div>
                                                <div style="font-size: 14px; line-height: 143%; color: #2a1e19; font-family: 'Outfit', Arial, Helvetica, sans-serif;">
                                                  Browse our premium collection
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
                                                <div style="font-size: 32px; margin-right: 12px;">🎁</div>
                                              </td>
                                              <td valign="middle">
                                                <div style="line-height: 133%; letter-spacing: -0.2px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 18px; font-weight: 500; color: #1b1b1b;">
                                                  Special Offers
                                                </div>
                                                <div style="font-size: 14px; line-height: 143%; color: #2a1e19; font-family: 'Outfit', Arial, Helvetica, sans-serif;">
                                                  Get exclusive deals
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
                        
                        <!-- Contact Section -->
                        <table width="600" border="0" cellspacing="0" cellpadding="0" align="center" style="width: 600px; max-width: 600px;">
                          <tr>
                            <td style="padding: 0px 40px 40px 40px; background-color: #ffffff;" bgcolor="#ffffff">
                              
                              <table width="100%" border="0" cellpadding="0" cellspacing="0">
                                <tr>
                                  <td align="center" valign="top" style="padding: 0px 0px 28px 0px;">
                                    <div style="line-height: 128%; letter-spacing: -0.6px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 32px; font-weight: 500; color: #1a110c; text-align: center;">
                                      Need Help?
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
                                    <img src="https://theceliacstore-fe-git-main-madhav-sethis-projects.vercel.app/_next/image?url=%2F193c7e94406b9a9160b8842fcba96582.png&w=384&q=75" width="164" height="41" alt="Celic Store" 
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

module.exports = {
  generateWelcomeEmail,
};

