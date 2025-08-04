// src/routes/telegramRoutes.js
const express = require('express');
const { auth } = require('../middleware/authMiddleware');
const User = require('../models/User');
const { asyncHandler } = require('../middleware/asyncHandler');

const router = express.Router();

router.use(auth);

// Link Telegram account
router.post('/link', asyncHandler(async (req, res) => {
  const { telegramId, username } = req.body;
  
  await User.findByIdAndUpdate(req.user._id, {
    telegramId,
    telegramUsername: username
  });
  
  res.json({
    success: true,
    message: 'Telegram account linked successfully'
  });
}));

// Unlink Telegram account
router.delete('/unlink', asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, {
    telegramId: null,
    telegramUsername: null
  });
  
  res.json({
    success: true,
    message: 'Telegram account unlinked successfully'
  });
}));

module.exports = router;
