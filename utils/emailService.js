const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE || 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      },
      secure: true,
      logger: process.env.NODE_ENV === 'development',
      debug: process.env.NODE_ENV === 'development'
    });
    
    // Verify connection configuration
    this.verifyConnection();
  }
  
  async verifyConnection() {
    try {
      await this.transporter.verify();
      console.log('📧 Email service is ready to send messages');
    } catch (error) {
      console.error('❌ Email service connection failed:', error.message);
    }
  }
  
  // Send OTP email
  async sendOTP(email, otp, name, purpose = 'verification') {
    const subject = `${otp} - Your YugaYatra ${purpose} Code`;
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>YugaYatra OTP Verification</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
          .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
          .header { background: linear-gradient(135deg, #f59e0b, #d97706); color: white; padding: 20px; text-align: center; }
          .logo { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
          .content { padding: 30px; }
          .otp-box { background-color: #fff3cd; border: 2px solid #f59e0b; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }
          .otp-code { font-size: 32px; font-weight: bold; color: #d97706; letter-spacing: 5px; margin: 10px 0; }
          .warning { background-color: #f8d7da; border-left: 4px solid #dc3545; padding: 15px; margin: 20px 0; }
          .footer { background-color: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #666; }
          .btn { display: inline-block; padding: 12px 24px; background-color: #f59e0b; color: white; text-decoration: none; border-radius: 5px; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">YugaYatra</div>
            <p>Retail (OPC) Pvt Ltd</p>
          </div>
          
          <div class="content">
            <h2>Hello ${name}!</h2>
            <p>Thank you for your interest in YugaYatra's internship program. Please use the following One-Time Password (OTP) to complete your ${purpose}:</p>
            
            <div class="otp-box">
              <p><strong>Your OTP Code:</strong></p>
              <div class="otp-code">${otp}</div>
              <p><small>Valid for 10 minutes only</small></p>
            </div>
            
            <p>If you didn't request this OTP, please ignore this email or contact our support team.</p>
            
            <div class="warning">
              <strong>Security Notice:</strong>
              <ul>
                <li>Never share your OTP with anyone</li>
                <li>YugaYatra will never ask for your OTP over phone or email</li>
                <li>This OTP expires in 10 minutes</li>
              </ul>
            </div>
          </div>
          
          <div class="footer">
            <p><strong>YugaYatra Retail (OPC) Pvt Ltd</strong></p>
            <p>📧 yugayatraretail@gmail.com | 📱 +91-9972037182</p>
            <p>This is an automated message. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;
    
    const mailOptions = {
      from: {
        name: 'YugaYatra Retail',
        address: process.env.EMAIL_FROM || process.env.EMAIL_USER
      },
      to: email,
      subject: subject,
      html: html,
      text: `Your YugaYatra ${purpose} OTP is: ${otp}. Valid for 10 minutes only. Please do not share this code with anyone.`
    };
    
    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log('✅ OTP email sent successfully:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('❌ Failed to send OTP email:', error);
      return { success: false, error: error.message };
    }
  }
  
  // Send test invitation email
  async sendTestInvitation(email, name, testDetails) {
    const subject = 'YugaYatra Internship Test - Important Instructions';
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Test Invitation - YugaYatra</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
          .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
          .header { background: linear-gradient(135deg, #f59e0b, #d97706); color: white; padding: 20px; text-align: center; }
          .logo { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
          .content { padding: 30px; }
          .test-details { background-color: #e7f3ff; border-left: 4px solid #0066cc; padding: 20px; margin: 20px 0; }
          .instructions { background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .warning { background-color: #fff3cd; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; }
          .footer { background-color: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #666; }
          .btn { display: inline-block; padding: 12px 24px; background-color: #f59e0b; color: white; text-decoration: none; border-radius: 5px; margin: 10px 0; }
          ul { padding-left: 20px; }
          li { margin-bottom: 8px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">YugaYatra</div>
            <p>Internship Test Invitation</p>
          </div>
          
          <div class="content">
            <h2>Dear ${name},</h2>
            <p>Congratulations! You have been selected to take the YugaYatra Internship Assessment Test.</p>
            
            <div class="test-details">
              <h3>📋 Test Details:</h3>
              <ul>
                <li><strong>Total Questions:</strong> ${testDetails.totalQuestions || 30}</li>
                <li><strong>Duration:</strong> ${testDetails.duration || 30} minutes</li>
                <li><strong>Passing Marks:</strong> ${testDetails.passingPercentage || 65}%</li>
                <li><strong>Maximum Attempts:</strong> ${testDetails.maxAttempts || 5}</li>
                <li><strong>Negative Marking:</strong> Yes (-1 for wrong answers)</li>
              </ul>
            </div>
            
            <div class="instructions">
              <h3>📝 Important Instructions:</h3>
              <ul>
                <li>Ensure stable internet connection throughout the test</li>
                <li>Use a desktop or laptop for better experience</li>
                <li>Keep your camera on during the test (if required)</li>
                <li>Do not switch tabs or minimize the browser</li>
                <li>Read questions carefully before answering</li>
                <li>You can review and change answers before final submission</li>
                <li>The test will auto-submit when time expires</li>
              </ul>
            </div>
            
            <div class="warning">
              <h3>⚠️ Important Notes:</h3>
              <ul>
                <li>Once started, the test cannot be paused</li>
                <li>Make sure you have a quiet environment</li>
                <li>Keep your phone number ${testDetails.phone || 'registered'} handy for OTP verification</li>
                <li>Technical support: +91-9972037182</li>
              </ul>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${testDetails.testUrl || '#'}" class="btn">Start Your Test</a>
            </div>
            
            <p>Best of luck with your test! We look forward to having you join the YugaYatra team.</p>
          </div>
          
          <div class="footer">
            <p><strong>YugaYatra Retail (OPC) Pvt Ltd</strong></p>
            <p>📧 yugayatraretail@gmail.com | 📱 +91-9972037182</p>
          </div>
        </div>
      </body>
      </html>
    `;
    
    const mailOptions = {
      from: {
        name: 'YugaYatra Retail',
        address: process.env.EMAIL_FROM || process.env.EMAIL_USER
      },
      to: email,
      subject: subject,
      html: html
    };
    
    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log('✅ Test invitation sent successfully:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('❌ Failed to send test invitation:', error);
      return { success: false, error: error.message };
    }
  }
  
  // Send test results email
  async sendTestResults(email, name, testResults) {
    const subject = `YugaYatra Test Results - ${testResults.isPassed ? 'Congratulations!' : 'Keep Trying!'}`;
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Test Results - YugaYatra</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
          .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
          .header { background: linear-gradient(135deg, ${testResults.isPassed ? '#10b981, #059669' : '#ef4444, #dc2626'}); color: white; padding: 20px; text-align: center; }
          .logo { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
          .content { padding: 30px; }
          .result-card { background-color: ${testResults.isPassed ? '#d1fae5' : '#fee2e2'}; border: 2px solid ${testResults.isPassed ? '#10b981' : '#ef4444'}; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }
          .score { font-size: 48px; font-weight: bold; color: ${testResults.isPassed ? '#059669' : '#dc2626'}; }
          .grade { font-size: 24px; font-weight: bold; margin: 10px 0; }
          .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 20px 0; }
          .stat-box { background-color: #f8f9fa; padding: 15px; border-radius: 8px; text-align: center; }
          .stat-value { font-size: 24px; font-weight: bold; color: #f59e0b; }
          .footer { background-color: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #666; }
          .next-steps { background-color: #e7f3ff; border-left: 4px solid #0066cc; padding: 20px; margin: 20px 0; }
          @media (max-width: 600px) { .stats-grid { grid-template-columns: 1fr; } }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">YugaYatra</div>
            <p>Test Results</p>
          </div>
          
          <div class="content">
            <h2>Dear ${name},</h2>
            <p>Thank you for taking the YugaYatra Internship Assessment Test. Here are your results:</p>
            
            <div class="result-card">
              <h3>${testResults.isPassed ? '🎉 Congratulations!' : '📚 Keep Learning!'}</h3>
              <div class="score">${testResults.percentage}%</div>
              <div class="grade">Grade: ${testResults.grade}</div>
              <p><strong>${testResults.isPassed ? 'You have successfully passed the test!' : 'You can retake the test after 24 hours.'}</strong></p>
            </div>
            
            <div class="stats-grid">
              <div class="stat-box">
                <div class="stat-value">${testResults.correctAnswers}</div>
                <div>Correct Answers</div>
              </div>
              <div class="stat-box">
                <div class="stat-value">${testResults.wrongAnswers}</div>
                <div>Wrong Answers</div>
              </div>
              <div class="stat-box">
                <div class="stat-value">${testResults.totalQuestions}</div>
                <div>Total Questions</div>
              </div>
              <div class="stat-box">
                <div class="stat-value">${testResults.attemptedQuestions}</div>
                <div>Attempted</div>
              </div>
            </div>
            
            <h3>📊 Detailed Performance:</h3>
            <ul>
              <li><strong>Test ID:</strong> ${testResults.testId}</li>
              <li><strong>Date:</strong> ${new Date(testResults.completedAt).toLocaleDateString()}</li>
              <li><strong>Duration:</strong> ${testResults.actualDuration} minutes</li>
              <li><strong>Score:</strong> ${testResults.netScore}/${testResults.totalPoints} points</li>
              <li><strong>Percentile:</strong> ${testResults.percentile || 'Calculating...'}%</li>
            </ul>
            
            ${testResults.isPassed ? 
              `<div class="next-steps">
                <h3>🚀 Next Steps:</h3>
                <ul>
                  <li>Our HR team will contact you within 2-3 business days</li>
                  <li>Please keep your phone accessible for further communication</li>
                  <li>Prepare for the interview round</li>
                  <li>Check your email regularly for updates</li>
                </ul>
              </div>` : 
              `<div class="next-steps">
                <h3>📈 Improvement Tips:</h3>
                <ul>
                  <li>Review the topics you found challenging</li>
                  <li>Practice more questions in weak areas</li>
                  <li>You can retake the test after 24 hours</li>
                  <li>Contact us if you need study materials</li>
                </ul>
              </div>`
            }
          </div>
          
          <div class="footer">
            <p><strong>YugaYatra Retail (OPC) Pvt Ltd</strong></p>
            <p>📧 yugayatraretail@gmail.com | 📱 +91-9972037182</p>
            <p>For queries regarding results, please contact us with your Test ID: ${testResults.testId}</p>
          </div>
        </div>
      </body>
      </html>
    `;
    
    const mailOptions = {
      from: {
        name: 'YugaYatra Retail',
        address: process.env.EMAIL_FROM || process.env.EMAIL_USER
      },
      to: email,
      subject: subject,
      html: html
    };
    
    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log('✅ Test results sent successfully:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('❌ Failed to send test results:', error);
      return { success: false, error: error.message };
    }
  }
  
  // Send admin notification
  async sendAdminNotification(type, data) {
    const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_USER;
    let subject, html;
    
    switch (type) {
      case 'new_registration':
        subject = 'New Test Registration - YugaYatra';
        html = `
          <h2>New Test Registration</h2>
          <p><strong>Name:</strong> ${data.name}</p>
          <p><strong>Phone:</strong> ${data.phone}</p>
          <p><strong>Email:</strong> ${data.email}</p>
          <p><strong>Registration Date:</strong> ${new Date(data.registrationDate).toLocaleString()}</p>
        `;
        break;
        
      case 'test_completed':
        subject = 'Test Completed - YugaYatra';
        html = `
          <h2>Test Completed</h2>
          <p><strong>Candidate:</strong> ${data.name}</p>
          <p><strong>Test ID:</strong> ${data.testId}</p>
          <p><strong>Score:</strong> ${data.percentage}% (${data.isPassed ? 'PASSED' : 'FAILED'})</p>
          <p><strong>Completion Date:</strong> ${new Date(data.completedAt).toLocaleString()}</p>
        `;
        break;
        
      case 'system_alert':
        subject = `System Alert - ${data.alertType}`;
        html = `
          <h2>System Alert</h2>
          <p><strong>Alert Type:</strong> ${data.alertType}</p>
          <p><strong>Message:</strong> ${data.message}</p>
          <p><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
        `;
        break;
        
      default:
        return { success: false, error: 'Invalid notification type' };
    }
    
    const mailOptions = {
      from: {
        name: 'YugaYatra System',
        address: process.env.EMAIL_FROM || process.env.EMAIL_USER
      },
      to: adminEmail,
      subject: subject,
      html: html
    };
    
    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log('✅ Admin notification sent successfully:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('❌ Failed to send admin notification:', error);
      return { success: false, error: error.message };
    }
  }
  
  // Send bulk emails
  async sendBulkEmails(recipients, subject, htmlTemplate, data = {}) {
    const results = [];
    
    for (const recipient of recipients) {
      try {
        const personalizedHtml = htmlTemplate.replace(/\{\{(\w+)\}\}/g, (match, key) => {
          return data[key] || recipient[key] || match;
        });
        
        const mailOptions = {
          from: {
            name: 'YugaYatra Retail',
            address: process.env.EMAIL_FROM || process.env.EMAIL_USER
          },
          to: recipient.email,
          subject: subject,
          html: personalizedHtml
        };
        
        const info = await this.transporter.sendMail(mailOptions);
        results.push({ 
          email: recipient.email, 
          success: true, 
          messageId: info.messageId 
        });
        
        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        results.push({ 
          email: recipient.email, 
          success: false, 
          error: error.message 
        });
      }
    }
    
    return results;
  }

  async sendEmail(to, subject, html, attachments = []) {
    try {
      const mailOptions = {
        from: `"YugaYatra Team" <${process.env.EMAIL_USER}>`,
        to,
        subject,
        html,
        attachments
      };

      const result = await this.transporter.sendMail(mailOptions);
      return {
        success: true,
        messageId: result.messageId
      };
    } catch (error) {
      console.error('Email sending error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async sendOTPEmail(email, otp, userName = 'User') {
    const subject = 'OTP Verification - YugaYatra';
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .header { text-align: center; margin-bottom: 30px; }
          .logo { color: #f59e0b; font-size: 24px; font-weight: bold; }
          .otp-box { background-color: #fef3c7; border: 2px solid #f59e0b; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0; }
          .otp-code { font-size: 32px; font-weight: bold; color: #92400e; letter-spacing: 5px; }
          .footer { margin-top: 30px; text-align: center; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">🎯 YugaYatra</div>
            <h2>OTP Verification</h2>
          </div>
          
          <p>Hi ${userName},</p>
          <p>Your OTP for verification is:</p>
          
          <div class="otp-box">
            <div class="otp-code">${otp}</div>
          </div>
          
          <p><strong>Important:</strong></p>
          <ul>
            <li>This OTP is valid for 10 minutes only</li>
            <li>Do not share this code with anyone</li>
            <li>If you didn't request this, please ignore this email</li>
          </ul>
          
          <div class="footer">
            <p>Best regards,<br>YugaYatra Team</p>
            <p>📞 Support: +91-9972037182 | 📧 support@yugayatra.com</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return await this.sendEmail(email, subject, html);
  }

  async sendTestInvitation(email, candidateName, testDetails) {
    const subject = 'Test Invitation - YugaYatra Internship';
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .header { text-align: center; margin-bottom: 30px; }
          .logo { color: #f59e0b; font-size: 24px; font-weight: bold; }
          .test-details { background-color: #f0f9ff; border-left: 4px solid #0284c7; padding: 20px; margin: 20px 0; }
          .cta-button { display: inline-block; background-color: #f59e0b; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
          .instructions { background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">🎯 YugaYatra</div>
            <h2>Test Invitation</h2>
          </div>
          
          <p>Dear ${candidateName},</p>
          <p>Congratulations! You have been invited to take the YugaYatra internship test.</p>
          
          <div class="test-details">
            <h3>📋 Test Details:</h3>
            <ul>
              <li><strong>Duration:</strong> ${testDetails.duration || 30} minutes</li>
              <li><strong>Total Questions:</strong> ${testDetails.totalQuestions || 30}</li>
              <li><strong>Attempts Allowed:</strong> ${testDetails.attemptsAllowed || 5}</li>
              <li><strong>Passing Score:</strong> ${testDetails.passingScore || 65}%</li>
            </ul>
          </div>
          
          <div style="text-align: center;">
            <a href="${testDetails.testLink}" class="cta-button">Start Test Now</a>
          </div>
          
          <div class="instructions">
            <h4>📝 Important Instructions:</h4>
            <ul>
              <li>Ensure stable internet connection</li>
              <li>Use Chrome or Firefox browser</li>
              <li>Keep your camera and microphone enabled</li>
              <li>Do not switch tabs or minimize browser</li>
              <li>Complete test in one sitting</li>
            </ul>
          </div>
          
          <p>Good luck with your test!</p>
          
          <div class="footer">
            <p>Best regards,<br>YugaYatra Team</p>
            <p>📞 Support: +91-9972037182 | 📧 support@yugayatra.com</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return await this.sendEmail(email, subject, html);
  }

  async sendInterviewInvitation(email, candidateName, interviewDetails) {
    const subject = 'Interview Invitation - YugaYatra';
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .header { text-align: center; margin-bottom: 30px; }
          .logo { color: #f59e0b; font-size: 24px; font-weight: bold; }
          .interview-card { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 25px; border-radius: 12px; margin: 20px 0; }
          .date-time { font-size: 24px; font-weight: bold; text-align: center; margin: 10px 0; }
          .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 20px 0; }
          .detail-item { background-color: rgba(255,255,255,0.1); padding: 10px; border-radius: 6px; }
          .checklist { background-color: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .meeting-link { background-color: #10b981; color: white; padding: 15px; text-align: center; border-radius: 8px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">🎯 YugaYatra</div>
            <h2>🤝 Interview Invitation</h2>
          </div>
          
          <p>Dear ${candidateName},</p>
          <p>Congratulations! You have been selected for an interview with YugaYatra.</p>
          
          <div class="interview-card">
            <h3 style="margin-top: 0; text-align: center;">📅 Interview Schedule</h3>
            <div class="date-time">${interviewDetails.date} at ${interviewDetails.time}</div>
            <div class="details-grid">
              <div class="detail-item">
                <strong>Type:</strong> ${interviewDetails.type}
              </div>
              <div class="detail-item">
                <strong>Duration:</strong> ${interviewDetails.duration || 60} minutes
              </div>
              <div class="detail-item">
                <strong>Position:</strong> ${interviewDetails.position}
              </div>
              <div class="detail-item">
                <strong>Interviewer:</strong> ${interviewDetails.interviewer}
              </div>
            </div>
          </div>
          
          ${interviewDetails.meetingLink ? `
          <div class="meeting-link">
            <h4 style="margin-top: 0;">🔗 Join Meeting</h4>
            <a href="${interviewDetails.meetingLink}" style="color: white; text-decoration: none; font-weight: bold;">
              Click here to join the interview
            </a>
          </div>
          ` : ''}
          
          ${interviewDetails.location ? `
          <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <h4>📍 Location:</h4>
            <p>${interviewDetails.location}</p>
          </div>
          ` : ''}
          
          <div class="checklist">
            <h4>📋 Interview Checklist:</h4>
            <ul>
              <li>Resume (multiple copies if offline)</li>
              <li>Government-issued ID proof</li>
              <li>Educational certificates</li>
              <li>Portfolio/work samples (if applicable)</li>
              <li>Good internet connection (for online interviews)</li>
              <li>Professional attire</li>
            </ul>
          </div>
          
          <p><strong>Please confirm your availability by replying to this email.</strong></p>
          
          <div class="footer">
            <p>Best of luck!<br>YugaYatra Team</p>
            <p>📞 Support: +91-9972037182 | 📧 support@yugayatra.com</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return await this.sendEmail(email, subject, html);
  }

  async sendInterviewReminder(email, candidateName, interviewDetails) {
    const subject = 'Interview Reminder - Tomorrow at YugaYatra';
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .reminder-banner { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 20px; text-align: center; border-radius: 8px; margin-bottom: 20px; }
          .countdown { font-size: 28px; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="reminder-banner">
            <h2 style="margin: 0;">⏰ Interview Reminder</h2>
            <div class="countdown">Tomorrow at ${interviewDetails.time}</div>
          </div>
          
          <p>Hi ${candidateName},</p>
          <p>This is a friendly reminder about your upcoming interview with YugaYatra.</p>
          
          <div style="background-color: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3>📅 Interview Details:</h3>
            <ul>
              <li><strong>Date:</strong> ${interviewDetails.date}</li>
              <li><strong>Time:</strong> ${interviewDetails.time}</li>
              <li><strong>Type:</strong> ${interviewDetails.type}</li>
              <li><strong>Interviewer:</strong> ${interviewDetails.interviewer}</li>
            </ul>
          </div>
          
          <p><strong>Please be available 10 minutes before the scheduled time.</strong></p>
          
          <div class="footer">
            <p>See you tomorrow!<br>YugaYatra Team</p>
            <p>📞 Support: +91-9972037182</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return await this.sendEmail(email, subject, html);
  }

  async sendTestResults(email, candidateName, results) {
    const subject = `Test Results - ${results.isPassed ? 'Congratulations!' : 'Next Steps'} - YugaYatra`;
    const statusColor = results.isPassed ? '#10b981' : '#ef4444';
    const statusIcon = results.isPassed ? '🎉' : '💪';
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .result-banner { background-color: ${statusColor}; color: white; padding: 25px; text-align: center; border-radius: 8px; margin-bottom: 20px; }
          .score-circle { width: 120px; height: 120px; border-radius: 50%; background-color: rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center; margin: 20px auto; }
          .score-text { font-size: 28px; font-weight: bold; }
          .next-steps { background-color: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="result-banner">
            <h2 style="margin: 0;">${statusIcon} Test Results</h2>
            <div class="score-circle">
              <div class="score-text">${results.score}%</div>
            </div>
            <h3 style="margin: 10px 0 0 0;">${results.isPassed ? 'PASSED' : 'NOT PASSED'}</h3>
          </div>
          
          <p>Dear ${candidateName},</p>
          <p>Your test results are ready!</p>
          
          <div style="background-color: #fafafa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3>📊 Score Breakdown:</h3>
            <ul>
              <li><strong>Your Score:</strong> ${results.score}%</li>
              <li><strong>Passing Score:</strong> ${results.passingScore}%</li>
              <li><strong>Time Taken:</strong> ${results.timeTaken} minutes</li>
              <li><strong>Questions Attempted:</strong> ${results.attempted}/${results.total}</li>
            </ul>
          </div>
          
          <div class="next-steps">
            <h3>🚀 Next Steps:</h3>
            ${results.isPassed ? `
              <p><strong>Congratulations!</strong> You have successfully qualified for the next round.</p>
              <p>Our team will contact you within 2-3 business days regarding the interview process.</p>
            ` : `
              <p><strong>Don't worry!</strong> You can retake the test after 24 hours.</p>
              <p>We recommend reviewing the following topics before your next attempt:</p>
              <ul>
                <li>General Knowledge</li>
                <li>Logical Reasoning</li>
                <li>Basic Mathematics</li>
                <li>English Comprehension</li>
              </ul>
            `}
          </div>
          
          <div class="footer">
            <p>Best regards,<br>YugaYatra Team</p>
            <p>📞 Questions? Call: +91-9972037182</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return await this.sendEmail(email, subject, html);
  }

  async sendInterviewReschedule(email, candidateName, rescheduleDetails) {
    const subject = 'Interview Rescheduled - YugaYatra';
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .reschedule-banner { background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); color: white; padding: 20px; text-align: center; border-radius: 8px; margin-bottom: 20px; }
          .old-schedule { background-color: #fee2e2; padding: 15px; border-radius: 8px; margin: 10px 0; text-decoration: line-through; color: #991b1b; }
          .new-schedule { background-color: #dcfce7; padding: 15px; border-radius: 8px; margin: 10px 0; color: #166534; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="reschedule-banner">
            <h2 style="margin: 0;">📅 Interview Rescheduled</h2>
          </div>
          
          <p>Dear ${candidateName},</p>
          <p>Your interview with YugaYatra has been rescheduled.</p>
          
          <div class="old-schedule">
            <h4>❌ Previous Schedule:</h4>
            <p><strong>Date:</strong> ${rescheduleDetails.oldDate}</p>
            <p><strong>Time:</strong> ${rescheduleDetails.oldTime}</p>
          </div>
          
          <div class="new-schedule">
            <h4>✅ New Schedule:</h4>
            <p><strong>Date:</strong> ${rescheduleDetails.newDate}</p>
            <p><strong>Time:</strong> ${rescheduleDetails.newTime}</p>
            <p><strong>Type:</strong> ${rescheduleDetails.type}</p>
          </div>
          
          <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <h4>📝 Reason for Rescheduling:</h4>
            <p>${rescheduleDetails.reason}</p>
          </div>
          
          <p><strong>Please update your calendar and confirm your availability.</strong></p>
          
          <div class="footer">
            <p>Thank you for your understanding,<br>YugaYatra Team</p>
            <p>📞 Questions? Call: +91-9972037182</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return await this.sendEmail(email, subject, html);
  }

  async sendWeeklyDigest(email, adminName, digestData) {
    const subject = 'Weekly Digest - YugaYatra Admin Dashboard';
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px; }
          .container { max-width: 700px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .header { text-align: center; margin-bottom: 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 25px; border-radius: 8px; }
          .stats-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin: 20px 0; }
          .stat-card { background-color: #f8fafc; padding: 20px; border-radius: 8px; text-align: center; border-left: 4px solid #3b82f6; }
          .stat-number { font-size: 28px; font-weight: bold; color: #1e40af; }
          .stat-label { color: #64748b; font-size: 14px; margin-top: 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2 style="margin: 0;">📊 Weekly Digest</h2>
            <p style="margin: 10px 0 0 0;">${digestData.period}</p>
          </div>
          
          <p>Hi ${adminName},</p>
          <p>Here's your weekly summary of YugaYatra platform activity:</p>
          
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-number">${digestData.stats.newUsers}</div>
              <div class="stat-label">New Registrations</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${digestData.stats.completedTests}</div>
              <div class="stat-label">Tests Completed</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${digestData.stats.scheduledInterviews}</div>
              <div class="stat-label">Interviews Scheduled</div>
            </div>
          </div>
          
          <p>Access your admin dashboard for detailed analytics and reports.</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/admin" style="background-color: #3b82f6; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">
              View Dashboard
            </a>
          </div>
          
          <div class="footer">
            <p>Best regards,<br>YugaYatra System</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return await this.sendEmail(email, subject, html);
  }
}

module.exports = new EmailService(); 