const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
  doctor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Appointment must belong to a doctor']
  },
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Appointment must belong to a patient']
  },
  date: {
    type: Date,
    required: [true, 'Please provide appointment date']
  },
  startTime: {
    type: String,
    required: [true, 'Please provide start time']
  },
  endTime: {
    type: String,
    required: [true, 'Please provide end time']
  },
  status: {
    type: String,
    enum: ['scheduled', 'completed', 'cancelled', 'no-show'],
    default: 'scheduled'
  },
  notes: String,
  reason: {
    type: String,
    required: [true, 'Please provide reason for appointment']
  },
  isVirtual: {
    type: Boolean,
    default: false
  },
  meetingLink: String,
  createdAt: {
    type: Date,
    default: Date.now()
  },
  updatedAt: Date
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
appointmentSchema.index({ doctor: 1, date: 1 });
appointmentSchema.index({ patient: 1, date: 1 });
appointmentSchema.index({ status: 1, date: 1 });

// Virtual for duration
appointmentSchema.virtual('duration').get(function() {
  const start = new Date(`1970-01-01T${this.startTime}Z`);
  const end = new Date(`1970-01-01T${this.endTime}Z`);
  return (end - start) / (1000 * 60); // Duration in minutes
});

// Document middleware to update updatedAt timestamp
appointmentSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Populate doctor and patient data when querying
appointmentSchema.pre(/^find/, function(next) {
  this.populate({
    path: 'doctor',
    select: 'name email phone specialization'
  }).populate({
    path: 'patient',
    select: 'name email phone dateOfBirth'
  });
  
  next();
});

const Appointment = mongoose.model('Appointment', appointmentSchema);

module.exports = Appointment;
