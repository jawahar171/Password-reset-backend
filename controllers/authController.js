const crypto = require("crypto");
const jwt    = require("jsonwebtoken");
const User   = require("../models/User");
const { sendPasswordResetEmail } = require("../utils/sendEmail");

// ── Helpers ───────────────────────────────────────────────────
const signToken = (id) => {
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is not defined in environment variables");
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
};

const hashToken = (raw) =>
  crypto.createHash("sha256").update(raw).digest("hex");

// ── Register ──────────────────────────────────────────────────
exports.register = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username?.trim() || !email?.trim() || !password)
      return res.status(400).json({ message: "All fields are required." });

    if (password.length < 6)
      return res.status(400).json({ message: "Password must be at least 6 characters." });

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing)
      return res.status(409).json({ message: "Email already registered." });

    const user  = await User.create({ username: username.trim(), email, password });
    const token = signToken(user._id);

    res.status(201).json({
      message: "Registration successful.",
      token,
      user: { id: user._id, username: user.username, email: user.email },
    });
  } catch (err) {
    console.error("Register error:", err.message);
    res.status(500).json({ message: "Server error.", error: err.message });
  }
};

// ── Login ─────────────────────────────────────────────────────
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email?.trim() || !password)
      return res.status(400).json({ message: "Email and password are required." });

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || !(await user.comparePassword(password)))
      return res.status(401).json({ message: "Invalid email or password." });

    const token = signToken(user._id);
    res.json({
      message: "Login successful.",
      token,
      user: { id: user._id, username: user.username, email: user.email },
    });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ message: "Server error.", error: err.message });
  }
};

// ── Forgot Password ───────────────────────────────────────────
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email?.trim())
      return res.status(400).json({ message: "Please provide your email address." });

    // Always return 200 — prevents email enumeration
    const genericResponse = {
      message: "If an account with that email exists, a reset link has been sent.",
    };

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(200).json(genericResponse);

    // Generate raw token (sent in email) and hashed token (stored in DB)
    const rawToken = crypto.randomBytes(32).toString("hex");
    user.resetPasswordToken   = hashToken(rawToken);
    user.resetPasswordExpires = Date.now() + 60 * 60 * 1000; // 1 hour
    await user.save({ validateBeforeSave: false });

    const clientURL = process.env.CLIENT_URL || "https://glittery-belekoy-b10d64.netlify.app";
    const resetURL  = `${clientURL}/reset-password/${rawToken}`;

    try {
      await sendPasswordResetEmail(user.email, resetURL);
      res.status(200).json(genericResponse);
    } catch (emailErr) {
      // Clear token so user can request again
      user.resetPasswordToken   = undefined;
      user.resetPasswordExpires = undefined;
      await user.save({ validateBeforeSave: false });
      console.error("❌ Email send failed:", emailErr.message);
      res.status(500).json({
        message: "Failed to send reset email. Please check server email configuration.",
        error: emailErr.message,
      });
    }
  } catch (err) {
    console.error("Forgot password error:", err.message);
    res.status(500).json({ message: "Server error.", error: err.message });
  }
};

// ── Reset Password ────────────────────────────────────────────
exports.resetPassword = async (req, res) => {
  try {
    const { token }                    = req.params;
    const { password, confirmPassword } = req.body;

    // Validate inputs
    if (!password || !confirmPassword)
      return res.status(400).json({ message: "Both password fields are required." });

    if (password.length < 6)
      return res.status(400).json({ message: "Password must be at least 6 characters." });

    // ← FIX: validate passwords match
    if (password !== confirmPassword)
      return res.status(400).json({ message: "Passwords do not match." });

    const user = await User.findOne({
      resetPasswordToken:   hashToken(token),
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user)
      return res.status(400).json({ message: "Reset token is invalid or has expired." });

    // Save new password — pre-save hook will hash it
    user.password             = password;
    user.resetPasswordToken   = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    const jwtToken = signToken(user._id);
    res.json({
      message: "Password reset successful. You are now logged in.",
      token: jwtToken,
      user: { id: user._id, username: user.username, email: user.email },
    });
  } catch (err) {
    console.error("Reset password error:", err.message);
    res.status(500).json({ message: "Server error.", error: err.message });
  }
};

// ── Verify Reset Token ────────────────────────────────────────
exports.verifyResetToken = async (req, res) => {
  try {
    const user = await User.findOne({
      resetPasswordToken:   hashToken(req.params.token),
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user)
      return res.status(400).json({ valid: false, message: "Token is invalid or expired." });

    res.json({ valid: true, email: user.email, message: "Token is valid." });
  } catch (err) {
    console.error("Verify token error:", err.message);
    res.status(500).json({ message: "Server error.", error: err.message });
  }
};