// src/routes/userRoutes.js
const express = require('express');
const { auth, requireDoctor } = require('../middleware/authMiddleware');
const User = require('../models/User');
const { asyncHandler } = require('../middleware/asyncHandler');

const router = express.Router();

router.use(auth);

// Get doctor's patients
router.get('/patients', requireDoctor, asyncHandler(async (req, res) => {
  const patients = await User.findPatientsByDoctor(req.user._id);
  res.json({
    success: true,
    data: patients
  });
}));

// Assign patient to doctor
router.post('/assign-patient/:patientId', requireDoctor, asyncHandler(async (req, res) => {
  const patient = await User.findByIdAndUpdate(
    req.params.patientId,
    { doctorId: req.user._id },
    { new: true }
  );
  
  if (!patient) {
    return res.status(404).json({
      success: false,
      message: 'Patient not found'
    });
  }
  
  res.json({
    success: true,
    message: 'Patient assigned successfully',
    data: patient
  });
}));

module.exports = router;