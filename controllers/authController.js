const crypto = require("crypto");
const jwt    = require("jsonwebtoken");
const User   = require("../models/User");
const { sendPasswordResetEmail } = require("../utils/sendEmail");

// ── Helpers ────────────────────────────────────────────────────
const signToken = (id) => {
  console.log("🔑 Signing JWT for user:", id);
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not defined in environment variables");
  }
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
};

const hashToken = (raw) =>
  crypto.createHash("sha256").update(raw).digest("hex");

// ── Register ───────────────────────────────────────────────────
exports.register = async (req, res) => {
  console.log("📩 Register request body:", {
    username: req.body?.username,
    email:    req.body?.email,
    password: req.body?.password ? "[provided]" : "[missing]",
  });

  try {
    const { username, email, password } = req.body;

    // Input validation
    if (!username?.trim())
      return res.status(400).json({ message: "Username is required." });
    if (username.trim().length < 2)
      return res.status(400).json({ message: "Username must be at least 2 characters." });
    if (!email?.trim())
      return res.status(400).json({ message: "Email is required." });
    if (!password)
      return res.status(400).json({ message: "Password is required." });
    if (password.length < 6)
      return res.status(400).json({ message: "Password must be at least 6 characters." });

    console.log("🔍 Checking for existing user:", email.toLowerCase().trim());
    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      console.log("⚠️  Email already registered:", email);
      return res.status(409).json({ message: "Email already registered." });
    }

    console.log("💾 Creating new user...");
    const user = await User.create({
      username: username.trim(),
      email:    email.toLowerCase().trim(),
      password,
    });
    console.log("✅ User created with ID:", user._id);

    const token = signToken(user._id);
    console.log("✅ Register complete for:", email);

    res.status(201).json({
      message: "Registration successful.",
      token,
      user: { id: user._id, username: user.username, email: user.email },
    });
  } catch (err) {
    console.error("❌ Register error name:", err.name);
    console.error("❌ Register error message:", err.message);
    console.error("❌ Register error stack:", err.stack);
    res.status(500).json({ message: "Server error.", error: err.message });
  }
};

// ── Login ──────────────────────────────────────────────────────
exports.login = async (req, res) => {
  console.log("📩 Login request for:", req.body?.email);

  try {
    const { email, password } = req.body;

    if (!email?.trim() || !password)
      return res.status(400).json({ message: "Email and password are required." });

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      console.log("⚠️  User not found:", email);
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const match = await user.comparePassword(password);
    if (!match) {
      console.log("⚠️  Wrong password for:", email);
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const token = signToken(user._id);
    console.log("✅ Login success for:", email);

    res.json({
      message: "Login successful.",
      token,
      user: { id: user._id, username: user.username, email: user.email },
    });
  } catch (err) {
    console.error("❌ Login error:", err.message);
    console.error("❌ Login stack:", err.stack);
    res.status(500).json({ message: "Server error.", error: err.message });
  }
};

// ── Forgot Password ────────────────────────────────────────────
exports.forgotPassword = async (req, res) => {
  console.log("📩 Forgot password request for:", req.body?.email);

  try {
    const { email } = req.body;

    if (!email?.trim())
      return res.status(400).json({ message: "Please provide your email address." });

    const genericOK = {
      message: "If an account with that email exists, a reset link has been sent.",
    };

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      console.log("ℹ️  No user found for forgot-password (returning generic OK)");
      return res.status(200).json(genericOK);
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    user.resetPasswordToken   = hashToken(rawToken);
    user.resetPasswordExpires = Date.now() + 60 * 60 * 1000;
    await user.save({ validateBeforeSave: false });
    console.log("✅ Reset token saved for:", email);

    const clientURL = process.env.CLIENT_URL || "https://glittery-belekoy-b10d64.netlify.app";
    const resetURL  = `${clientURL}/reset-password/${rawToken}`;

    try {
      await sendPasswordResetEmail(user.email, resetURL);
      console.log("✅ Reset email sent to:", email);
      res.status(200).json(genericOK);
    } catch (emailErr) {
      user.resetPasswordToken   = undefined;
      user.resetPasswordExpires = undefined;
      await user.save({ validateBeforeSave: false });
      console.error("❌ Email send failed:", emailErr.message);
      res.status(500).json({
        message: "Failed to send reset email. Please check your email configuration.",
        error:   emailErr.message,
      });
    }
  } catch (err) {
    console.error("❌ Forgot password error:", err.message);
    console.error("❌ Forgot password stack:", err.stack);
    res.status(500).json({ message: "Server error.", error: err.message });
  }
};

// ── Reset Password ─────────────────────────────────────────────
exports.resetPassword = async (req, res) => {
  console.log("📩 Reset password request for token:", req.params?.token?.slice(0, 10) + "...");

  try {
    const { token }                     = req.params;
    const { password, confirmPassword } = req.body;

    if (!password || !confirmPassword)
      return res.status(400).json({ message: "Both password fields are required." });
    if (password.length < 6)
      return res.status(400).json({ message: "Password must be at least 6 characters." });
    if (password !== confirmPassword)
      return res.status(400).json({ message: "Passwords do not match." });

    const user = await User.findOne({
      resetPasswordToken:   hashToken(token),
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      console.log("⚠️  Invalid or expired reset token");
      return res.status(400).json({ message: "Reset token is invalid or has expired." });
    }

    user.password             = password;
    user.resetPasswordToken   = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();
    console.log("✅ Password reset for:", user.email);

    const jwtToken = signToken(user._id);
    res.json({
      message: "Password reset successful. You are now logged in.",
      token:   jwtToken,
      user:    { id: user._id, username: user.username, email: user.email },
    });
  } catch (err) {
    console.error("❌ Reset password error:", err.message);
    console.error("❌ Reset password stack:", err.stack);
    res.status(500).json({ message: "Server error.", error: err.message });
  }
};

// ── Verify Reset Token ─────────────────────────────────────────
exports.verifyResetToken = async (req, res) => {
  console.log("📩 Verify token request");
  try {
    const user = await User.findOne({
      resetPasswordToken:   hashToken(req.params.token),
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      console.log("⚠️  Token invalid or expired");
      return res.status(400).json({ valid: false, message: "Token is invalid or expired." });
    }

    console.log("✅ Token valid for:", user.email);
    res.json({ valid: true, email: user.email, message: "Token is valid." });
  } catch (err) {
    console.error("❌ Verify token error:", err.message);
    res.status(500).json({ message: "Server error.", error: err.message });
  }
};