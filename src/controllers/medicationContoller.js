const Medication = require('../models/Medication');
const User = require('../models/User');
const MedicationHistory = require('../models/MedicationHistory');
const { validationResult } = require('express-validator');
const { asyncHandler } = require('../middleware/asyncHandler');

// @desc    Get medications (role-based)
// @route   GET /api/medications
// @access  Private
const getMedications = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, active, startDate, endDate, search } = req.query;
  
  let query = {};
  
  // Role-based filtering
  if (req.user.role === 'doctor') {
    query.doctorId = req.user._id;
  } else if (req.user.role === 'patient') {
    query.patientId = req.user._id;
  }
  
  // Additional filters
  if (active !== undefined) {
    query.isActive = active === 'true';
  }
  
  if (startDate || endDate) {
    query.$and = [];
    if (startDate) {
      query.$and.push({ endDate: { $gte: new Date(startDate) } });
    }
    if (endDate) {
      query.$and.push({ startDate: { $lte: new Date(endDate) } });
    }
  }
  
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { instructions: { $regex: search, $options: 'i' } }
    ];
  }

  const options = {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    sort: { createdAt: -1 },
    populate: [
      { path: 'patientId', select: 'name email' },
      { path: 'doctorId', select: 'name clinicName' }
    ]
  };

  const medications = await Medication.paginate(query, options);

  res.status(200).json({
    success: true,
    data: medications.docs,
    pagination: {
      currentPage: medications.page,
      totalPages: medications.totalPages,
      totalItems: medications.totalDocs,
      hasNext: medications.hasNextPage,
      hasPrev: medications.hasPrevPage
    }
  });
});

// @desc    Get single medication
// @route   GET /api/medications/:id
// @access  Private
const getMedication = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  let query = { _id: req.params.id };
  
  // Role-based access control
  if (req.user.role === 'doctor') {
    query.doctorId = req.user._id;
  } else if (req.user.role === 'patient') {
    query.patientId = req.user._id;
  }

  const medication = await Medication.findOne(query)
    .populate('patientId', 'name email telegramId')
    .populate('doctorId', 'name clinicName');

  if (!medication) {
    return res.status(404).json({
      success: false,
      message: 'Medication not found'
    });
  }

  res.status(200).json({
    success: true,
    data: medication
  });
});

// @desc    Create medication
// @route   POST /api/medications
// @access  Private (Doctor only)
const createMedication = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const { patientId, name, dosage, timesPerDay, startDate, endDate, instructions, foodInstructions, sideEffects } = req.body;

  // Verify patient belongs to doctor
  const patient = await User.findOne({
    _id: patientId,
    doctorId: req.user._id,
    role: 'patient'
  });

  if (!patient) {
    return res.status(404).json({
      success: false,
      message: 'Patient not found or not assigned to you'
    });
  }

  const medicationData = {
    patientId,
    doctorId: req.user._id,
    name,
    dosage,
    timesPerDay,
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    instructions: instructions || '',
    foodInstructions: foodInstructions || 'no-restriction',
    sideEffects: sideEffects || ''
  };

  const medication = await Medication.create(medicationData);

  // Populate the created medication
  await medication.populate([
    { path: 'patientId', select: 'name email' },
    { path: 'doctorId', select: 'name clinicName' }
  ]);

  res.status(201).json({
    success: true,
    message: 'Medication created successfully',
    data: medication
  });
});

// @desc    Update medication
// @route   PUT /api/medications/:id
// @access  Private (Doctor only)
const updateMedication = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const medication = await Medication.findOne({
    _id: req.params.id,
    doctorId: req.user._id
  });

  if (!medication) {
    return res.status(404).json({
      success: false,
      message: 'Medication not found or you do not have permission to update it'
    });
  }

  // Update fields
  const updateFields = ['name', 'dosage', 'timesPerDay', 'startDate', 'endDate', 'instructions', 'isActive', 'foodInstructions', 'sideEffects'];
  
  updateFields.forEach(field => {
    if (req.body[field] !== undefined) {
      if (field === 'startDate' || field === 'endDate') {
        medication[field] = new Date(req.body[field]);
      } else {
        medication[field] = req.body[field];
      }
    }
  });

  await medication.save();

  await medication.populate([
    { path: 'patientId', select: 'name email' },
    { path: 'doctorId', select: 'name clinicName' }
  ]);

  res.status(200).json({
    success: true,
    message: 'Medication updated successfully',
    data: medication
  });
});

// @desc    Delete medication
// @route   DELETE /api/medications/:id
// @access  Private (Doctor only)
const deleteMedication = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const medication = await Medication.findOne({
    _id: req.params.id,
    doctorId: req.user._id
  });

  if (!medication) {
    return res.status(404).json({
      success: false,
      message: 'Medication not found or you do not have permission to delete it'
    });
  }

  await medication.deleteOne();

  res.status(200).json({
    success: true,
    message: 'Medication deleted successfully'
  });
});

// @desc    Toggle medication status
// @route   PATCH /api/medications/:id/toggle
// @access  Private (Doctor only)
const toggleMedicationStatus = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const medication = await Medication.findOne({
    _id: req.params.id,
    doctorId: req.user._id
  });

  if (!medication) {
    return res.status(404).json({
      success: false,
      message: 'Medication not found or you do not have permission to modify it'
    });
  }

  medication.isActive = !medication.isActive;
  await medication.save();

  res.status(200).json({
    success: true,
    message: `Medication ${medication.isActive ? 'activated' : 'deactivated'} successfully`,
    data: { isActive: medication.isActive }
  });
});

// @desc    Get today's medications
// @route   GET /api/medications/today
// @access  Private
const getTodaysMedications = asyncHandler(async (req, res) => {
  let patientId = null;
  
  if (req.user.role === 'patient') {
    patientId = req.user._id;
  }

  const medications = await Medication.findActiveForToday(patientId);

  // Filter by doctor if user is doctor
  let filteredMedications = medications;
  if (req.user.role === 'doctor') {
    filteredMedications = medications.filter(med => 
      med.doctorId._id.toString() === req.user._id.toString()
    );
  }

  res.status(200).json({
    success: true,
    data: filteredMedications,
    count: filteredMedications.length
  });
});

// @desc    Get medication statistics
// @route   GET /api/medications/stats
// @access  Private
const getMedicationStats = asyncHandler(async (req, res) => {
  let matchQuery = {};
  
  if (req.user.role === 'doctor') {
    matchQuery.doctorId = req.user._id;
  } else if (req.user.role === 'patient') {
    matchQuery.patientId = req.user._id;
  }

  const stats = await Medication.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: null,
        totalMedications: { $sum: 1 },
        activeMedications: {
          $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] }
        },
        inactiveMedications: {
          $sum: { $cond: [{ $eq: ['$isActive', false] }, 1, 0] }
        },
        currentMedications: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ['$isActive', true] },
                  { $lte: ['$startDate', new Date()] },
                  { $gte: ['$endDate', new Date()] }
                ]
              },
              1,
              0
            ]
          }
        }
      }
    }
  ]);

  const result = stats[0] || {
    totalMedications: 0,
    activeMedications: 0,
    inactiveMedications: 0,
    currentMedications: 0
  };

  res.status(200).json({
    success: true,
    data: result
  });
});

// @desc    Mark medication as taken
// @route   POST /api/medications/:id/taken
// @access  Private (Patient only)
const markAsTaken = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const medication = await Medication.findOne({
    _id: req.params.id,
    patientId: req.user._id
  });

  if (!medication) {
    return res.status(404).json({
      success: false,
      message: 'Medication not found or you do not have access to it'
    });
  }

  // Create medication history entry
  const historyEntry = await MedicationHistory.create({
    medicationId: medication._id,
    patientId: req.user._id,
    takenAt: new Date(),
    status: 'taken',
    notes: req.body.notes || ''
  });

  res.status(200).json({
    success: true,
    message: 'Medication marked as taken',
    data: historyEntry
  });
});

// @desc    Get medication history
// @route   GET /api/medications/:id/history
// @access  Private
const getMedicationHistory = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  let query = { _id: req.params.id };
  
  // Role-based access control
  if (req.user.role === 'doctor') {
    query.doctorId = req.user._id;
  } else if (req.user.role === 'patient') {
    query.patientId = req.user._id;
  }

  const medication = await Medication.findOne(query);

  if (!medication) {
    return res.status(404).json({
      success: false,
      message: 'Medication not found or you do not have access to it'
    });
  }

  const history = await MedicationHistory.find({
    medicationId: medication._id
  }).sort({ takenAt: -1 });

  res.status(200).json({
    success: true,
    data: history
  });
});

module.exports = {
  getMedications,
  getMedication,
  createMedication,
  updateMedication,
  deleteMedication,
  toggleMedicationStatus,
  getTodaysMedications,
  getMedicationStats,
  markAsTaken,
  getMedicationHistory
};