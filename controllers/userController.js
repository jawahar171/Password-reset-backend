// ═══════════════════════════════════════════════
//  controllers/userController.js
// ═══════════════════════════════════════════════
const User = require("../models/User");

// GET /api/user/profile — returns the logged-in user's info
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found." });

    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error." });
  }
};

module.exports = { getProfile };