const express = require('express');
const multer = require('multer');
const path = require('path');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Test = require('../models/Test');
const { protectUser } = require('../middleware/auth');
const emailService = require('../utils/emailService');
const smsService = require('../utils/smsService');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  // Profile photo validation
  if (file.fieldname === 'profilePhoto') {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed for profile photo'), false);
    }
  }
  // Resume validation
  else if (file.fieldname === 'resume') {
    if (file.mimetype === 'application/pdf' || 
        file.mimetype === 'application/msword' || 
        file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, DOC, and DOCX files are allowed for resume'), false);
    }
  }
  // ID proof validation
  else if (file.fieldname === 'idProof') {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only image or PDF files are allowed for ID proof'), false);
    }
  }
  else {
    cb(new Error('Unexpected field'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// @route   GET /api/users/profile
// @desc    Get user profile
// @access  Private
router.get('/profile', protectUser, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-otp -otpExpires -testInfo.violations')
      .populate('testInfo.completedTests', 'score percentage status createdAt');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        user: {
          ...user.toObject(),
          profileCompletion: calculateProfileCompletion(user)
        }
      }
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch profile'
    });
  }
});

// @route   PUT /api/users/profile
// @desc    Update user profile with file uploads
// @access  Private
router.put('/profile', 
  protectUser,
  upload.fields([
    { name: 'profilePhoto', maxCount: 1 },
    { name: 'resume', maxCount: 1 },
    { name: 'idProof', maxCount: 1 }
  ]),
  [
    body('fullName').optional().isLength({ min: 2 }).withMessage('Full name must be at least 2 characters'),
    body('email').optional().isEmail().withMessage('Valid email is required'),
    body('dateOfBirth').optional().isISO8601().withMessage('Valid date of birth is required'),
    body('gender').optional().isIn(['Male', 'Female', 'Other']).withMessage('Valid gender is required'),
    body('address.pincode').optional().isLength({ min: 6, max: 6 }).withMessage('Valid pincode is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const user = await User.findById(req.user._id);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      // Update basic fields
      const updateFields = ['fullName', 'email', 'dateOfBirth', 'gender'];
      updateFields.forEach(field => {
        if (req.body[field]) {
          user[field] = req.body[field];
        }
      });

      // Update nested objects
      if (req.body.address) {
        user.address = { ...user.address, ...req.body.address };
      }

      if (req.body.education) {
        user.education = { ...user.education, ...req.body.education };
      }

      if (req.body.emergencyContact) {
        user.emergencyContact = { ...user.emergencyContact, ...req.body.emergencyContact };
      }

      if (req.body.preferences) {
        user.preferences = { ...user.preferences, ...req.body.preferences };
      }

      // Handle file uploads
      if (req.files) {
        if (req.files.profilePhoto) {
          user.profile.photo = `/uploads/${req.files.profilePhoto[0].filename}`;
        }
        if (req.files.resume) {
          user.profile.resume = `/uploads/${req.files.resume[0].filename}`;
        }
        if (req.files.idProof) {
          user.profile.idProof = `/uploads/${req.files.idProof[0].filename}`;
        }
      }

      user.profile.lastUpdated = new Date();
      await user.save();

      res.status(200).json({
        success: true,
        message: 'Profile updated successfully',
        data: {
          user: {
            ...user.toObject(),
            profileCompletion: calculateProfileCompletion(user)
          }
        }
      });

    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update profile'
      });
    }
  }
);

// @route   GET /api/users/test-eligibility
// @desc    Check test eligibility
// @access  Private
router.get('/test-eligibility', protectUser, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const eligibility = {
      isEligible: true,
      reasons: [],
      canTakeTest: false,
      attemptsLeft: 0,
      nextAttemptAt: null,
      profileCompletion: calculateProfileCompletion(user)
    };

    // Check if user is verified
    if (!user.isVerified) {
      eligibility.isEligible = false;
      eligibility.reasons.push('Phone number not verified');
    }

    // Check if already qualified
    if (user.testInfo.hasQualified) {
      eligibility.isEligible = false;
      eligibility.reasons.push('Already qualified for interview');
    }

    // Check attempts
    if (user.testInfo.totalAttempts >= 5) {
      eligibility.isEligible = false;
      eligibility.reasons.push('Maximum attempts reached');
    } else {
      eligibility.attemptsLeft = 5 - user.testInfo.totalAttempts;
    }

    // Check cooldown period (24 hours between attempts)
    if (user.testInfo.lastAttempt) {
      const cooldownPeriod = 24 * 60 * 60 * 1000; // 24 hours
      const timeSinceLastAttempt = Date.now() - user.testInfo.lastAttempt.getTime();
      
      if (timeSinceLastAttempt < cooldownPeriod) {
        eligibility.isEligible = false;
        eligibility.nextAttemptAt = new Date(user.testInfo.lastAttempt.getTime() + cooldownPeriod);
        eligibility.reasons.push(`Must wait 24 hours between attempts. Next attempt available at ${eligibility.nextAttemptAt.toLocaleString()}`);
      }
    }

    // Check profile completion (at least 70% for test)
    if (eligibility.profileCompletion < 70) {
      eligibility.isEligible = false;
      eligibility.reasons.push('Profile must be at least 70% complete to take test');
    }

    eligibility.canTakeTest = eligibility.isEligible && eligibility.reasons.length === 0;

    res.status(200).json({
      success: true,
      data: { eligibility }
    });

  } catch (error) {
    console.error('Check test eligibility error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check test eligibility'
    });
  }
});

// @route   GET /api/users/test-history
// @desc    Get user's test history
// @access  Private
router.get('/test-history', protectUser, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const tests = await Test.find({ candidate: req.user._id })
      .select('score percentage status timeTaken violationsCount createdAt startedAt completedAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalTests = await Test.countDocuments({ candidate: req.user._id });

    const user = await User.findById(req.user._id).select('testInfo');

    res.status(200).json({
      success: true,
      data: {
        tests,
        testInfo: user.testInfo,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalTests / parseInt(limit)),
          totalTests,
          hasNextPage: parseInt(page) < Math.ceil(totalTests / parseInt(limit)),
          hasPrevPage: parseInt(page) > 1
        }
      }
    });

  } catch (error) {
    console.error('Get test history error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch test history'
    });
  }
});

// @route   GET /api/users/test-result/:testId
// @desc    Get detailed test result
// @access  Private
router.get('/test-result/:testId', protectUser, async (req, res) => {
  try {
    const test = await Test.findOne({
      _id: req.params.testId,
      candidate: req.user._id
    }).populate('questions.question', 'questionText options correctAnswer difficulty category');

    if (!test) {
      return res.status(404).json({
        success: false,
        error: 'Test result not found'
      });
    }

    // Calculate detailed analytics
    const analytics = {
      totalQuestions: test.questions.length,
      correctAnswers: test.questions.filter(q => q.isCorrect).length,
      wrongAnswers: test.questions.filter(q => q.userAnswer !== undefined && !q.isCorrect).length,
      unanswered: test.questions.filter(q => q.userAnswer === undefined).length,
      categoryWise: {},
      difficultyWise: {},
      timeAnalysis: {
        totalTime: test.timeTaken,
        averageTimePerQuestion: test.timeTaken / test.questions.length,
        timeManagement: test.timeTaken <= 30 * 60 ? 'Good' : 'Needs Improvement'
      }
    };

    // Category-wise analysis
    test.questions.forEach(q => {
      const category = q.question.category;
      if (!analytics.categoryWise[category]) {
        analytics.categoryWise[category] = { total: 0, correct: 0, percentage: 0 };
      }
      analytics.categoryWise[category].total++;
      if (q.isCorrect) analytics.categoryWise[category].correct++;
    });

    // Calculate percentages
    Object.keys(analytics.categoryWise).forEach(category => {
      const cat = analytics.categoryWise[category];
      cat.percentage = Math.round((cat.correct / cat.total) * 100);
    });

    // Difficulty-wise analysis
    test.questions.forEach(q => {
      const difficulty = q.question.difficulty;
      if (!analytics.difficultyWise[difficulty]) {
        analytics.difficultyWise[difficulty] = { total: 0, correct: 0, percentage: 0 };
      }
      analytics.difficultyWise[difficulty].total++;
      if (q.isCorrect) analytics.difficultyWise[difficulty].correct++;
    });

    // Calculate percentages
    Object.keys(analytics.difficultyWise).forEach(difficulty => {
      const diff = analytics.difficultyWise[difficulty];
      diff.percentage = Math.round((diff.correct / diff.total) * 100);
    });

    res.status(200).json({
      success: true,
      data: {
        test,
        analytics
      }
    });

  } catch (error) {
    console.error('Get test result error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch test result'
    });
  }
});

// @route   PUT /api/users/change-phone
// @desc    Change phone number
// @access  Private
router.put('/change-phone',
  protectUser,
  [
    body('newPhone').isMobilePhone('en-IN').withMessage('Valid Indian phone number is required'),
    body('otp').isLength({ min: 4, max: 6 }).withMessage('Valid OTP is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const { newPhone, otp } = req.body;

      const user = await User.findById(req.user._id);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      // Check if phone number is already in use
      const existingUser = await User.findOne({ phone: newPhone });
      if (existingUser && existingUser._id.toString() !== user._id.toString()) {
        return res.status(400).json({
          success: false,
          error: 'Phone number already in use'
        });
      }

      // Verify OTP (In production, implement proper OTP verification)
      if (user.otp !== otp || user.otpExpires < Date.now()) {
        return res.status(400).json({
          success: false,
          error: 'Invalid or expired OTP'
        });
      }

      const oldPhone = user.phone;
      user.phone = newPhone;
      user.otp = undefined;
      user.otpExpires = undefined;
      user.isVerified = true;
      
      await user.save();

      // Send confirmation notifications
      await Promise.all([
        emailService.sendEmail(
          user.email,
          'Phone Number Changed - YugaYatra',
          `Your phone number has been successfully changed from ${oldPhone} to ${newPhone}.`
        ),
        smsService.sendSMS(
          newPhone,
          `Your YugaYatra account phone number has been updated successfully. If this wasn't you, please contact support immediately.`
        )
      ]);

      res.status(200).json({
        success: true,
        message: 'Phone number updated successfully',
        data: {
          user: {
            ...user.toObject(),
            otp: undefined,
            otpExpires: undefined
          }
        }
      });

    } catch (error) {
      console.error('Change phone error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to change phone number'
      });
    }
  }
);

// @route   POST /api/users/request-phone-change
// @desc    Request phone number change (send OTP)
// @access  Private
router.post('/request-phone-change',
  protectUser,
  [
    body('newPhone').isMobilePhone('en-IN').withMessage('Valid Indian phone number is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const { newPhone } = req.body;

      // Check if phone number is already in use
      const existingUser = await User.findOne({ phone: newPhone });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          error: 'Phone number already in use'
        });
      }

      const user = await User.findById(req.user._id);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      // Generate OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      user.otp = otp;
      user.otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
      
      await user.save();

      // Send OTP to new phone
      await smsService.sendOTP(newPhone, otp, user.fullName);

      res.status(200).json({
        success: true,
        message: 'OTP sent to new phone number',
        data: {
          otpSent: true,
          expiresIn: 10 * 60 * 1000 // 10 minutes in milliseconds
        }
      });

    } catch (error) {
      console.error('Request phone change error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to send OTP'
      });
    }
  }
);

// @route   DELETE /api/users/account
// @desc    Delete user account
// @access  Private
router.delete('/account',
  protectUser,
  [
    body('confirmDelete').equals('DELETE').withMessage('Type DELETE to confirm account deletion'),
    body('reason').isLength({ min: 10 }).withMessage('Please provide a reason for account deletion')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const { reason } = req.body;

      const user = await User.findById(req.user._id);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      // Archive user data before deletion (for compliance)
      const archivedData = {
        userId: user._id,
        userData: user.toObject(),
        deletionReason: reason,
        deletedAt: new Date(),
        deletedBy: 'user_request'
      };

      // In production, save to archived_users collection
      console.log('Archiving user data:', archivedData);

      // Delete related test data
      await Test.deleteMany({ candidate: user._id });

      // Delete user
      await User.findByIdAndDelete(user._id);

      // Send confirmation email
      await emailService.sendEmail(
        user.email,
        'Account Deleted - YugaYatra',
        `Your YugaYatra account has been permanently deleted as requested. All your data has been removed from our systems.`
      );

      res.status(200).json({
        success: true,
        message: 'Account deleted successfully'
      });

    } catch (error) {
      console.error('Delete account error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete account'
      });
    }
  }
);

// Helper function to calculate profile completion percentage
function calculateProfileCompletion(user) {
  const fields = [
    user.fullName,
    user.email,
    user.phone,
    user.dateOfBirth,
    user.gender,
    user.address?.street,
    user.address?.city,
    user.address?.state,
    user.address?.pincode,
    user.education?.qualification,
    user.education?.institution,
    user.education?.yearOfPassing,
    user.profile?.photo,
    user.profile?.resume,
    user.emergencyContact?.name,
    user.emergencyContact?.phone
  ];

  const completedFields = fields.filter(field => field && field.toString().trim().length > 0).length;
  return Math.round((completedFields / fields.length) * 100);
}

module.exports = router; 