const express = require('express');
const adminController = require('../controllers/admin.controller');
const { protect, restrictTo } = require('../middleware/auth.middleware');

const router = express.Router();

// Protect all routes with authentication and admin restriction
router.use(protect);
router.use(restrictTo('admin'));

// Dashboard routes
router.get('/dashboard', adminController.getDashboardStats);
router.get('/health', adminController.getHealthStatus);

// User management routes
router
  .route('/users')
  .get(adminController.getAllUsers)
  .post(adminController.createUser);

router
  .route('/users/:id')
  .get(adminController.getUser)
  .patch(adminController.updateUser)
  .delete(adminController.deleteUser);

// Appointment management routes
router.get('/appointments', adminController.getAllAppointments);

// Medication management routes
router.get('/medications', adminController.getAllMedications);

// System logs
router.get('/logs', adminController.getLogs);

module.exports = router;
