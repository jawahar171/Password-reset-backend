const nodemailer = require("nodemailer");

const createTransporter = async () => {
  const service = process.env.EMAIL_SERVICE;

  if (service === "gmail") {
    if (!process.env.EMAIL_USER) throw new Error("EMAIL_USER is not set.");
    if (!process.env.EMAIL_PASS) throw new Error("EMAIL_PASS is not set. Generate a Gmail App Password at https://myaccount.google.com/apppasswords");
    return nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }

  if (service === "sendgrid") {
    if (!process.env.SENDGRID_API_KEY) throw new Error("SENDGRID_API_KEY is not set.");
    return nodemailer.createTransport({
      host: "smtp.sendgrid.net",
      port: 587,
      auth: { user: "apikey", pass: process.env.SENDGRID_API_KEY },
    });
  }

  if (service === "smtp") {
    if (!process.env.SMTP_HOST) throw new Error("SMTP_HOST is not set.");
    return nodemailer.createTransport({
      host:   process.env.SMTP_HOST,
      port:   parseInt(process.env.SMTP_PORT, 10) || 587,
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  // Ethereal fallback - no setup needed, shows preview URL in logs
  console.warn("WARNING: EMAIL_SERVICE not set. Using Ethereal test account.");
  console.warn("WARNING: Emails will NOT deliver - check Render logs for preview URL.");
  const testAccount = await nodemailer.createTestAccount();
  console.log("Ethereal test account:", testAccount.user);
  return nodemailer.createTransport({
    host:   "smtp.ethereal.email",
    port:   587,
    secure: false,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass,
    },
  });
};

const sendPasswordResetEmail = async (to, resetURL) => {
  const transporter = await createTransporter();

  const from = `"${process.env.EMAIL_FROM_NAME || "Support"}" <${
    process.env.EMAIL_FROM || process.env.EMAIL_USER || "noreply@example.com"
  }>`;

  const info = await transporter.sendMail({
    from,
    to,
    subject: "Password Reset Request",
    text: `You requested a password reset.\n\nClick here:\n${resetURL}\n\nExpires in 1 hour.\n\nIgnore if you did not request this.`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:8px;">
        <h2 style="color:#111827;">Password Reset Request</h2>
        <p style="color:#374151;">Click the button below. Link expires in <strong>1 hour</strong>.</p>
        <a href="${resetURL}" style="display:inline-block;padding:12px 28px;background:#185FA5;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">
          Reset My Password
        </a>
        <p style="color:#6B7280;font-size:13px;margin-top:24px;">Didn't request this? Ignore this email.</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
        <p style="color:#9CA3AF;font-size:12px;">
          Or copy this URL:<br/>
          <a href="${resetURL}" style="color:#185FA5;">${resetURL}</a>
        </p>
      </div>
    `,
  });

  const previewURL = nodemailer.getTestMessageUrl(info);
  if (previewURL) {
    console.log("EMAIL PREVIEW URL:", previewURL);
  } else {
    console.log("Reset email sent:", info.messageId);
  }

  return info;
};

module.exports = { sendPasswordResetEmail };