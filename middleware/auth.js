const jwtUtils = require('../utils/jwtUtils');
const User = require('../models/User');
const Admin = require('../models/Admin');

// Middleware to extract and verify JWT token
const extractToken = (req, res, next) => {
  let token;
  
  // Check for token in Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }
  
  // Check for token in cookies (if using cookie authentication)
  else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }
  
  // Check for token in query parameters (not recommended for production)
  else if (req.query && req.query.token) {
    token = req.query.token;
  }
  
  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Access token is required'
    });
  }
  
  // Check if token is blacklisted
  if (jwtUtils.isTokenBlacklisted(token)) {
    return res.status(401).json({
      success: false,
      error: 'Token has been invalidated'
    });
  }
  
  req.token = token;
  next();
};

// Middleware to verify user authentication
const authenticate = async (req, res, next) => {
  try {
    const verificationResult = jwtUtils.verifyAccessToken(req.token);
    
    if (!verificationResult.success) {
      return res.status(401).json({
        success: false,
        error: verificationResult.isExpired ? 'Token has expired' : 'Invalid token',
        expired: verificationResult.isExpired
      });
    }
    
    const { decoded } = verificationResult;
    
    // Find user in database
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Check if user account is active
    if (user.status !== 'Active') {
      return res.status(401).json({
        success: false,
        error: 'Account is not active'
      });
    }
    
    // Check if user is verified
    if (!user.isVerified) {
      return res.status(401).json({
        success: false,
        error: 'Account is not verified'
      });
    }
    
    req.user = user;
    req.tokenData = decoded;
    next();
  } catch (error) {
    console.error('Authentication Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Authentication failed'
    });
  }
};

// Middleware to verify admin authentication
const authenticateAdmin = async (req, res, next) => {
  try {
    const verificationResult = jwtUtils.verifyAdminToken(req.token);
    
    if (!verificationResult.success) {
      return res.status(401).json({
        success: false,
        error: verificationResult.isExpired ? 'Token has expired' : 'Invalid admin token',
        expired: verificationResult.isExpired
      });
    }
    
    const { decoded } = verificationResult;
    
    // Find admin in database
    const admin = await Admin.findById(decoded.id).select('-password -otp');
    
    if (!admin) {
      return res.status(401).json({
        success: false,
        error: 'Admin not found'
      });
    }
    
    // Check if admin account is active
    if (admin.status !== 'Active') {
      return res.status(401).json({
        success: false,
        error: 'Admin account is not active'
      });
    }
    
    // Check if admin is verified
    if (!admin.isVerified) {
      return res.status(401).json({
        success: false,
        error: 'Admin account is not verified'
      });
    }
    
    // Check if account is locked
    if (admin.isLocked) {
      return res.status(401).json({
        success: false,
        error: 'Admin account is temporarily locked'
      });
    }
    
    req.admin = admin;
    req.tokenData = decoded;
    next();
  } catch (error) {
    console.error('Admin Authentication Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Admin authentication failed'
    });
  }
};

// Middleware to verify test session token
const authenticateTest = async (req, res, next) => {
  try {
    const verificationResult = jwtUtils.verifyTestToken(req.token);
    
    if (!verificationResult.success) {
      return res.status(401).json({
        success: false,
        error: verificationResult.isExpired ? 'Test session has expired' : 'Invalid test token',
        expired: verificationResult.isExpired
      });
    }
    
    const { decoded } = verificationResult;
    
    // Find user in database
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Check if user can attempt test
    const canAttempt = user.canAttemptTest();
    if (!canAttempt.canAttempt) {
      return res.status(403).json({
        success: false,
        error: canAttempt.reason
      });
    }
    
    req.user = user;
    req.testData = {
      testId: decoded.testId,
      startTime: decoded.startTime
    };
    req.tokenData = decoded;
    next();
  } catch (error) {
    console.error('Test Authentication Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Test authentication failed'
    });
  }
};

// Middleware to check admin permissions
const checkPermission = (resource, action) => {
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({
        success: false,
        error: 'Admin authentication required'
      });
    }
    
    // Super admin has all permissions
    if (req.admin.role === 'Super Admin') {
      return next();
    }
    
    // Check specific permission
    if (!req.admin.hasPermission(resource, action)) {
      return res.status(403).json({
        success: false,
        error: `Permission denied: ${resource}.${action}`
      });
    }
    
    next();
  };
};

// Middleware to check admin role
const checkRole = (...roles) => {
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({
        success: false,
        error: 'Admin authentication required'
      });
    }
    
    if (!roles.includes(req.admin.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient role privileges'
      });
    }
    
    next();
  };
};

// Middleware for optional authentication (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
  try {
    let token;
    
    // Extract token similar to extractToken but don't fail if not found
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }
    
    if (!token) {
      req.user = null;
      return next();
    }
    
    // Verify token if present
    const verificationResult = jwtUtils.verifyAccessToken(token);
    
    if (verificationResult.success) {
      const user = await User.findById(verificationResult.decoded.id).select('-password');
      req.user = user;
    } else {
      req.user = null;
    }
    
    next();
  } catch (error) {
    req.user = null;
    next();
  }
};

// Middleware to log authentication attempts
const logAuthAttempt = (type = 'user') => {
  return (req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent');
    const timestamp = new Date().toISOString();
    
    console.log(`🔐 Auth Attempt [${type.toUpperCase()}] - IP: ${clientIP} - UA: ${userAgent} - Time: ${timestamp}`);
    
    // Store auth attempt info in request for later use
    req.authAttempt = {
      ip: clientIP,
      userAgent: userAgent,
      timestamp: timestamp,
      type: type
    };
    
    next();
  };
};

// Middleware to validate API key (if API access is enabled)
const validateApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];
    const apiSecret = req.headers['x-api-secret'];
    
    if (!apiKey || !apiSecret) {
      return res.status(401).json({
        success: false,
        error: 'API key and secret are required'
      });
    }
    
    // Find admin with matching API key
    const admin = await Admin.findOne({
      'apiAccess.apiKey': apiKey,
      'apiAccess.apiSecret': apiSecret,
      'apiAccess.enabled': true,
      status: 'Active'
    });
    
    if (!admin) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API credentials'
      });
    }
    
    // Update last API call timestamp
    admin.apiAccess.lastApiCall = new Date();
    await admin.save();
    
    req.admin = admin;
    req.isApiAccess = true;
    next();
  } catch (error) {
    console.error('API Key Validation Error:', error);
    return res.status(500).json({
      success: false,
      error: 'API authentication failed'
    });
  }
};

// Middleware to check if user is verified
const requireVerification = (req, res, next) => {
  if (!req.user || !req.user.isVerified) {
    return res.status(403).json({
      success: false,
      error: 'Account verification required'
    });
  }
  next();
};

// Middleware to check if profile is completed
const requireCompleteProfile = (req, res, next) => {
  if (!req.user || !req.user.profileCompletedAt) {
    return res.status(403).json({
      success: false,
      error: 'Profile completion required'
    });
  }
  next();
};

// Combined middleware for user routes
const protectUser = [extractToken, authenticate];

// Combined middleware for admin routes
const protectAdmin = [extractToken, authenticateAdmin];

// Combined middleware for test routes
const protectTest = [extractToken, authenticateTest];

// Combined middleware for verified users
const protectVerifiedUser = [extractToken, authenticate, requireVerification];

// Combined middleware for users with complete profile
const protectCompleteUser = [extractToken, authenticate, requireVerification, requireCompleteProfile];

module.exports = {
  extractToken,
  authenticate,
  authenticateAdmin,
  authenticateTest,
  checkPermission,
  checkRole,
  optionalAuth,
  logAuthAttempt,
  validateApiKey,
  requireVerification,
  requireCompleteProfile,
  protectUser,
  protectAdmin,
  protectTest,
  protectVerifiedUser,
  protectCompleteUser
}; 