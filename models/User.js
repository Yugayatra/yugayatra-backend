const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // Personal Information
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    unique: true,
    match: [/^\d{10}$/, 'Please enter a valid 10-digit phone number']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  fullName: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters'],
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  
  // Authentication
  password: {
    type: String
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  
  // Profile Information
  profile: {
    dateOfBirth: {
      type: Date,
      required: [true, 'Date of birth is required']
    },
    gender: {
      type: String,
      enum: ['Male', 'Female', 'Other', 'Prefer not to say'],
      required: [true, 'Gender is required']
    },
    fatherName: {
      type: String,
      required: [true, 'Father name is required'],
      trim: true
    },
    motherName: {
      type: String,
      required: [true, 'Mother name is required'],
      trim: true
    },
    address: {
      street: {
        type: String,
        required: [true, 'Street address is required']
      },
      city: {
        type: String,
        required: [true, 'City is required']
      },
      state: {
        type: String,
        required: [true, 'State is required']
      },
      pincode: {
        type: String,
        required: [true, 'Pincode is required'],
        match: [/^\d{6}$/, 'Please enter a valid 6-digit pincode']
      }
    },
    
    // Educational Information
    education: {
      qualification: {
        type: String,
        required: [true, 'Educational qualification is required'],
        enum: ['10th', '12th', 'Diploma', 'Graduate', 'Post Graduate', 'PhD', 'Other']
      },
      specialization: {
        type: String,
        required: [true, 'Specialization/Stream is required']
      },
      institution: {
        type: String,
        required: [true, 'Institution name is required']
      },
      yearOfPassing: {
        type: Number,
        required: [true, 'Year of passing is required'],
        min: [1980, 'Invalid year'],
        max: [new Date().getFullYear() + 2, 'Invalid year']
      },
      percentage: {
        type: Number,
        required: [true, 'Percentage/CGPA is required'],
        min: [0, 'Invalid percentage'],
        max: [100, 'Invalid percentage']
      }
    },
    
    // Professional Information (if applicable)
    experience: {
      totalYears: {
        type: Number,
        default: 0,
        min: [0, 'Experience cannot be negative']
      },
      currentCompany: String,
      currentRole: String,
      skills: [String]
    },
    
    // Additional Information
    emergencyContact: {
      name: {
        type: String,
        required: [true, 'Emergency contact name is required']
      },
      phone: {
        type: String,
        required: [true, 'Emergency contact phone is required'],
        match: [/^\d{10}$/, 'Please enter a valid 10-digit phone number']
      },
      relation: {
        type: String,
        required: [true, 'Relation with emergency contact is required']
      }
    },
    
    // Documents
    photo: String,
    resume: String,
    idCard: String
  },
  
  // OTP Verification
  otp: {
    code: String,
    expiresAt: Date,
    attempts: {
      type: Number,
      default: 0
    }
  },
  
  // Test Related Information
  testInfo: {
    totalAttempts: {
      type: Number,
      default: 0
    },
    lastAttemptDate: Date,
    bestScore: {
      type: Number,
      default: 0
    },
    hasQualified: {
      type: Boolean,
      default: false
    },
    qualificationDate: Date,
    blockedUntil: Date,
    blockedReason: String
  },
  
  // Consent and Agreement
  termsAccepted: {
    type: Boolean,
    required: [true, 'Terms and conditions must be accepted']
  },
  termsAcceptedAt: {
    type: Date,
    default: Date.now
  },
  dataProcessingConsent: {
    type: Boolean,
    required: [true, 'Data processing consent is required']
  },
  
  // System Information
  ipAddress: String,
  userAgent: String,
  deviceInfo: {
    browser: String,
    os: String,
    device: String
  },
  
  // Status
  status: {
    type: String,
    enum: ['Active', 'Blocked', 'Suspended', 'Deleted'],
    default: 'Active'
  },
  
  // Timestamps
  lastLogin: Date,
  profileCompletedAt: Date
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for age calculation
userSchema.virtual('age').get(function() {
  if (!this.profile?.dateOfBirth) return null;
  const today = new Date();
  const birthDate = new Date(this.profile.dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
});

// Virtual for full address
userSchema.virtual('fullAddress').get(function() {
  if (!this.profile?.address) return null;
  const addr = this.profile.address;
  return `${addr.street}, ${addr.city}, ${addr.state} - ${addr.pincode}`;
});

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
  if (!this.isModified('password') || !this.password) return next();
  
  try {
    const salt = await bcrypt.genSalt(parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to check password
userSchema.methods.matchPassword = async function(enteredPassword) {
  if (!this.password) return false;
  return await bcrypt.compare(enteredPassword, this.password);
};

// Method to generate and save OTP
userSchema.methods.generateOTP = function() {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  this.otp = {
    code: otp,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
    attempts: 0
  };
  return otp;
};

// Method to verify OTP
userSchema.methods.verifyOTP = function(enteredOTP) {
  if (!this.otp?.code) return false;
  if (new Date() > this.otp.expiresAt) return false;
  if (this.otp.attempts >= 5) return false;
  
  this.otp.attempts += 1;
  
  if (this.otp.code === enteredOTP) {
    this.otp = undefined;
    this.isVerified = true;
    return true;
  }
  
  return false;
};

// Method to check if user can attempt test
userSchema.methods.canAttemptTest = function() {
  const maxAttempts = parseInt(process.env.MAX_ATTEMPTS) || 5;
  
  // Check if blocked
  if (this.testInfo.blockedUntil && new Date() < this.testInfo.blockedUntil) {
    return { canAttempt: false, reason: 'Account is temporarily blocked' };
  }
  
  // Check if already qualified
  if (this.testInfo.hasQualified) {
    return { canAttempt: false, reason: 'Already qualified' };
  }
  
  // Check attempts limit
  if (this.testInfo.totalAttempts >= maxAttempts) {
    return { canAttempt: false, reason: 'Maximum attempts reached' };
  }
  
  // Check cooldown period (24 hours between attempts)
  if (this.testInfo.lastAttemptDate) {
    const timeDiff = new Date() - this.testInfo.lastAttemptDate;
    const hoursDiff = timeDiff / (1000 * 60 * 60);
    if (hoursDiff < 24) {
      return { 
        canAttempt: false, 
        reason: `Please wait ${Math.ceil(24 - hoursDiff)} hours before next attempt` 
      };
    }
  }
  
  return { canAttempt: true };
};

// Indexes for performance
userSchema.index({ phone: 1 });
userSchema.index({ email: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ 'testInfo.hasQualified': 1 });
userSchema.index({ status: 1 });

module.exports = mongoose.model('User', userSchema); 