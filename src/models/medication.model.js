const mongoose = require('mongoose');

const medicationSchema = new mongoose.Schema({
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Medication must be prescribed to a patient']
  },
  doctor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Medication must be prescribed by a doctor']
  },
  name: {
    type: String,
    required: [true, 'Please provide medication name'],
    trim: true
  },
  dosage: {
    value: {
      type: Number,
      required: [true, 'Please provide dosage value']
    },
    unit: {
      type: String,
      required: [true, 'Please provide dosage unit'],
      enum: ['mg', 'mcg', 'g', 'ml', 'tsp', 'tbsp', 'puff', 'drop', 'other']
    },
    form: {
      type: String,
      enum: ['tablet', 'capsule', 'liquid', 'injection', 'inhaler', 'cream', 'other'],
      required: [true, 'Please provide medication form']
    }
  },
  frequency: {
    timesPerDay: {
      type: Number,
      required: [true, 'Please specify how many times per day']
    },
    specificTimes: [{
      type: String,
      validate: {
        validator: function(v) {
          return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
        },
        message: props => `${props.value} is not a valid time format (HH:MM)`
      }
    }],
    instructions: String
  },
  startDate: {
    type: Date,
    required: [true, 'Please provide start date'],
    default: Date.now
  },
  endDate: {
    type: Date,
    validate: {
      validator: function(v) {
        return v > this.startDate;
      },
      message: 'End date must be after start date'
    }
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'stopped', 'cancelled'],
    default: 'active'
  },
  instructions: {
    type: String,
    maxlength: [500, 'Instructions cannot be longer than 500 characters']
  },
  sideEffects: [{
    description: String,
    severity: {
      type: String,
      enum: ['mild', 'moderate', 'severe']
    },
    reportedAt: {
      type: Date,
      default: Date.now
    }
  }],
  refillInformation: {
    refillsRemaining: Number,
    lastFilled: Date,
    nextRefill: Date
  },
  isCritical: {
    type: Boolean,
    default: false
  },
  notes: [{
    content: String,
    createdAt: {
      type: Date,
      default: Date.now
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
medicationSchema.index({ patient: 1, status: 1 });
medicationSchema.index({ doctor: 1, status: 1 });
medicationSchema.index({ status: 1, startDate: 1 });

// Virtual for duration of medication
medicationSchema.virtual('durationInDays').get(function() {
  if (!this.endDate) return null;
  return Math.ceil((this.endDate - this.startDate) / (1000 * 60 * 60 * 24));
});

// Document middleware to validate specificTimes length matches timesPerDay
medicationSchema.pre('save', function(next) {
  if (this.frequency.specificTimes && this.frequency.specificTimes.length !== this.frequency.timesPerDay) {
    this.frequency.specificTimes = [];
  }
  next();
});

// Populate doctor and patient data when querying
medicationSchema.pre(/^find/, function(next) {
  this.populate({
    path: 'doctor',
    select: 'name specialization'
  }).populate({
    path: 'patient',
    select: 'name email phone'
  });
  
  next();
});

const Medication = mongoose.model('Medication', medicationSchema);

module.exports = Medication;
