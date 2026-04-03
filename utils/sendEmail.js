const nodemailer = require('nodemailer');

/**
 * Creates a Nodemailer transporter based on env config.
 * Supports Gmail (with App Password), SendGrid, Mailtrap, or any SMTP.
 */
const createTransporter = () => {
  // --- Option 1: Gmail with App Password (most common) ---
  if (process.env.EMAIL_SERVICE === 'gmail') {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS, // Use Gmail App Password, NOT your real password
      },
    });
  }

  // --- Option 2: SendGrid ---
  if (process.env.EMAIL_SERVICE === 'sendgrid') {
    return nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      auth: {
        user: 'apikey',
        pass: process.env.SENDGRID_API_KEY,
      },
    });
  }

  // --- Option 3: Generic SMTP (Mailtrap, Brevo, etc.) ---
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: process.env.SMTP_SECURE === 'true', // true for port 465
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

/**
 * Sends a password reset email.
 * @param {string} to - Recipient email address
 * @param {string} resetURL - Full reset link
 */
const sendPasswordResetEmail = async (to, resetURL) => {
  const transporter = createTransporter();

  // Verify connection before sending
  await transporter.verify();

  const mailOptions = {
    from: `"${process.env.EMAIL_FROM_NAME || 'Support'}" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
    to,
    subject: 'Password Reset Request',
    text: `You requested a password reset.\n\nClick the link below to reset your password:\n${resetURL}\n\nThis link expires in 1 hour.\n\nIf you did not request this, please ignore this email.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 8px;">
        <h2 style="color: #111827;">Password Reset Request</h2>
        <p style="color: #374151;">You requested to reset your password. Click the button below:</p>
        <a href="${resetURL}" 
           style="display: inline-block; margin: 16px 0; padding: 12px 24px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">
          Reset My Password
        </a>
        <p style="color: #6B7280; font-size: 14px;">This link expires in <strong>1 hour</strong>.</p>
        <p style="color: #6B7280; font-size: 14px;">If you didn't request this, you can safely ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #9CA3AF; font-size: 12px;">Or copy and paste this URL into your browser:<br/>${resetURL}</p>
      </div>
    `,
  };

  const info = await transporter.sendMail(mailOptions);
  console.log('✅ Reset email sent:', info.messageId);
  return info;
};

module.exports = { sendPasswordResetEmail };