const jwt = require('jsonwebtoken');

class JWTUtils {
  constructor() {
    this.secret = process.env.JWT_SECRET || 'yugayatra_fallback_secret_key';
    this.expiresIn = process.env.JWT_EXPIRE || '7d';
    
    if (!process.env.JWT_SECRET) {
      console.warn('⚠️ JWT_SECRET not set in environment variables, using fallback secret');
    }
  }
  
  // Generate JWT token
  generateToken(payload, options = {}) {
    try {
      const tokenOptions = {
        expiresIn: options.expiresIn || this.expiresIn,
        issuer: options.issuer || 'yugayatra-test-system',
        audience: options.audience || 'yugayatra-users',
        subject: options.subject || payload.id || payload._id,
        ...options
      };
      
      const token = jwt.sign(payload, this.secret, tokenOptions);
      
      return {
        success: true,
        token: token,
        expiresIn: tokenOptions.expiresIn
      };
    } catch (error) {
      console.error('❌ JWT Generation Error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // Generate access token for users
  generateAccessToken(user) {
    const payload = {
      id: user._id,
      phone: user.phone,
      email: user.email,
      name: user.fullName,
      role: 'user',
      isVerified: user.isVerified,
      type: 'access'
    };
    
    return this.generateToken(payload, {
      expiresIn: '1d', // Access tokens expire in 1 day
      subject: user._id.toString()
    });
  }
  
  // Generate refresh token for users
  generateRefreshToken(user) {
    const payload = {
      id: user._id,
      phone: user.phone,
      type: 'refresh'
    };
    
    return this.generateToken(payload, {
      expiresIn: '30d', // Refresh tokens expire in 30 days
      subject: user._id.toString()
    });
  }
  
  // Generate admin token
  generateAdminToken(admin) {
    const payload = {
      id: admin._id,
      phone: admin.phone,
      email: admin.email,
      name: admin.fullName,
      role: admin.role,
      permissions: admin.permissions,
      type: 'admin'
    };
    
    return this.generateToken(payload, {
      expiresIn: '8h', // Admin tokens expire in 8 hours
      subject: admin._id.toString(),
      audience: 'yugayatra-admin'
    });
  }
  
  // Generate test session token
  generateTestToken(user, testId) {
    const payload = {
      id: user._id,
      phone: user.phone,
      name: user.fullName,
      testId: testId,
      type: 'test',
      startTime: new Date().toISOString()
    };
    
    return this.generateToken(payload, {
      expiresIn: '2h', // Test tokens expire in 2 hours
      subject: user._id.toString(),
      audience: 'yugayatra-test'
    });
  }
  
  // Generate OTP verification token
  generateOTPToken(phone, purpose = 'verification') {
    const payload = {
      phone: phone,
      purpose: purpose,
      type: 'otp',
      timestamp: Date.now()
    };
    
    return this.generateToken(payload, {
      expiresIn: '10m', // OTP tokens expire in 10 minutes
      subject: phone,
      audience: 'yugayatra-otp'
    });
  }
  
  // Verify JWT token
  verifyToken(token, options = {}) {
    try {
      const decoded = jwt.verify(token, this.secret, {
        issuer: options.issuer || 'yugayatra-test-system',
        audience: options.audience || 'yugayatra-users',
        ...options
      });
      
      return {
        success: true,
        decoded: decoded,
        isExpired: false
      };
    } catch (error) {
      console.error('❌ JWT Verification Error:', error.message);
      
      return {
        success: false,
        error: error.message,
        isExpired: error.name === 'TokenExpiredError',
        isInvalid: error.name === 'JsonWebTokenError'
      };
    }
  }
  
  // Verify user access token
  verifyAccessToken(token) {
    return this.verifyToken(token, {
      audience: 'yugayatra-users'
    });
  }
  
  // Verify admin token
  verifyAdminToken(token) {
    return this.verifyToken(token, {
      audience: 'yugayatra-admin'
    });
  }
  
  // Verify test token
  verifyTestToken(token) {
    return this.verifyToken(token, {
      audience: 'yugayatra-test'
    });
  }
  
  // Verify OTP token
  verifyOTPToken(token) {
    return this.verifyToken(token, {
      audience: 'yugayatra-otp'
    });
  }
  
  // Decode token without verification (for debugging)
  decodeToken(token) {
    try {
      const decoded = jwt.decode(token, { complete: true });
      
      if (!decoded) {
        return {
          success: false,
          error: 'Invalid token format'
        };
      }
      
      return {
        success: true,
        header: decoded.header,
        payload: decoded.payload,
        signature: decoded.signature
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // Check if token is expired
  isTokenExpired(token) {
    try {
      const decoded = jwt.decode(token);
      
      if (!decoded || !decoded.exp) {
        return true;
      }
      
      const currentTime = Math.floor(Date.now() / 1000);
      return decoded.exp < currentTime;
    } catch (error) {
      return true;
    }
  }
  
  // Get token expiration time
  getTokenExpiration(token) {
    try {
      const decoded = jwt.decode(token);
      
      if (!decoded || !decoded.exp) {
        return null;
      }
      
      return new Date(decoded.exp * 1000);
    } catch (error) {
      return null;
    }
  }
  
  // Get time until token expires
  getTimeUntilExpiry(token) {
    try {
      const expirationTime = this.getTokenExpiration(token);
      
      if (!expirationTime) {
        return null;
      }
      
      const currentTime = new Date();
      const timeDiff = expirationTime - currentTime;
      
      if (timeDiff <= 0) {
        return 0;
      }
      
      return Math.floor(timeDiff / 1000); // Return in seconds
    } catch (error) {
      return null;
    }
  }
  
  // Refresh access token using refresh token
  refreshAccessToken(refreshToken) {
    const verificationResult = this.verifyToken(refreshToken);
    
    if (!verificationResult.success) {
      return {
        success: false,
        error: 'Invalid refresh token'
      };
    }
    
    const { decoded } = verificationResult;
    
    if (decoded.type !== 'refresh') {
      return {
        success: false,
        error: 'Token is not a refresh token'
      };
    }
    
    // Generate new access token
    const newAccessToken = this.generateToken({
      id: decoded.id,
      phone: decoded.phone,
      type: 'access'
    }, {
      expiresIn: '1d',
      subject: decoded.id,
      audience: 'yugayatra-users'
    });
    
    return newAccessToken;
  }
  
  // Blacklist token (for logout)
  // Note: In a production environment, you'd store blacklisted tokens in Redis or database
  static blacklistedTokens = new Set();
  
  blacklistToken(token) {
    try {
      const decoded = jwt.decode(token);
      if (decoded && decoded.jti) {
        JWTUtils.blacklistedTokens.add(decoded.jti);
      } else {
        // If no JTI, blacklist the entire token
        JWTUtils.blacklistedTokens.add(token);
      }
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  
  // Check if token is blacklisted
  isTokenBlacklisted(token) {
    try {
      const decoded = jwt.decode(token);
      if (decoded && decoded.jti) {
        return JWTUtils.blacklistedTokens.has(decoded.jti);
      }
      return JWTUtils.blacklistedTokens.has(token);
    } catch (error) {
      return false;
    }
  }
  
  // Generate token with JTI (JWT ID) for blacklisting
  generateTokenWithJTI(payload, options = {}) {
    const jti = require('crypto').randomBytes(16).toString('hex');
    
    const enhancedPayload = {
      ...payload,
      jti: jti
    };
    
    return this.generateToken(enhancedPayload, options);
  }
  
  // Extract user information from token
  extractUserFromToken(token) {
    const verificationResult = this.verifyAccessToken(token);
    
    if (!verificationResult.success) {
      return null;
    }
    
    const { decoded } = verificationResult;
    
    return {
      id: decoded.id,
      phone: decoded.phone,
      email: decoded.email,
      name: decoded.name,
      role: decoded.role,
      isVerified: decoded.isVerified
    };
  }
  
  // Extract admin information from token
  extractAdminFromToken(token) {
    const verificationResult = this.verifyAdminToken(token);
    
    if (!verificationResult.success) {
      return null;
    }
    
    const { decoded } = verificationResult;
    
    return {
      id: decoded.id,
      phone: decoded.phone,
      email: decoded.email,
      name: decoded.name,
      role: decoded.role,
      permissions: decoded.permissions
    };
  }
  
  // Clean up expired blacklisted tokens (should be called periodically)
  cleanupBlacklistedTokens() {
    const tokensToRemove = [];
    
    for (const token of JWTUtils.blacklistedTokens) {
      if (this.isTokenExpired(token)) {
        tokensToRemove.push(token);
      }
    }
    
    tokensToRemove.forEach(token => {
      JWTUtils.blacklistedTokens.delete(token);
    });
    
    console.log(`🧹 Cleaned up ${tokensToRemove.length} expired blacklisted tokens`);
    
    return tokensToRemove.length;
  }
}

module.exports = new JWTUtils(); 