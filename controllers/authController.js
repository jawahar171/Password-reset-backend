const crypto = require("crypto");
const jwt    = require("jsonwebtoken");
const User   = require("../models/User");
const { sendPasswordResetEmail } = require("../utils/sendEmail");

const hashToken = (raw) =>
  crypto.createHash("sha256").update(raw).digest("hex");

// ── Register ───────────────────────────────────────────────────
exports.register = async (req, res) => {

  // STEP 1 — log exactly what arrived
  console.log("=== REGISTER START ===");
  console.log("body:", JSON.stringify({
    username: req.body?.username,
    email:    req.body?.email,
    hasPassword: !!req.body?.password,
    passwordLen: req.body?.password?.length,
  }));

  // STEP 2 — check env
  console.log("JWT_SECRET set:", !!process.env.JWT_SECRET);
  console.log("MONGO_URI set:",  !!process.env.MONGO_URI);

  try {
    const { username, email, password } = req.body;

    // STEP 3 — validate inputs
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

    // STEP 4 — check duplicate
    console.log("Checking for existing user:", email.toLowerCase().trim());
    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      console.log("DUPLICATE EMAIL found");
      return res.status(409).json({ message: "Email already registered." });
    }
    console.log("No duplicate found, proceeding...");

    // STEP 5 — create user
    console.log("Creating user...");
    const user = await User.create({
      username: username.trim(),
      email:    email.toLowerCase().trim(),
      password,
    });
    console.log("User created OK, id:", user._id.toString());

    // STEP 6 — sign JWT
    console.log("Signing JWT...");
    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET environment variable is not set on Render");
    }
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    });
    console.log("JWT signed OK");

    console.log("=== REGISTER SUCCESS ===");
    return res.status(201).json({
      message: "Registration successful.",
      token,
      user: { id: user._id, username: user.username, email: user.email },
    });

  } catch (err) {
    // Return FULL error details so we can see it in browser Network tab
    console.error("=== REGISTER FAILED ===");
    console.error("name:",    err.name);
    console.error("message:", err.message);
    console.error("code:",    err.code);
    console.error("stack:",   err.stack);

    return res.status(500).json({
      message: "Server error.",
      // These fields show in browser Network > Response tab
      errorName:    err.name,
      errorMessage: err.message,
      errorCode:    err.code || null,
      // Extra hints based on known error types
      hint:
        err.code === 11000                        ? "DUPLICATE KEY — email already exists in MongoDB" :
        err.name === "ValidationError"            ? "MONGOOSE VALIDATION — " + Object.values(err.errors || {}).map(e => e.message).join(", ") :
        err.message?.includes("JWT_SECRET")       ? "JWT_SECRET not set in Render environment variables" :
        err.message?.includes("buffering timed")  ? "MongoDB connection timed out — check MONGO_URI and Atlas IP whitelist (set 0.0.0.0/0)" :
        err.message?.includes("ECONNREFUSED")     ? "MongoDB connection refused — check MONGO_URI" :
        err.message?.includes("authentication")   ? "MongoDB authentication failed — check username/password in MONGO_URI" :
        "Unknown error — check errorMessage above",
    });
  }
};

// ── Login ──────────────────────────────────────────────────────
exports.login = async (req, res) => {
  console.log("=== LOGIN START ===", req.body?.email);
  try {
    const { email, password } = req.body;

    if (!email?.trim() || !password)
      return res.status(400).json({ message: "Email and password are required." });

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || !(await user.comparePassword(password)))
      return res.status(401).json({ message: "Invalid email or password." });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    });

    console.log("=== LOGIN SUCCESS ===");
    return res.json({
      message: "Login successful.",
      token,
      user: { id: user._id, username: user.username, email: user.email },
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err.name, err.message);
    return res.status(500).json({
      message:      "Server error.",
      errorName:    err.name,
      errorMessage: err.message,
      errorCode:    err.code || null,
    });
  }
};

// ── Forgot Password ────────────────────────────────────────────
exports.forgotPassword = async (req, res) => {
  console.log("=== FORGOT PASSWORD ===", req.body?.email);
  try {
    const { email } = req.body;

    if (!email?.trim())
      return res.status(400).json({ message: "Please provide your email address." });

    const genericOK = {
      message: "If an account with that email exists, a reset link has been sent.",
    };

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(200).json(genericOK);

    const rawToken = crypto.randomBytes(32).toString("hex");
    user.resetPasswordToken   = hashToken(rawToken);
    user.resetPasswordExpires = Date.now() + 60 * 60 * 1000;
    await user.save({ validateBeforeSave: false });

    const clientURL = process.env.CLIENT_URL || "https://glittery-belekoy-b10d64.netlify.app";
    const resetURL  = `${clientURL}/reset-password/${rawToken}`;

    try {
      await sendPasswordResetEmail(user.email, resetURL);
      return res.status(200).json(genericOK);
    } catch (emailErr) {
      user.resetPasswordToken   = undefined;
      user.resetPasswordExpires = undefined;
      await user.save({ validateBeforeSave: false });
      console.error("EMAIL SEND FAILED:", emailErr.message);
      return res.status(500).json({
        message:      "Failed to send reset email.",
        errorMessage: emailErr.message,
      });
    }
  } catch (err) {
    console.error("FORGOT PASSWORD ERROR:", err.message);
    return res.status(500).json({
      message:      "Server error.",
      errorName:    err.name,
      errorMessage: err.message,
    });
  }
};

// ── Reset Password ─────────────────────────────────────────────
exports.resetPassword = async (req, res) => {
  console.log("=== RESET PASSWORD ===");
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

    if (!user)
      return res.status(400).json({ message: "Reset token is invalid or has expired." });

    user.password             = password;
    user.resetPasswordToken   = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    const jwtToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    });

    return res.json({
      message: "Password reset successful. You are now logged in.",
      token:   jwtToken,
      user:    { id: user._id, username: user.username, email: user.email },
    });
  } catch (err) {
    console.error("RESET PASSWORD ERROR:", err.message);
    return res.status(500).json({
      message:      "Server error.",
      errorName:    err.name,
      errorMessage: err.message,
    });
  }
};

// ── Verify Reset Token ─────────────────────────────────────────
exports.verifyResetToken = async (req, res) => {
  try {
    const user = await User.findOne({
      resetPasswordToken:   hashToken(req.params.token),
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user)
      return res.status(400).json({ valid: false, message: "Token is invalid or expired." });

    return res.json({ valid: true, email: user.email, message: "Token is valid." });
  } catch (err) {
    console.error("VERIFY TOKEN ERROR:", err.message);
    return res.status(500).json({
      message:      "Server error.",
      errorName:    err.name,
      errorMessage: err.message,
    });
  }
};