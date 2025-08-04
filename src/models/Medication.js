const mongoose = require('mongoose');

const medicationSchema = new mongoose.Schema({
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
  name: {
    type: String,
    required: [true, 'Medication name is required'],
    trim: true,
    maxlength: [100, 'Medication name cannot exceed 100 characters']
  },
  dosage: {
    type: String,
    required: [true, 'Dosage is required'],
    trim: true,
    maxlength: [50, 'Dosage cannot exceed 50 characters']
  },
  timesPerDay: [{
    type: String,
    required: true,
    validate: {
      validator: function(time) {
        return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time);
      },
      message: 'Invalid time format. Use HH:MM (24-hour format)'
    }
  }],
  startDate: {
    type: Date,
    required: [true, 'Start date is required']
  },
  endDate: {
    type: Date,
    required: [true, 'End date is required'],
    validate: {
      validator: function(endDate) {
        return endDate > this.startDate;
      },
      message: 'End date must be after start date'
    }
  },
  instructions: {
    type: String,
    trim: true,
    default: '',
    maxlength: [500, 'Instructions cannot exceed 500 characters']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastReminded: {
    type: Date,
    default: null
  },
  frequency: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'as-needed'],
    default: 'daily'
  },
  sideEffects: {
    type: String,
    trim: true,
    default: '',
    maxlength: [300, 'Side effects cannot exceed 300 characters']
  },
  foodInstructions: {
    type: String,
    enum: ['before-meal', 'after-meal', 'with-meal', 'empty-stomach', 'no-restriction'],
    default: 'no-restriction'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
medicationSchema.index({ patientId: 1, isActive: 1 });
medicationSchema.index({ doctorId: 1 });
medicationSchema.index({ startDate: 1, endDate: 1 });
medicationSchema.index({ patientId: 1, startDate: 1, endDate: 1 });

// Virtual for checking if medication is currently active
medicationSchema.virtual('isCurrentlyActive').get(function() {
  const now = new Date();
  return this.isActive && this.startDate <= now && this.endDate >= now;
});

// Virtual for days remaining
medicationSchema.virtual('daysRemaining').get(function() {
  const now = new Date();
  const endDate = new Date(this.endDate);
  const diffTime = endDate - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
});

// Virtual for total duration
medicationSchema.virtual('totalDays').get(function() {
  const startDate = new Date(this.startDate);
  const endDate = new Date(this.endDate);
  const diffTime = endDate - startDate;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Static method to find active medications for today
medicationSchema.statics.findActiveForToday = function(patientId = null) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const query = {
    isActive: true,
    startDate: { $lte: today },
    endDate: { $gte: today }
  };

  if (patientId) {
    query.patientId = patientId;
  }
  
  return this.find(query)
    .populate('patientId', 'name telegramId')
    .populate('doctorId', 'name clinicName');
};

// Static method to find medications needing reminders
medicationSchema.statics.findMedicationsForReminders = function() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  return this.find({
    isActive: true,
    startDate: { $lte: today },
    endDate: { $gte: today }
  })
    .populate('patientId', 'name telegramId')
    .populate('doctorId', 'name clinicName');
};

// Instance method to check if medication should be taken at a specific time
medicationSchema.methods.shouldTakeAtTime = function(timeString) {
  return this.timesPerDay.some(scheduledTime => {
    const [schedHour, schedMin] = scheduledTime.split(':').map(Number);
    const [checkHour, checkMin] = timeString.split(':').map(Number);
    
    // Check if within 5-minute window
    const schedMinutes = schedHour * 60 + schedMin;
    const checkMinutes = checkHour * 60 + checkMin;
    
    return Math.abs(schedMinutes - checkMinutes) <= 5;
  });
};

// Instance method to get next dose time
medicationSchema.methods.getNextDoseTime = function() {
  const now = new Date();
  const currentTime = now.getHours() * 60 + now.getMinutes();
  
  const nextTimes = this.timesPerDay
    .map(time => {
      const [hour, minute] = time.split(':').map(Number);
      return { time, minutes: hour * 60 + minute };
    })
    .filter(({ minutes }) => minutes > currentTime)
    .sort((a, b) => a.minutes - b.minutes);
  
  if (nextTimes.length > 0) {
    return nextTimes[0].time;
  }
  
  // If no more times today, return first time of next day
  const sortedTimes = this.timesPerDay
    .map(time => {
      const [hour, minute] = time.split(':').map(Number);
      return { time, minutes: hour * 60 + minute };
    })
    .sort((a, b) => a.minutes - b.minutes);
  
  return sortedTimes.length > 0 ? sortedTimes[0].time : null;
};

// Pre-save middleware to sort times
medicationSchema.pre('save', function(next) {
  if (this.isModified('timesPerDay')) {
    this.timesPerDay.sort((a, b) => {
      const [aHour, aMin] = a.split(':').map(Number);
      const [bHour, bMin] = b.split(':').map(Number);
      const aMinutes = aHour * 60 + aMin;
      const bMinutes = bHour * 60 + bMin;
      return aMinutes - bMinutes;
    });
  }
  next();
});

module.exports = mongoose.model('Medication', medicationSchema);