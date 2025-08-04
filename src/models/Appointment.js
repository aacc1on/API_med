const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Patient ID is required']
  },
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Doctor ID is required']
  },
  date: {
    type: Date,
    required: [true, 'Appointment date is required'],
    validate: {
      validator: function(date) {
        return date >= new Date().setHours(0, 0, 0, 0);
      },
      message: 'Appointment date cannot be in the past'
    }
  },
  time: {
    type: String,
    required: [true, 'Appointment time is required'],
    validate: {
      validator: function(time) {
        return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time);
      },
      message: 'Invalid time format. Use HH:MM (24-hour format)'
    }
  },
  duration: {
    type: Number,
    default: 30,
    min: [15, 'Minimum appointment duration is 15 minutes'],
    max: [240, 'Maximum appointment duration is 4 hours']
  },
  location: {
    type: String,
    required: [true, 'Location is required'],
    trim: true,
    maxlength: [200, 'Location cannot exceed 200 characters']
  },
  type: {
    type: String,
    enum: ['consultation', 'follow-up', 'check-up', 'surgery', 'therapy', 'emergency', 'other'],
    default: 'consultation'
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [500, 'Notes cannot exceed 500 characters'],
    default: ''
  },
  status: {
    type: String,
    enum: ['scheduled', 'confirmed', 'completed', 'cancelled', 'rescheduled', 'no-show'],
    default: 'scheduled'
  },
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  reminderSent: {
    type: Boolean,
    default: false
  },
  reminderSentAt: {
    type: Date,
    default: null
  },
  completedAt: {
    type: Date,
    default: null
  },
  cancelledAt: {
    type: Date,
    default: null
  },
  cancellationReason: {
    type: String,
    trim: true,
    maxlength: [200, 'Cancellation reason cannot exceed 200 characters'],
    default: ''
  },
  followUpRequired: {
    type: Boolean,
    default: false
  },
  followUpDate: {
    type: Date,
    default: null
  },
  symptoms: {
    type: String,
    trim: true,
    maxlength: [300, 'Symptoms cannot exceed 300 characters'],
    default: ''
  },
  diagnosis: {
    type: String,
    trim: true,
    maxlength: [300, 'Diagnosis cannot exceed 300 characters'],
    default: ''
  },
  treatment: {
    type: String,
    trim: true,
    maxlength: [500, 'Treatment cannot exceed 500 characters'],
    default: ''
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
appointmentSchema.index({ patientId: 1, date: 1 });
appointmentSchema.index({ doctorId: 1, date: 1 });
appointmentSchema.index({ status: 1, date: 1 });
appointmentSchema.index({ date: 1, time: 1 });

// Virtual for full datetime
appointmentSchema.virtual('datetime').get(function() {
  const appointmentDate = new Date(this.date);
  const [hours, minutes] = this.time.split(':').map(Number);
  appointmentDate.setHours(hours, minutes, 0, 0);
  return appointmentDate;
});

// Virtual for end time
appointmentSchema.virtual('endTime').get(function() {
  const [hours, minutes] = this.time.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes + this.duration;
  const endHours = Math.floor(totalMinutes / 60);
  const endMinutes = totalMinutes % 60;
  return `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
});

// Virtual for status display
appointmentSchema.virtual('statusDisplay').get(function() {
  const statusMap = {
    'scheduled': 'Scheduled',
    'confirmed': 'Confirmed',
    'completed': 'Completed',
    'cancelled': 'Cancelled',
    'rescheduled': 'Rescheduled',
    'no-show': 'No Show'
  };
  return statusMap[this.status] || this.status;
});

// Virtual for time until appointment
appointmentSchema.virtual('timeUntil').get(function() {
  const now = new Date();
  const appointmentTime = this.datetime;
  const diffMs = appointmentTime - now;
  
  if (diffMs <= 0) return 'Past';
  
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? 's' : ''}`;
  if (diffHours > 0) return `${diffHours} hour${diffHours > 1 ? 's' : ''}`;
  return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''}`;
});

// Static method to find appointments for tomorrow
appointmentSchema.statics.findAppointmentsForTomorrow = function() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const dayAfter = new Date(tomorrow);
  dayAfter.setDate(dayAfter.getDate() + 1);
  
  return this.find({
    date: { $gte: tomorrow, $lt: dayAfter },
    status: { $in: ['scheduled', 'confirmed'] },
    reminderSent: false
  })
    .populate('patientId', 'name telegramId email')
    .populate('doctorId', 'name clinicName');
};

// Static method to find upcoming appointments
appointmentSchema.statics.findUpcoming = function(userId, role, days = 7) {
  const now = new Date();
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);
  
  const query = {
    date: { $gte: now, $lte: futureDate },
    status: { $in: ['scheduled', 'confirmed'] }
  };
  
  if (role === 'doctor') {
    query.doctorId = userId;
  } else {
    query.patientId = userId;
  }
  
  return this.find(query)
    .populate('patientId', 'name email')
    .populate('doctorId', 'name clinicName')
    .sort({ date: 1, time: 1 });
};

// Static method to check for conflicts
appointmentSchema.statics.hasConflict = async function(doctorId, date, time, duration, excludeId = null) {
  const appointmentDate = new Date(date);
  appointmentDate.setHours(0, 0, 0, 0);
  const nextDay = new Date(appointmentDate);
  nextDay.setDate(nextDay.getDate() + 1);
  
  const [startHour, startMin] = time.split(':').map(Number);
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = startMinutes + duration;
  
  const query = {
    doctorId,
    date: { $gte: appointmentDate, $lt: nextDay },
    status: { $in: ['scheduled', 'confirmed'] }
  };
  
  if (excludeId) {
    query._id = { $ne: excludeId };
  }
  
  const existingAppointments = await this.find(query);
  
  for (const appointment of existingAppointments) {
    const [existingHour, existingMin] = appointment.time.split(':').map(Number);
    const existingStart = existingHour * 60 + existingMin;
    const existingEnd = existingStart + appointment.duration;
    
    // Check for overlap
    if (startMinutes < existingEnd && endMinutes > existingStart) {
      return true;
    }
  }
  
  return false;
};

// Instance method to mark as completed
appointmentSchema.methods.markCompleted = function(diagnosis = '', treatment = '') {
  this.status = 'completed';
  this.completedAt = new Date();
  if (diagnosis) this.diagnosis = diagnosis;
  if (treatment) this.treatment = treatment;
  return this.save();
};

// Instance method to cancel appointment
appointmentSchema.methods.cancel = function(reason = '') {
  this.status = 'cancelled';
  this.cancelledAt = new Date();
  this.cancellationReason = reason;
  return this.save();
};

// Pre-save middleware to validate appointment time
appointmentSchema.pre('save', async function(next) {
  if (this.isNew || this.isModified('date') || this.isModified('time') || this.isModified('duration')) {
    const hasConflict = await this.constructor.hasConflict(
      this.doctorId,
      this.date,
      this.time,
      this.duration,
      this._id
    );
    
    if (hasConflict) {
      const err = new Error('Appointment time conflicts with existing appointment');
      err.name = 'ValidationError';
      return next(err);
    }
  }
  next();
});

module.exports = mongoose.model('Appointment', appointmentSchema);