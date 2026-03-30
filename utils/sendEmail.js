// ═══════════════════════════════════════════════
//  utils/sendEmail.js  —  Email Sender (Nodemailer)
//
//  Uses Gmail SMTP with an App Password.
//  Sends styled HTML email with the reset link.
// ═══════════════════════════════════════════════
const nodemailer = require("nodemailer");

/**
 * sendResetEmail
 * Sends the password reset email to the user.
 *
 * @param {string} toEmail    - recipient's email address
 * @param {string} username   - recipient's name (for personalisation)
 * @param {string} resetUrl   - full reset link to embed in the email
 */
const sendResetEmail = async (toEmail, username, resetUrl) => {
  // ── Build Transporter ─────────────────────
  // This is the SMTP connection config.
  // For Gmail, use an App Password (not your real password).
  // How to get one: Google Account → Security → 2FA → App Passwords → Generate
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,   // smtp.gmail.com
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: false,                  // false = STARTTLS on port 587
    auth: {
      user: process.env.EMAIL_USER, // your Gmail address
      pass: process.env.EMAIL_PASS, // 16-char App Password
    },
  });

  // ── Styled HTML Email Body ────────────────
  // Professional-looking email using inline styles (email clients strip CSS classes)
  const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8"/>
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    </head>
    <body style="margin:0;padding:0;background:#f4f6f9;font-family:'Segoe UI',Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 0;">
        <tr>
          <td align="center">
            <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
              
              <!-- Header -->
              <tr>
                <td style="background:linear-gradient(135deg,#1a237e 0%,#283593 100%);padding:36px 40px;text-align:center;">
                  <h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:700;letter-spacing:-0.5px;">
                    🔐 Password Reset
                  </h1>
                  <p style="color:rgba(255,255,255,0.75);margin:8px 0 0;font-size:14px;">
                    Secure reset request
                  </p>
                </td>
              </tr>

              <!-- Body -->
              <tr>
                <td style="padding:40px;">
                  <p style="color:#37474f;font-size:16px;margin:0 0 12px;">
                    Hi <strong>${username}</strong>,
                  </p>
                  <p style="color:#546e7a;font-size:15px;line-height:1.7;margin:0 0 24px;">
                    We received a request to reset the password for your account. 
                    Click the button below to set a new password.
                  </p>

                  <!-- CTA Button -->
                  <div style="text-align:center;margin:32px 0;">
                    <a href="${resetUrl}"
                       style="display:inline-block;background:#1a237e;color:#ffffff;text-decoration:none;
                              padding:14px 36px;border-radius:8px;font-size:16px;font-weight:600;
                              letter-spacing:0.3px;">
                      Reset My Password
                    </a>
                  </div>

                  <!-- Expiry Warning -->
                  <div style="background:#fff8e1;border-left:4px solid #ffc107;border-radius:4px;padding:14px 18px;margin:24px 0;">
                    <p style="margin:0;color:#795548;font-size:14px;">
                      ⏱ <strong>This link expires in ${process.env.RESET_TOKEN_EXPIRE_MINUTES || 10} minutes.</strong>
                      After that you'll need to request a new one.
                    </p>
                  </div>

                  <!-- Raw Link Fallback -->
                  <p style="color:#90a4ae;font-size:13px;line-height:1.6;margin:20px 0 0;">
                    If the button doesn't work, copy and paste this link into your browser:<br/>
                    <a href="${resetUrl}" style="color:#1a237e;word-break:break-all;">${resetUrl}</a>
                  </p>

                  <p style="color:#b0bec5;font-size:13px;margin:24px 0 0;">
                    If you did not request a password reset, please ignore this email. 
                    Your password will remain unchanged.
                  </p>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="background:#f8f9fa;padding:20px 40px;text-align:center;border-top:1px solid #eceff1;">
                  <p style="color:#b0bec5;font-size:12px;margin:0;">
                    © ${new Date().getFullYear()} Password Reset App. All rights reserved.
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

  // ── Plain-text fallback ───────────────────
  const textBody = `
Hi ${username},

You requested a password reset. Use the link below (valid for ${process.env.RESET_TOKEN_EXPIRE_MINUTES || 10} minutes):

${resetUrl}

If you did not request this, ignore this email.
  `.trim();

  // ── Send the email ────────────────────────
  const info = await transporter.sendMail({
    from: process.env.EMAIL_FROM || `"Password Reset App" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: "🔐 Password Reset Request",
    text: textBody,
    html: htmlBody,
  });

  console.log(`📧 Reset email sent to ${toEmail} — Message ID: ${info.messageId}`);
  return info;
};

module.exports = sendResetEmail;