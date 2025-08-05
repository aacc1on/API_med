const { promisify } = require('util');
const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');

// Middleware to protect routes - requires authentication
exports.protect = catchAsync(async (req, res, next) => {
  // 1) Get token from header or cookie
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies.jwt) {
    token = req.cookies.jwt;
  }

  if (!token) {
    return next(
      new AppError('You are not logged in! Please log in to get access.', 401)
    );
  }

  // 2) Verify token
  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

  // 3) Check if user still exists
  const currentUser = await User.findById(decoded.id);
  if (!currentUser) {
    return next(
      new AppError('The user belonging to this token no longer exists.', 401)
    );
  }

  // 4) Check if user changed password after the token was issued
  if (currentUser.changedPasswordAfter(decoded.iat)) {
    return next(
      new AppError('User recently changed password! Please log in again.', 401)
    );
  }

  // GRANT ACCESS TO PROTECTED ROUTE
  req.user = currentUser;
  res.locals.user = currentUser;
  next();
});

// Middleware to restrict routes to specific roles
exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError('You do not have permission to perform this action', 403)
      );
    }
    next();
  };
};

// Middleware to check if user is the owner of the resource
exports.isOwner = (model) => {
  return catchAsync(async (req, res, next) => {
    const doc = await model.findById(req.params.id);
    
    if (!doc) {
      return next(new AppError('No document found with that ID', 404));
    }

    // Check if the document belongs to the user or if user is admin/doctor
    const isOwner = doc.patient && doc.patient.toString() === req.user.id;
    const isDoctor = req.user.role === 'doctor' && doc.doctor && doc.doctor.toString() === req.user.id;
    const isAdmin = req.user.role === 'admin';
    
    if (!isOwner && !isDoctor && !isAdmin) {
      return next(
        new AppError('You do not have permission to perform this action', 403)
      );
    }

    next();
  });
};

// Middleware to set filter for doctor's own patients
exports.setDoctorPatientFilter = (req, res, next) => {
  // If user is a doctor, they can only see their own patients
  if (req.user.role === 'doctor') {
    req.filter = { doctor: req.user._id };
  }
  next();
};

// Middleware to set filter for patient's own data
exports.setPatientFilter = (req, res, next) => {
  // If user is a patient, they can only see their own data
  if (req.user.role === 'patient') {
    req.filter = { patient: req.user._id };
  }
  next();
};
