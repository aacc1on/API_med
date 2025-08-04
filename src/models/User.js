const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [50, 'Name cannot exceed 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false // Don't include password in queries by default
  },
  role: {
    type: String,
    enum: ['doctor', 'patient'],
    required: [true, 'Role is required']
  },
  clinicName: {
    type: String,
    required: function() {
      return this.role === 'doctor';
    },
    trim: true,
    maxlength: [100, 'Clinic name cannot exceed 100 characters']
  },
  telegramId: {
    type: String,
    default: null,
    sparse: true, // Allow multiple null values but unique non-null values
    unique: true
  },
  telegramUsername: {
    type: String,
    default: null
  },
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    validate: {
      validator: function(doctorId) {
        // If role is patient and doctorId is provided, it should be valid
        if (this.role === 'patient' && doctorId) {
          return mongoose.Types.ObjectId.isValid(doctorId);
        }
        return true;
      },
      message: 'Invalid doctor ID'
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date,
    default: null
  },
  passwordResetToken: {
    type: String,
    default: null
  },
  passwordResetExpires: {
    type: Date,
    default: null
  }
}, {
  timestamps: true,
  toJSON: { 
    transform: function(doc, ret) {
      delete ret.password;
      delete ret.passwordResetToken;
      delete ret.passwordResetExpires;
      return ret;
    }
  }
});

// Indexes for better performance
userSchema.index({ email: 1 });
userSchema.index({ doctorId: 1 });
userSchema.index({ telegramId: 1 }, { sparse: true });
userSchema.index({ role: 1, isActive: 1 });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) {
    throw new Error('Password not available for comparison');
  }
  return await bcrypt.compare(candidatePassword, this.password);
};

// Get user without sensitive data
userSchema.methods.toPublicJSON = function() {
  const user = this.toObject();
  delete user.password;
  delete user.passwordResetToken;
  delete user.passwordResetExpires;
  return user;
};

// Static method to find doctor's patients
userSchema.statics.findPatientsByDoctor = function(doctorId) {
  return this.find({ 
    doctorId, 
    role: 'patient',
    isActive: true 
  }).select('-password');
};

// Static method to find available patients (without doctor)
userSchema.statics.findAvailablePatients = function() {
  return this.find({ 
    role: 'patient',
    doctorId: null,
    isActive: true 
  }).select('-password');
};

// Virtual for full name
userSchema.virtual('fullInfo').get(function() {
  if (this.role === 'doctor') {
    return `Dr. ${this.name} - ${this.clinicName}`;
  }
  return this.name;
});

module.exports = mongoose.model('User', userSchema);