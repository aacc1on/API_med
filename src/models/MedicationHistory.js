const mongoose = require('mongoose');

const medicationHistorySchema = new mongoose.Schema({
  medicationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Medication',
    required: [true, 'Medication ID is required']
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Patient ID is required']
  },
  takenAt: {
    type: Date,
    required: [true, 'Taken date is required'],
    default: Date.now
  },
  scheduledTime: {
    type: String,
    validate: {
      validator: function(time) {
        return !time || /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time);
      },
      message: 'Invalid time format. Use HH:MM (24-hour format)'
    }
  },
  status: {
    type: String,
    enum: ['taken', 'missed', 'skipped', 'delayed'],
    required: [true, 'Status is required'],
    default: 'taken'
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [200, 'Notes cannot exceed 200 characters'],
    default: ''
  },
  sideEffectsReported: {
    type: String,
    trim: true,
    maxlength: [300, 'Side effects cannot exceed 300 characters'],
    default: ''
  },
  reminderSent: {
    type: Boolean,
    default: false
  },
  reminderSentAt: {
    type: Date,
    default: null
  },
  location: {
    type: String,
    trim: true,
    maxlength: [100, 'Location cannot exceed 100 characters'],
    default: ''
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
medicationHistorySchema.index({ medicationId: 1, takenAt: -1 });
medicationHistorySchema.index({ patientId: 1, takenAt: -1 });
medicationHistorySchema.index({ status: 1, takenAt: -1 });

// Virtual for delay calculation
medicationHistorySchema.virtual('delayMinutes').get(function() {
  if (!this.scheduledTime || this.status !== 'delayed') return 0;
  
  const [schedHour, schedMin] = this.scheduledTime.split(':').map(Number);
  const takenDate = new Date(this.takenAt);
  const actualHour = takenDate.getHours();
  const actualMin = takenDate.getMinutes();
  
  const scheduledMinutes = schedHour * 60 + schedMin;
  const actualMinutes = actualHour * 60 + actualMin;
  
  return Math.max(0, actualMinutes - scheduledMinutes);
});

// Static method to get adherence rate for a patient
medicationHistorySchema.statics.getAdherenceRate = async function(patientId, medicationId = null, days = 30) {
  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - days);
  
  const matchQuery = {
    patientId,
    takenAt: { $gte: dateFrom }
  };
  
  if (medicationId) {
    matchQuery.medicationId = medicationId;
  }
  
  const stats = await this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        taken: {
          $sum: {
            $cond: [{ $eq: ['$status', 'taken'] }, 1, 0]
          }
        },
        missed: {
          $sum: {
            $cond: [{ $eq: ['$status', 'missed'] }, 1, 0]
          }
        },
        skipped: {
          $sum: {
            $cond: [{ $eq: ['$status', 'skipped'] }, 1, 0]
          }
        },
        delayed: {
          $sum: {
            $cond: [{ $eq: ['$status', 'delayed'] }, 1, 0]
          }
        }
      }
    }
  ]);
  
  if (stats.length === 0) {
    return {
      adherenceRate: 0,
      totalDoses: 0,
      takenDoses: 0,
      missedDoses: 0,
      skippedDoses: 0,
      delayedDoses: 0
    };
  }
  
  const result = stats[0];
  return {
    adherenceRate: result.total > 0 ? (result.taken / result.total) * 100 : 0,
    totalDoses: result.total,
    takenDoses: result.taken,
    missedDoses: result.missed,
    skippedDoses: result.skipped,
    delayedDoses: result.delayed
  };
};

// Static method to get weekly adherence pattern
medicationHistorySchema.statics.getWeeklyPattern = async function(patientId, medicationId = null, weeks = 4) {
  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - (weeks * 7));
  
  const matchQuery = {
    patientId,
    takenAt: { $gte: dateFrom }
  };
  
  if (medicationId) {
    matchQuery.medicationId = medicationId;
  }
  
  const pattern = await this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: { $dayOfWeek: '$takenAt' },
        total: { $sum: 1 },
        taken: {
          $sum: {
            $cond: [{ $eq: ['$status', 'taken'] }, 1, 0]
          }
        }
      }
    },
    {
      $project: {
        dayOfWeek: '$_id',
        adherenceRate: {
          $cond: [
            { $gt: ['$total', 0] },
            { $multiply: [{ $divide: ['$taken', '$total'] }, 100] },
            0
          ]
        }
      }
    },
    { $sort: { dayOfWeek: 1 } }
  ]);
  
  // Fill in missing days with 0% adherence
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const result = {};
  
  days.forEach((day, index) => {
    const dayData = pattern.find(p => p.dayOfWeek === index + 1);
    result[day] = dayData ? dayData.adherenceRate : 0;
  });
  
  return result;
};

// Instance method to check if dose was on time
medicationHistorySchema.methods.wasOnTime = function(toleranceMinutes = 30) {
  if (!this.scheduledTime || this.status !== 'taken') return false;
  
  const [schedHour, schedMin] = this.scheduledTime.split(':').map(Number);
  const takenDate = new Date(this.takenAt);
  const actualHour = takenDate.getHours();
  const actualMin = takenDate.getMinutes();
  
  const scheduledMinutes = schedHour * 60 + schedMin;
  const actualMinutes = actualHour * 60 + actualMin;
  
  return Math.abs(actualMinutes - scheduledMinutes) <= toleranceMinutes;
};

module.exports = mongoose.model('MedicationHistory', medicationHistorySchema);