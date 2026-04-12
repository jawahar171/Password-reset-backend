const crypto = require("crypto");
const jwt    = require("jsonwebtoken");
const User   = require("../models/User");
const { sendPasswordResetEmail } = require("../utils/sendEmail");

const signToken = (id) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET environment variable is not set");
  }
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
};

// ── Register ──────────────────────────────────
exports.register = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password)
      return res.status(400).json({ message: "All fields are required." });

    if (password.length < 6)
      return res.status(400).json({ message: "Password must be at least 6 characters." });

    const existing = await User.findOne({ email });
    if (existing)
      return res.status(409).json({ message: "Email already registered." });

    const user = await User.create({ username, email, password });
    const token = signToken(user._id);

    res.status(201).json({
      message: "Registration successful.",
      token,
      user: { id: user._id, username: user.username, email: user.email },
    });
  } catch (err) {
    console.error("❌ Register error:", err.name, "|", err.message);
    // Return the actual error message so it shows in browser + Render logs
    res.status(500).json({
      message: "Server error during registration.",
      error: err.message,
      type: err.name,
    });
  }
};

// ── Login ─────────────────────────────────────
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: "Email and password are required." });

    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password)))
      return res.status(401).json({ message: "Invalid email or password." });

    const token = signToken(user._id);
    res.json({
      message: "Login successful.",
      token,
      user: { id: user._id, username: user.username, email: user.email },
    });
  } catch (err) {
    console.error("❌ Login error:", err.name, "|", err.message);
    res.status(500).json({
      message: "Server error during login.",
      error: err.message,
      type: err.name,
    });
  }
};

// ── Forgot Password ───────────────────────────
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email)
      return res.status(400).json({ message: "Please provide your email address." });

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(200).json({
        message: "If an account with that email exists, a reset link has been sent.",
      });
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    user.resetPasswordToken   = crypto.createHash("sha256").update(rawToken).digest("hex");
    user.resetPasswordExpires = Date.now() + 60 * 60 * 1000;
    await user.save({ validateBeforeSave: false });

    const clientURL = process.env.CLIENT_URL || "https://glittery-belekoy-b10d64.netlify.app";
    const resetURL  = `${clientURL}/reset-password/${rawToken}`;

    try {
      await sendPasswordResetEmail(user.email, resetURL);
      res.status(200).json({
        message: "If an account with that email exists, a reset link has been sent.",
      });
    } catch (emailErr) {
      user.resetPasswordToken   = undefined;
      user.resetPasswordExpires = undefined;
      await user.save({ validateBeforeSave: false });
      console.error("❌ Email send failed:", emailErr.message);
      res.status(500).json({
        message: "Failed to send reset email. Check email configuration.",
        error: emailErr.message,
        type: emailErr.name,
      });
    }
  } catch (err) {
    console.error("❌ Forgot password error:", err.name, "|", err.message);
    res.status(500).json({
      message: "Server error during forgot password.",
      error: err.message,
      type: err.name,
    });
  }
};

// ── Reset Password ────────────────────────────
exports.resetPassword = async (req, res) => {
  try {
    const { token }    = req.params;
    const { password } = req.body;

    if (!password || password.length < 6)
      return res.status(400).json({ message: "Password must be at least 6 characters." });

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({
      resetPasswordToken:   hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user)
      return res.status(400).json({ message: "Reset token is invalid or has expired." });

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
    console.error("❌ Reset password error:", err.name, "|", err.message);
    res.status(500).json({
      message: "Server error during password reset.",
      error: err.message,
      type: err.name,
    });
  }
};

// ── Verify Reset Token ────────────────────────
exports.verifyResetToken = async (req, res) => {
  try {
    const hashedToken = crypto.createHash("sha256").update(req.params.token).digest("hex");
    const user = await User.findOne({
      resetPasswordToken:   hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user)
      return res.status(400).json({ valid: false, message: "Token is invalid or expired." });

    res.json({ valid: true, email: user.email, message: "Token is valid." });
  } catch (err) {
    console.error("❌ Verify token error:", err.name, "|", err.message);
    res.status(500).json({
      message: "Server error during token verification.",
      error: err.message,
      type: err.name,
    });
  }
};