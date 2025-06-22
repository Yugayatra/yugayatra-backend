const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

class ProctoringService {
  constructor() {
    this.activeTestSessions = new Map();
    this.violationThreshold = parseInt(process.env.VIOLATION_THRESHOLD) || 3;
    this.screenshotInterval = parseInt(process.env.SCREENSHOT_INTERVAL_SECONDS) || 30;
    this.proctoringEnabled = process.env.ENABLE_PROCTORING === 'true';
    
    this.violationTypes = {
      TAB_SWITCH: 'tab_switch',
      WINDOW_BLUR: 'window_blur',
      FULLSCREEN_EXIT: 'fullscreen_exit',
      COPY_PASTE: 'copy_paste',
      RIGHT_CLICK: 'right_click',
      KEYBOARD_SHORTCUT: 'keyboard_shortcut',
      MULTIPLE_FACES: 'multiple_faces',
      NO_FACE_DETECTED: 'no_face_detected',
      SUSPICIOUS_MOVEMENT: 'suspicious_movement',
      BROWSER_DEVELOPER_TOOLS: 'developer_tools'
    };
    
    this.ensureDirectories();
  }

  ensureDirectories() {
    const dirs = ['./uploads/screenshots', './uploads/recordings', './logs/proctoring'];
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  // Initialize proctoring session
  startProctoring(testId, userId, options = {}) {
    if (!this.proctoringEnabled) {
      return { success: false, message: 'Proctoring is disabled' };
    }

    const sessionData = {
      testId,
      userId,
      startTime: new Date(),
      violations: [],
      screenshots: [],
      isActive: true,
      options: {
        enableFaceDetection: options.enableFaceDetection || true,
        enableScreenCapture: options.enableScreenCapture || true,
        enableKeylogging: options.enableKeylogging || false,
        strictMode: options.strictMode || true,
        ...options
      }
    };

    this.activeTestSessions.set(testId, sessionData);
    
    // Start periodic screenshot capture
    if (sessionData.options.enableScreenCapture) {
      this.startScreenshotCapture(testId);
    }

    console.log(`🔍 Proctoring started for test ${testId}, user ${userId}`);
    return { success: true, sessionId: testId };
  }

  // Stop proctoring session
  stopProctoring(testId) {
    const session = this.activeTestSessions.get(testId);
    if (!session) {
      return { success: false, message: 'Session not found' };
    }

    session.isActive = false;
    session.endTime = new Date();
    
    // Clear screenshot interval
    if (session.screenshotInterval) {
      clearInterval(session.screenshotInterval);
    }

    // Generate final report
    const report = this.generateProctoringReport(testId);
    
    // Archive session data
    this.archiveSession(testId, session);
    
    this.activeTestSessions.delete(testId);
    
    console.log(`🔍 Proctoring stopped for test ${testId}`);
    return { success: true, report };
  }

  // Record a violation
  recordViolation(testId, violationType, details = {}) {
    const session = this.activeTestSessions.get(testId);
    if (!session) {
      return { success: false, message: 'Session not found' };
    }

    const violation = {
      type: violationType,
      timestamp: new Date(),
      details,
      severity: this.getViolationSeverity(violationType),
      id: `${testId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };

    session.violations.push(violation);

    // Log violation
    this.logViolation(testId, violation);

    // Check if violation threshold exceeded
    const criticalViolations = session.violations.filter(v => v.severity === 'critical').length;
    const majorViolations = session.violations.filter(v => v.severity === 'major').length;
    
    let shouldTerminate = false;
    if (criticalViolations >= 2 || majorViolations >= this.violationThreshold) {
      shouldTerminate = true;
    }

    console.log(`⚠️ Violation recorded: ${violationType} for test ${testId}`);
    
    return {
      success: true,
      violation,
      totalViolations: session.violations.length,
      shouldTerminate,
      violationCount: {
        critical: criticalViolations,
        major: majorViolations,
        minor: session.violations.filter(v => v.severity === 'minor').length
      }
    };
  }

  // Capture screenshot
  async captureScreenshot(testId, imageData) {
    const session = this.activeTestSessions.get(testId);
    if (!session || !session.options.enableScreenCapture) {
      return { success: false, message: 'Screenshot capture not enabled' };
    }

    try {
      // Remove data URL prefix if present
      const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');

      // Generate filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${testId}_${timestamp}.jpg`;
      const filepath = path.join('./uploads/screenshots', filename);

      // Compress and save image
      await sharp(buffer)
        .jpeg({ quality: 60 })
        .resize(800, 600, { fit: 'inside' })
        .toFile(filepath);

      // Add to session
      const screenshot = {
        filename,
        filepath,
        timestamp: new Date(),
        size: fs.statSync(filepath).size
      };

      session.screenshots.push(screenshot);

      // Face detection (if enabled)
      if (session.options.enableFaceDetection) {
        await this.detectFaces(testId, filepath);
      }

      return { success: true, screenshot };
    } catch (error) {
      console.error('Screenshot capture error:', error);
      return { success: false, error: error.message };
    }
  }

  // Start automatic screenshot capture
  startScreenshotCapture(testId) {
    const session = this.activeTestSessions.get(testId);
    if (!session) return;

    session.screenshotInterval = setInterval(() => {
      if (!session.isActive) {
        clearInterval(session.screenshotInterval);
        return;
      }

      // Request screenshot from client (this would be handled via websocket)
      this.requestScreenshot(testId);
    }, this.screenshotInterval * 1000);
  }

  // Request screenshot from client (placeholder for websocket implementation)
  requestScreenshot(testId) {
    // This would emit a websocket event to the client
    console.log(`📸 Requesting screenshot for test ${testId}`);
  }

  // Detect faces in screenshot (placeholder for AI implementation)
  async detectFaces(testId, imagePath) {
    try {
      // Placeholder for face detection logic
      // In a real implementation, this would use AI/ML services like:
      // - OpenCV
      // - AWS Rekognition
      // - Google Vision API
      // - Face-api.js
      
      const fakeDetection = {
        faceCount: Math.random() > 0.8 ? 0 : Math.random() > 0.9 ? 2 : 1,
        confidence: 0.95
      };

      if (fakeDetection.faceCount === 0) {
        this.recordViolation(testId, this.violationTypes.NO_FACE_DETECTED, {
          screenshot: imagePath,
          confidence: fakeDetection.confidence
        });
      } else if (fakeDetection.faceCount > 1) {
        this.recordViolation(testId, this.violationTypes.MULTIPLE_FACES, {
          screenshot: imagePath,
          faceCount: fakeDetection.faceCount,
          confidence: fakeDetection.confidence
        });
      }

      return fakeDetection;
    } catch (error) {
      console.error('Face detection error:', error);
      return { error: error.message };
    }
  }

  // Get violation severity
  getViolationSeverity(violationType) {
    const severityMap = {
      [this.violationTypes.TAB_SWITCH]: 'major',
      [this.violationTypes.WINDOW_BLUR]: 'major',
      [this.violationTypes.FULLSCREEN_EXIT]: 'major',
      [this.violationTypes.COPY_PASTE]: 'critical',
      [this.violationTypes.RIGHT_CLICK]: 'minor',
      [this.violationTypes.KEYBOARD_SHORTCUT]: 'major',
      [this.violationTypes.MULTIPLE_FACES]: 'critical',
      [this.violationTypes.NO_FACE_DETECTED]: 'major',
      [this.violationTypes.SUSPICIOUS_MOVEMENT]: 'minor',
      [this.violationTypes.BROWSER_DEVELOPER_TOOLS]: 'critical'
    };

    return severityMap[violationType] || 'minor';
  }

  // Log violation to file
  logViolation(testId, violation) {
    const logEntry = {
      timestamp: violation.timestamp.toISOString(),
      testId,
      violationType: violation.type,
      severity: violation.severity,
      details: violation.details
    };

    const logFile = path.join('./logs/proctoring', `${testId}.log`);
    fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
  }

  // Generate proctoring report
  generateProctoringReport(testId) {
    const session = this.activeTestSessions.get(testId);
    if (!session) {
      return null;
    }

    const totalViolations = session.violations.length;
    const violationsByType = session.violations.reduce((acc, v) => {
      acc[v.type] = (acc[v.type] || 0) + 1;
      return acc;
    }, {});
    
    const violationsBySeverity = session.violations.reduce((acc, v) => {
      acc[v.severity] = (acc[v.severity] || 0) + 1;
      return acc;
    }, {});

    const duration = session.endTime ? 
      (session.endTime - session.startTime) / 1000 / 60 : // in minutes
      (new Date() - session.startTime) / 1000 / 60;

    const report = {
      testId,
      userId: session.userId,
      startTime: session.startTime,
      endTime: session.endTime,
      duration: Math.round(duration),
      totalViolations,
      violationsByType,
      violationsBySeverity,
      screenshotCount: session.screenshots.length,
      riskLevel: this.calculateRiskLevel(session.violations),
      recommendations: this.generateRecommendations(session.violations),
      timeline: session.violations.map(v => ({
        timestamp: v.timestamp,
        type: v.type,
        severity: v.severity
      }))
    };

    return report;
  }

  // Calculate risk level
  calculateRiskLevel(violations) {
    const criticalCount = violations.filter(v => v.severity === 'critical').length;
    const majorCount = violations.filter(v => v.severity === 'major').length;
    const minorCount = violations.filter(v => v.severity === 'minor').length;

    if (criticalCount >= 2) return 'HIGH';
    if (criticalCount >= 1 || majorCount >= 3) return 'MEDIUM';
    if (majorCount >= 1 || minorCount >= 5) return 'LOW';
    return 'MINIMAL';
  }

  // Generate recommendations
  generateRecommendations(violations) {
    const recommendations = [];
    const violationTypes = [...new Set(violations.map(v => v.type))];

    if (violationTypes.includes(this.violationTypes.MULTIPLE_FACES)) {
      recommendations.push('Multiple faces detected - verify candidate identity');
    }
    
    if (violationTypes.includes(this.violationTypes.TAB_SWITCH)) {
      recommendations.push('Frequent tab switching detected - review test session');
    }
    
    if (violationTypes.includes(this.violationTypes.COPY_PASTE)) {
      recommendations.push('Copy-paste activity detected - flag for manual review');
    }

    if (violations.filter(v => v.severity === 'critical').length >= 2) {
      recommendations.push('High-risk session - recommend test invalidation');
    }

    return recommendations;
  }

  // Archive session data
  archiveSession(testId, session) {
    const archiveData = {
      ...session,
      archivedAt: new Date()
    };

    const archiveFile = path.join('./logs/proctoring', `archived_${testId}.json`);
    fs.writeFileSync(archiveFile, JSON.stringify(archiveData, null, 2));
  }

  // Get session status
  getSessionStatus(testId) {
    const session = this.activeTestSessions.get(testId);
    if (!session) {
      return { exists: false };
    }

    return {
      exists: true,
      isActive: session.isActive,
      startTime: session.startTime,
      violationCount: session.violations.length,
      screenshotCount: session.screenshots.length,
      riskLevel: this.calculateRiskLevel(session.violations)
    };
  }

  // Get all active sessions
  getAllActiveSessions() {
    return Array.from(this.activeTestSessions.entries()).map(([testId, session]) => ({
      testId,
      userId: session.userId,
      startTime: session.startTime,
      violationCount: session.violations.length,
      riskLevel: this.calculateRiskLevel(session.violations)
    }));
  }
}

module.exports = new ProctoringService(); 