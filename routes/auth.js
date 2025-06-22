const express = require('express');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Admin = require('../models/Admin');
const jwtUtils = require('../utils/jwtUtils');
const emailService = require('../utils/emailService');
const smsService = require('../utils/smsService');
const { protectUser, protectAdmin, logAuthAttempt } = require('../middleware/auth');

const router = express.Router();

// Validation rules
const registrationValidation = [
  body('phone')
    .matches(/^\d{10}$/)
    .withMessage('Please provide a valid 10-digit phone number'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('fullName')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Full name must be between 2 and 100 characters'),
  body('termsAccepted')
    .equals('true')
    .withMessage('Terms and conditions must be accepted'),
  body('dataProcessingConsent')
    .equals('true')
    .withMessage('Data processing consent is required')
];

const loginValidation = [
  body('phone')
    .matches(/^\d{10}$/)
    .withMessage('Please provide a valid 10-digit phone number')
];

const otpValidation = [
  body('phone')
    .matches(/^\d{10}$/)
    .withMessage('Please provide a valid 10-digit phone number'),
  body('otp')
    .matches(/^\d{6}$/)
    .withMessage('OTP must be a 6-digit number')
];

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

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', 
  logAuthAttempt('user'),
  registrationValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { phone, email, fullName, termsAccepted, dataProcessingConsent } = req.body;
      
      // Check if user already exists
      const existingUser = await User.findOne({
        $or: [{ phone }, { email }]
      });
      
      if (existingUser) {
        return res.status(400).json({
          success: false,
          error: existingUser.phone === phone ? 
            'Phone number already registered' : 
            'Email address already registered'
        });
      }
      
      // Create new user
      const user = new User({
        phone,
        email,
        fullName,
        termsAccepted: termsAccepted === 'true',
        dataProcessingConsent: dataProcessingConsent === 'true',
        ipAddress: req.authAttempt.ip,
        userAgent: req.authAttempt.userAgent,
        deviceInfo: {
          browser: req.get('User-Agent'),
          os: req.get('sec-ch-ua-platform') || 'Unknown',
          device: req.get('sec-ch-ua-mobile') === '?1' ? 'Mobile' : 'Desktop'
        }
      });
      
      // Generate and send OTP
      const otp = user.generateOTP();
      await user.save();
      
      // Send OTP via SMS and Email
      const smsResult = await smsService.sendOTP(phone, otp, fullName, 'registration');
      const emailResult = await emailService.sendOTP(email, otp, fullName, 'registration');
      
      console.log('📱 SMS Result:', smsResult.success ? 'Sent' : smsResult.error);
      console.log('📧 Email Result:', emailResult.success ? 'Sent' : emailResult.error);
      
      // Log activity
      user.logActivity && user.logActivity('registration_initiated', {
        method: 'phone_email',
        ip: req.authAttempt.ip
      });
      
      res.status(201).json({
        success: true,
        message: 'Registration initiated. Please verify your phone number with the OTP sent.',
        data: {
          phone: phone,
          email: email,
          otpSent: {
            sms: smsResult.success,
            email: emailResult.success
          }
        }
      });
      
    } catch (error) {
      console.error('Registration Error:', error);
      res.status(500).json({
        success: false,
        error: 'Registration failed. Please try again.'
      });
    }
  }
);

// @route   POST /api/auth/verify-otp
// @desc    Verify OTP and complete registration
// @access  Public
router.post('/verify-otp',
  logAuthAttempt('user'),
  otpValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { phone, otp } = req.body;
      
      // Find user by phone
      const user = await User.findOne({ phone });
      
      if (!user) {
        return res.status(400).json({
          success: false,
          error: 'User not found. Please register first.'
        });
      }
      
      // Verify OTP
      const isOTPValid = user.verifyOTP(otp);
      
      if (!isOTPValid) {
        await user.save(); // Save the incremented attempt count
        
        return res.status(400).json({
          success: false,
          error: 'Invalid or expired OTP',
          attemptsRemaining: user.otp ? (5 - user.otp.attempts) : 0
        });
      }
      
      // Update user verification status
      user.isVerified = true;
      user.status = 'Active';
      await user.save();
      
      // Generate tokens
      const accessToken = jwtUtils.generateAccessToken(user);
      const refreshToken = jwtUtils.generateRefreshToken(user);
      
      if (!accessToken.success || !refreshToken.success) {
        return res.status(500).json({
          success: false,
          error: 'Token generation failed'
        });
      }
      
      // Send welcome email
      await emailService.sendTestInvitation(user.email, user.fullName, {
        totalQuestions: 30,
        duration: 30,
        passingPercentage: 65,
        maxAttempts: 5,
        phone: user.phone,
        testUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/test`
      });
      
      res.status(200).json({
        success: true,
        message: 'Registration completed successfully',
        data: {
          user: {
            id: user._id,
            phone: user.phone,
            email: user.email,
            name: user.fullName,
            isVerified: user.isVerified
          },
          tokens: {
            accessToken: accessToken.token,
            refreshToken: refreshToken.token,
            expiresIn: accessToken.expiresIn
          }
        }
      });
      
    } catch (error) {
      console.error('OTP Verification Error:', error);
      res.status(500).json({
        success: false,
        error: 'OTP verification failed. Please try again.'
      });
    }
  }
);

// @route   POST /api/auth/login
// @desc    User login
// @access  Public
router.post('/login',
  logAuthAttempt('user'),
  loginValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { phone } = req.body;
      
      // Find user by phone
      const user = await User.findOne({ phone });
      
      if (!user) {
        return res.status(400).json({
          success: false,
          error: 'User not found. Please register first.'
        });
      }
      
      // Check if user is active
      if (user.status !== 'Active') {
        return res.status(400).json({
          success: false,
          error: 'Account is not active. Please contact support.'
        });
      }
      
      // Generate and send OTP for login
      const otp = user.generateOTP();
      await user.save();
      
      // Send OTP via SMS and Email
      const smsResult = await smsService.sendOTP(phone, otp, user.fullName, 'login');
      const emailResult = await emailService.sendOTP(user.email, otp, user.fullName, 'login');
      
      res.status(200).json({
        success: true,
        message: 'OTP sent successfully. Please verify to login.',
        data: {
          phone: phone,
          otpSent: {
            sms: smsResult.success,
            email: emailResult.success
          }
        }
      });
      
    } catch (error) {
      console.error('Login Error:', error);
      res.status(500).json({
        success: false,
        error: 'Login failed. Please try again.'
      });
    }
  }
);

// @route   POST /api/auth/login-verify
// @desc    Verify login OTP
// @access  Public
router.post('/login-verify',
  logAuthAttempt('user'),
  otpValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { phone, otp } = req.body;
      
      // Find user by phone
      const user = await User.findOne({ phone });
      
      if (!user) {
        return res.status(400).json({
          success: false,
          error: 'User not found'
        });
      }
      
      // Verify OTP
      const isOTPValid = user.verifyOTP(otp);
      
      if (!isOTPValid) {
        await user.save();
        
        return res.status(400).json({
          success: false,
          error: 'Invalid or expired OTP',
          attemptsRemaining: user.otp ? (5 - user.otp.attempts) : 0
        });
      }
      
      // Update last login
      user.lastLogin = new Date();
      await user.save();
      
      // Generate tokens
      const accessToken = jwtUtils.generateAccessToken(user);
      const refreshToken = jwtUtils.generateRefreshToken(user);
      
      if (!accessToken.success || !refreshToken.success) {
        return res.status(500).json({
          success: false,
          error: 'Token generation failed'
        });
      }
      
      res.status(200).json({
        success: true,
        message: 'Login successful',
        data: {
          user: {
            id: user._id,
            phone: user.phone,
            email: user.email,
            name: user.fullName,
            isVerified: user.isVerified,
            profileCompleted: !!user.profileCompletedAt
          },
          tokens: {
            accessToken: accessToken.token,
            refreshToken: refreshToken.token,
            expiresIn: accessToken.expiresIn
          }
        }
      });
      
    } catch (error) {
      console.error('Login Verify Error:', error);
      res.status(500).json({
        success: false,
        error: 'Login verification failed. Please try again.'
      });
    }
  }
);

// @route   POST /api/auth/resend-otp
// @desc    Resend OTP
// @access  Public
router.post('/resend-otp',
  loginValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { phone } = req.body;
      
      // Find user by phone
      const user = await User.findOne({ phone });
      
      if (!user) {
        return res.status(400).json({
          success: false,
          error: 'User not found'
        });
      }
      
      // Check if user has exceeded OTP attempts
      if (user.otp && user.otp.attempts >= 5) {
        return res.status(429).json({
          success: false,
          error: 'Too many OTP attempts. Please try again later.'
        });
      }
      
      // Generate and send new OTP
      const otp = user.generateOTP();
      await user.save();
      
      // Send OTP via SMS and Email
      const smsResult = await smsService.sendOTP(phone, otp, user.fullName);
      const emailResult = await emailService.sendOTP(user.email, otp, user.fullName);
      
      res.status(200).json({
        success: true,
        message: 'OTP resent successfully',
        data: {
          otpSent: {
            sms: smsResult.success,
            email: emailResult.success
          }
        }
      });
      
    } catch (error) {
      console.error('Resend OTP Error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to resend OTP. Please try again.'
      });
    }
  }
);

// @route   POST /api/auth/admin/login
// @desc    Admin login with phone and OTP
// @access  Public
router.post('/admin/login',
  logAuthAttempt('admin'),
  [
    body('phone')
      .equals(process.env.ADMIN_PHONE || '9972037182')
      .withMessage('Unauthorized access')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { phone } = req.body;
      
      // Find or create admin
      let admin = await Admin.findOne({ phone });
      
      if (!admin) {
        // Create default admin if not exists
        admin = new Admin({
          phone,
          fullName: 'YugaYatra Admin',
          role: 'Super Admin',
          status: 'Active',
          isVerified: true,
          permissions: {
            users: { view: true, create: true, edit: true, delete: true },
            questions: { view: true, create: true, edit: true, delete: true, approve: true, bulkUpload: true },
            tests: { view: true, create: true, manage: true, results: true, analytics: true },
            system: { settings: true, backup: true, logs: true, reports: true }
          }
        });
      }
      
      // Check if admin account is locked
      if (admin.isLocked) {
        return res.status(423).json({
          success: false,
          error: 'Account is temporarily locked due to multiple failed attempts'
        });
      }
      
      // Generate and send OTP
      const otp = admin.generateOTP();
      await admin.save();
      
      // Send OTP via SMS
      const smsResult = await smsService.sendOTP(phone, otp, admin.fullName, 'admin login');
      
      // Log activity
      await admin.logActivity('login_attempt', {
        ip: req.authAttempt.ip,
        userAgent: req.authAttempt.userAgent
      }, req);
      
      res.status(200).json({
        success: true,
        message: 'Admin OTP sent successfully',
        data: {
          otpSent: smsResult.success
        }
      });
      
    } catch (error) {
      console.error('Admin Login Error:', error);
      res.status(500).json({
        success: false,
        error: 'Admin login failed. Please try again.'
      });
    }
  }
);

// @route   POST /api/auth/admin/verify
// @desc    Verify admin OTP and login
// @access  Public
router.post('/admin/verify',
  logAuthAttempt('admin'),
  [
    body('phone')
      .equals(process.env.ADMIN_PHONE || '9972037182')
      .withMessage('Unauthorized access'),
    body('otp')
      .matches(/^\d{6}$/)
      .withMessage('OTP must be a 6-digit number')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { phone, otp } = req.body;
      
      // Find admin
      const admin = await Admin.findOne({ phone });
      
      if (!admin) {
        return res.status(400).json({
          success: false,
          error: 'Admin not found'
        });
      }
      
      // Verify OTP
      const isOTPValid = admin.verifyOTP(otp);
      
      if (!isOTPValid) {
        await admin.incLoginAttempts();
        
        return res.status(400).json({
          success: false,
          error: 'Invalid or expired OTP',
          attemptsRemaining: admin.otp ? (5 - admin.otp.attempts) : 0
        });
      }
      
      // Reset login attempts on successful login
      await admin.resetLoginAttempts();
      
      // Update last login
      admin.lastLogin = new Date();
      await admin.save();
      
      // Generate admin token
      const adminToken = jwtUtils.generateAdminToken(admin);
      
      if (!adminToken.success) {
        return res.status(500).json({
          success: false,
          error: 'Token generation failed'
        });
      }
      
      // Log successful login
      await admin.logActivity('login_success', {
        ip: req.authAttempt.ip,
        userAgent: req.authAttempt.userAgent
      }, req);
      
      res.status(200).json({
        success: true,
        message: 'Admin login successful',
        data: {
          admin: {
            id: admin._id,
            phone: admin.phone,
            name: admin.fullName,
            role: admin.role,
            permissions: admin.permissions
          },
          token: adminToken.token,
          expiresIn: adminToken.expiresIn
        }
      });
      
    } catch (error) {
      console.error('Admin Verify Error:', error);
      res.status(500).json({
        success: false,
        error: 'Admin verification failed. Please try again.'
      });
    }
  }
);

// @route   POST /api/auth/logout
// @desc    User logout
// @access  Private
router.post('/logout', protectUser, async (req, res) => {
  try {
    // Blacklist the token
    jwtUtils.blacklistToken(req.token);
    
    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
    
  } catch (error) {
    console.error('Logout Error:', error);
    res.status(500).json({
      success: false,
      error: 'Logout failed'
    });
  }
});

// @route   POST /api/auth/admin/logout
// @desc    Admin logout
// @access  Private
router.post('/admin/logout', protectAdmin, async (req, res) => {
  try {
    // Blacklist the token
    jwtUtils.blacklistToken(req.token);
    
    // Log activity
    await req.admin.logActivity('logout', {
      ip: req.ip,
      userAgent: req.get('User-Agent')
    }, req);
    
    res.status(200).json({
      success: true,
      message: 'Admin logged out successfully'
    });
    
  } catch (error) {
    console.error('Admin Logout Error:', error);
    res.status(500).json({
      success: false,
      error: 'Admin logout failed'
    });
  }
});

// @route   POST /api/auth/refresh
// @desc    Refresh access token
// @access  Public
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: 'Refresh token is required'
      });
    }
    
    // Refresh the access token
    const result = jwtUtils.refreshAccessToken(refreshToken);
    
    if (!result.success) {
      return res.status(401).json({
        success: false,
        error: result.error
      });
    }
    
    res.status(200).json({
      success: true,
      data: {
        accessToken: result.token,
        expiresIn: result.expiresIn
      }
    });
    
  } catch (error) {
    console.error('Token Refresh Error:', error);
    res.status(500).json({
      success: false,
      error: 'Token refresh failed'
    });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user info
// @access  Private
router.get('/me', protectUser, async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      data: {
        user: {
          id: req.user._id,
          phone: req.user.phone,
          email: req.user.email,
          name: req.user.fullName,
          isVerified: req.user.isVerified,
          status: req.user.status,
          profileCompleted: !!req.user.profileCompletedAt,
          testInfo: req.user.testInfo,
          createdAt: req.user.createdAt
        }
      }
    });
  } catch (error) {
    console.error('Get User Info Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user information'
    });
  }
});

// @route   GET /api/auth/admin/me
// @desc    Get current admin info
// @access  Private
router.get('/admin/me', protectAdmin, async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      data: {
        admin: {
          id: req.admin._id,
          phone: req.admin.phone,
          email: req.admin.email,
          name: req.admin.fullName,
          role: req.admin.role,
          permissions: req.admin.permissions,
          status: req.admin.status,
          lastLogin: req.admin.lastLogin,
          createdAt: req.admin.createdAt
        }
      }
    });
  } catch (error) {
    console.error('Get Admin Info Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get admin information'
    });
  }
});

module.exports = router; 