/**
 * Generate forgot password email
 * @param {Object} user - User object
 * @param {string} newPassword - New generated password
 * @returns {string} HTML email content
 */
const generateForgotPasswordEmail = (user, newPassword) => {
  const baseUrl = process.env.APP_URL || 'http://localhost:8000';
  const resetDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return `
    <!DOCTYPE html>
    <html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
    <head>
      <meta charset="UTF-8" />
      <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
      <meta http-equiv="X-UA-Compatible" content="IE=edge" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <link href="https://fonts.googleapis.com/css?family=Outfit:ital,wght@0,400;0,500;0,600" rel="stylesheet" />
      <title>Password Reset - Celic Store</title>
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
                                    <img src="https://theceliacstore-fe-git-main-madhav-sethis-projects.vercel.app/_next/image?url=%2Fceliac-brand-logo.png&w=384&q=75" width="164" height="41" alt="Celic Store" 
                                         style="display: block; width: 164px; height: auto; max-width: 100%; border: 0;" />
                                  </td>
                                </tr>
                              </table>
                              
                              <!-- Title -->
                              <table width="100%" border="0" cellpadding="0" cellspacing="0">
                                <tr>
                                  <td align="center" valign="top" style="padding: 0px 0px 12px 0px;">
                                    <div style="line-height: 128%; letter-spacing: -0.2px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 38px; font-weight: 500; color: #ffffff; text-align: center;">
                                      Password Reset 🔐
                                    </div>
                                  </td>
                                </tr>
                              </table>
                              
                              <!-- Subtitle -->
                              <table width="100%" border="0" cellpadding="0" cellspacing="0">
                                <tr>
                                  <td align="center" valign="top" style="padding: 0px 0px 20px 0px;">
                                    <div style="line-height: 156%; letter-spacing: -0.2px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 19px; font-weight: normal; color: #ffffffcc; text-align: center;">
                                      Your password has been successfully reset
                                    </div>
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
                              
                              <!-- Greeting -->
                              <table width="100%" border="0" cellpadding="0" cellspacing="0">
                                <tr>
                                  <td valign="top" style="padding: 0px 0px 20px 0px;">
                                    <div style="line-height: 140%; letter-spacing: -0.2px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 18px; font-weight: 500; color: #1a110c;">
                                      Hi ${user.name || 'there'},
                                    </div>
                                  </td>
                                </tr>
                              </table>
                              
                              <!-- Message -->
                              <table width="100%" border="0" cellpadding="0" cellspacing="0">
                                <tr>
                                  <td valign="top" style="padding: 0px 0px 24px 0px;">
                                    <div style="line-height: 156%; letter-spacing: -0.2px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 16px; font-weight: normal; color: #2a1e19;">
                                      We received a request to reset your password. Your account has been secured with a new temporary password.
                                    </div>
                                  </td>
                                </tr>
                              </table>
                              
                              <!-- New Password Box -->
                              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                                <tr>
                                  <td style="padding: 28px; background-color: #fcedd0; border-radius: 12px; border-left: 4px solid #ffcb65;">
                                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                                      <tr>
                                        <td align="center" valign="top" style="padding: 0px 0px 12px 0px;">
                                          <div style="line-height: 140%; letter-spacing: -0.2px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 14px; font-weight: 600; color: #2a1e19; text-transform: uppercase;">
                                            Your New Temporary Password
                                          </div>
                                        </td>
                                      </tr>
                                      <tr>
                                        <td align="center" valign="top" style="padding: 12px 20px; background-color: #ffffff; border-radius: 8px;">
                                          <div style="line-height: 140%; letter-spacing: 2px; font-family: 'Courier New', monospace; font-size: 24px; font-weight: 700; color: #1a110c;">
                                            ${newPassword}
                                          </div>
                                        </td>
                                      </tr>
                                    </table>
                                  </td>
                                </tr>
                              </table>
                              
                              <!-- Instructions -->
                              <table width="100%" border="0" cellpadding="0" cellspacing="0">
                                <tr>
                                  <td style="padding: 20px; background-color: #e3f2fd; border-radius: 12px; border-left: 4px solid #5ec4ff;">
                                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                                      <tr>
                                        <td valign="top" style="padding: 0px 0px 12px 0px;">
                                          <div style="line-height: 140%; letter-spacing: -0.2px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 16px; font-weight: 600; color: #1a110c;">
                                            🔒 Important Security Steps:
                                          </div>
                                        </td>
                                      </tr>
                                      <tr>
                                        <td valign="top" style="padding: 0px 0px 8px 0px;">
                                          <div style="line-height: 156%; letter-spacing: -0.2px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 14px; font-weight: normal; color: #2a1e19;">
                                            1. Use the password above to log in to your account<br>
                                            2. Change your password immediately after logging in<br>
                                            3. Choose a strong, unique password<br>
                                            4. Do not share this password with anyone
                                          </div>
                                        </td>
                                      </tr>
                                    </table>
                                  </td>
                                </tr>
                              </table>
                              
                              <!-- Login Button -->
                              <table width="100%" border="0" cellpadding="0" cellspacing="0">
                                <tr>
                                  <td align="center" style="padding: 32px 0px 24px 0px;">
                                    <a style="display: inline-block; border-radius: 126px; background-color: #ffcb65; padding: 14px 32px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-weight: 600; font-size: 16px; line-height: 150%; letter-spacing: -0.2px; color: #1a110c; text-align: center; text-decoration: none;" 
                                       href="${baseUrl}/login">
                                      Log In to Your Account
                                    </a>
                                  </td>
                                </tr>
                              </table>
                              
                              <!-- Security Notice -->
                              <table width="100%" border="0" cellpadding="0" cellspacing="0">
                                <tr>
                                  <td style="padding: 20px; background-color: #fff3cd; border-radius: 12px; border-left: 4px solid #ff9065;">
                                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                                      <tr>
                                        <td valign="top" style="padding: 0px 0px 8px 0px;">
                                          <div style="line-height: 140%; letter-spacing: -0.2px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 14px; font-weight: 600; color: #2a1e19;">
                                            ⚠️ Didn't request this?
                                          </div>
                                        </td>
                                      </tr>
                                      <tr>
                                        <td valign="top">
                                          <div style="line-height: 156%; letter-spacing: -0.2px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 14px; font-weight: normal; color: #2a1e19;">
                                            If you didn't request a password reset, please contact our support team immediately. Your account security is our priority.
                                          </div>
                                        </td>
                                      </tr>
                                    </table>
                                  </td>
                                </tr>
                              </table>
                              
                              <!-- Footer Note -->
                              <table width="100%" border="0" cellpadding="0" cellspacing="0">
                                <tr>
                                  <td valign="top" style="padding: 24px 0px 0px 0px;">
                                    <div style="line-height: 156%; letter-spacing: -0.2px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 13px; font-weight: normal; color: #6b7280; text-align: center;">
                                      Password reset requested on ${resetDate}
                                    </div>
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
                                    <div style="line-height: 128%; letter-spacing: -0.6px; font-family: 'Outfit', Arial, Helvetica, sans-serif; font-size: 28px; font-weight: 500; color: #1a110c; text-align: center;">
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
  generateForgotPasswordEmail,
};

