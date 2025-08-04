const express = require('express');
const { body, param, query } = require('express-validator');
const medicationController = require('../controllers/medicationController');
const { auth, requireDoctor, requirePatient } = require('../middleware/authMiddleware');

const router = express.Router();

// All routes require authentication
router.use(auth);

// Validation rules
const createMedicationValidation = [
  body('patientId')
    .isMongoId()
    .withMessage('Valid patient ID is required'),
  
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Medication name must be between 2 and 100 characters'),
  
  body('dosage')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Dosage is required and must not exceed 50 characters'),
  
  body('timesPerDay')
    .isArray({ min: 1 })
    .withMessage('At least one time per day is required'),
  
  body('timesPerDay.*')
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Invalid time format. Use HH:MM (24-hour format)'),
  
  body('startDate')
    .isISO8601()
    .withMessage('Valid start date is required'),
  
  body('endDate')
    .isISO8601()
    .withMessage('Valid end date is required')
    .custom((endDate, { req }) => {
      if (new Date(endDate) <= new Date(req.body.startDate)) {
        throw new Error('End date must be after start date');
      }
      return true;
    }),
  
  body('instructions')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Instructions cannot exceed 500 characters')
];

const updateMedicationValidation = [
  param('id').isMongoId().withMessage('Valid medication ID is required'),
  
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Medication name must be between 2 and 100 characters'),
  
  body('dosage')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Dosage must not exceed 50 characters'),
  
  body('timesPerDay')
    .optional()
    .isArray({ min: 1 })
    .withMessage('At least one time per day is required'),
  
  body('timesPerDay.*')
    .optional()
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Invalid time format. Use HH:MM (24-hour format)'),
  
  body('startDate')
    .optional()
    .isISO8601()
    .withMessage('Valid start date is required'),
  
  body('endDate')
    .optional()
    .isISO8601()
    .withMessage('Valid end date is required'),
  
  body('instructions')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Instructions cannot exceed 500 characters'),
  
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean value')
];

const idValidation = [
  param('id').isMongoId().withMessage('Valid medication ID is required')
];

const queryValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  
  query('active')
    .optional()
    .isBoolean()
    .withMessage('Active filter must be a boolean'),
  
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid date'),
  
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid date')
];

// Routes

// GET /api/medications - Get medications (role-based)
router.get('/', queryValidation, medicationController.getMedications);

// GET /api/medications/stats - Get medication statistics
router.get('/stats', medicationController.getMedicationStats);

// GET /api/medications/today - Get today's medications
router.get('/today', medicationController.getTodaysMedications);

// GET /api/medications/:id - Get single medication
router.get('/:id', idValidation, medicationController.getMedication);

// POST /api/medications - Create medication (doctors only)
router.post('/', requireDoctor, createMedicationValidation, medicationController.createMedication);

// PUT /api/medications/:id - Update medication (doctors only)
router.put('/:id', requireDoctor, updateMedicationValidation, medicationController.updateMedication);

// DELETE /api/medications/:id - Delete medication (doctors only)
router.delete('/:id', requireDoctor, idValidation, medicationController.deleteMedication);

// PATCH /api/medications/:id/toggle - Toggle medication active status (doctors only)
router.patch('/:id/toggle', requireDoctor, idValidation, medicationController.toggleMedicationStatus);

// POST /api/medications/:id/taken - Mark medication as taken (patients only)
router.post('/:id/taken', requirePatient, idValidation, medicationController.markAsTaken);

// GET /api/medications/:id/history - Get medication taking history
router.get('/:id/history', idValidation, medicationController.getMedicationHistory);

module.exports = router;