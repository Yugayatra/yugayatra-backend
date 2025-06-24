const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const adminSchema = new mongoose.Schema({
  // Authentication Information
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    unique: true,
    match: [/^\d{10}$/, 'Please enter a valid 10-digit phone number']
  },
  
  email: {
    type: String,
    unique: true,
    sparse: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  
  // Personal Information
  fullName: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters'],
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  
  // Role and Permissions
  role: {
    type: String,
    enum: ['Super Admin', 'Admin', 'Question Manager', 'Test Manager', 'Viewer'],
    default: 'Admin'
  },
  
  permissions: {
    users: {
      view: { type: Boolean, default: true },
      create: { type: Boolean, default: false },
      edit: { type: Boolean, default: false },
      delete: { type: Boolean, default: false }
    },
    questions: {
      view: { type: Boolean, default: true },
      create: { type: Boolean, default: true },
      edit: { type: Boolean, default: true },
      delete: { type: Boolean, default: false },
      approve: { type: Boolean, default: false },
      bulkUpload: { type: Boolean, default: false }
    },
    tests: {
      view: { type: Boolean, default: true },
      create: { type: Boolean, default: false },
      manage: { type: Boolean, default: false },
      results: { type: Boolean, default: true },
      analytics: { type: Boolean, default: true }
    },
    system: {
      settings: { type: Boolean, default: false },
      backup: { type: Boolean, default: false },
      logs: { type: Boolean, default: false },
      reports: { type: Boolean, default: true }
    }
  },
  
  // Authentication & Security
  password: {
    type: String,
    minlength: [6, 'Password must be at least 6 characters']
  },
  
  // Account Status
  status: {
    type: String,
    enum: ['Active', 'Suspended', 'Blocked', 'Pending'],
    default: 'Pending'
  },
  
  isVerified: {
    type: Boolean,
    default: false
  },
  
  // Session Management
  lastLogin: Date,
  
  loginAttempts: {
    type: Number,
    default: 0
  },
  
  lockUntil: Date,
  
  // Activity Tracking
  activityLog: [{
    action: {
      type: String,
      required: true
    },
    details: {
      type: mongoose.Schema.Types.Mixed
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    ipAddress: String,
    userAgent: String
  }],
  
  // Question Management Stats
  questionStats: {
    created: { type: Number, default: 0 },
    edited: { type: Number, default: 0 },
    approved: { type: Number, default: 0 },
    rejected: { type: Number, default: 0 },
    deleted: { type: Number, default: 0 }
  },
  
  // Test Management Stats
  testStats: {
    managed: { type: Number, default: 0 },
    reviewed: { type: Number, default: 0 }
  },
  
  // Profile Information
  profile: {
    avatar: String,
    department: String,
    designation: String,
    employeeId: String,
    joiningDate: Date,
    bio: String
  },
  
  // Notification Preferences
  notifications: {
    email: {
      newUser: { type: Boolean, default: true },
      testCompleted: { type: Boolean, default: true },
      systemAlerts: { type: Boolean, default: true },
      reports: { type: Boolean, default: true }
    },
    sms: {
      critical: { type: Boolean, default: true },
      reports: { type: Boolean, default: false }
    }
  },
  
  // Access Restrictions
  accessRestrictions: {
    ipWhitelist: [String],
    timeRestrictions: {
      enabled: { type: Boolean, default: false },
      startTime: String, // HH:MM format
      endTime: String,   // HH:MM format
      timezone: { type: String, default: 'Asia/Kolkata' }
    },
    deviceLimit: {
      enabled: { type: Boolean, default: false },
      maxDevices: { type: Number, default: 3 },
      currentDevices: [{
        deviceId: String,
        lastUsed: Date,
        userAgent: String,
        ipAddress: String
      }]
    }
  },
  
  // Two-Factor Authentication
  twoFactorAuth: {
    enabled: { type: Boolean, default: false },
    secret: String,
    backupCodes: [String],
    lastUsedBackupCode: String
  },
  
  // API Access (if needed)
  apiAccess: {
    enabled: { type: Boolean, default: false },
    apiKey: String,
    apiSecret: String,
    rateLimits: {
      requestsPerHour: { type: Number, default: 1000 },
      requestsPerDay: { type: Number, default: 10000 }
    },
    lastApiCall: Date
  },
  
  // Audit Information
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  
  modifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  
  lastModifiedAt: Date
}, {
  timestamps: true,
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.password;
      delete ret.twoFactorAuth.secret;
      delete ret.apiAccess.apiSecret;
      return ret;
    }
  },
  toObject: { virtuals: true }
});

// Virtual for account lock status
adminSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Virtual for total activities
adminSchema.virtual('totalActivities').get(function() {
  return this.activityLog ? this.activityLog.length : 0;
});

// Pre-save middleware to hash password
adminSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  if (this.password) {
    try {
      const salt = await bcrypt.genSalt(parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12);
      this.password = await bcrypt.hash(this.password, salt);
    } catch (error) {
      return next(error);
    }
  }
  
  // Update modification timestamp
  this.lastModifiedAt = new Date();
  
  next();
});

// Method to check password
adminSchema.methods.matchPassword = async function(enteredPassword) {
  if (!this.password) return false;
  return await bcrypt.compare(enteredPassword, this.password);
};

// Method to handle failed login attempts
adminSchema.methods.incLoginAttempts = function() {
  // If we have a previous lock that has expired, restart at 1
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 }
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  
  // Lock account after 5 failed attempts for 2 hours
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 }; // 2 hours
  }
  
  return this.updateOne(updates);
};

// Method to reset login attempts
adminSchema.methods.resetLoginAttempts = function() {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 }
  });
};

// Method to log activity
adminSchema.methods.logActivity = function(action, details = {}, req = null) {
  const activity = {
    action,
    details,
    timestamp: new Date(),
    ipAddress: req?.ip || req?.connection?.remoteAddress,
    userAgent: req?.get('User-Agent')
  };
  
  this.activityLog.push(activity);
  
  // Keep only last 1000 activities
  if (this.activityLog.length > 1000) {
    this.activityLog = this.activityLog.slice(-1000);
  }
  
  return this.save();
};

// Method to check permissions
adminSchema.methods.hasPermission = function(resource, action) {
  if (this.role === 'Super Admin') return true;
  
  const resourcePermissions = this.permissions[resource];
  if (!resourcePermissions) return false;
  
  return resourcePermissions[action] === true;
};

// Method to update question stats
adminSchema.methods.updateQuestionStats = function(action) {
  if (this.questionStats[action] !== undefined) {
    this.questionStats[action] += 1;
    return this.save();
  }
};

// Method to update test stats
adminSchema.methods.updateTestStats = function(action) {
  if (this.testStats[action] !== undefined) {
    this.testStats[action] += 1;
    return this.save();
  }
};

// Method to generate API key
adminSchema.methods.generateApiKey = function() {
  const crypto = require('crypto');
  this.apiAccess.apiKey = crypto.randomBytes(32).toString('hex');
  this.apiAccess.apiSecret = crypto.randomBytes(64).toString('hex');
  this.apiAccess.enabled = true;
  return this.save();
};

// Method to check access restrictions
adminSchema.methods.checkAccessRestrictions = function(req) {
  const restrictions = this.accessRestrictions;
  const currentTime = new Date();
  const userIP = req.ip || req.connection.remoteAddress;
  
  // Check IP whitelist
  if (restrictions.ipWhitelist.length > 0 && !restrictions.ipWhitelist.includes(userIP)) {
    return { allowed: false, reason: 'IP address not in whitelist' };
  }
  
  // Check time restrictions
  if (restrictions.timeRestrictions.enabled) {
    const currentHour = currentTime.getHours();
    const currentMinute = currentTime.getMinutes();
    const currentTimeMinutes = currentHour * 60 + currentMinute;
    
    const [startHour, startMinute] = restrictions.timeRestrictions.startTime.split(':').map(Number);
    const [endHour, endMinute] = restrictions.timeRestrictions.endTime.split(':').map(Number);
    const startTimeMinutes = startHour * 60 + startMinute;
    const endTimeMinutes = endHour * 60 + endMinute;
    
    if (currentTimeMinutes < startTimeMinutes || currentTimeMinutes > endTimeMinutes) {
      return { 
        allowed: false, 
        reason: `Access allowed only between ${restrictions.timeRestrictions.startTime} and ${restrictions.timeRestrictions.endTime}` 
      };
    }
  }
  
  // Check device limit
  if (restrictions.deviceLimit.enabled) {
    const userAgent = req.get('User-Agent');
    const deviceExists = restrictions.deviceLimit.currentDevices.some(device => 
      device.userAgent === userAgent && device.ipAddress === userIP
    );
    
    if (!deviceExists && restrictions.deviceLimit.currentDevices.length >= restrictions.deviceLimit.maxDevices) {
      return { allowed: false, reason: 'Maximum device limit reached' };
    }
  }
  
  return { allowed: true };
};

// Static method to get admin statistics
adminSchema.statics.getAdminStats = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalAdmins: { $sum: 1 },
        activeAdmins: { $sum: { $cond: [{ $eq: ['$status', 'Active'] }, 1, 0] } },
        suspendedAdmins: { $sum: { $cond: [{ $eq: ['$status', 'Suspended'] }, 1, 0] } },
        totalQuestions: { $sum: '$questionStats.created' },
        totalApprovals: { $sum: '$questionStats.approved' }
      }
    }
  ]);
  
  return stats[0] || {
    totalAdmins: 0,
    activeAdmins: 0,
    suspendedAdmins: 0,
    totalQuestions: 0,
    totalApprovals: 0
  };
};

// Static method to find by phone (for admin login)
adminSchema.statics.findByPhone = function(phone) {
  return this.findOne({ phone, status: { $ne: 'Blocked' } });
};

// Indexes for performance
adminSchema.index({ phone: 1 });
adminSchema.index({ email: 1 });
adminSchema.index({ status: 1 });
adminSchema.index({ role: 1 });
adminSchema.index({ lastLogin: -1 });
adminSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Admin', adminSchema); 