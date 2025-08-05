const express = require('express');
const medicationController = require('../controllers/medication.controller');
const { protect, restrictTo } = require('../middleware/auth.middleware');

const router = express.Router();

// Protect all routes after this middleware
router.use(protect);

// Doctor and admin routes for managing medications
router
  .route('/')
  .get(medicationController.getAllMedications)
  .post(restrictTo('doctor'), medicationController.createMedication);

// Patient routes for viewing their own medications
router.get(
  '/my-medications',
  restrictTo('patient'),
  medicationController.getMyMedications
);

// Medication statistics
router.get(
  '/stats/:patientId?',
  medicationController.getMedicationStats
);

// Single medication routes
router
  .route('/:id')
  .get(medicationController.getMedication)
  .patch(
    restrictTo('doctor', 'admin'),
    medicationController.updateMedication
  )
  .delete(
    restrictTo('doctor', 'admin'),
    medicationController.deleteMedication
  );

module.exports = router;
