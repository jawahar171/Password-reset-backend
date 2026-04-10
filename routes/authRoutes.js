const express = require('express');
const router  = express.Router();
const {
  register,
  login,
  forgotPassword,
  resetPassword,
  verifyResetToken,
} = require('../controllers/authController');

// POST /api/auth/register
router.post('/register', register);

// POST /api/auth/login
router.post('/login', login);

// POST /api/auth/forgot-password
router.post('/forgot-password', forgotPassword);

// POST /api/auth/reset-password/:token
router.post('/reset-password/:token', resetPassword);

// GET  /api/auth/verify-reset-token/:token  (optional — for frontend token validation)
router.get('/verify-reset-token/:token', verifyResetToken);

module.exports = router;