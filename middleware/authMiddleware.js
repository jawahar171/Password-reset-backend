// ═══════════════════════════════════════════════
//  middleware/authMiddleware.js  —  JWT Auth Guard
// ═══════════════════════════════════════════════
const jwt  = require("jsonwebtoken");
const User = require("../models/User");

/**
 * protect
 * Express middleware that validates a Bearer JWT.
 * Attaches the authenticated user to req.user.
 * Must be added to any route that requires login.
 */
const protect = async (req, res, next) => {
  let token;

  // Extract token from "Authorization: Bearer <token>" header
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Access denied. Please log in first.",
    });
  }

  try {
    // Verify token signature and expiry
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch the user from DB (excluding password)
    req.user = await User.findById(decoded.id).select("-password");

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "User no longer exists.",
      });
    }

    next(); // Token is valid — proceed to route handler
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ success: false, message: "Session expired. Please log in again." });
    }
    return res.status(401).json({ success: false, message: "Invalid token." });
  }
};

module.exports = { protect };