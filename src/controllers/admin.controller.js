const User = require('../models/user.model');
const Appointment = require('../models/appointment.model');
const Medication = require('../models/medication.model');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const logger = require('../config/logger');

// @desc    Get dashboard statistics
// @route   GET /api/admin/dashboard
// @access  Private/Admin
exports.getDashboardStats = catchAsync(async (req, res, next) => {
  const [
    totalPatients,
    totalDoctors,
    totalAppointments,
    activeMedications,
    recentAppointments,
    recentMedications
  ] = await Promise.all([
    // Count total patients
    User.countDocuments({ role: 'patient' }),
    
    // Count total doctors
    User.countDocuments({ role: 'doctor' }),
    
    // Count total appointments (last 30 days)
    Appointment.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    }),
    
    // Count active medications
    Medication.countDocuments({ status: 'active' }),
    
    // Get recent appointments
    Appointment.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('patient', 'name email')
      .populate('doctor', 'name'),
      
    // Get recent medications
    Medication.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('patient', 'name email')
      .populate('doctor', 'name')
  ]);

  // Calculate appointment statistics
  const appointmentStats = await Appointment.aggregate([
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } },
    { $limit: 7 }
  ]);

  // Calculate medication statistics
  const medicationStats = await Medication.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      stats: {
        totalPatients,
        totalDoctors,
        totalAppointments,
        activeMedications
      },
      recentAppointments,
      recentMedications,
      charts: {
        appointmentStats,
        medicationStats
      }
    }
  });
});

// @desc    Get all users with filtering and pagination
// @route   GET /api/admin/users
// @access  Private/Admin
exports.getAllUsers = catchAsync(async (req, res, next) => {
  const { role, search, page = 1, limit = 10 } = req.query;
  
  // Build query
  const query = {};
  if (role) query.role = role;
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } }
    ];
  }
  
  // Execute query with pagination
  const users = await User.find(query)
    .select('-password -passwordChangedAt -passwordResetToken -passwordResetExpires')
    .sort({ createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);
    
  // Get total count for pagination
  const total = await User.countDocuments(query);
  
  res.status(200).json({
    status: 'success',
    results: users.length,
    total,
    totalPages: Math.ceil(total / limit),
    currentPage: +page,
    data: {
      users
    }
  });
});

// @desc    Get user by ID
// @route   GET /api/admin/users/:id
// @access  Private/Admin
exports.getUser = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.params.id)
    .select('-password -passwordChangedAt -passwordResetToken -passwordResetExpires');
    
  if (!user) {
    return next(new AppError('No user found with that ID', 404));
  }
  
  res.status(200).json({
    status: 'success',
    data: {
      user
    }
  });
});

// @desc    Create a new user (admin only)
// @route   POST /api/admin/users
// @access  Private/Admin
exports.createUser = catchAsync(async (req, res, next) => {
  const { name, email, password, role, phone, specialization } = req.body;
  
  // Check if user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return next(new AppError('Email already in use', 400));
  }
  
  // Create new user
  const newUser = await User.create({
    name,
    email,
    password,
    role: role || 'patient',
    ...(phone && { phone }),
    ...(role === 'doctor' && { specialization }),
    isVerified: true // Admin-created users are automatically verified
  });
  
  // Remove password from output
  newUser.password = undefined;
  
  res.status(201).json({
    status: 'success',
    data: {
      user: newUser
    }
  });
});

// @desc    Update user
// @route   PATCH /api/admin/users/:id
// @access  Private/Admin
exports.updateUser = catchAsync(async (req, res, next) => {
  const { name, email, role, phone, specialization, isActive } = req.body;
  
  const user = await User.findById(req.params.id);
  if (!user) {
    return next(new AppError('No user found with that ID', 404));
  }
  
  // Update user fields
  if (name) user.name = name;
  if (email) user.email = email;
  if (role) user.role = role;
  if (phone !== undefined) user.phone = phone;
  if (specialization !== undefined) user.specialization = specialization;
  if (isActive !== undefined) user.active = isActive;
  
  await user.save({ validateBeforeSave: false });
  
  // Remove sensitive data
  user.password = undefined;
  user.passwordChangedAt = undefined;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  
  res.status(200).json({
    status: 'success',
    data: {
      user
    }
  });
});

// @desc    Delete user
// @route   DELETE /api/admin/users/:id
// @access  Private/Admin
exports.deleteUser = catchAsync(async (req, res, next) => {
  const user = await User.findByIdAndDelete(req.params.id);
  
  if (!user) {
    return next(new AppError('No user found with that ID', 404));
  }
  
  // Cancel any active reminders for this user
  if (user.telegramId) {
    const { cancelUserReminders } = require('../services/telegram.service');
    cancelUserReminders(user._id);
  }
  
  res.status(204).json({
    status: 'success',
    data: null
  });
});

// @desc    Get all appointments with filtering and pagination
// @route   GET /api/admin/appointments
// @access  Private/Admin
exports.getAllAppointments = catchAsync(async (req, res, next) => {
  const { status, doctorId, patientId, startDate, endDate, page = 1, limit = 10 } = req.query;
  
  // Build query
  const query = {};
  if (status) query.status = status;
  if (doctorId) query.doctor = doctorId;
  if (patientId) query.patient = patientId;
  
  // Date range filter
  if (startDate || endDate) {
    query.date = {};
    if (startDate) query.date.$gte = new Date(startDate);
    if (endDate) query.date.$lte = new Date(endDate);
  }
  
  // Execute query with pagination
  const appointments = await Appointment.find(query)
    .populate('patient', 'name email')
    .populate('doctor', 'name specialization')
    .sort({ date: 1, startTime: 1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);
    
  // Get total count for pagination
  const total = await Appointment.countDocuments(query);
  
  res.status(200).json({
    status: 'success',
    results: appointments.length,
    total,
    totalPages: Math.ceil(total / limit),
    currentPage: +page,
    data: {
      appointments
    }
  });
});

// @desc    Get all medications with filtering and pagination
// @route   GET /api/admin/medications
// @access  Private/Admin
exports.getAllMedications = catchAsync(async (req, res, next) => {
  const { status, doctorId, patientId, isCritical, page = 1, limit = 10 } = req.query;
  
  // Build query
  const query = {};
  if (status) query.status = status;
  if (doctorId) query.doctor = doctorId;
  if (patientId) query.patient = patientId;
  if (isCritical !== undefined) query.isCritical = isCritical === 'true';
  
  // Execute query with pagination
  const medications = await Medication.find(query)
    .populate('patient', 'name email')
    .populate('doctor', 'name specialization')
    .sort({ startDate: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);
    
  // Get total count for pagination
  const total = await Medication.countDocuments(query);
  
  res.status(200).json({
    status: 'success',
    results: medications.length,
    total,
    totalPages: Math.ceil(total / limit),
    currentPage: +page,
    data: {
      medications
    }
  });
});

// @desc    Get system logs
// @route   GET /api/admin/logs
// @access  Private/Admin
exports.getLogs = catchAsync(async (req, res, next) => {
  const { level, search, startDate, endDate, page = 1, limit = 50 } = req.query;
  
  // In a production environment, you would query your logging system here
  // For this example, we'll return a simplified response
  
  res.status(200).json({
    status: 'success',
    message: 'Log retrieval endpoint. In a production environment, this would return actual log data.',
    query: {
      level,
      search,
      startDate,
      endDate,
      page,
      limit
    }
  });
});

// @desc    Get system health status
// @route   GET /api/admin/health
// @access  Private/Admin
exports.getHealthStatus = catchAsync(async (req, res, next) => {
  // Check database connection
  const dbStatus = await checkDatabaseConnection();
  
  // Check external services (e.g., email, storage)
  const externalServices = {
    database: dbStatus,
    email: true, // In a real app, you would check email service status
    storage: true // In a real app, you would check storage service status
  };
  
  // Get system resources
  const systemResources = {
    memoryUsage: process.memoryUsage(),
    uptime: process.uptime(),
    nodeVersion: process.version,
    platform: process.platform,
    environment: process.env.NODE_ENV || 'development'
  };
  
  // Check if all services are healthy
  const isHealthy = Object.values(externalServices).every(status => status === true);
  
  res.status(200).json({
    status: 'success',
    data: {
      status: isHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      externalServices,
      systemResources
    }
  });
});

// Helper function to check database connection
async function checkDatabaseConnection() {
  try {
    // Simple query to check database connection
    await User.findOne().limit(1);
    return true;
  } catch (error) {
    logger.error(`Database connection error: ${error.message}`);
    return false;
  }
}
