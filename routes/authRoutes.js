// ═══════════════════════════════════════════════
//  routes/authRoutes.js
// ═══════════════════════════════════════════════
const express = require("express");
const router  = express.Router();
const {
  register,
  login,
  forgotPassword,
  verifyResetToken,
  resetPassword,
} = require("../controllers/authController");

// ── Public Routes (no login required) ─────────
router.post("/register",         register);
router.post("/login",            login);
router.post("/forgot-password",  forgotPassword);          // Flow 1
router.get( "/verify-token/:token", verifyResetToken);     // Flow 2 — verify link
router.post("/reset-password/:token", resetPassword);      // Flow 2 — set new password

module.exports = router;