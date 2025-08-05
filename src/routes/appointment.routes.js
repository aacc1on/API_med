const express = require('express');
const appointmentController = require('../controllers/appointment.controller');
const authController = require('../controllers/auth.controller');
const { protect, restrictTo } = require('../middleware/auth.middleware');

const router = express.Router();

// Protect all routes after this middleware
router.use(protect);

// Doctor and admin routes
router
  .route('/')
  .get(restrictTo('doctor', 'admin'), appointmentController.getAllAppointments)
  .post(restrictTo('doctor'), appointmentController.createAppointment);

// Patient routes
router.get('/my-appointments', 
  restrictTo('patient'), 
  appointmentController.getMyAppointments
);

// Available time slots (public but protected)
router.get(
  '/available-slots',
  restrictTo('patient', 'doctor', 'admin'),
  appointmentController.getAvailableSlots
);

// Single appointment routes
router
  .route('/:id')
  .get(appointmentController.getAppointment)
  .patch(
    restrictTo('doctor', 'admin'),
    appointmentController.updateAppointment
  )
  .delete(
    restrictTo('doctor', 'admin'),
    appointmentController.deleteAppointment
  );

// Export the router
module.exports = router;
