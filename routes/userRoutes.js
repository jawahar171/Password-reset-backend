// ═══════════════════════════════════════════════
//  routes/userRoutes.js  —  Protected Routes
// ═══════════════════════════════════════════════
const express  = require("express");
const router   = express.Router();
const { getProfile } = require("../controllers/userController");
const { protect }    = require("../middleware/authMiddleware");

// protect middleware runs before getProfile — rejects if no valid JWT
router.get("/profile", protect, getProfile);

module.exports = router;