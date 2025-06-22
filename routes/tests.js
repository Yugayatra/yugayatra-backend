const express = require('express');
const { body, validationResult } = require('express-validator');
const Test = require('../models/Test');
const Question = require('../models/Question');
const User = require('../models/User');
const jwtUtils = require('../utils/jwtUtils');
const emailService = require('../utils/emailService');
const smsService = require('../utils/smsService');
const { protectUser, protectTest, protectAdmin, requireCompleteProfile } = require('../middleware/auth');

const router = express.Router();

// Helper function to handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

// @route   POST /api/tests/start
// @desc    Start a new test session
// @access  Private (Verified User with Complete Profile)
router.post('/start', 
  protectUser, 
  requireCompleteProfile,
  async (req, res) => {
    try {
      const user = await User.findById(req.user._id);
      
      // Check if user can attempt test
      const eligibility = user.canAttemptTest();
      if (!eligibility.canAttempt) {
        return res.status(403).json({
          success: false,
          error: eligibility.reason
        });
      }
      
      // Check if user has an active test session
      const activeTest = await Test.findOne({
        user: user._id,
        status: { $in: ['Scheduled', 'In Progress'] }
      });
      
      if (activeTest) {
        return res.status(400).json({
          success: false,
          error: 'You have an active test session. Please complete it first.',
          data: {
            testId: activeTest.testId,
            status: activeTest.status
          }
        });
      }
      
      // Get test configuration
      const testConfig = {
        totalQuestions: parseInt(process.env.QUESTIONS_PER_TEST) || 30,
        durationMinutes: parseInt(process.env.TEST_DURATION_MINUTES) || 30,
        difficultyDistribution: {
          easy: 30,    // 30% easy questions
          moderate: 30, // 30% moderate questions
          hard: 40     // 40% hard questions
        },
        passingPercentage: parseInt(process.env.PASSING_PERCENTAGE) || 65,
        negativeMarking: true
      };
      
      // Get random questions based on difficulty distribution
      const questions = await Question.getRandomQuestions({
        count: testConfig.totalQuestions,
        difficulty: {
          Easy: testConfig.difficultyDistribution.easy,
          Moderate: testConfig.difficultyDistribution.moderate,
          Hard: testConfig.difficultyDistribution.hard
        }
      });
      
      if (questions.length < testConfig.totalQuestions) {
        return res.status(500).json({
          success: false,
          error: 'Insufficient questions available. Please contact support.'
        });
      }
      
      // Prepare questions for test (hide correct answers)
      const testQuestions = questions.map((question, index) => ({
        questionId: question._id,
        questionNumber: index + 1,
        questionText: question.questionText,
        questionType: question.questionType,
        category: question.category,
        difficulty: question.difficulty,
        points: question.points,
        negativePoints: question.negativePoints,
        options: question.options ? question.options.map(opt => ({
          text: opt.text,
          isCorrect: opt.isCorrect // This will be used for evaluation
        })) : [],
        correctAnswer: question.correctAnswer,
        userResponse: {
          selectedOption: '',
          selectedAnswer: '',
          timeSpent: 0,
          answeredAt: null,
          isAnswered: false,
          flaggedForReview: false
        },
        isCorrect: null,
        pointsEarned: 0
      }));
      
      // Create new test
      const test = new Test({
        user: user._id,
        userPhone: user.phone,
        userName: user.fullName,
        testConfig: testConfig,
        questions: testQuestions,
        startTime: new Date(),
        status: 'Scheduled',
        attemptNumber: user.testInfo.totalAttempts + 1,
        isRetake: user.testInfo.totalAttempts > 0,
        previousAttempts: user.testInfo.totalAttempts > 0 ? [{
          score: user.testInfo.bestScore,
          percentage: user.testInfo.bestScore,
          attemptDate: user.testInfo.lastAttemptDate
        }] : [],
        proctoring: {
          browserInfo: {
            userAgent: req.get('User-Agent'),
            browser: req.get('sec-ch-ua') || 'Unknown',
            os: req.get('sec-ch-ua-platform') || 'Unknown',
            device: req.get('sec-ch-ua-mobile') === '?1' ? 'Mobile' : 'Desktop'
          },
          ipAddress: req.ip,
          fullScreenViolations: 0,
          tabSwitchViolations: 0,
          suspiciousActivities: []
        }
      });
      
      await test.save();
      
      // Update user test info
      user.testInfo.totalAttempts += 1;
      user.testInfo.lastAttemptDate = new Date();
      await user.save();
      
      // Generate test session token
      const testToken = jwtUtils.generateTestToken(user, test.testId);
      
      if (!testToken.success) {
        return res.status(500).json({
          success: false,
          error: 'Failed to generate test token'
        });
      }
      
      // Return test information (without answers)
      const testData = {
        testId: test.testId,
        totalQuestions: test.testConfig.totalQuestions,
        durationMinutes: test.testConfig.durationMinutes,
        passingPercentage: test.testConfig.passingPercentage,
        questions: test.questions.map(q => ({
          questionNumber: q.questionNumber,
          questionText: q.questionText,
          questionType: q.questionType,
          category: q.category,
          difficulty: q.difficulty,
          points: q.points,
          options: q.questionType === 'Multiple Choice' ? 
            q.options.map(opt => ({ text: opt.text })) : [] // Hide correct answers
        })),
        startTime: test.startTime,
        timeRemaining: test.timeRemaining
      };
      
      res.status(201).json({
        success: true,
        message: 'Test session created successfully',
        data: {
          test: testData,
          testToken: testToken.token,
          instructions: {
            duration: `${test.testConfig.durationMinutes} minutes`,
            totalQuestions: test.testConfig.totalQuestions,
            passingMarks: `${test.testConfig.passingPercentage}%`,
            negativeMarking: 'Yes (-1 for wrong answers)',
            rules: [
              'Do not refresh or close the browser',
              'Do not switch tabs or minimize window',
              'Keep camera on if required',
              'Ensure stable internet connection',
              'Submit the test before time expires'
            ]
          }
        }
      });
      
    } catch (error) {
      console.error('Start Test Error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to start test session'
      });
    }
  }
);

// @route   POST /api/tests/begin/:testId
// @desc    Begin the test (start timer)
// @access  Private (Test Token)
router.post('/begin/:testId', protectTest, async (req, res) => {
  try {
    const { testId } = req.params;
    
    const test = await Test.findOne({ testId, user: req.user._id });
    
    if (!test) {
      return res.status(404).json({
        success: false,
        error: 'Test not found'
      });
    }
    
    if (test.status !== 'Scheduled') {
      return res.status(400).json({
        success: false,
        error: 'Test cannot be started in current state'
      });
    }
    
    // Start the test
    await test.startTest();
    
    res.status(200).json({
      success: true,
      message: 'Test started successfully',
      data: {
        testId: test.testId,
        status: test.status,
        startTime: test.startTime,
        timeRemaining: test.timeRemaining
      }
    });
    
  } catch (error) {
    console.error('Begin Test Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to begin test'
    });
  }
});

// @route   PUT /api/tests/answer/:testId
// @desc    Submit answer for a question
// @access  Private (Test Token)
router.put('/answer/:testId',
  protectTest,
  [
    body('questionNumber')
      .isInt({ min: 1 })
      .withMessage('Valid question number is required'),
    body('answer')
      .notEmpty()
      .withMessage('Answer is required'),
    body('timeSpent')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Time spent must be a positive number')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { testId } = req.params;
      const { questionNumber, answer, timeSpent = 0 } = req.body;
      
      const test = await Test.findOne({ testId, user: req.user._id });
      
      if (!test) {
        return res.status(404).json({
          success: false,
          error: 'Test not found'
        });
      }
      
      if (test.status !== 'In Progress') {
        return res.status(400).json({
          success: false,
          error: 'Test is not in progress'
        });
      }
      
      // Check if test time has expired
      const timeElapsed = (new Date() - test.startTime) / 1000; // in seconds
      const timeLimit = test.testConfig.durationMinutes * 60;
      
      if (timeElapsed > timeLimit) {
        // Auto-submit test
        await test.completeTest();
        
        return res.status(400).json({
          success: false,
          error: 'Test time has expired',
          testCompleted: true
        });
      }
      
      // Submit the answer
      await test.submitAnswer(questionNumber, answer, timeSpent);
      
      // Update time remaining
      test.timeRemaining = Math.max(0, timeLimit - timeElapsed);
      await test.save();
      
      res.status(200).json({
        success: true,
        message: 'Answer submitted successfully',
        data: {
          questionNumber: questionNumber,
          timeRemaining: test.timeRemaining
        }
      });
      
    } catch (error) {
      console.error('Submit Answer Error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to submit answer'
      });
    }
  }
);

// @route   PUT /api/tests/flag/:testId
// @desc    Flag/unflag question for review
// @access  Private (Test Token)
router.put('/flag/:testId',
  protectTest,
  [
    body('questionNumber')
      .isInt({ min: 1 })
      .withMessage('Valid question number is required'),
    body('flagged')
      .isBoolean()
      .withMessage('Flagged status must be boolean')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { testId } = req.params;
      const { questionNumber, flagged } = req.body;
      
      const test = await Test.findOne({ testId, user: req.user._id });
      
      if (!test || test.status !== 'In Progress') {
        return res.status(400).json({
          success: false,
          error: 'Invalid test session'
        });
      }
      
      const question = test.questions.find(q => q.questionNumber === questionNumber);
      
      if (!question) {
        return res.status(404).json({
          success: false,
          error: 'Question not found'
        });
      }
      
      question.userResponse.flaggedForReview = flagged;
      
      // Add to attempt pattern
      test.analytics.attemptPattern.push({
        timestamp: new Date(),
        action: flagged ? 'flagged' : 'unflagged',
        questionNumber: questionNumber
      });
      
      await test.save();
      
      res.status(200).json({
        success: true,
        message: flagged ? 'Question flagged for review' : 'Question unflagged',
        data: {
          questionNumber: questionNumber,
          flagged: flagged
        }
      });
      
    } catch (error) {
      console.error('Flag Question Error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to flag question'
      });
    }
  }
);

// @route   POST /api/tests/submit/:testId
// @desc    Submit test for evaluation
// @access  Private (Test Token)
router.post('/submit/:testId', protectTest, async (req, res) => {
  try {
    const { testId } = req.params;
    
    const test = await Test.findOne({ testId, user: req.user._id });
    
    if (!test) {
      return res.status(404).json({
        success: false,
        error: 'Test not found'
      });
    }
    
    if (test.status !== 'In Progress') {
      return res.status(400).json({
        success: false,
        error: 'Test is not in progress'
      });
    }
    
    // Complete the test
    await test.completeTest();
    
    // Update user test info
    const user = await User.findById(req.user._id);
    if (test.score.percentage > user.testInfo.bestScore) {
      user.testInfo.bestScore = test.score.percentage;
    }
    
    if (test.isPassed) {
      user.testInfo.hasQualified = true;
      user.testInfo.qualificationDate = new Date();
    }
    
    await user.save();
    
    // Send results via email and SMS
    const resultData = {
      testId: test.testId,
      percentage: test.score.percentage,
      grade: test.score.grade,
      isPassed: test.isPassed,
      correctAnswers: test.score.correctAnswers,
      wrongAnswers: test.score.wrongAnswers,
      totalQuestions: test.score.totalQuestions,
      attemptedQuestions: test.score.attemptedQuestions,
      netScore: test.score.netScore,
      totalPoints: test.score.totalPoints,
      completedAt: test.submittedAt,
      actualDuration: test.actualDurationMinutes,
      percentile: test.percentile || 'Calculating...'
    };
    
    // Send notifications
    await Promise.all([
      emailService.sendTestResults(user.email, user.fullName, resultData),
      smsService.sendTestResults(user.phone, user.fullName, resultData),
      emailService.sendAdminNotification('test_completed', {
        name: user.fullName,
        testId: test.testId,
        percentage: test.score.percentage,
        isPassed: test.isPassed,
        completedAt: test.submittedAt
      })
    ]);
    
    res.status(200).json({
      success: true,
      message: 'Test submitted successfully',
      data: {
        testId: test.testId,
        score: test.score,
        isPassed: test.isPassed,
        rank: test.rank,
        percentile: test.percentile,
        submittedAt: test.submittedAt,
        certificate: test.isPassed ? {
          eligible: true,
          message: 'Certificate will be generated within 24 hours'
        } : null
      }
    });
    
  } catch (error) {
    console.error('Submit Test Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit test'
    });
  }
});

// @route   GET /api/tests/status/:testId
// @desc    Get current test status and progress
// @access  Private (Test Token)
router.get('/status/:testId', protectTest, async (req, res) => {
  try {
    const { testId } = req.params;
    
    const test = await Test.findOne({ testId, user: req.user._id });
    
    if (!test) {
      return res.status(404).json({
        success: false,
        error: 'Test not found'
      });
    }
    
    // Calculate time remaining
    if (test.status === 'In Progress') {
      const timeElapsed = (new Date() - test.startTime) / 1000;
      const timeLimit = test.testConfig.durationMinutes * 60;
      test.timeRemaining = Math.max(0, timeLimit - timeElapsed);
      
      // Auto-submit if time expired
      if (test.timeRemaining <= 0 && test.status === 'In Progress') {
        await test.completeTest();
      }
    }
    
    const progress = {
      answeredQuestions: test.questions.filter(q => q.userResponse.isAnswered).length,
      flaggedQuestions: test.questions.filter(q => q.userResponse.flaggedForReview).length,
      totalQuestions: test.questions.length
    };
    
    res.status(200).json({
      success: true,
      data: {
        testId: test.testId,
        status: test.status,
        timeRemaining: test.timeRemaining,
        progress: progress,
        startTime: test.startTime,
        canSubmit: progress.answeredQuestions > 0
      }
    });
    
  } catch (error) {
    console.error('Test Status Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get test status'
    });
  }
});

// @route   POST /api/tests/proctoring/:testId
// @desc    Report proctoring violations
// @access  Private (Test Token)
router.post('/proctoring/:testId',
  protectTest,
  [
    body('violationType')
      .isIn(['tab_switch', 'full_screen_exit', 'suspicious_activity'])
      .withMessage('Invalid violation type'),
    body('timestamp')
      .optional()
      .isISO8601()
      .withMessage('Invalid timestamp format')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { testId } = req.params;
      const { violationType, description, timestamp } = req.body;
      
      const test = await Test.findOne({ testId, user: req.user._id });
      
      if (!test || test.status !== 'In Progress') {
        return res.status(400).json({
          success: false,
          error: 'Invalid test session'
        });
      }
      
      // Record violation
      if (violationType === 'tab_switch') {
        test.proctoring.tabSwitchViolations += 1;
      } else if (violationType === 'full_screen_exit') {
        test.proctoring.fullScreenViolations += 1;
      }
      
      test.proctoring.suspiciousActivities.push({
        type: violationType,
        timestamp: timestamp ? new Date(timestamp) : new Date(),
        description: description || ''
      });
      
      await test.save();
      
      // Check if violations exceed threshold
      const totalViolations = test.proctoring.tabSwitchViolations + test.proctoring.fullScreenViolations;
      
      if (totalViolations >= 5) {
        // Auto-submit test due to violations
        await test.completeTest();
        
        return res.status(200).json({
          success: true,
          message: 'Test auto-submitted due to excessive violations',
          testCompleted: true
        });
      }
      
      res.status(200).json({
        success: true,
        message: 'Violation recorded',
        data: {
          totalViolations: totalViolations,
          warningThreshold: 5
        }
      });
      
    } catch (error) {
      console.error('Proctoring Error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to record violation'
      });
    }
  }
);

// Admin Routes

// @route   GET /api/tests/admin/all
// @desc    Get all tests with filtering (Admin only)
// @access  Private (Admin)
router.get('/admin/all', protectAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const {
      status,
      isPassed,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;
    
    // Build query
    const query = {};
    
    if (status) query.status = status;
    if (isPassed !== undefined) query.isPassed = isPassed === 'true';
    
    if (search) {
      query.$or = [
        { testId: { $regex: search, $options: 'i' } },
        { userName: { $regex: search, $options: 'i' } },
        { userPhone: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    const tests = await Test.find(query)
      .select('testId userName userPhone status score isPassed createdAt submittedAt actualDurationMinutes')
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('user', 'fullName email phone');
    
    const totalTests = await Test.countDocuments(query);
    
    res.status(200).json({
      success: true,
      data: {
        tests: tests,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalTests / limit),
          totalTests: totalTests,
          hasNextPage: page < Math.ceil(totalTests / limit),
          hasPrevPage: page > 1
        }
      }
    });
    
  } catch (error) {
    console.error('Get All Tests Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get tests'
    });
  }
});

// @route   GET /api/tests/admin/:testId
// @desc    Get detailed test information (Admin only)
// @access  Private (Admin)
router.get('/admin/:testId', protectAdmin, async (req, res) => {
  try {
    const { testId } = req.params;
    
    const test = await Test.findOne({ testId })
      .populate('user', 'fullName email phone profile');
    
    if (!test) {
      return res.status(404).json({
        success: false,
        error: 'Test not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: {
        test: test
      }
    });
    
  } catch (error) {
    console.error('Get Test Details Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get test details'
    });
  }
});

// @route   GET /api/tests/admin/stats
// @desc    Get test statistics (Admin only)
// @access  Private (Admin)
router.get('/admin/stats', protectAdmin, async (req, res) => {
  try {
    const stats = await Test.getTestStats();
    
    const recentTests = await Test.find({ status: 'Evaluated' })
      .select('testId userName score isPassed createdAt')
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('user', 'fullName');
    
    res.status(200).json({
      success: true,
      data: {
        ...stats,
        recentTests: recentTests
      }
    });
    
  } catch (error) {
    console.error('Test Stats Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get test statistics'
    });
  }
});

module.exports = router; 