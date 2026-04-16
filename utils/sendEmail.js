const nodemailer = require("nodemailer");

const sendPasswordResetEmail = async (to, resetURL) => {

  // ── Validate required env vars BEFORE attempting SMTP ─────────────────
  const service = process.env.EMAIL_SERVICE;
  const user    = process.env.EMAIL_USER;
  const pass    = process.env.EMAIL_PASS;

  console.log("📧 Email config check:");
  console.log("  EMAIL_SERVICE:", service || "❌ NOT SET");
  console.log("  EMAIL_USER:",    user    || "❌ NOT SET");
  console.log("  EMAIL_PASS:",    pass    ? "✅ set" : "❌ NOT SET");

  if (!service || !user || !pass) {
    throw new Error(
      `Email not configured. Missing: ${[
        !service && "EMAIL_SERVICE",
        !user    && "EMAIL_USER",
        !pass    && "EMAIL_PASS",
      ].filter(Boolean).join(", ")} — set these in Render Environment Variables`
    );
  }

  // ── Build transporter ──────────────────────────────────────────────────
  let transportConfig;

  if (service === "gmail") {
    transportConfig = {
      service: "gmail",
      auth: { user, pass },
    };
  } else if (service === "sendgrid") {
    transportConfig = {
      host: "smtp.sendgrid.net",
      port: 587,
      secure: false,
      auth: { user: "apikey", pass: process.env.SENDGRID_API_KEY },
    };
  } else {
    // Generic SMTP (Mailtrap, Brevo, etc.)
    transportConfig = {
      host:   process.env.SMTP_HOST,
      port:   parseInt(process.env.SMTP_PORT, 10) || 587,
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER || user,
        pass: process.env.SMTP_PASS || pass,
      },
    };
  }

  const transporter = nodemailer.createTransport(transportConfig);

  // ── Send email (no verify() — it's slow and causes timeouts) ──────────
  const from = `"${process.env.EMAIL_FROM_NAME || "SecureAuth"}" <${process.env.EMAIL_FROM || user}>`;

  console.log("📧 Sending reset email to:", to);

  const info = await transporter.sendMail({
    from,
    to,
    subject: "Password Reset Request",
    text: `You requested a password reset.\n\nReset your password here:\n${resetURL}\n\nThis link expires in 1 hour.\n\nIf you did not request this, ignore this email.`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:8px;">
        <h2 style="color:#111827;">Password Reset Request</h2>
        <p style="color:#374151;">Click the button below to reset your password. This link expires in <strong>1 hour</strong>.</p>
        <a href="${resetURL}"
           style="display:inline-block;margin:16px 0;padding:12px 28px;background:#185FA5;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">
          Reset My Password
        </a>
        <p style="color:#6B7280;font-size:13px;">If you didn't request this, you can safely ignore this email.</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/>
        <p style="color:#9CA3AF;font-size:12px;">
          Or copy this URL:<br/>
          <a href="${resetURL}" style="color:#185FA5;">${resetURL}</a>
        </p>
      </div>
    `,
  });

  console.log("✅ Email sent successfully. MessageId:", info.messageId);
  return info;
};

module.exports = { sendPasswordResetEmail };