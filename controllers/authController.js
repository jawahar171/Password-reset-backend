// ═══════════════════════════════════════════════
//  controllers/authController.js
//
//  Endpoints:
//   POST /api/auth/register         — create account
//   POST /api/auth/login            — login + JWT
//   POST /api/auth/forgot-password  — send reset email (Flow 1)
//   GET  /api/auth/verify-token/:token — check token validity (Flow 2 step 1)
//   POST /api/auth/reset-password/:token — set new password (Flow 2 step 2)
// ═══════════════════════════════════════════════
const jwt          = require("jsonwebtoken");
const crypto       = require("crypto");
const User         = require("../models/User");
const sendResetEmail = require("../utils/sendEmail");

// ── Helper: create and sign a JWT ────────────
const generateJWT = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || "7d",
  });


// ════════════════════════════════════════════
//  REGISTER
//  POST /api/auth/register
//  Body: { username, email, password }
// ════════════════════════════════════════════
const register = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Validate all fields are present
    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please fill in all fields: username, email, password.",
      });
    }

    // Check for existing user (duplicate email or username)
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      const conflictField = existingUser.email === email.toLowerCase() ? "Email" : "Username";
      return res.status(409).json({
        success: false,
        message: `${conflictField} is already registered. Please use a different one.`,
      });
    }

    // Create user — password is hashed by the pre-save hook in User model
    const user = await User.create({ username, email, password });
    const token = generateJWT(user._id);

    res.status(201).json({
      success: true,
      message: "Account created successfully!",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    // Handle Mongoose validation errors (minlength, regex, etc.)
    if (error.name === "ValidationError") {
      const message = Object.values(error.errors)[0].message;
      return res.status(400).json({ success: false, message });
    }
    console.error("Register error:", error);
    res.status(500).json({ success: false, message: "Server error. Please try again." });
  }
};


// ════════════════════════════════════════════
//  LOGIN
//  POST /api/auth/login
//  Body: { email, password }
// ════════════════════════════════════════════
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide your email and password.",
      });
    }

    // .select("+password") re-includes the password field (it's excluded by default)
    const user = await User.findOne({ email: email.toLowerCase() }).select("+password");

    // Intentionally vague error — don't tell attackers whether the email exists
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    const token = generateJWT(user._id);

    res.status(200).json({
      success: true,
      message: "Login successful!",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ success: false, message: "Server error. Please try again." });
  }
};


// ════════════════════════════════════════════
//  FORGOT PASSWORD  — Flow 1
//  POST /api/auth/forgot-password
//  Body: { email }
//
//  Task spec:
//   ✓ Check if user exists in DB
//   ✓ If not → send error message
//   ✓ If yes → generate random string
//   ✓ Store random string in DB
//   ✓ Send link with random string via email
// ════════════════════════════════════════════
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Please enter your email address.",
      });
    }

    // ── Check if user exists ──────────────────
    const user = await User.findOne({ email: email.toLowerCase() });

    // Task spec: "If the user is not present send an error message"
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "No account found with that email address. Please check and try again.",
      });
    }

    // ── Generate random string + store hash in DB ──
    // generateResetToken() returns the raw token and stores its SHA-256 hash in the document
    const rawToken = user.generateResetToken();

    // Save the hashed token and expiry to MongoDB
    await user.save({ validateBeforeSave: false });

    // ── Build reset URL ───────────────────────
    // This is the link emailed to the user.
    // The raw token is in the URL — the frontend will extract it and send to the verify endpoint.
    const resetUrl = `${process.env.CLIENT_URL}/reset-password/${rawToken}`;

    // ── Send email ────────────────────────────
    try {
      await sendResetEmail(user.email, user.username, resetUrl);

      res.status(200).json({
        success: true,
        message: `Password reset link sent to ${user.email}. Check your inbox (valid for ${process.env.RESET_TOKEN_EXPIRE_MINUTES || 10} minutes).`,
        // DEV ONLY — remove in production so attackers can't bypass email
        devResetUrl: process.env.NODE_ENV !== "production" ? resetUrl : undefined,
      });
    } catch (emailError) {
      // If email fails, clear the token so the user can try again
      user.resetToken = undefined;
      user.resetTokenExpire = undefined;
      await user.save({ validateBeforeSave: false });

      console.error("Email send failed:", emailError.message);
      return res.status(500).json({
        success: false,
        message: "Failed to send reset email. Please try again later.",
      });
    }
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ success: false, message: "Server error. Please try again." });
  }
};


// ════════════════════════════════════════════
//  VERIFY RESET TOKEN  — Flow 2, Step 1
//  GET /api/auth/verify-token/:token
//
//  Called when the user clicks the link in their email.
//  Checks if the token is valid and not expired.
//  Task spec:
//   ✓ Retrieve the random string from the URL
//   ✓ Pass it to DB to check if it matches
//   ✓ If match → show password reset form (return success)
//   ✓ If no match / expired → send error message
// ════════════════════════════════════════════
const verifyResetToken = async (req, res) => {
  try {
    // Hash the raw token from the URL to compare with the stored hash
    const hashedToken = crypto
      .createHash("sha256")
      .update(req.params.token)
      .digest("hex");

    // Find user with a matching non-expired token
    const user = await User.findOne({
      resetToken: hashedToken,
      resetTokenExpire: { $gt: Date.now() }, // $gt = greater than = token not yet expired
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "This password reset link is invalid or has expired. Please request a new one.",
      });
    }

    // Token is valid — tell the frontend to show the reset form
    res.status(200).json({
      success: true,
      message: "Token is valid. You may now reset your password.",
      email: user.email, // Optional: show user which account they're resetting
    });
  } catch (error) {
    console.error("Verify token error:", error);
    res.status(500).json({ success: false, message: "Server error." });
  }
};


// ════════════════════════════════════════════
//  RESET PASSWORD  — Flow 2, Step 2
//  POST /api/auth/reset-password/:token
//  Body: { password, confirmPassword }
//
//  Task spec:
//   ✓ String matches → allow password reset
//   ✓ Store the new password in DB
//   ✓ Clear the random string from DB
//   ✓ String does not match → send error message
// ════════════════════════════════════════════
const resetPassword = async (req, res) => {
  try {
    const { password, confirmPassword } = req.body;

    // ── Validate inputs ───────────────────────
    if (!password || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Please enter and confirm your new password.",
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match. Please try again.",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long.",
      });
    }

    // ── Hash URL token and look up user ───────
    const hashedToken = crypto
      .createHash("sha256")
      .update(req.params.token)
      .digest("hex");

    const user = await User.findOne({
      resetToken: hashedToken,
      resetTokenExpire: { $gt: Date.now() }, // Ensure token hasn't expired
    });

    // If no match or expired — reject
    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset link. Please request a new password reset.",
      });
    }

    // ── Update password and clear reset fields ─
    user.password = password;          // pre-save hook will bcrypt-hash this
    user.resetToken = undefined;        // ✓ clear random string from DB as per task spec
    user.resetTokenExpire = undefined;  // ✓ clear expiry

    await user.save(); // Triggers pre-save hook → password gets hashed

    // ── Log the user in immediately ───────────
    // Issue a fresh JWT so they don't need to go to the login page
    const token = generateJWT(user._id);

    res.status(200).json({
      success: true,
      message: "Password reset successful! You are now logged in.",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ success: false, message: "Server error. Please try again." });
  }
};


module.exports = {
  register,
  login,
  forgotPassword,
  verifyResetToken,
  resetPassword,
};