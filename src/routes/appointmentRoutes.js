const express = require('express');
const { body, param } = require('express-validator');
const { auth, requireDoctor, requirePatient } = require('../middleware/authMiddleware');
const Appointment = require('../models/Appointment');
const { asyncHandler } = require('../middleware/asyncHandler');

const router = express.Router();

router.use(auth);

// Get appointments
router.get('/', asyncHandler(async (req, res) => {
  let query = {};
  
  if (req.user.role === 'doctor') {
    query.doctorId = req.user._id;
  } else {
    query.patientId = req.user._id;
  }
  
  const appointments = await Appointment.find(query)
    .populate('patientId', 'name email')
    .populate('doctorId', 'name clinicName')
    .sort({ date: 1, time: 1 });
  
  res.json({
    success: true,
    data: appointments
  });
}));

// Create appointment
router.post('/', requireDoctor, [
  body('patientId').isMongoId(),
  body('date').isISO8601(),
  body('time').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
  body('location').isLength({ min: 1, max: 200 })
], asyncHandler(async (req, res) => {
  const appointment = await Appointment.create({
    ...req.body,
    doctorId: req.user._id
  });
  
  await appointment.populate([
    { path: 'patientId', select: 'name email' },
    { path: 'doctorId', select: 'name clinicName' }
  ]);
  
  res.status(201).json({
    success: true,
    data: appointment
  });
}));

module.exports = router;