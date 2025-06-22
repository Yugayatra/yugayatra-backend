const express = require('express');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const XLSX = require('xlsx');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const Question = require('../models/Question');
const Test = require('../models/Test');
const Admin = require('../models/Admin');
const emailService = require('../utils/emailService');
const smsService = require('../utils/smsService');
const { protectAdmin, checkPermission, checkRole } = require('../middleware/auth');

const router = express.Router();

// Multer configuration for file uploads (CSV/Excel)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/admin';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];
  
  if (allowedTypes.includes(file.mimetype) || file.originalname.match(/\.(csv|xlsx|xls)$/)) {
    cb(null, true);
  } else {
    cb(new Error('Only CSV and Excel files are allowed'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 25 * 1024 * 1024 // 25MB limit
  }
});

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

// @route   GET /api/admin/dashboard
// @desc    Get admin dashboard overview
// @access  Private (Admin)
router.get('/dashboard', protectAdmin, async (req, res) => {
  try {
    // Get overview statistics
    const [userStats, questionStats, testStats] = await Promise.all([
      User.aggregate([
        {
          $group: {
            _id: null,
            totalUsers: { $sum: 1 },
            activeUsers: { $sum: { $cond: [{ $eq: ['$status', 'Active'] }, 1, 0] } },
            verifiedUsers: { $sum: { $cond: ['$isVerified', 1, 0] } },
            qualifiedUsers: { $sum: { $cond: ['$testInfo.hasQualified', 1, 0] } }
          }
        }
      ]),
      Question.aggregate([
        {
          $group: {
            _id: null,
            totalQuestions: { $sum: 1 },
            activeQuestions: { $sum: { $cond: [{ $eq: ['$status', 'Active'] }, 1, 0] } },
            pendingApproval: { $sum: { $cond: [{ $eq: ['$status', 'Review'] }, 1, 0] } }
          }
        }
      ]),
      Test.aggregate([
        {
          $group: {
            _id: null,
            totalTests: { $sum: 1 },
            completedTests: { $sum: { $cond: [{ $eq: ['$status', 'Evaluated'] }, 1, 0] } },
            passedTests: { $sum: { $cond: ['$isPassed', 1, 0] } },
            avgScore: { $avg: '$score.percentage' }
          }
        }
      ])
    ]);
    
    // Get recent activities
    const recentUsers = await User.find({ status: 'Active' })
      .select('fullName phone email createdAt')
      .sort({ createdAt: -1 })
      .limit(5);
    
    const recentTests = await Test.find({ status: 'Evaluated' })
      .select('testId userName score isPassed createdAt')
      .sort({ createdAt: -1 })
      .limit(5);
    
    // Get trends (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const trends = await Promise.all([
      User.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
      Test.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
      Test.countDocuments({ 
        createdAt: { $gte: sevenDaysAgo },
        isPassed: true 
      })
    ]);
    
    res.status(200).json({
      success: true,
      data: {
        overview: {
          users: userStats[0] || { totalUsers: 0, activeUsers: 0, verifiedUsers: 0, qualifiedUsers: 0 },
          questions: questionStats[0] || { totalQuestions: 0, activeQuestions: 0, pendingApproval: 0 },
          tests: testStats[0] || { totalTests: 0, completedTests: 0, passedTests: 0, avgScore: 0 }
        },
        recentActivity: {
          newUsers: recentUsers,
          recentTests: recentTests
        },
        trends: {
          newUsersLast7Days: trends[0],
          testsLast7Days: trends[1],
          passedTestsLast7Days: trends[2]
        }
      }
    });
    
  } catch (error) {
    console.error('Dashboard Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load dashboard data'
    });
  }
});

// @route   GET /api/admin/analytics
// @desc    Get detailed analytics
// @access  Private (Admin)
router.get('/analytics', protectAdmin, checkPermission('tests', 'analytics'), async (req, res) => {
  try {
    const { period = '30', startDate, endDate } = req.query;
    
    // Calculate date range
    let dateFilter = {};
    if (startDate && endDate) {
      dateFilter = {
        createdAt: {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        }
      };
    } else {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - parseInt(period));
      dateFilter = { createdAt: { $gte: daysAgo } };
    }
    
    // Test performance analytics
    const testAnalytics = await Test.aggregate([
      { $match: { status: 'Evaluated', ...dateFilter } },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          totalTests: { $sum: 1 },
          passedTests: { $sum: { $cond: ['$isPassed', 1, 0] } },
          avgScore: { $avg: '$score.percentage' },
          avgDuration: { $avg: '$actualDurationMinutes' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ]);
    
    // Question category performance
    const categoryPerformance = await Test.aggregate([
      { $match: { status: 'Evaluated', ...dateFilter } },
      { $unwind: '$questions' },
      {
        $group: {
          _id: '$questions.category',
          totalQuestions: { $sum: 1 },
          correctAnswers: { $sum: { $cond: ['$questions.isCorrect', 1, 0] } },
          avgTimeSpent: { $avg: '$questions.userResponse.timeSpent' }
        }
      },
      {
        $addFields: {
          successRate: { $multiply: [{ $divide: ['$correctAnswers', '$totalQuestions'] }, 100] }
        }
      },
      { $sort: { successRate: -1 } }
    ]);
    
    // Difficulty level analysis
    const difficultyAnalysis = await Test.aggregate([
      { $match: { status: 'Evaluated', ...dateFilter } },
      { $unwind: '$questions' },
      {
        $group: {
          _id: '$questions.difficulty',
          totalQuestions: { $sum: 1 },
          correctAnswers: { $sum: { $cond: ['$questions.isCorrect', 1, 0] } },
          avgTimeSpent: { $avg: '$questions.userResponse.timeSpent' }
        }
      },
      {
        $addFields: {
          successRate: { $multiply: [{ $divide: ['$correctAnswers', '$totalQuestions'] }, 100] }
        }
      }
    ]);
    
    // User registration trends
    const registrationTrends = await User.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          newUsers: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ]);
    
    res.status(200).json({
      success: true,
      data: {
        testPerformance: testAnalytics,
        categoryPerformance: categoryPerformance,
        difficultyAnalysis: difficultyAnalysis,
        registrationTrends: registrationTrends,
        period: period,
        dateRange: {
          start: startDate || new Date(Date.now() - parseInt(period) * 24 * 60 * 60 * 1000).toISOString(),
          end: endDate || new Date().toISOString()
        }
      }
    });
    
  } catch (error) {
    console.error('Analytics Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load analytics data'
    });
  }
});

// @route   GET /api/admin/candidates
// @desc    Get candidates list with advanced filtering
// @access  Private (Admin)
router.get('/candidates', protectAdmin, checkPermission('users', 'view'), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const {
      status,
      qualified,
      search,
      qualification,
      minScore,
      maxScore,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;
    
    // Build query
    const query = {};
    
    if (status) query.status = status;
    if (qualified !== undefined) query['testInfo.hasQualified'] = qualified === 'true';
    if (qualification) query['profile.education.qualification'] = qualification;
    
    if (minScore || maxScore) {
      query['testInfo.bestScore'] = {};
      if (minScore) query['testInfo.bestScore'].$gte = parseInt(minScore);
      if (maxScore) query['testInfo.bestScore'].$lte = parseInt(maxScore);
    }
    
    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    const candidates = await User.find(query)
      .select('fullName phone email status isVerified profileCompletedAt testInfo createdAt profile.education.qualification')
      .sort(sort)
      .skip(skip)
      .limit(limit);
    
    const totalCandidates = await User.countDocuments(query);
    
    res.status(200).json({
      success: true,
      data: {
        candidates: candidates,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCandidates / limit),
          totalCandidates: totalCandidates,
          hasNextPage: page < Math.ceil(totalCandidates / limit),
          hasPrevPage: page > 1
        }
      }
    });
    
  } catch (error) {
    console.error('Get Candidates Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get candidates'
    });
  }
});

// @route   GET /api/admin/candidate/:id
// @desc    Get detailed candidate information
// @access  Private (Admin)
router.get('/candidate/:id', protectAdmin, checkPermission('users', 'view'), async (req, res) => {
  try {
    const candidate = await User.findById(req.params.id).select('-password -otp');
    
    if (!candidate) {
      return res.status(404).json({
        success: false,
        error: 'Candidate not found'
      });
    }
    
    // Get candidate's test history
    const testHistory = await Test.find({ user: candidate._id })
      .select('testId status score isPassed createdAt submittedAt actualDurationMinutes')
      .sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      data: {
        candidate: candidate,
        testHistory: testHistory,
        summary: {
          totalAttempts: testHistory.length,
          passedAttempts: testHistory.filter(t => t.isPassed).length,
          bestScore: Math.max(...testHistory.map(t => t.score?.percentage || 0)),
          averageScore: testHistory.length > 0 ? 
            testHistory.reduce((sum, t) => sum + (t.score?.percentage || 0), 0) / testHistory.length : 0
        }
      }
    });
    
  } catch (error) {
    console.error('Get Candidate Details Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get candidate details'
    });
  }
});

// @route   PUT /api/admin/candidate/:id/status
// @desc    Update candidate status
// @access  Private (Admin)
router.put('/candidate/:id/status', 
  protectAdmin, 
  checkPermission('users', 'edit'),
  [
    body('status')
      .isIn(['Active', 'Blocked', 'Suspended'])
      .withMessage('Invalid status'),
    body('reason')
      .optional()
      .isLength({ min: 1, max: 500 })
      .withMessage('Reason must be between 1 and 500 characters')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { status, reason } = req.body;
      
      const candidate = await User.findById(req.params.id);
      
      if (!candidate) {
        return res.status(404).json({
          success: false,
          error: 'Candidate not found'
        });
      }
      
      const oldStatus = candidate.status;
      candidate.status = status;
      
      if (status === 'Blocked' && reason) {
        candidate.testInfo.blockedReason = reason;
        candidate.testInfo.blockedUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
      }
      
      await candidate.save();
      
      // Log admin activity
      await req.admin.logActivity('candidate_status_change', {
        candidateId: candidate._id,
        candidateName: candidate.fullName,
        oldStatus: oldStatus,
        newStatus: status,
        reason: reason
      }, req);
      
      // Send notification to candidate
      if (status === 'Blocked') {
        await smsService.sendCustomSMS(
          candidate.phone,
          `Your YugaYatra account has been temporarily blocked. Reason: ${reason}. Contact support: +91-9972037182`
        );
      }
      
      res.status(200).json({
        success: true,
        message: 'Candidate status updated successfully',
        data: {
          candidateId: candidate._id,
          newStatus: status
        }
      });
      
    } catch (error) {
      console.error('Update Candidate Status Error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update candidate status'
      });
    }
  }
);

// @route   POST /api/admin/bulk-notification
// @desc    Send bulk notifications to candidates
// @access  Private (Admin)
router.post('/bulk-notification',
  protectAdmin,
  checkPermission('users', 'edit'),
  [
    body('type')
      .isIn(['sms', 'email', 'both'])
      .withMessage('Invalid notification type'),
    body('message')
      .isLength({ min: 1, max: 1000 })
      .withMessage('Message must be between 1 and 1000 characters'),
    body('recipients')
      .isArray({ min: 1 })
      .withMessage('At least one recipient is required')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { type, message, subject, recipients, filters } = req.body;
      
      let candidateQuery = {};
      
      if (recipients.includes('all')) {
        candidateQuery = { status: 'Active' };
      } else if (recipients.includes('qualified')) {
        candidateQuery = { 'testInfo.hasQualified': true };
      } else if (recipients.includes('unqualified')) {
        candidateQuery = { 'testInfo.hasQualified': false, 'testInfo.totalAttempts': { $gt: 0 } };
      } else {
        candidateQuery = { _id: { $in: recipients } };
      }
      
      // Apply additional filters
      if (filters) {
        if (filters.qualification) candidateQuery['profile.education.qualification'] = filters.qualification;
        if (filters.minScore) candidateQuery['testInfo.bestScore'] = { $gte: filters.minScore };
      }
      
      const candidates = await User.find(candidateQuery)
        .select('fullName phone email');
      
      if (candidates.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No candidates found matching the criteria'
        });
      }
      
      let results = {
        total: candidates.length,
        sms: { sent: 0, failed: 0 },
        email: { sent: 0, failed: 0 }
      };
      
      // Send SMS notifications
      if (type === 'sms' || type === 'both') {
        const phoneNumbers = candidates.map(c => c.phone);
        const smsResult = await smsService.sendBulkSMS(phoneNumbers, message);
        
        results.sms.sent = smsResult.totalSent;
        results.sms.failed = smsResult.totalFailed;
      }
      
      // Send Email notifications
      if (type === 'email' || type === 'both') {
        const emailRecipients = candidates.map(c => ({
          email: c.email,
          name: c.fullName
        }));
        
        const emailTemplate = `
          <h2>${subject || 'Important Notification'}</h2>
          <p>Dear {{name}},</p>
          <p>${message}</p>
          <br>
          <p>Best regards,<br>YugaYatra Team</p>
        `;
        
        const emailResults = await emailService.sendBulkEmails(
          emailRecipients,
          subject || 'Important Notification - YugaYatra',
          emailTemplate
        );
        
        results.email.sent = emailResults.filter(r => r.success).length;
        results.email.failed = emailResults.filter(r => !r.success).length;
      }
      
      // Log admin activity
      await req.admin.logActivity('bulk_notification', {
        type: type,
        recipientCount: candidates.length,
        message: message.substring(0, 100),
        results: results
      }, req);
      
      res.status(200).json({
        success: true,
        message: 'Bulk notification sent successfully',
        data: results
      });
      
    } catch (error) {
      console.error('Bulk Notification Error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to send bulk notification'
      });
    }
  }
);

// @route   GET /api/admin/reports/export
// @desc    Export data reports
// @access  Private (Admin)
router.get('/reports/export', protectAdmin, checkPermission('system', 'reports'), async (req, res) => {
  try {
    const { type, format = 'json', startDate, endDate } = req.query;
    
    let dateFilter = {};
    if (startDate && endDate) {
      dateFilter = {
        createdAt: {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        }
      };
    }
    
    let data = {};
    
    switch (type) {
      case 'candidates':
        data = await User.find(dateFilter)
          .select('fullName phone email status isVerified testInfo createdAt profile.education')
          .lean();
        break;
        
      case 'tests':
        data = await Test.find({ status: 'Evaluated', ...dateFilter })
          .select('testId userName userPhone score isPassed createdAt submittedAt actualDurationMinutes')
          .lean();
        break;
        
      case 'questions':
        data = await Question.find(dateFilter)
          .select('questionText category difficulty status timesUsed successRate createdAt')
          .lean();
        break;
        
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid report type'
        });
    }
    
    if (format === 'csv') {
      // Convert to CSV format
      const csv = require('csv-stringify');
      
      csv(data, { header: true }, (err, output) => {
        if (err) {
          return res.status(500).json({
            success: false,
            error: 'Failed to generate CSV'
          });
        }
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${type}_report_${Date.now()}.csv"`);
        res.send(output);
      });
    } else {
      res.status(200).json({
        success: true,
        data: data,
        count: data.length,
        exportedAt: new Date().toISOString()
      });
    }
    
  } catch (error) {
    console.error('Export Report Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export report'
    });
  }
});

// @route   GET /api/admin/activity-log
// @desc    Get admin activity log
// @access  Private (Super Admin)
router.get('/activity-log', protectAdmin, checkRole('Super Admin'), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;
    
    const { adminId, action, startDate, endDate } = req.query;
    
    let query = {};
    if (adminId) query._id = adminId;
    if (startDate && endDate) {
      query['activityLog.timestamp'] = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    const admins = await Admin.find(query)
      .select('fullName activityLog')
      .lean();
    
    // Flatten activity logs
    let activities = [];
    admins.forEach(admin => {
      admin.activityLog.forEach(activity => {
        activities.push({
          ...activity,
          adminName: admin.fullName,
          adminId: admin._id
        });
      });
    });
    
    // Filter by action if specified
    if (action) {
      activities = activities.filter(a => a.action.includes(action));
    }
    
    // Sort by timestamp
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Paginate
    const paginatedActivities = activities.slice(skip, skip + limit);
    
    res.status(200).json({
      success: true,
      data: {
        activities: paginatedActivities,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(activities.length / limit),
          totalActivities: activities.length,
          hasNextPage: page < Math.ceil(activities.length / limit),
          hasPrevPage: page > 1
        }
      }
    });
    
  } catch (error) {
    console.error('Activity Log Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get activity log'
    });
  }
});

// @route   POST /api/admin/system/backup
// @desc    Create system backup
// @access  Private (Super Admin)
router.post('/system/backup', protectAdmin, checkRole('Super Admin'), async (req, res) => {
  try {
    const backupData = {
      timestamp: new Date().toISOString(),
      users: await User.countDocuments(),
      questions: await Question.countDocuments(),
      tests: await Test.countDocuments(),
      admins: await Admin.countDocuments()
    };
    
    // Log the backup activity
    await req.admin.logActivity('system_backup', backupData, req);
    
    res.status(200).json({
      success: true,
      message: 'System backup initiated successfully',
      data: backupData
    });
    
  } catch (error) {
    console.error('System Backup Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create system backup'
    });
  }
});

// @route   GET /api/admin/dashboard/realtime
// @desc    Get real-time dashboard data
// @access  Private (Admin)
router.get('/dashboard/realtime', protectAdmin, async (req, res) => {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Real-time statistics
    const [
      totalStats,
      todayStats,
      weekStats,
      monthStats,
      activeTests,
      recentActivity,
      systemHealth
    ] = await Promise.all([
      // Total statistics
      Promise.all([
        User.countDocuments(),
        Question.countDocuments({ status: 'Active' }),
        Test.countDocuments({ status: 'Evaluated' }),
        Test.countDocuments({ isPassed: true })
      ]),
      
      // Today's statistics
      Promise.all([
        User.countDocuments({ createdAt: { $gte: today } }),
        Test.countDocuments({ createdAt: { $gte: today } }),
        Test.countDocuments({ createdAt: { $gte: today }, isPassed: true })
      ]),
      
      // This week's statistics
      Promise.all([
        User.countDocuments({ createdAt: { $gte: thisWeek } }),
        Test.countDocuments({ createdAt: { $gte: thisWeek } }),
        Test.countDocuments({ createdAt: { $gte: thisWeek }, isPassed: true })
      ]),
      
      // This month's statistics
      Promise.all([
        User.countDocuments({ createdAt: { $gte: thisMonth } }),
        Test.countDocuments({ createdAt: { $gte: thisMonth } }),
        Test.countDocuments({ createdAt: { $gte: thisMonth }, isPassed: true })
      ]),
      
      // Active tests (currently in progress)
      Test.find({ status: { $in: ['In Progress', 'Scheduled'] } })
        .select('testId userName userPhone startTime timeRemaining status')
        .populate('user', 'fullName email')
        .sort({ startTime: -1 })
        .limit(10),
      
      // Recent activity (last 24 hours)
      Promise.all([
        User.find({ createdAt: { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } })
          .select('fullName phone createdAt')
          .sort({ createdAt: -1 })
          .limit(5),
        Test.find({ 
          submittedAt: { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
          status: 'Evaluated'
        })
          .select('testId userName score isPassed submittedAt')
          .sort({ submittedAt: -1 })
          .limit(5)
      ]),
      
      // System health metrics
      Promise.all([
        Question.countDocuments({ status: 'Draft' }),
        Question.countDocuments({ status: 'Review' }),
        Test.countDocuments({ 
          status: 'In Progress',
          startTime: { $lt: new Date(now.getTime() - 2 * 60 * 60 * 1000) } // Tests running over 2 hours
        }),
        User.countDocuments({ status: 'Blocked' })
      ])
    ]);

    // Calculate real-time metrics
    const [totalUsers, totalQuestions, totalTests, totalPassed] = totalStats;
    const [todayUsers, todayTests, todayPassed] = todayStats;
    const [weekUsers, weekTests, weekPassed] = weekStats;
    const [monthUsers, monthTests, monthPassed] = monthStats;
    const [recentUsers, recentTests] = recentActivity;
    const [draftQuestions, reviewQuestions, stuckTests, blockedUsers] = systemHealth;

    // Calculate performance metrics
    const overallPassRate = totalTests > 0 ? Math.round((totalPassed / totalTests) * 100) : 0;
    const todayPassRate = todayTests > 0 ? Math.round((todayPassed / todayTests) * 100) : 0;
    const weekPassRate = weekTests > 0 ? Math.round((weekPassed / weekTests) * 100) : 0;

    // Calculate growth rates
    const userGrowthRate = weekUsers > 0 ? Math.round(((todayUsers * 7) / weekUsers - 1) * 100) : 0;
    const testGrowthRate = weekTests > 0 ? Math.round(((todayTests * 7) / weekTests - 1) * 100) : 0;

    res.status(200).json({
      success: true,
      data: {
        overview: {
          totalUsers,
          totalQuestions,
          totalTests,
          totalPassed,
          overallPassRate
        },
        today: {
          newUsers: todayUsers,
          testsCompleted: todayTests,
          testsPassed: todayPassed,
          passRate: todayPassRate
        },
        trends: {
          weekUsers,
          weekTests,
          weekPassed,
          weekPassRate,
          userGrowthRate,
          testGrowthRate
        },
        month: {
          monthUsers,
          monthTests,
          monthPassed
        },
        activeTests: activeTests.map(test => ({
          ...test.toObject(),
          timeElapsed: test.startTime ? Math.floor((now - test.startTime) / (1000 * 60)) : 0,
          timeRemaining: Math.max(0, test.timeRemaining || 0)
        })),
        recentActivity: {
          newRegistrations: recentUsers,
          completedTests: recentTests
        },
        systemHealth: {
          draftQuestions,
          reviewQuestions,
          stuckTests,
          blockedUsers,
          alerts: [
            ...(stuckTests > 0 ? [`${stuckTests} tests running over 2 hours`] : []),
            ...(reviewQuestions > 10 ? [`${reviewQuestions} questions pending review`] : []),
            ...(blockedUsers > 0 ? [`${blockedUsers} users are blocked`] : [])
          ]
        },
        timestamp: now.toISOString()
      }
    });

  } catch (error) {
    console.error('Real-time Dashboard Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load real-time dashboard data'
    });
  }
});

// @route   GET /api/admin/monitoring/live-tests
// @desc    Get live test monitoring data
// @access  Private (Admin)
router.get('/monitoring/live-tests', protectAdmin, async (req, res) => {
  try {
    const activeTests = await Test.find({ 
      status: { $in: ['In Progress', 'Scheduled'] } 
    })
      .populate('user', 'fullName email phone profile.photo')
      .sort({ startTime: -1 });

    const monitoringData = activeTests.map(test => {
      const now = new Date();
      const timeElapsed = test.startTime ? Math.floor((now - test.startTime) / (1000 * 60)) : 0;
      const progress = test.questions.filter(q => q.userResponse.isAnswered).length;
      const flagged = test.questions.filter(q => q.userResponse.flaggedForReview).length;
      
      // Calculate risk score based on violations and time
      let riskScore = 0;
      riskScore += test.proctoring.tabSwitchViolations * 10;
      riskScore += test.proctoring.fullScreenViolations * 15;
      riskScore += test.proctoring.suspiciousActivities.length * 5;
      
      if (timeElapsed > test.testConfig.durationMinutes + 5) riskScore += 20;
      
      const riskLevel = riskScore > 50 ? 'high' : riskScore > 20 ? 'medium' : 'low';

      return {
        testId: test.testId,
        candidate: {
          name: test.user.fullName,
          email: test.user.email,
          phone: test.user.phone,
          photo: test.user.profile?.photo
        },
        status: test.status,
        startTime: test.startTime,
        timeElapsed,
        timeRemaining: Math.max(0, test.testConfig.durationMinutes - timeElapsed),
        progress: {
          answered: progress,
          total: test.questions.length,
          percentage: Math.round((progress / test.questions.length) * 100),
          flagged
        },
        proctoring: {
          tabSwitches: test.proctoring.tabSwitchViolations,
          fullScreenExits: test.proctoring.fullScreenViolations,
          suspiciousActivities: test.proctoring.suspiciousActivities.length,
          riskScore,
          riskLevel
        },
        location: test.proctoring.location,
        browser: test.proctoring.browserInfo.browser,
        lastActivity: test.questions
          .filter(q => q.userResponse.answeredAt)
          .sort((a, b) => new Date(b.userResponse.answeredAt) - new Date(a.userResponse.answeredAt))[0]?.userResponse.answeredAt
      };
    });

    res.status(200).json({
      success: true,
      data: {
        activeTests: monitoringData,
        summary: {
          total: monitoringData.length,
          inProgress: monitoringData.filter(t => t.status === 'In Progress').length,
          scheduled: monitoringData.filter(t => t.status === 'Scheduled').length,
          highRisk: monitoringData.filter(t => t.proctoring.riskLevel === 'high').length,
          mediumRisk: monitoringData.filter(t => t.proctoring.riskLevel === 'medium').length
        }
      }
    });

  } catch (error) {
    console.error('Live Test Monitoring Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load live test monitoring data'
    });
  }
});

// @route   POST /api/admin/questions/bulk-upload-excel
// @desc    Bulk upload questions via Excel/CSV
// @access  Private (Admin)
router.post('/questions/bulk-upload-excel',
  protectAdmin,
  checkPermission('questions', 'bulkUpload'),
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'File is required'
        });
      }

      let data = [];
      const filePath = req.file.path;
      const fileExtension = path.extname(req.file.originalname).toLowerCase();

      // Parse file based on type
      if (fileExtension === '.csv') {
        // Parse CSV
        data = await new Promise((resolve, reject) => {
          const results = [];
          fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (row) => results.push(row))
            .on('end', () => resolve(results))
            .on('error', reject);
        });
      } else if (fileExtension === '.xlsx' || fileExtension === '.xls') {
        // Parse Excel
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        data = XLSX.utils.sheet_to_json(worksheet);
      } else {
        throw new Error('Unsupported file format');
      }

      const questions = [];
      const errors = [];
      let processedCount = 0;

      // Process each row
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const lineNumber = i + 2; // Account for header row
        processedCount++;

        try {
          // Validate required fields
          if (!row.questionText || !row.category || !row.difficulty) {
            errors.push({
              line: lineNumber,
              error: 'Missing required fields: questionText, category, difficulty'
            });
            continue;
          }

          // Parse options for multiple choice questions
          let options = [];
          const questionType = row.questionType || 'Multiple Choice';
          
          if (questionType === 'Multiple Choice') {
            if (row.option1 && row.option2) {
              // Format: option1, option2, option3, option4, correctOption
              const opts = [row.option1, row.option2, row.option3, row.option4].filter(Boolean);
              const correctIndex = parseInt(row.correctOption) - 1;
              
              if (opts.length < 2) {
                errors.push({
                  line: lineNumber,
                  error: 'Multiple choice questions must have at least 2 options'
                });
                continue;
              }

              options = opts.map((opt, index) => ({
                text: opt.trim(),
                isCorrect: index === correctIndex
              }));
            } else if (row.options) {
              // JSON format
              try {
                const optionData = JSON.parse(row.options);
                options = optionData.map(opt => ({
                  text: opt.text,
                  isCorrect: opt.isCorrect === true || opt.isCorrect === 'true'
                }));
              } catch (parseError) {
                errors.push({
                  line: lineNumber,
                  error: 'Invalid options format. Use option1, option2, etc. columns or valid JSON'
                });
                continue;
              }
            } else {
              errors.push({
                line: lineNumber,
                error: 'Options are required for multiple choice questions'
              });
              continue;
            }

            // Validate correct answer count
            const correctOptions = options.filter(opt => opt.isCorrect);
            if (correctOptions.length !== 1) {
              errors.push({
                line: lineNumber,
                error: 'Multiple choice questions must have exactly one correct answer'
              });
              continue;
            }
          }

          // Create question object
          const questionData = {
            questionText: row.questionText.trim(),
            questionType: questionType,
            category: row.category,
            subcategory: row.subcategory || '',
            difficulty: row.difficulty,
            points: parseInt(row.points) || (row.difficulty === 'Easy' ? 2 : row.difficulty === 'Hard' ? 4 : 3),
            negativePoints: parseInt(row.negativePoints) || 1,
            options: options,
            correctAnswer: row.correctAnswer || '',
            explanation: row.explanation || '',
            hints: row.hints ? row.hints.split(',').map(h => h.trim()) : [],
            tags: row.tags ? row.tags.split(',').map(tag => tag.trim()) : [],
            source: row.source || '',
            author: row.author || '',
            createdBy: req.admin.fullName,
            status: row.autoApprove === 'true' || row.autoApprove === true ? 'Active' : 'Draft',
            isApproved: row.autoApprove === 'true' || row.autoApprove === true,
            approvedBy: row.autoApprove === 'true' || row.autoApprove === true ? req.admin._id : undefined,
            approvedAt: row.autoApprove === 'true' || row.autoApprove === true ? new Date() : undefined
          };

          questions.push(questionData);

        } catch (error) {
          errors.push({
            line: lineNumber,
            error: error.message
          });
        }
      }

      // Insert valid questions in batches
      let insertedCount = 0;
      const batchSize = 100;
      
      if (questions.length > 0) {
        for (let i = 0; i < questions.length; i += batchSize) {
          const batch = questions.slice(i, i + batchSize);
          
          try {
            const insertedQuestions = await Question.insertMany(batch, { ordered: false });
            insertedCount += insertedQuestions.length;
          } catch (insertError) {
            if (insertError.writeErrors) {
              insertError.writeErrors.forEach(writeError => {
                errors.push({
                  line: i + writeError.index + 2,
                  error: writeError.errmsg
                });
              });
              insertedCount += insertError.result?.nInserted || 0;
            } else {
              throw insertError;
            }
          }
        }
      }

      // Clean up uploaded file
      fs.unlinkSync(filePath);

      // Update admin stats
      if (insertedCount > 0) {
        req.admin.questionStats.created += insertedCount;
        await req.admin.save();
      }

      // Log activity
      await req.admin.logActivity('bulk_question_upload', {
        fileName: req.file.originalname,
        totalProcessed: processedCount,
        successful: insertedCount,
        failed: errors.length,
        fileType: fileExtension
      }, req);

      res.status(200).json({
        success: true,
        message: `Bulk upload completed. ${insertedCount} questions processed successfully.`,
        data: {
          totalProcessed: processedCount,
          successful: insertedCount,
          failed: errors.length,
          errors: errors.slice(0, 20), // Limit errors shown
          summary: {
            duplicates: errors.filter(e => e.error.includes('duplicate')).length,
            validationErrors: errors.filter(e => !e.error.includes('duplicate')).length
          }
        }
      });

    } catch (error) {
      console.error('Bulk Upload Excel Error:', error);
      
      // Clean up uploaded file
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      res.status(500).json({
        success: false,
        error: 'Bulk upload failed: ' + error.message
      });
    }
  }
);

// @route   GET /api/admin/analytics/advanced
// @desc    Get advanced analytics and reports
// @access  Private (Admin)
router.get('/analytics/advanced', protectAdmin, checkPermission('tests', 'analytics'), async (req, res) => {
  try {
    const { 
      period = '30',
      startDate,
      endDate,
      includeQuestionAnalysis = 'true',
      includeCandidateAnalysis = 'true',
      includePerformanceAnalysis = 'true'
    } = req.query;

    // Calculate date range
    let dateFilter = {};
    if (startDate && endDate) {
      dateFilter = {
        createdAt: {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        }
      };
    } else {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - parseInt(period));
      dateFilter = { createdAt: { $gte: daysAgo } };
    }

    const analytics = {};

    // Test Performance Analytics
    if (includePerformanceAnalysis === 'true') {
      const performanceData = await Test.aggregate([
        { $match: { status: 'Evaluated', ...dateFilter } },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
              day: { $dayOfMonth: '$createdAt' }
            },
            totalTests: { $sum: 1 },
            passedTests: { $sum: { $cond: ['$isPassed', 1, 0] } },
            avgScore: { $avg: '$score.percentage' },
            avgDuration: { $avg: '$actualDurationMinutes' },
            maxScore: { $max: '$score.percentage' },
            minScore: { $min: '$score.percentage' },
            totalViolations: { 
              $sum: { 
                $add: ['$proctoring.tabSwitchViolations', '$proctoring.fullScreenViolations'] 
              } 
            }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
      ]);

      // Score distribution
      const scoreDistribution = await Test.aggregate([
        { $match: { status: 'Evaluated', ...dateFilter } },
        {
          $bucket: {
            groupBy: '$score.percentage',
            boundaries: [0, 20, 40, 60, 80, 100],
            default: 'other',
            output: {
              count: { $sum: 1 },
              avgScore: { $avg: '$score.percentage' }
            }
          }
        }
      ]);

      analytics.performance = {
        dailyTrends: performanceData,
        scoreDistribution,
        summary: {
          totalTests: performanceData.reduce((sum, day) => sum + day.totalTests, 0),
          averageScore: performanceData.length > 0 ? 
            performanceData.reduce((sum, day) => sum + day.avgScore, 0) / performanceData.length : 0,
          passRate: performanceData.reduce((sum, day) => sum + day.totalTests, 0) > 0 ?
            (performanceData.reduce((sum, day) => sum + day.passedTests, 0) / 
             performanceData.reduce((sum, day) => sum + day.totalTests, 0)) * 100 : 0
        }
      };
    }

    // Question Analysis
    if (includeQuestionAnalysis === 'true') {
      const questionPerformance = await Test.aggregate([
        { $match: { status: 'Evaluated', ...dateFilter } },
        { $unwind: '$questions' },
        {
          $group: {
            _id: {
              questionId: '$questions.questionId',
              category: '$questions.category',
              difficulty: '$questions.difficulty'
            },
            totalAttempts: { $sum: 1 },
            correctAttempts: { $sum: { $cond: ['$questions.isCorrect', 1, 0] } },
            avgTimeSpent: { $avg: '$questions.userResponse.timeSpent' },
            skippedCount: { $sum: { $cond: [{ $eq: ['$questions.userResponse.isAnswered', false] }, 1, 0] } }
          }
        },
        {
          $addFields: {
            successRate: { $multiply: [{ $divide: ['$correctAttempts', '$totalAttempts'] }, 100] },
            skipRate: { $multiply: [{ $divide: ['$skippedCount', '$totalAttempts'] }, 100] }
          }
        },
        { $sort: { successRate: 1 } }
      ]);

      // Category performance
      const categoryPerformance = await Test.aggregate([
        { $match: { status: 'Evaluated', ...dateFilter } },
        { $unwind: '$questions' },
        {
          $group: {
            _id: '$questions.category',
            totalQuestions: { $sum: 1 },
            correctAnswers: { $sum: { $cond: ['$questions.isCorrect', 1, 0] } },
            avgTimeSpent: { $avg: '$questions.userResponse.timeSpent' },
            avgPoints: { $avg: '$questions.points' }
          }
        },
        {
          $addFields: {
            successRate: { $multiply: [{ $divide: ['$correctAnswers', '$totalQuestions'] }, 100] }
          }
        },
        { $sort: { successRate: -1 } }
      ]);

      // Difficulty analysis
      const difficultyAnalysis = await Test.aggregate([
        { $match: { status: 'Evaluated', ...dateFilter } },
        { $unwind: '$questions' },
        {
          $group: {
            _id: '$questions.difficulty',
            totalQuestions: { $sum: 1 },
            correctAnswers: { $sum: { $cond: ['$questions.isCorrect', 1, 0] } },
            avgTimeSpent: { $avg: '$questions.userResponse.timeSpent' }
          }
        },
        {
          $addFields: {
            successRate: { $multiply: [{ $divide: ['$correctAnswers', '$totalQuestions'] }, 100] }
          }
        }
      ]);

      analytics.questions = {
        performance: questionPerformance.slice(0, 50), // Top 50 worst performing questions
        categoryPerformance,
        difficultyAnalysis,
        insights: {
          hardestQuestions: questionPerformance.slice(0, 10),
          easiestQuestions: questionPerformance.slice(-10).reverse(),
          mostSkipped: questionPerformance.sort((a, b) => b.skipRate - a.skipRate).slice(0, 10)
        }
      };
    }

    // Candidate Analysis
    if (includeCandidateAnalysis === 'true') {
      const candidatePerformance = await Test.aggregate([
        { $match: { status: 'Evaluated', ...dateFilter } },
        {
          $group: {
            _id: '$user',
            totalAttempts: { $sum: 1 },
            bestScore: { $max: '$score.percentage' },
            avgScore: { $avg: '$score.percentage' },
            totalTime: { $sum: '$actualDurationMinutes' },
            passed: { $sum: { $cond: ['$isPassed', 1, 0] } },
            violations: { 
              $sum: { 
                $add: ['$proctoring.tabSwitchViolations', '$proctoring.fullScreenViolations'] 
              } 
            }
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'userInfo'
          }
        },
        { $unwind: '$userInfo' },
        {
          $project: {
            name: '$userInfo.fullName',
            email: '$userInfo.email',
            phone: '$userInfo.phone',
            qualification: '$userInfo.profile.education.qualification',
            totalAttempts: 1,
            bestScore: 1,
            avgScore: 1,
            avgTime: { $divide: ['$totalTime', '$totalAttempts'] },
            passRate: { $multiply: [{ $divide: ['$passed', '$totalAttempts'] }, 100] },
            violations: 1
          }
        },
        { $sort: { bestScore: -1 } }
      ]);

      // Qualification-wise performance
      const qualificationAnalysis = await User.aggregate([
        {
          $match: {
            'testInfo.totalAttempts': { $gt: 0 },
            ...dateFilter
          }
        },
        {
          $group: {
            _id: '$profile.education.qualification',
            totalCandidates: { $sum: 1 },
            qualifiedCandidates: { $sum: { $cond: ['$testInfo.hasQualified', 1, 0] } },
            avgBestScore: { $avg: '$testInfo.bestScore' },
            avgAttempts: { $avg: '$testInfo.totalAttempts' }
          }
        },
        {
          $addFields: {
            qualificationRate: { $multiply: [{ $divide: ['$qualifiedCandidates', '$totalCandidates'] }, 100] }
          }
        },
        { $sort: { qualificationRate: -1 } }
      ]);

      analytics.candidates = {
        topPerformers: candidatePerformance.slice(0, 20),
        qualificationAnalysis,
        summary: {
          totalCandidates: candidatePerformance.length,
          avgBestScore: candidatePerformance.length > 0 ? 
            candidatePerformance.reduce((sum, c) => sum + c.bestScore, 0) / candidatePerformance.length : 0,
          multipleAttempts: candidatePerformance.filter(c => c.totalAttempts > 1).length,
          highViolations: candidatePerformance.filter(c => c.violations > 5).length
        }
      };
    }

    // Time-based analysis
    const timeAnalysis = await Test.aggregate([
      { $match: { status: 'Evaluated', ...dateFilter } },
      {
        $group: {
          _id: { $hour: '$startTime' },
          totalTests: { $sum: 1 },
          avgScore: { $avg: '$score.percentage' },
          passRate: { $avg: { $cond: ['$isPassed', 1, 0] } }
        }
      },
      { $sort: { '_id': 1 } }
    ]);

    analytics.timeAnalysis = timeAnalysis;

    // Generate insights
    analytics.insights = {
      peakHours: timeAnalysis.sort((a, b) => b.totalTests - a.totalTests).slice(0, 3),
      improvementAreas: analytics.questions?.categoryPerformance
        ?.filter(cat => cat.successRate < 60)
        ?.map(cat => cat._id) || [],
      recommendations: [
        ...(analytics.performance?.summary.passRate < 50 ? ['Consider reviewing test difficulty'] : []),
        ...(analytics.questions?.insights.mostSkipped.length > 5 ? ['Review frequently skipped questions'] : []),
        ...(analytics.candidates?.summary.highViolations > 10 ? ['Strengthen proctoring measures'] : [])
      ]
    };

    res.status(200).json({
      success: true,
      data: analytics,
      metadata: {
        period: period,
        dateRange: {
          start: startDate || new Date(Date.now() - parseInt(period) * 24 * 60 * 60 * 1000).toISOString(),
          end: endDate || new Date().toISOString()
        },
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Advanced Analytics Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate advanced analytics'
    });
  }
});

// @route   GET /api/admin/candidates/performance-tracking
// @desc    Get detailed candidate performance tracking
// @access  Private (Admin)
router.get('/candidates/performance-tracking', protectAdmin, checkPermission('users', 'view'), async (req, res) => {
  try {
    const {
      candidateId,
      qualification,
      minScore,
      maxScore,
      attempts,
      status,
      sortBy = 'bestScore',
      sortOrder = 'desc',
      page = 1,
      limit = 20
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build query
    const query = {};
    if (candidateId) query._id = candidateId;
    if (qualification) query['profile.education.qualification'] = qualification;
    if (status) query.status = status;
    if (attempts) query['testInfo.totalAttempts'] = { $gte: parseInt(attempts) };

    if (minScore || maxScore) {
      query['testInfo.bestScore'] = {};
      if (minScore) query['testInfo.bestScore'].$gte = parseInt(minScore);
      if (maxScore) query['testInfo.bestScore'].$lte = parseInt(maxScore);
    }

    // Get candidates with performance data
    const candidates = await User.aggregate([
      { $match: query },
      {
        $lookup: {
          from: 'tests',
          localField: '_id',
          foreignField: 'user',
          as: 'tests'
        }
      },
      {
        $addFields: {
          completedTests: {
            $filter: {
              input: '$tests',
              cond: { $eq: ['$$this.status', 'Evaluated'] }
            }
          }
        }
      },
      {
        $addFields: {
          performanceMetrics: {
            totalTests: { $size: '$completedTests' },
            passedTests: {
              $size: {
                $filter: {
                  input: '$completedTests',
                  cond: { $eq: ['$$this.isPassed', true] }
                }
              }
            },
            avgScore: { $avg: '$completedTests.score.percentage' },
            bestScore: { $max: '$completedTests.score.percentage' },
            worstScore: { $min: '$completedTests.score.percentage' },
            avgDuration: { $avg: '$completedTests.actualDurationMinutes' },
            totalViolations: {
              $sum: {
                $map: {
                  input: '$completedTests',
                  as: 'test',
                  in: {
                    $add: [
                      '$$test.proctoring.tabSwitchViolations',
                      '$$test.proctoring.fullScreenViolations'
                    ]
                  }
                }
              }
            },
            improvement: {
              $cond: {
                if: { $gt: [{ $size: '$completedTests' }, 1] },
                then: {
                  $subtract: [
                    { $arrayElemAt: ['$completedTests.score.percentage', -1] },
                    { $arrayElemAt: ['$completedTests.score.percentage', 0] }
                  ]
                },
                else: 0
              }
            }
          }
        }
      },
      {
        $addFields: {
          'performanceMetrics.passRate': {
            $cond: {
              if: { $gt: ['$performanceMetrics.totalTests', 0] },
              then: {
                $multiply: [
                  { $divide: ['$performanceMetrics.passedTests', '$performanceMetrics.totalTests'] },
                  100
                ]
              },
              else: 0
            }
          },
          'performanceMetrics.riskLevel': {
            $switch: {
              branches: [
                { case: { $gt: ['$performanceMetrics.totalViolations', 10] }, then: 'high' },
                { case: { $gt: ['$performanceMetrics.totalViolations', 5] }, then: 'medium' }
              ],
              default: 'low'
            }
          }
        }
      },
      {
        $project: {
          fullName: 1,
          email: 1,
          phone: 1,
          status: 1,
          isVerified: 1,
          createdAt: 1,
          'profile.education.qualification': 1,
          'profile.dateOfBirth': 1,
          'testInfo.hasQualified': 1,
          'testInfo.qualificationDate': 1,
          performanceMetrics: 1,
          recentTests: { $slice: ['$completedTests', -3] }
        }
      },
      { $sort: { [`performanceMetrics.${sortBy}`]: sortOrder === 'desc' ? -1 : 1 } },
      { $skip: skip },
      { $limit: parseInt(limit) }
    ]);

    const totalCandidates = await User.countDocuments(query);

    // Calculate summary statistics
    const summaryStats = await User.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalCandidates: { $sum: 1 },
          qualifiedCandidates: { $sum: { $cond: ['$testInfo.hasQualified', 1, 0] } },
          avgBestScore: { $avg: '$testInfo.bestScore' },
          avgAttempts: { $avg: '$testInfo.totalAttempts' }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        candidates: candidates,
        summary: summaryStats[0] || {
          totalCandidates: 0,
          qualifiedCandidates: 0,
          avgBestScore: 0,
          avgAttempts: 0
        },
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCandidates / parseInt(limit)),
          totalCandidates: totalCandidates,
          hasNextPage: parseInt(page) < Math.ceil(totalCandidates / parseInt(limit)),
          hasPrevPage: parseInt(page) > 1
        }
      }
    });

  } catch (error) {
    console.error('Performance Tracking Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get candidate performance tracking data'
    });
  }
});

// @route   GET /api/admin/templates/download/:type
// @desc    Download Excel/CSV templates for bulk operations
// @access  Private (Admin)
router.get('/templates/download/:type', protectAdmin, (req, res) => {
  try {
    const { type } = req.params;
    const { format = 'xlsx' } = req.query;

    let templateData = [];
    let filename = '';

    switch (type) {
      case 'questions':
        templateData = [
          {
            questionText: 'What is the capital of India?',
            questionType: 'Multiple Choice',
            category: 'General Knowledge',
            subcategory: 'Geography',
            difficulty: 'Easy',
            points: 2,
            negativePoints: 1,
            option1: 'New Delhi',
            option2: 'Mumbai',
            option3: 'Kolkata',
            option4: 'Chennai',
            correctOption: 1,
            explanation: 'New Delhi is the capital of India',
            tags: 'geography,india,capital',
            source: 'Sample Source',
            author: 'Sample Author',
            autoApprove: false
          },
          {
            questionText: 'The Earth is round',
            questionType: 'True/False',
            category: 'General Knowledge',
            subcategory: 'Science',
            difficulty: 'Easy',
            points: 2,
            negativePoints: 1,
            correctAnswer: 'True',
            explanation: 'The Earth is approximately spherical',
            tags: 'science,earth,geography',
            source: 'Sample Source',
            author: 'Sample Author',
            autoApprove: false
          }
        ];
        filename = 'questions_template';
        break;

      case 'candidates':
        templateData = [
          {
            fullName: 'John Doe',
            email: 'john.doe@example.com',
            phone: '9876543210',
            qualification: 'Graduate',
            specialization: 'Computer Science',
            institution: 'Sample University',
            yearOfPassing: 2023,
            percentage: 85.5,
            sendInvitation: true
          }
        ];
        filename = 'candidates_template';
        break;

      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid template type'
        });
    }

    if (format === 'csv') {
      const csv = require('csv-stringify');
      csv(templateData, { header: true }, (err, output) => {
        if (err) {
          return res.status(500).json({
            success: false,
            error: 'Failed to generate CSV template'
          });
        }
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
        res.send(output);
      });
    } else {
      // Generate Excel file
      const worksheet = XLSX.utils.json_to_sheet(templateData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Template');
      
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
      res.send(buffer);
    }

  } catch (error) {
    console.error('Template Download Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to download template'
    });
  }
});

module.exports = router; 