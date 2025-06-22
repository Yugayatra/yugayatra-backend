const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  // Question Content
  questionText: {
    type: String,
    required: [true, 'Question text is required'],
    trim: true,
    minlength: [10, 'Question must be at least 10 characters long'],
    maxlength: [1000, 'Question cannot exceed 1000 characters']
  },
  
  questionType: {
    type: String,
    enum: ['Multiple Choice', 'True/False', 'Fill in the Blank'],
    required: [true, 'Question type is required'],
    default: 'Multiple Choice'
  },
  
  // Options for Multiple Choice Questions
  options: [{
    text: {
      type: String,
      required: function() {
        return this.questionType === 'Multiple Choice';
      },
      trim: true,
      maxlength: [500, 'Option text cannot exceed 500 characters']
    },
    isCorrect: {
      type: Boolean,
      default: false
    }
  }],
  
  // For True/False Questions
  correctAnswer: {
    type: String,
    required: function() {
      return this.questionType === 'True/False' || this.questionType === 'Fill in the Blank';
    },
    trim: true
  },
  
  // Question Metadata
  category: {
    type: String,
    required: [true, 'Question category is required'],
    enum: [
      'General Knowledge',
      'Logical Reasoning',
      'Quantitative Aptitude',
      'English Language',
      'Computer Knowledge',
      'Current Affairs',
      'Technical Knowledge',
      'Analytical Reasoning',
      'Verbal Ability',
      'Data Interpretation'
    ]
  },
  
  subcategory: {
    type: String,
    trim: true,
    maxlength: [100, 'Subcategory cannot exceed 100 characters']
  },
  
  difficulty: {
    type: String,
    required: [true, 'Difficulty level is required'],
    enum: ['Easy', 'Moderate', 'Hard'],
    default: 'Moderate'
  },
  
  // Scoring
  points: {
    type: Number,
    required: [true, 'Points are required'],
    min: [1, 'Points must be at least 1'],
    max: [10, 'Points cannot exceed 10'],
    default: function() {
      switch(this.difficulty) {
        case 'Easy': return 2;
        case 'Moderate': return 3;
        case 'Hard': return 4;
        default: return 3;
      }
    }
  },
  
  negativePoints: {
    type: Number,
    min: [0, 'Negative points cannot be less than 0'],
    max: [5, 'Negative points cannot exceed 5'],
    default: 1
  },
  
  // Question Analytics
  timesUsed: {
    type: Number,
    default: 0
  },
  
  correctAttempts: {
    type: Number,
    default: 0
  },
  
  totalAttempts: {
    type: Number,
    default: 0
  },
  
  avgTimeSpent: {
    type: Number, // in seconds
    default: 0
  },
  
  // Additional Information
  explanation: {
    type: String,
    trim: true,
    maxlength: [1000, 'Explanation cannot exceed 1000 characters']
  },
  
  hints: [String],
  
  relatedTopics: [String],
  
  // Media attachments
  imageUrl: String,
  
  // Question Source and Attribution
  source: {
    type: String,
    trim: true,
    maxlength: [200, 'Source cannot exceed 200 characters']
  },
  
  author: {
    type: String,
    trim: true,
    maxlength: [100, 'Author name cannot exceed 100 characters']
  },
  
  // Question Status and Lifecycle
  status: {
    type: String,
    enum: ['Draft', 'Review', 'Active', 'Inactive', 'Archived'],
    default: 'Draft'
  },
  
  isApproved: {
    type: Boolean,
    default: false
  },
  
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  
  approvedAt: Date,
  
  reviewComments: [String],
  
  // Version Control
  version: {
    type: Number,
    default: 1
  },
  
  previousVersions: [{
    versionNumber: Number,
    questionText: String,
    options: [{
      text: String,
      isCorrect: Boolean
    }],
    modifiedAt: Date,
    modifiedBy: String,
    changeReason: String
  }],
  
  // Usage Restrictions
  usageRestrictions: {
    maxUsagePerTest: {
      type: Number,
      default: 1
    },
    cooldownPeriod: {
      type: Number, // in days
      default: 0
    },
    lastUsed: Date
  },
  
  // Tags for better organization
  tags: [String],
  
  // Quality Metrics
  qualityScore: {
    type: Number,
    min: [0, 'Quality score cannot be less than 0'],
    max: [100, 'Quality score cannot exceed 100'],
    default: 50
  },
  
  difficultyScore: {
    type: Number,
    min: [0, 'Difficulty score cannot be less than 0'],
    max: [100, 'Difficulty score cannot exceed 100']
  },
  
  // Admin Information
  createdBy: {
    type: String,
    required: [true, 'Creator information is required']
  },
  
  lastModifiedBy: String,
  
  lastModifiedAt: Date
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for success rate
questionSchema.virtual('successRate').get(function() {
  if (this.totalAttempts === 0) return 0;
  return Math.round((this.correctAttempts / this.totalAttempts) * 100);
});

// Virtual for difficulty rating based on success rate
questionSchema.virtual('actualDifficulty').get(function() {
  const successRate = this.successRate;
  if (successRate >= 70) return 'Easy';
  if (successRate >= 40) return 'Moderate';
  return 'Hard';
});

// Pre-save middleware for validation
questionSchema.pre('save', function(next) {
  // Validate multiple choice questions have at least 2 options with exactly one correct answer
  if (this.questionType === 'Multiple Choice') {
    if (!this.options || this.options.length < 2) {
      return next(new Error('Multiple choice questions must have at least 2 options'));
    }
    
    const correctOptions = this.options.filter(option => option.isCorrect);
    if (correctOptions.length !== 1) {
      return next(new Error('Multiple choice questions must have exactly one correct answer'));
    }
  }
  
  // Update last modified information
  if (this.isModified() && !this.isNew) {
    this.lastModifiedAt = new Date();
  }
  
  // Calculate quality score based on usage and success rate
  if (this.totalAttempts > 10) {
    const successRate = this.successRate;
    const usageScore = Math.min(this.timesUsed * 2, 50);
    this.qualityScore = Math.round((successRate + usageScore) / 2);
  }
  
  next();
});

// Method to update statistics after use
questionSchema.methods.updateStats = function(isCorrect, timeSpent) {
  this.timesUsed += 1;
  this.totalAttempts += 1;
  
  if (isCorrect) {
    this.correctAttempts += 1;
  }
  
  // Update average time spent
  if (timeSpent && timeSpent > 0) {
    const totalTime = this.avgTimeSpent * (this.totalAttempts - 1) + timeSpent;
    this.avgTimeSpent = Math.round(totalTime / this.totalAttempts);
  }
  
  this.usageRestrictions.lastUsed = new Date();
  
  return this.save();
};

// Method to check if question can be used
questionSchema.methods.canBeUsed = function() {
  // Check if question is active and approved
  if (this.status !== 'Active' || !this.isApproved) {
    return { canUse: false, reason: 'Question is not active or approved' };
  }
  
  // Check cooldown period
  if (this.usageRestrictions.cooldownPeriod > 0 && this.usageRestrictions.lastUsed) {
    const daysSinceLastUse = (new Date() - this.usageRestrictions.lastUsed) / (1000 * 60 * 60 * 24);
    if (daysSinceLastUse < this.usageRestrictions.cooldownPeriod) {
      return { 
        canUse: false, 
        reason: `Question is in cooldown period. ${Math.ceil(this.usageRestrictions.cooldownPeriod - daysSinceLastUse)} days remaining.` 
      };
    }
  }
  
  return { canUse: true };
};

// Method to create a new version
questionSchema.methods.createVersion = function(changes, reason, modifiedBy) {
  const currentVersion = {
    versionNumber: this.version,
    questionText: this.questionText,
    options: [...this.options],
    modifiedAt: new Date(),
    modifiedBy: modifiedBy,
    changeReason: reason
  };
  
  this.previousVersions.push(currentVersion);
  this.version += 1;
  this.lastModifiedBy = modifiedBy;
  this.lastModifiedAt = new Date();
  
  // Apply changes
  Object.assign(this, changes);
  
  return this.save();
};

// Static method to get random questions by criteria
questionSchema.statics.getRandomQuestions = async function(criteria) {
  const {
    count = 30,
    difficulty = { Easy: 30, Moderate: 30, Hard: 40 }, // percentage distribution
    categories = [],
    excludeIds = []
  } = criteria;
  
  const questions = [];
  const pipeline = [
    {
      $match: {
        status: 'Active',
        isApproved: true,
        _id: { $nin: excludeIds.map(id => mongoose.Types.ObjectId(id)) }
      }
    }
  ];
  
  // Add category filter if specified
  if (categories.length > 0) {
    pipeline[0].$match.category = { $in: categories };
  }
  
  // Get questions by difficulty
  for (const [diff, percentage] of Object.entries(difficulty)) {
    const questionsNeeded = Math.round((count * percentage) / 100);
    
    const difficultyPipeline = [
      ...pipeline,
      { $match: { difficulty: diff } },
      { $sample: { size: questionsNeeded } }
    ];
    
    const difficultyQuestions = await this.aggregate(difficultyPipeline);
    questions.push(...difficultyQuestions);
  }
  
  // If we don't have enough questions, fill with random ones
  if (questions.length < count) {
    const remaining = count - questions.length;
    const usedIds = questions.map(q => q._id);
    
    const remainingPipeline = [
      ...pipeline,
      { $match: { _id: { $nin: usedIds } } },
      { $sample: { size: remaining } }
    ];
    
    const remainingQuestions = await this.aggregate(remainingPipeline);
    questions.push(...remainingQuestions);
  }
  
  // Shuffle and return
  return questions.sort(() => Math.random() - 0.5).slice(0, count);
};

// Indexes for performance
questionSchema.index({ status: 1, isApproved: 1 });
questionSchema.index({ category: 1, difficulty: 1 });
questionSchema.index({ tags: 1 });
questionSchema.index({ createdAt: -1 });
questionSchema.index({ qualityScore: -1 });
questionSchema.index({ timesUsed: -1 });

module.exports = mongoose.model('Question', questionSchema); 