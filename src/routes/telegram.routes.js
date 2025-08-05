const express = require('express');
const router = express.Router();
const telegramService = require('../services/telegram.service');
const authController = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth.middleware');

// Webhook endpoint for Telegram updates (POST only)
router.post('/webhook/:token', (req, res) => {
  telegramService.handleWebhookUpdate(req, res);
});

// Generate a verification code for Telegram linking
router.post(
  '/generate-verification-code',
  protect,
  async (req, res, next) => {
    try {
      // Generate a random 6-digit code
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
      
      // Save the code to the user's account
      req.user.telegramVerificationCode = code;
      req.user.telegramVerificationExpires = expiresAt;
      await req.user.save({ validateBeforeSave: false });
      
      res.status(200).json({
        status: 'success',
        data: {
          code,
          expiresAt,
          instructions: 'Use this code in the MedReminder bot to link your Telegram account.'
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// Unlink Telegram account
router.post(
  '/unlink',
  protect,
  async (req, res, next) => {
    try {
      // Cancel any active reminders for this user
      if (req.user.telegramId) {
        telegramService.cancelUserReminders(req.user._id);
      }
      
      // Clear Telegram ID and verification data
      req.user.telegramId = undefined;
      req.user.telegramVerificationCode = undefined;
      req.user.telegramVerificationExpires = undefined;
      await req.user.save({ validateBeforeSave: false });
      
      res.status(200).json({
        status: 'success',
        message: 'Telegram account unlinked successfully.'
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get Telegram bot username and link
router.get(
  '/bot-info',
  protect,
  (req, res) => {
    const botUsername = process.env.TELEGRAM_BOT_USERNAME;
    
    if (!botUsername) {
      return res.status(503).json({
        status: 'error',
        message: 'Telegram bot is not configured.'
      });
    }
    
    res.status(200).json({
      status: 'success',
      data: {
        botUsername,
        botLink: `https://t.me/${botUsername}`,
        isLinked: !!req.user.telegramId
      }
    });
  }
);

module.exports = router;
