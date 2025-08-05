const Appointment = require('../models/appointment.model');
const User = require('../models/user.model');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const logger = require('../config/logger');
const Email = require('../utils/email');

// @desc    Get all appointments (for doctors/admins)
// @route   GET /api/appointments
// @access  Private (Doctor/Admin)
exports.getAllAppointments = catchAsync(async (req, res, next) => {
  // If user is admin, get all appointments, otherwise get only doctor's appointments
  const filter = req.user.role === 'admin' ? {} : { doctor: req.user.id };

  const appointments = await Appointment.find(filter)
    .populate('doctor', 'name email')
    .populate('patient', 'name email')
    .sort({ date: 1, startTime: 1 });

  res.status(200).json({
    status: 'success',
    results: appointments.length,
    data: {
      appointments
    }
  });
});

// @desc    Get a single appointment
// @route   GET /api/appointments/:id
// @access  Private
exports.getAppointment = catchAsync(async (req, res, next) => {
  const appointment = await Appointment.findById(req.params.id)
    .populate('doctor', 'name email')
    .populate('patient', 'name email');

  if (!appointment) {
    return next(new AppError('No appointment found with that ID', 404));
  }

  // Check if the requesting user is the doctor, patient, or admin
  if (
    req.user.role !== 'admin' &&
    appointment.doctor._id.toString() !== req.user.id &&
    appointment.patient._id.toString() !== req.user.id
  ) {
    return next(new AppError('Not authorized to view this appointment', 403));
  }

  res.status(200).json({
    status: 'success',
    data: {
      appointment
    }
  });
});

// Helper function to check time slot availability
// @desc    Get logged in patient's appointments
// @route   GET /api/appointments/my-appointments
// @access  Private (Patient)
exports.getMyAppointments = catchAsync(async (req, res, next) => {
  const appointments = await Appointment.find({ patient: req.user.id })
    .populate('doctor', 'name email')
    .sort({ date: 1, startTime: 1 });

  res.status(200).json({
    status: 'success',
    results: appointments.length,
    data: {
      appointments
    }
  });
});

// @desc    Delete an appointment
// @route   DELETE /api/appointments/:id
// @access  Private (Doctor/Admin)
exports.deleteAppointment = catchAsync(async (req, res, next) => {
  const appointment = await Appointment.findByIdAndDelete(req.params.id);

  if (!appointment) {
    return next(new AppError('No appointment found with that ID', 404));
  }

  // Check if the requesting user is authorized
  if (req.user.role !== 'admin' && appointment.doctor.toString() !== req.user.id) {
    return next(new AppError('Not authorized to delete this appointment', 403));
  }

  res.status(204).json({
    status: 'success',
    data: null
  });
});

// Helper function to check time slot availability
const checkTimeSlotAvailability = async (doctorId, date, startTime, endTime, excludeAppointmentId = null) => {
  const query = {
    doctor: doctorId,
    date: new Date(date),
    $or: [
      // New appointment starts during existing appointment
      { 
        startTime: { $lt: endTime },
        endTime: { $gt: startTime }
      },
      // New appointment ends during existing appointment
      {
        startTime: { $lt: endTime },
        endTime: { $gt: startTime }
      },
      // New appointment completely contains existing appointment
      {
        startTime: { $gte: startTime },
        endTime: { $lte: endTime }
      }
    ]
  };

  if (excludeAppointmentId) {
    query._id = { $ne: excludeAppointmentId };
  }

  const conflictingAppointments = await Appointment.find(query);
  return conflictingAppointments.length === 0;
};

// @desc    Create a new appointment
// @route   POST /api/appointments
// @access  Private (Doctor)
exports.createAppointment = catchAsync(async (req, res, next) => {
  const { patientId, date, startTime, endTime, reason, notes, isVirtual } = req.body;
  
  // 1) Check if patient exists
  const patient = await User.findById(patientId);
  if (!patient || patient.role !== 'patient') {
    return next(new AppError('No patient found with that ID', 404));
  }

  // 2) Check if time slot is available
  const isAvailable = await checkTimeSlotAvailability(
    req.user.id,
    date,
    startTime,
    endTime
  );

  if (!isAvailable) {
    return next(new AppError('The selected time slot is not available', 400));
  }

  // 3) Create appointment
  const appointment = await Appointment.create({
    doctor: req.user.id,
    patient: patientId,
    date,
    startTime,
    endTime,
    reason,
    notes,
    isVirtual
  });

  // 4) Send confirmation email to patient
  try {
    const url = `${req.protocol}://${req.get('host')}/my-appointments`;
    await new Email(patient, url).sendAppointmentConfirmation({
      doctorName: req.user.name,
      date: new Date(date).toLocaleDateString(),
      time: startTime,
      reason
    });
  } catch (err) {
    logger.error(`Error sending appointment confirmation email: ${err.message}`);
  }

  res.status(201).json({
    status: 'success',
    data: {
      appointment
    }
  });
});

// @desc    Get all appointments (filtered by role)
// @route   GET /api/appointments
// @access  Private
exports.getAllAppointments = catchAsync(async (req, res, next) => {
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
  
  if (req.query.startDate && req.query.endDate) {
    filter.date = {
      $gte: new Date(req.query.startDate),
      $lte: new Date(req.query.endDate)
    };
  }

  const appointments = await Appointment.find(filter)
    .sort({ date: 1, startTime: 1 })
    .populate('patient', 'name email phone')
    .populate('doctor', 'name specialization');

  res.status(200).json({
    status: 'success',
    results: appointments.length,
    data: {
      appointments
    }
  });
});

// @desc    Get single appointment
// @route   GET /api/appointments/:id
// @access  Private
exports.getAppointment = catchAsync(async (req, res, next) => {
  const appointment = await Appointment.findById(req.params.id)
    .populate('patient', 'name email phone')
    .populate('doctor', 'name specialization');

  if (!appointment) {
    return next(new AppError('No appointment found with that ID', 404));
  }

  // Check if user has permission to view this appointment
  if (
    appointment.doctor._id.toString() !== req.user.id &&
    appointment.patient._id.toString() !== req.user.id &&
    req.user.role !== 'admin'
  ) {
    return next(
      new AppError('You do not have permission to view this appointment', 403)
    );
  }

  res.status(200).json({
    status: 'success',
    data: {
      appointment
    }
  });
});

// @desc    Update appointment
// @route   PATCH /api/appointments/:id
// @access  Private
exports.updateAppointment = catchAsync(async (req, res, next) => {
  const { date, startTime, endTime, status, notes } = req.body;
  
  // 1) Get appointment
  const appointment = await Appointment.findById(req.params.id);
  
  if (!appointment) {
    return next(new AppError('No appointment found with that ID', 404));
  }

  // 2) Check if user has permission to update
  if (
    appointment.doctor.toString() !== req.user.id &&
    req.user.role !== 'admin'
  ) {
    return next(
      new AppError('You do not have permission to update this appointment', 403)
    );
  }

  // 3) If updating time, check if new time slot is available
  if (date || startTime || endTime) {
    const checkDate = date ? new Date(date) : appointment.date;
    const checkStartTime = startTime || appointment.startTime;
    const checkEndTime = endTime || appointment.endTime;
    
    const isAvailable = await checkTimeSlotAvailability(
      appointment.doctor,
      checkDate,
      checkStartTime,
      checkEndTime,
      req.params.id
    );

    if (!isAvailable) {
      return next(new AppError('The selected time slot is not available', 400));
    }
  }

  // 4) Update appointment
  const updatedAppointment = await Appointment.findByIdAndUpdate(
    req.params.id,
    {
      date: date || appointment.date,
      startTime: startTime || appointment.startTime,
      endTime: endTime || appointment.endTime,
      status: status || appointment.status,
      notes: notes !== undefined ? notes : appointment.notes
    },
    {
      new: true,
      runValidators: true
    }
  )
  .populate('patient', 'name email')
  .populate('doctor', 'name');

  // 5) Send update notification if time or status changed
  if ((date || startTime || endTime || status) && updatedAppointment.patient.email) {
    try {
      const changes = [];
      if (date) changes.push(`date to ${new Date(date).toLocaleDateString()}`);
      if (startTime) changes.push(`start time to ${startTime}`);
      if (endTime) changes.push(`end time to ${endTime}`);
      if (status) changes.push(`status to ${status}`);

      const url = `${req.protocol}://${req.get('host')}/my-appointments`;
      await new Email(updatedAppointment.patient, url).sendAppointmentUpdate({
        doctorName: updatedAppointment.doctor.name,
        changes: changes.join(', ')
      });
    } catch (err) {
      logger.error(`Error sending appointment update email: ${err.message}`);
    }
  }

  res.status(200).json({
    status: 'success',
    data: {
      appointment: updatedAppointment
    }
  });
});

// @desc    Delete appointment
// @route   DELETE /api/appointments/:id
// @access  Private
exports.deleteAppointment = catchAsync(async (req, res, next) => {
  const appointment = await Appointment.findById(req.params.id);

  if (!appointment) {
    return next(new AppError('No appointment found with that ID', 404));
  }

  // Check if user has permission to delete
  if (
    appointment.doctor.toString() !== req.user.id &&
    req.user.role !== 'admin'
  ) {
    return next(
      new AppError('You do not have permission to delete this appointment', 403)
    );
  }

  await Appointment.findByIdAndDelete(req.params.id);

  res.status(204).json({
    status: 'success',
    data: null
  });
});

// @desc    Get available time slots for a doctor on a specific date
// @route   GET /api/appointments/available-slots
// @access  Private
exports.getAvailableSlots = catchAsync(async (req, res, next) => {
  const { doctorId, date, duration = 30 } = req.query;
  
  if (!doctorId || !date) {
    return next(
      new AppError('Please provide doctorId and date to check availability', 400)
    );
  }

  // 1) Get doctor's working hours (in a real app, this would come from the doctor's profile)
  const workingHours = {
    start: '09:00',
    end: '17:00',
    breakStart: '12:00',
    breakEnd: '13:00'
  };

  // 2) Get all appointments for the doctor on the given date
  const appointments = await Appointment.find({
    doctor: doctorId,
    date: new Date(date),
    status: { $ne: 'cancelled' }
  }).select('startTime endTime');

  // 3) Generate available time slots
  const slots = [];
  const slotDuration = parseInt(duration, 10);
  const [startHour, startMinute] = workingHours.start.split(':').map(Number);
  const [endHour, endMinute] = workingHours.end.split(':').map(Number);
  const [breakStartHour, breakStartMinute] = workingHours.breakStart.split(':').map(Number);
  const [breakEndHour, breakEndMinute] = workingHours.breakEnd.split(':').map(Number);

  const startTime = new Date(new Date(date).setHours(startHour, startMinute, 0, 0));
  const endTime = new Date(new Date(date).setHours(endHour, endMinute, 0, 0));
  const breakStart = new Date(new Date(date).setHours(breakStartHour, breakStartMinute, 0, 0));
  const breakEnd = new Date(new Date(date).setHours(breakEndHour, breakEndMinute, 0, 0));

  let currentSlot = new Date(startTime);
  
  while (currentSlot < endTime) {
    const slotEnd = new Date(currentSlot.getTime() + slotDuration * 60000);
    
    // Skip if slot is during break time
    if (!(currentSlot >= breakStart && slotEnd <= breakEnd)) {
      // Check if slot is available (not booked)
      const isBooked = appointments.some(appt => {
        const apptStart = new Date(appt.startTime);
        const apptEnd = new Date(appt.endTime);
        return (
          (currentSlot >= apptStart && currentSlot < apptEnd) ||
          (slotEnd > apptStart && slotEnd <= apptEnd) ||
          (currentSlot <= apptStart && slotEnd >= apptEnd)
        );
      });

      if (!isBooked) {
        slots.push({
          start: currentSlot.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          end: slotEnd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          available: true
        });
      } else {
        slots.push({
          start: currentSlot.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          end: slotEnd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          available: false
        });
      }
    }
    
    currentSlot = new Date(currentSlot.getTime() + 15 * 60000); // Next slot starts 15 minutes later
  }

  res.status(200).json({
    status: 'success',
    data: {
      date,
      doctor: doctorId,
      slots
    }
  });
});
