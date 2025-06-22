const mongoose = require('mongoose');

const InterviewSchema = new mongoose.Schema({
  // Basic Information
  interviewId: {
    type: String,
    unique: true,
    default: function() {
      return 'INT-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4).toUpperCase();
    }
  },
  
  // Candidate Information
  candidate: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  candidateName: String,
  candidateEmail: String,
  candidatePhone: String,
  
  // Interview Details
  interviewType: {
    type: String,
    enum: ['Technical', 'HR', 'Final', 'Group Discussion'],
    required: true
  },
  interviewMode: {
    type: String,
    enum: ['Online', 'Offline'],
    default: 'Online'
  },
  position: {
    type: String,
    required: true
  },
  department: String,
  
  // Scheduling Information
  scheduledDate: {
    type: Date,
    required: true,
    index: true
  },
  scheduledTime: String, // Format: "10:00 AM"
  duration: {
    type: Number,
    default: 60, // Duration in minutes
    min: 15,
    max: 180
  },
  timeZone: {
    type: String,
    default: 'Asia/Kolkata'
  },
  
  // Meeting Details
  meetingLink: String,
  meetingId: String,
  meetingPassword: String,
  location: {
    address: String,
    city: String,
    state: String,
    pincode: String,
    landmark: String,
    directions: String
  },
  
  // Interviewer Information
  interviewer: {
    name: {
      type: String,
      required: true
    },
    email: String,
    phone: String,
    designation: String,
    department: String
  },
  panelMembers: [{
    name: String,
    email: String,
    designation: String,
    role: {
      type: String,
      enum: ['Primary', 'Secondary', 'Observer'],
      default: 'Secondary'
    }
  }],
  
  // Status and Tracking
  status: {
    type: String,
    enum: ['Scheduled', 'Confirmed', 'Cancelled', 'Completed'],
    default: 'Scheduled',
    index: true
  },
  confirmationStatus: {
    candidateConfirmed: {
      type: Boolean,
      default: false
    },
    confirmedAt: Date,
    confirmationToken: String,
    interviewerConfirmed: {
      type: Boolean,
      default: false
    }
  },
  
  // Rescheduling History
  rescheduleHistory: [{
    previousDate: Date,
    newDate: Date,
    reason: String,
    requestedBy: {
      type: String,
      enum: ['Candidate', 'Interviewer', 'Admin']
    },
    requestedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Instructions and Requirements
  instructions: {
    candidateInstructions: String,
    documentsRequired: [String],
    dresscode: String,
    preparation: [String],
    technicalRequirements: {
      camera: Boolean,
      microphone: Boolean,
      stableInternet: Boolean,
      browserRequirements: String,
      softwareRequired: [String]
    }
  },
  
  // Assessment and Evaluation
  assessmentCriteria: [{
    category: String,
    weight: Number,
    maxScore: Number
  }],
  evaluation: {
    overallRating: {
      type: Number,
      min: 1,
      max: 10
    },
    scores: [{
      category: String,
      score: Number,
      maxScore: Number,
      comments: String
    }],
    feedback: {
      strengths: [String],
      improvements: [String],
      recommendation: {
        type: String,
        enum: ['Strongly Recommend', 'Recommend', 'Consider', 'Do Not Recommend']
      },
      nextRound: Boolean,
      comments: String
    },
    evaluatedBy: String,
    evaluatedAt: Date
  },
  
  // Notification Settings
  notifications: {
    reminderSent: {
      type: Boolean,
      default: false
    },
    reminderSentAt: Date,
    confirmationSent: {
      type: Boolean,
      default: false
    },
    confirmationSentAt: Date,
    followUpSent: {
      type: Boolean,
      default: false
    },
    channels: [{
      type: String,
      enum: ['email', 'sms', 'whatsapp']
    }]
  },
  
  // Recording and Documentation
  recording: {
    isRecorded: {
      type: Boolean,
      default: false
    },
    recordingUrl: String,
    recordingDuration: Number,
    consentGiven: {
      type: Boolean,
      default: false
    }
  },
  
  // Additional Metadata
  tags: [String],
  priority: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Urgent'],
    default: 'Medium'
  },
  source: {
    type: String,
    enum: ['Test Qualified', 'Direct Application', 'Referral', 'Campus Hiring'],
    default: 'Test Qualified'
  },
  
  // System Fields
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  activityLog: [{
    action: String,
    performedBy: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    details: mongoose.Schema.Types.Mixed
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
InterviewSchema.index({ scheduledDate: 1, status: 1 });
InterviewSchema.index({ candidate: 1 });
InterviewSchema.index({ 'interviewer.email': 1, scheduledDate: 1 });
InterviewSchema.index({ interviewType: 1, scheduledDate: 1 });
InterviewSchema.index({ createdAt: -1 });

// Virtual for formatted date
InterviewSchema.virtual('formattedDate').get(function() {
  return this.scheduledDate ? this.scheduledDate.toLocaleDateString('en-IN') : '';
});

// Virtual for formatted time
InterviewSchema.virtual('formattedTime').get(function() {
  return this.scheduledDate ? this.scheduledDate.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }) : '';
});

// Virtual for interview duration in hours
InterviewSchema.virtual('durationInHours').get(function() {
  return this.duration ? (this.duration / 60).toFixed(1) : '1.0';
});

// Virtual for time until interview
InterviewSchema.virtual('timeUntilInterview').get(function() {
  if (!this.scheduledDate) return null;
  
  const now = new Date();
  const diffInMs = this.scheduledDate.getTime() - now.getTime();
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
  
  if (diffInHours < 0) return 'Past';
  if (diffInHours < 24) return `${diffInHours} hours`;
  
  const diffInDays = Math.floor(diffInHours / 24);
  return `${diffInDays} days`;
});

// Pre-save middleware
InterviewSchema.pre('save', function(next) {
  // Auto-populate candidate info if not present
  if (this.isModified('candidate') && !this.candidateName) {
    this.populate('candidate', 'fullName email phone')
      .then(() => {
        if (this.candidate) {
          this.candidateName = this.candidate.fullName;
          this.candidateEmail = this.candidate.email;
          this.candidatePhone = this.candidate.phone;
        }
        next();
      })
      .catch(next);
  } else {
    next();
  }
});

// Instance methods
InterviewSchema.methods.canReschedule = function() {
  const hoursUntilInterview = (this.scheduledDate.getTime() - Date.now()) / (1000 * 60 * 60);
  return hoursUntilInterview > 24 && this.status === 'Scheduled';
};

InterviewSchema.methods.canCancel = function() {
  const hoursUntilInterview = (this.scheduledDate.getTime() - Date.now()) / (1000 * 60 * 60);
  return hoursUntilInterview > 2 && ['Scheduled', 'Confirmed'].includes(this.status);
};

InterviewSchema.methods.generateConfirmationToken = function() {
  this.confirmationStatus.confirmationToken = Math.random().toString(36).substr(2, 20);
  return this.confirmationStatus.confirmationToken;
};

InterviewSchema.methods.addToActivityLog = function(action, performedBy, details = {}) {
  this.activityLog.push({
    action,
    performedBy,
    details,
    timestamp: new Date()
  });
};

InterviewSchema.methods.reschedule = function(newDate, reason, requestedBy) {
  this.rescheduleHistory.push({
    previousDate: this.scheduledDate,
    newDate: newDate,
    reason: reason,
    requestedBy: requestedBy
  });
  
  this.scheduledDate = newDate;
  this.status = 'Rescheduled';
  this.notifications.reminderSent = false;
  
  this.addToActivityLog('Rescheduled', requestedBy, {
    previousDate: this.rescheduleHistory[this.rescheduleHistory.length - 1].previousDate,
    newDate: newDate,
    reason: reason
  });
};

InterviewSchema.methods.confirm = function(confirmedBy = 'Candidate') {
  if (confirmedBy === 'Candidate') {
    this.confirmationStatus.candidateConfirmed = true;
  } else {
    this.confirmationStatus.interviewerConfirmed = true;
  }
  
  this.confirmationStatus.confirmedAt = new Date();
  this.status = 'Confirmed';
  
  this.addToActivityLog('Confirmed', confirmedBy);
};

InterviewSchema.methods.complete = function(evaluation) {
  this.status = 'Completed';
  if (evaluation) {
    this.evaluation = { ...this.evaluation, ...evaluation };
  }
  this.addToActivityLog('Completed', 'System');
};

// Static methods
InterviewSchema.statics.findUpcoming = function(days = 7) {
  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + days);
  
  return this.find({
    scheduledDate: {
      $gte: startDate,
      $lte: endDate
    },
    status: { $in: ['Scheduled', 'Confirmed'] }
  }).populate('candidate', 'fullName email phone');
};

InterviewSchema.statics.findByInterviewer = function(interviewerEmail, startDate, endDate) {
  return this.find({
    'interviewer.email': interviewerEmail,
    scheduledDate: {
      $gte: startDate,
      $lte: endDate
    }
  }).populate('candidate', 'fullName email phone');
};

InterviewSchema.statics.getInterviewStats = function(startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        scheduledDate: {
          $gte: startDate,
          $lte: endDate
        }
      }
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        avgDuration: { $avg: '$duration' }
      }
    }
  ]);
};

module.exports = mongoose.model('Interview', InterviewSchema); 