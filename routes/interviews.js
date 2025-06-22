const express = require('express');
const { body, validationResult } = require('express-validator');
const Interview = require('../models/Interview');
const User = require('../models/User');
const notificationService = require('../utils/notificationService');
const { protectAdmin, protectUser } = require('../middleware/auth');

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

// @route   POST /api/interviews/schedule
// @desc    Schedule a new interview
// @access  Private (Admin)
router.post('/schedule',
  protectAdmin,
  [
    body('candidateId').isMongoId().withMessage('Valid candidate ID is required'),
    body('interviewType').isIn(['Technical', 'HR', 'Final', 'Group Discussion']).withMessage('Valid interview type is required'),
    body('scheduledDate').isISO8601().withMessage('Valid date is required'),
    body('interviewer.name').notEmpty().withMessage('Interviewer name is required'),
    body('position').notEmpty().withMessage('Position is required')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const {
        candidateId,
        interviewType,
        interviewMode = 'Online',
        scheduledDate,
        duration = 60,
        meetingLink,
        location,
        interviewer,
        position,
        notificationChannels = ['email', 'sms']
      } = req.body;

      // Validate candidate exists
      const candidate = await User.findById(candidateId);
      if (!candidate) {
        return res.status(404).json({
          success: false,
          error: 'Candidate not found'
        });
      }

      // Create interview
      const interview = new Interview({
        candidate: candidateId,
        candidateName: candidate.fullName,
        candidateEmail: candidate.email,
        candidatePhone: candidate.phone,
        interviewType,
        interviewMode,
        position,
        scheduledDate: new Date(scheduledDate),
        duration,
        meetingLink,
        location,
        interviewer,
        createdBy: req.admin._id
      });

      await interview.save();

      // Send interview invitation notification
      const notificationData = {
        date: new Date(scheduledDate).toLocaleDateString('en-IN'),
        time: new Date(scheduledDate).toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        }),
        type: interviewType,
        position: position,
        interviewer: interviewer.name,
        duration: duration,
        meetingLink: meetingLink,
        location: location?.address
      };

      await notificationService.sendMultiChannelNotification(
        {
          name: candidate.fullName,
          email: candidate.email,
          phone: candidate.phone
        },
        'interview_invitation',
        notificationData,
        notificationChannels
      );

      // Mark notification as sent
      interview.notifications.confirmationSent = true;
      await interview.save();

      res.status(201).json({
        success: true,
        message: 'Interview scheduled successfully',
        data: {
          interview: await Interview.findById(interview._id).populate('candidate', 'fullName email phone')
        }
      });

    } catch (error) {
      console.error('Schedule interview error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to schedule interview'
      });
    }
  }
);

// @route   GET /api/interviews
// @desc    Get interviews with filtering and pagination
// @access  Private (Admin)
router.get('/', protectAdmin, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      interviewType,
      startDate,
      endDate,
      candidateId,
      sortBy = 'scheduledDate',
      sortOrder = 'desc'
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build query
    const query = {};
    if (status) query.status = status;
    if (interviewType) query.interviewType = interviewType;
    if (candidateId) query.candidate = candidateId;

    if (startDate || endDate) {
      query.scheduledDate = {};
      if (startDate) query.scheduledDate.$gte = new Date(startDate);
      if (endDate) query.scheduledDate.$lte = new Date(endDate);
    }

    const interviews = await Interview.find(query)
      .populate('candidate', 'fullName email phone profile.photo')
      .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalInterviews = await Interview.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        interviews,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalInterviews / parseInt(limit)),
          totalInterviews,
          hasNextPage: parseInt(page) < Math.ceil(totalInterviews / parseInt(limit)),
          hasPrevPage: parseInt(page) > 1
        }
      }
    });

  } catch (error) {
    console.error('Get interviews error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch interviews'
    });
  }
});

module.exports = router; 