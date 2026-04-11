const express    = require("express");
const router     = express.Router();
const { protect } = require("../middleware/authMiddleware");

router.get("/profile", protect, (req, res) => {
  res.json({
    message: "Profile fetched successfully.",
    user: {
      id:       req.user._id,
      username: req.user.username,
      email:    req.user.email,
      createdAt: req.user.createdAt,
    },
  });
});

module.exports = router;