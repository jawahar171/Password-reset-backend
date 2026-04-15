const nodemailer = require("nodemailer");

const createTransporter = () => {
  const service = process.env.EMAIL_SERVICE;

  if (service === "gmail") {
    return nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }

  if (service === "sendgrid") {
    return nodemailer.createTransport({
      host: "smtp.sendgrid.net",
      port: 587,
      auth: {
        user: "apikey",
        pass: process.env.SENDGRID_API_KEY,
      },
    });
  }

  // Generic SMTP fallback (Mailtrap, Brevo, etc.)
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

const sendPasswordResetEmail = async (to, resetURL) => {
  // Check required email env vars before even trying
  const service = process.env.EMAIL_SERVICE;

  if (!service) {
    throw new Error(
      "EMAIL_SERVICE is not set in environment variables. Set it to 'gmail', 'sendgrid', or configure SMTP_HOST."
    );
  }

  if (service === "gmail") {
    if (!process.env.EMAIL_USER) throw new Error("EMAIL_USER is not set in environment variables.");
    if (!process.env.EMAIL_PASS) throw new Error("EMAIL_PASS is not set in environment variables. Use a Gmail App Password, not your login password.");
  }

  if (service === "sendgrid" && !process.env.SENDGRID_API_KEY) {
    throw new Error("SENDGRID_API_KEY is not set in environment variables.");
  }

  const transporter = createTransporter();

  const from = `"${process.env.EMAIL_FROM_NAME || "Support"}" <${
    process.env.EMAIL_FROM || process.env.EMAIL_USER
  }>`;

  const info = await transporter.sendMail({
    from,
    to,
    subject: "Password Reset Request",
    text: `You requested a password reset.\n\nClick here to reset:\n${resetURL}\n\nThis link expires in 1 hour.\n\nIf you did not request this, ignore this email.`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:8px;">
        <h2 style="color:#111827;margin-bottom:8px;">Password Reset Request</h2>
        <p style="color:#374151;margin-bottom:20px;">
          Click the button below to reset your password.
          This link expires in <strong>1 hour</strong>.
        </p>
        <a href="${resetURL}"
           style="display:inline-block;padding:12px 28px;background:#185FA5;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;font-size:15px;">
          Reset My Password
        </a>
        <p style="color:#6B7280;font-size:13px;margin-top:24px;">
          If you didn't request this, you can safely ignore this email.
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/>
        <p style="color:#9CA3AF;font-size:12px;">
          Or copy and paste this URL into your browser:<br/>
          <a href="${resetURL}" style="color:#185FA5;">${resetURL}</a>
        </p>
      </div>
    `,
  });

  console.log("✅ Reset email sent:", info.messageId);
  return info;
};

module.exports = { sendPasswordResetEmail };