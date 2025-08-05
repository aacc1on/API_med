const express = require('express');
const authController = require('../controllers/auth.controller');
const { protect, restrictTo } = require('../middleware/auth.middleware');

const router = express.Router();

// Public routes
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/forgot-password', authController.forgotPassword);
router.patch('/reset-password/:token', authController.resetPassword);

// Protected routes - require authentication
router.use(protect);

router.get('/me', (req, res) => {
  res.status(200).json({
    status: 'success',
    data: {
      user: req.user,
    },
  });
});

router.patch('/update-password', authController.updatePassword);
router.post('/logout', authController.logout);
router.post('/verify-telegram', authController.verifyTelegramId);

// Admin only routes
router.use(restrictTo('admin'));
// Add admin-specific auth routes here if needed

module.exports = router;
