const Medication = require('../models/medication.model');
const User = require('../models/user.model');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const logger = require('../config/logger');
const { scheduleMedicationReminders } = require('../services/telegram.service');

// @desc    Get all medications (for doctors/admins)
// @route   GET /api/medications
// @access  Private (Doctor/Admin)
exports.getAllMedications = catchAsync(async (req, res, next) => {
  // If user is admin, get all medications, otherwise get only doctor's prescribed medications
  const filter = req.user.role === 'admin' ? {} : { doctor: req.user.id };

  const medications = await Medication.find(filter)
    .populate('patient', 'name email')
    .populate('doctor', 'name email')
    .sort({ startDate: -1 });

  res.status(200).json({
    status: 'success',
    results: medications.length,
    data: {
      medications
    }
  });
});

// @desc    Get logged in patient's medications
// @route   GET /api/medications/my-medications
// @access  Private (Patient)
exports.getMyMedications = catchAsync(async (req, res, next) => {
  const medications = await Medication.find({ patient: req.user.id })
    .populate('doctor', 'name email')
    .sort({ startDate: -1 });

  res.status(200).json({
    status: 'success',
    results: medications.length,
    data: {
      medications
    }
  });
});

// @desc    Create a new medication
// @route   POST /api/medications
// @access  Private (Doctor)
exports.createMedication = catchAsync(async (req, res, next) => {
  const { 
    patientId, 
    name, 
    dosage, 
    frequency, 
    instructions, 
    startDate, 
    endDate, 
    isCritical 
  } = req.body;
  
  // 1) Check if patient exists and is a patient
  const patient = await User.findById(patientId);
  if (!patient || patient.role !== 'patient') {
    return next(new AppError('No patient found with that ID', 404));
  }

  // 2) Create medication
  const medication = await Medication.create({
    patient: patientId,
    doctor: req.user.id,
    name,
    dosage,
    frequency,
    instructions,
    startDate: startDate || Date.now(),
    endDate,
    isCritical: isCritical || false
  });

  // 3) Schedule reminders if patient has Telegram ID
  if (patient.telegramId) {
    try {
      await scheduleMedicationReminders(medication, patient);
    } catch (err) {
      logger.error(`Error scheduling medication reminders: ${err.message}`);
    }
  }

  res.status(201).json({
    status: 'success',
    data: {
      medication
    }
  });
});

// @desc    Get all medications (filtered by role)
// @route   GET /api/medications
// @access  Private
exports.getAllMedications = catchAsync(async (req, res, next) => {
  // Create a filter object based on user role
  const filter = {};
  
  if (req.user.role === 'doctor') {
    filter.doctor = req.user.id;
  } else if (req.user.role === 'patient') {
    filter.patient = req.user.id;
  }
  
  // Add additional filters from query params
  if (req.query.status) {
    filter.status = req.query.status;
  }
  
  if (req.query.isCritical) {
    filter.isCritical = req.query.isCritical === 'true';
  }

  const medications = await Medication.find(filter)
    .sort({ startDate: -1 })
    .populate('patient', 'name email')
    .populate('doctor', 'name specialization');

  res.status(200).json({
    status: 'success',
    results: medications.length,
    data: {
      medications
    }
  });
});

// @desc    Get single medication
// @route   GET /api/medications/:id
// @access  Private
exports.getMedication = catchAsync(async (req, res, next) => {
  const medication = await Medication.findById(req.params.id)
    .populate('patient', 'name email')
    .populate('doctor', 'name specialization');

  if (!medication) {
    return next(new AppError('No medication found with that ID', 404));
  }

  // Check if user has permission to view this medication
  if (
    medication.doctor._id.toString() !== req.user.id &&
    medication.patient._id.toString() !== req.user.id &&
    req.user.role !== 'admin'
  ) {
    return next(
      new AppError('You do not have permission to view this medication', 403)
    );
  }

  res.status(200).json({
    status: 'success',
    data: {
      medication
    }
  });
});

// @desc    Update medication
// @route   PATCH /api/medications/:id
// @access  Private
exports.updateMedication = catchAsync(async (req, res, next) => {
  const { 
    name, 
    dosage, 
    frequency, 
    instructions, 
    status, 
    isCritical 
  } = req.body;
  
  // 1) Get medication
  const medication = await Medication.findById(req.params.id);
  
  if (!medication) {
    return next(new AppError('No medication found with that ID', 404));
  }

  // 2) Check if user has permission to update
  if (
    medication.doctor.toString() !== req.user.id &&
    req.user.role !== 'admin'
  ) {
    return next(
      new AppError('You do not have permission to update this medication', 403)
    );
  }

  // 3) Update medication
  const updatedMedication = await Medication.findByIdAndUpdate(
    req.params.id,
    {
      name: name || medication.name,
      dosage: dosage || medication.dosage,
      frequency: frequency || medication.frequency,
      instructions: instructions !== undefined ? instructions : medication.instructions,
      status: status || medication.status,
      isCritical: isCritical !== undefined ? isCritical : medication.isCritical
    },
    {
      new: true,
      runValidators: true
    }
  )
  .populate('patient', 'name email telegramId')
  .populate('doctor', 'name');

  // 4) Reschedule reminders if medication is active and patient has Telegram ID
  if (
    updatedMedication.status === 'active' && 
    updatedMedication.patient.telegramId
  ) {
    try {
      await scheduleMedicationReminders(updatedMedication, updatedMedication.patient);
    } catch (err) {
      logger.error(`Error rescheduling medication reminders: ${err.message}`);
    }
  }

  res.status(200).json({
    status: 'success',
    data: {
      medication: updatedMedication
    }
  });
});

// @desc    Delete medication
// @route   DELETE /api/medications/:id
// @access  Private
exports.deleteMedication = catchAsync(async (req, res, next) => {
  const medication = await Medication.findById(req.params.id);

  if (!medication) {
    return next(new AppError('No medication found with that ID', 404));
  }

  // Check if user has permission to delete
  if (
    medication.doctor.toString() !== req.user.id &&
    req.user.role !== 'admin'
  ) {
    return next(
      new AppError('You do not have permission to delete this medication', 403)
    );
  }

  // In a real app, we would also cancel any scheduled reminders here
  await Medication.findByIdAndDelete(req.params.id);

  res.status(204).json({
    status: 'success',
    data: null
  });
});

// @desc    Get medication adherence statistics
// @route   GET /api/medications/stats/:patientId
// @access  Private
exports.getMedicationStats = catchAsync(async (req, res, next) => {
  const { patientId } = req.params;
  
  // Check if user has permission to view these stats
  if (
    req.user.role === 'patient' && 
    req.user.id !== patientId
  ) {
    return next(
      new AppError('You do not have permission to view these statistics', 403)
    );
  }

  // In a real app, we would query the database for actual adherence data
  // For now, we'll return mock data
  const stats = {
    patient: patientId,
    totalMedications: 0,
    activeMedications: 0,
    adherenceRate: 0,
    nextDose: null,
    criticalMedications: []
  };

  // Get all medications for the patient
  const medications = await Medication.find({ 
    patient: patientId,
    status: { $ne: 'completed' }
  });

  stats.totalMedications = medications.length;
  stats.activeMedications = medications.filter(m => m.status === 'active').length;
  
  // Calculate adherence rate (mock data - in a real app, this would be based on actual adherence data)
  if (medications.length > 0) {
    const adherenceData = medications.map(m => ({
      medicationId: m._id,
      name: m.name,
      adherence: Math.floor(Math.random() * 100) // Random adherence for demo
    }));
    
    const totalAdherence = adherenceData.reduce((sum, m) => sum + m.adherence, 0);
    stats.adherenceRate = Math.round(totalAdherence / medications.length);
    stats.medicationAdherence = adherenceData;
    
    // Find critical medications with low adherence
    stats.criticalMedications = adherenceData
      .filter(m => m.adherence < 70)
      .map(m => ({
        medicationId: m.medicationId,
        name: m.name,
        adherence: m.adherence
      }));
  }

  // Find next scheduled dose
  const now = new Date();
  const upcomingMeds = [];
  
  for (const med of medications.filter(m => m.status === 'active')) {
    if (med.frequency && med.frequency.specificTimes) {
      for (const time of med.frequency.specificTimes) {
        const [hours, minutes] = time.split(':').map(Number);
        const nextDose = new Date();
        nextDose.setHours(hours, minutes, 0, 0);
        
        // If the time has already passed today, schedule for tomorrow
        if (nextDose < now) {
          nextDose.setDate(nextDose.getDate() + 1);
        }
        
        upcomingMeds.push({
          medicationId: med._id,
          name: med.name,
          nextDose,
          dosage: med.dosage,
          instructions: med.instructions
        });
      }
    }
  }
  
  // Sort by nextDose and get the earliest one
  if (upcomingMeds.length > 0) {
    upcomingMeds.sort((a, b) => a.nextDose - b.nextDose);
    stats.nextDose = upcomingMeds[0];
  }

  res.status(200).json({
    status: 'success',
    data: {
      stats
    }
  });
});
