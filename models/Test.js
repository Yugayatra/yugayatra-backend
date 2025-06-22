const mongoose = require('mongoose');

const testSchema = new mongoose.Schema({
  // Test Basic Information
  testId: {
    type: String,
    required: [true, 'Test ID is required'],
    unique: true,
    uppercase: true
  },
  
  // User Information
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User reference is required']
  },
  
  userPhone: {
    type: String,
    required: [true, 'User phone is required']
  },
  
  userName: {
    type: String,
    required: [true, 'User name is required']
  },
  
  // Test Configuration
  testConfig: {
    totalQuestions: {
      type: Number,
      required: [true, 'Total questions count is required'],
      default: 30
    },
    durationMinutes: {
      type: Number,
      required: [true, 'Test duration is required'],
      default: 30
    },
    difficultyDistribution: {
      easy: {
        type: Number,
        default: 30 // percentage
      },
      moderate: {
        type: Number,
        default: 30 // percentage
      },
      hard: {
        type: Number,
        default: 40 // percentage
      }
    },
    categories: [String],
    passingPercentage: {
      type: Number,
      default: 65
    },
    negativeMarking: {
      type: Boolean,
      default: true
    }
  },
  
  // Questions and Responses
  questions: [{
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      required: true
    },
    questionNumber: {
      type: Number,
      required: true
    },
    questionText: String,
    questionType: String,
    category: String,
    difficulty: String,
    points: Number,
    negativePoints: Number,
    options: [{
      text: String,
      isCorrect: Boolean
    }],
    correctAnswer: String,
    
    // User Response
    userResponse: {
      selectedOption: String,
      selectedAnswer: String,
      timeSpent: {
        type: Number, // in seconds
        default: 0
      },
      answeredAt: Date,
      isAnswered: {
        type: Boolean,
        default: false
      },
      flaggedForReview: {
        type: Boolean,
        default: false
      }
    },
    
    // Evaluation
    isCorrect: {
      type: Boolean,
      default: null
    },
    pointsEarned: {
      type: Number,
      default: 0
    }
  }],
  
  // Test Timeline
  startTime: {
    type: Date,
    required: [true, 'Start time is required']
  },
  
  endTime: Date,
  
  submittedAt: Date,
  
  actualDurationMinutes: {
    type: Number,
    default: 0
  },
  
  timeRemaining: {
    type: Number, // in seconds
    default: function() {
      return this.testConfig.durationMinutes * 60;
    }
  },
  
  // Test Status
  status: {
    type: String,
    enum: ['Scheduled', 'In Progress', 'Completed', 'Submitted', 'Evaluated', 'Cancelled', 'Expired'],
    default: 'Scheduled'
  },
  
  // Results and Scoring
  score: {
    totalQuestions: {
      type: Number,
      default: 0
    },
    attemptedQuestions: {
      type: Number,
      default: 0
    },
    correctAnswers: {
      type: Number,
      default: 0
    },
    wrongAnswers: {
      type: Number,
      default: 0
    },
    unansweredQuestions: {
      type: Number,
      default: 0
    },
    
    // Points Calculation
    totalPoints: {
      type: Number,
      default: 0
    },
    pointsEarned: {
      type: Number,
      default: 0
    },
    negativePoints: {
      type: Number,
      default: 0
    },
    netScore: {
      type: Number,
      default: 0
    },
    
    // Percentage and Grade
    percentage: {
      type: Number,
      default: 0
    },
    grade: {
      type: String,
      enum: ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D', 'F'],
      default: 'F'
    },
    
    // Category-wise Performance
    categoryWiseScore: [{
      category: String,
      totalQuestions: Number,
      correctAnswers: Number,
      percentage: Number,
      points: Number
    }],
    
    // Difficulty-wise Performance
    difficultyWiseScore: [{
      difficulty: String,
      totalQuestions: Number,
      correctAnswers: Number,
      percentage: Number,
      points: Number
    }]
  },
  
  // Result Status
  isPassed: {
    type: Boolean,
    default: false
  },
  
  rank: Number,
  
  percentile: Number,
  
  // Test Analytics
  analytics: {
    avgTimePerQuestion: {
      type: Number, // in seconds
      default: 0
    },
    fastestQuestion: {
      questionNumber: Number,
      timeSpent: Number
    },
    slowestQuestion: {
      questionNumber: Number,
      timeSpent: Number
    },
    timeDistribution: [{
      range: String, // e.g., "0-30s", "30-60s"
      count: Number
    }],
    attemptPattern: [{
      timestamp: Date,
      action: String, // 'answered', 'flagged', 'unflagged', 'reviewed'
      questionNumber: Number
    }]
  },
  
  // Proctoring and Security
  proctoring: {
    cameraEnabled: {
      type: Boolean,
      default: false
    },
    fullScreenViolations: {
      type: Number,
      default: 0
    },
    tabSwitchViolations: {
      type: Number,
      default: 0
    },
    suspiciousActivities: [{
      type: String,
      timestamp: Date,
      description: String
    }],
    screenshots: [String], // URLs of captured screenshots
    
    // Browser and Device Info
    browserInfo: {
      userAgent: String,
      browser: String,
      version: String,
      os: String,
      device: String
    },
    
    ipAddress: String,
    location: {
      country: String,
      state: String,
      city: String,
      coordinates: {
        latitude: Number,
        longitude: Number
      }
    }
  },
  
  // Feedback and Comments
  feedback: {
    testExperience: {
      rating: {
        type: Number,
        min: 1,
        max: 5
      },
      comments: String
    },
    technicalIssues: [String],
    suggestions: String
  },
  
  // Administrative Information
  attemptNumber: {
    type: Number,
    required: [true, 'Attempt number is required']
  },
  
  isRetake: {
    type: Boolean,
    default: false
  },
  
  previousAttempts: [{
    testId: String,
    score: Number,
    percentage: Number,
    attemptDate: Date
  }],
  
  // Quality Assurance
  reviewStatus: {
    type: String,
    enum: ['Pending', 'Under Review', 'Approved', 'Flagged', 'Rejected'],
    default: 'Pending'
  },
  
  reviewComments: [String],
  
  reviewedBy: String,
  
  reviewedAt: Date,
  
  // Certificates and Documentation
  certificateIssued: {
    type: Boolean,
    default: false
  },
  
  certificateNumber: String,
  
  certificateIssuedAt: Date,
  
  reportGenerated: {
    type: Boolean,
    default: false
  },
  
  reportUrl: String,
  
  // Expiry and Validity
  validUntil: Date,
  
  isExpired: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for test duration in a readable format
testSchema.virtual('durationFormatted').get(function() {
  if (!this.actualDurationMinutes) return 'N/A';
  const hours = Math.floor(this.actualDurationMinutes / 60);
  const minutes = this.actualDurationMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
});

// Virtual for time utilization percentage
testSchema.virtual('timeUtilization').get(function() {
  if (!this.actualDurationMinutes || !this.testConfig.durationMinutes) return 0;
  return Math.round((this.actualDurationMinutes / this.testConfig.durationMinutes) * 100);
});

// Pre-save middleware for calculations
testSchema.pre('save', function(next) {
  // Generate test ID if not present
  if (!this.testId) {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    this.testId = `TEST${timestamp}${random}`;
  }
  
  // Calculate actual duration if test is completed
  if (this.status === 'Completed' && this.startTime && this.endTime) {
    this.actualDurationMinutes = Math.round((this.endTime - this.startTime) / (1000 * 60));
  }
  
  // Update expiry status
  if (this.validUntil && new Date() > this.validUntil) {
    this.isExpired = true;
  }
  
  next();
});

// Method to start the test
testSchema.methods.startTest = function() {
  if (this.status !== 'Scheduled') {
    throw new Error('Test cannot be started in current status');
  }
  
  this.status = 'In Progress';
  this.startTime = new Date();
  this.timeRemaining = this.testConfig.durationMinutes * 60;
  
  return this.save();
};

// Method to submit answer
testSchema.methods.submitAnswer = function(questionNumber, answer, timeSpent) {
  const question = this.questions.find(q => q.questionNumber === questionNumber);
  if (!question) {
    throw new Error('Question not found');
  }
  
  question.userResponse.selectedAnswer = answer;
  question.userResponse.timeSpent = timeSpent || 0;
  question.userResponse.answeredAt = new Date();
  question.userResponse.isAnswered = true;
  
  // Check if answer is correct
  if (question.questionType === 'Multiple Choice') {
    const correctOption = question.options.find(opt => opt.isCorrect);
    question.isCorrect = correctOption && correctOption.text === answer;
    question.userResponse.selectedOption = answer;
  } else {
    question.isCorrect = question.correctAnswer.toLowerCase().trim() === answer.toLowerCase().trim();
  }
  
  // Calculate points
  if (question.isCorrect) {
    question.pointsEarned = question.points;
  } else if (this.testConfig.negativeMarking && question.userResponse.isAnswered) {
    question.pointsEarned = -question.negativePoints;
  } else {
    question.pointsEarned = 0;
  }
  
  return this.save();
};

// Method to calculate final score
testSchema.methods.calculateScore = function() {
  const score = {
    totalQuestions: this.questions.length,
    attemptedQuestions: 0,
    correctAnswers: 0,
    wrongAnswers: 0,
    unansweredQuestions: 0,
    totalPoints: 0,
    pointsEarned: 0,
    negativePoints: 0,
    netScore: 0,
    percentage: 0,
    categoryWiseScore: [],
    difficultyWiseScore: []
  };
  
  // Calculate basic metrics
  this.questions.forEach(question => {
    score.totalPoints += question.points;
    
    if (question.userResponse.isAnswered) {
      score.attemptedQuestions++;
      
      if (question.isCorrect) {
        score.correctAnswers++;
        score.pointsEarned += question.points;
      } else {
        score.wrongAnswers++;
        if (this.testConfig.negativeMarking) {
          score.negativePoints += question.negativePoints;
        }
      }
    } else {
      score.unansweredQuestions++;
    }
  });
  
  // Calculate net score and percentage
  score.netScore = score.pointsEarned - score.negativePoints;
  score.percentage = Math.round((score.netScore / score.totalPoints) * 100);
  
  // Determine grade
  if (score.percentage >= 90) score.grade = 'A+';
  else if (score.percentage >= 80) score.grade = 'A';
  else if (score.percentage >= 70) score.grade = 'B+';
  else if (score.percentage >= 60) score.grade = 'B';
  else if (score.percentage >= 50) score.grade = 'C+';
  else if (score.percentage >= 40) score.grade = 'C';
  else if (score.percentage >= 30) score.grade = 'D';
  else score.grade = 'F';
  
  // Calculate category-wise score
  const categories = [...new Set(this.questions.map(q => q.category))];
  categories.forEach(category => {
    const categoryQuestions = this.questions.filter(q => q.category === category);
    const categoryCorrect = categoryQuestions.filter(q => q.isCorrect).length;
    const categoryPoints = categoryQuestions.reduce((sum, q) => sum + (q.isCorrect ? q.points : (q.userResponse.isAnswered ? -q.negativePoints : 0)), 0);
    
    score.categoryWiseScore.push({
      category,
      totalQuestions: categoryQuestions.length,
      correctAnswers: categoryCorrect,
      percentage: Math.round((categoryCorrect / categoryQuestions.length) * 100),
      points: categoryPoints
    });
  });
  
  // Calculate difficulty-wise score
  const difficulties = [...new Set(this.questions.map(q => q.difficulty))];
  difficulties.forEach(difficulty => {
    const difficultyQuestions = this.questions.filter(q => q.difficulty === difficulty);
    const difficultyCorrect = difficultyQuestions.filter(q => q.isCorrect).length;
    const difficultyPoints = difficultyQuestions.reduce((sum, q) => sum + (q.isCorrect ? q.points : (q.userResponse.isAnswered ? -q.negativePoints : 0)), 0);
    
    score.difficultyWiseScore.push({
      difficulty,
      totalQuestions: difficultyQuestions.length,
      correctAnswers: difficultyCorrect,
      percentage: Math.round((difficultyCorrect / difficultyQuestions.length) * 100),
      points: difficultyPoints
    });
  });
  
  this.score = score;
  this.isPassed = score.percentage >= this.testConfig.passingPercentage;
  
  return score;
};

// Method to complete test
testSchema.methods.completeTest = function() {
  if (this.status !== 'In Progress') {
    throw new Error('Test is not in progress');
  }
  
  this.endTime = new Date();
  this.submittedAt = new Date();
  this.status = 'Completed';
  
  // Calculate score
  this.calculateScore();
  
  // Calculate analytics
  this.calculateAnalytics();
  
  this.status = 'Evaluated';
  
  return this.save();
};

// Method to calculate analytics
testSchema.methods.calculateAnalytics = function() {
  const answeredQuestions = this.questions.filter(q => q.userResponse.isAnswered);
  
  if (answeredQuestions.length === 0) {
    this.analytics.avgTimePerQuestion = 0;
    return;
  }
  
  // Calculate average time per question
  const totalTime = answeredQuestions.reduce((sum, q) => sum + q.userResponse.timeSpent, 0);
  this.analytics.avgTimePerQuestion = Math.round(totalTime / answeredQuestions.length);
  
  // Find fastest and slowest questions
  const sortedByTime = answeredQuestions.sort((a, b) => a.userResponse.timeSpent - b.userResponse.timeSpent);
  
  this.analytics.fastestQuestion = {
    questionNumber: sortedByTime[0].questionNumber,
    timeSpent: sortedByTime[0].userResponse.timeSpent
  };
  
  this.analytics.slowestQuestion = {
    questionNumber: sortedByTime[sortedByTime.length - 1].questionNumber,
    timeSpent: sortedByTime[sortedByTime.length - 1].userResponse.timeSpent
  };
  
  // Calculate time distribution
  const timeRanges = [
    { range: '0-30s', min: 0, max: 30, count: 0 },
    { range: '30-60s', min: 30, max: 60, count: 0 },
    { range: '60-120s', min: 60, max: 120, count: 0 },
    { range: '120s+', min: 120, max: Infinity, count: 0 }
  ];
  
  answeredQuestions.forEach(q => {
    const time = q.userResponse.timeSpent;
    const range = timeRanges.find(r => time >= r.min && time < r.max);
    if (range) range.count++;
  });
  
  this.analytics.timeDistribution = timeRanges.map(r => ({
    range: r.range,
    count: r.count
  }));
};

// Static method to get test statistics
testSchema.statics.getTestStats = async function(filters = {}) {
  const pipeline = [
    { $match: { status: 'Evaluated', ...filters } },
    {
      $group: {
        _id: null,
        totalTests: { $sum: 1 },
        passedTests: { $sum: { $cond: ['$isPassed', 1, 0] } },
        avgScore: { $avg: '$score.percentage' },
        avgDuration: { $avg: '$actualDurationMinutes' },
        maxScore: { $max: '$score.percentage' },
        minScore: { $min: '$score.percentage' }
      }
    }
  ];
  
  const [stats] = await this.aggregate(pipeline);
  
  if (!stats) {
    return {
      totalTests: 0,
      passedTests: 0,
      passRate: 0,
      avgScore: 0,
      avgDuration: 0,
      maxScore: 0,
      minScore: 0
    };
  }
  
  return {
    ...stats,
    passRate: Math.round((stats.passedTests / stats.totalTests) * 100),
    avgScore: Math.round(stats.avgScore),
    avgDuration: Math.round(stats.avgDuration)
  };
};

// Indexes for performance
testSchema.index({ user: 1, createdAt: -1 });
testSchema.index({ status: 1 });
testSchema.index({ testId: 1 });
testSchema.index({ userPhone: 1 });
testSchema.index({ 'score.percentage': -1 });
testSchema.index({ isPassed: 1 });
testSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Test', testSchema); 