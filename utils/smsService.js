class SMSService {
  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
    this.fromNumber = process.env.TWILIO_PHONE_NUMBER;
    
    if (this.accountSid && this.authToken) {
      try {
        const twilio = require('twilio');
        this.client = twilio(this.accountSid, this.authToken);
        this.isConfigured = true;
        console.log('📱 SMS service initialized successfully');
      } catch (error) {
        this.isConfigured = false;
        this.client = null;
        console.warn('⚠️ SMS service initialization failed:', error.message);
      }
    } else {
      this.isConfigured = false;
      this.client = null;
      console.warn('⚠️ SMS service not configured - Twilio credentials missing');
    }
  }
  
  // Check if SMS service is properly configured
  isAvailable() {
    return this.isConfigured;
  }
  
  // Format phone number to international format
  formatPhoneNumber(phone) {
    // Remove any non-digit characters
    const cleaned = phone.replace(/\D/g, '');
    
    // If it's a 10-digit Indian number, add country code
    if (cleaned.length === 10) {
      return `+91${cleaned}`;
    }
    
    // If it already has country code
    if (cleaned.length === 12 && cleaned.startsWith('91')) {
      return `+${cleaned}`;
    }
    
    // If it starts with +91
    if (phone.startsWith('+91')) {
      return phone;
    }
    
    // Default case - assume Indian number
    return `+91${cleaned}`;
  }
  
  // Send OTP SMS
  async sendOTP(phone, otp, name, purpose = 'verification') {
    if (!this.isConfigured) {
      console.log('📱 SMS service not configured, skipping OTP SMS');
      return { success: false, error: 'SMS service not configured' };
    }
    
    const formattedPhone = this.formatPhoneNumber(phone);
    const message = `Dear ${name}, your YugaYatra ${purpose} OTP is: ${otp}. Valid for 10 minutes. Do not share this code. - YugaYatra Retail`;
    
    try {
      const result = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: formattedPhone
      });
      
      console.log('✅ OTP SMS sent successfully:', result.sid);
      return { 
        success: true, 
        sid: result.sid,
        status: result.status 
      };
    } catch (error) {
      console.error('❌ Failed to send OTP SMS:', error);
      return { 
        success: false, 
        error: error.message,
        code: error.code 
      };
    }
  }
  
  // Send test reminder SMS
  async sendTestReminder(phone, name, testDetails) {
    if (!this.isConfigured) {
      return { success: false, error: 'SMS service not configured' };
    }
    
    const formattedPhone = this.formatPhoneNumber(phone);
    const message = `Hi ${name}! Reminder: Your YugaYatra internship test is scheduled. Duration: ${testDetails.duration || 30} mins. Questions: ${testDetails.totalQuestions || 30}. Best of luck! - YugaYatra`;
    
    try {
      const result = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: formattedPhone
      });
      
      console.log('✅ Test reminder sent successfully:', result.sid);
      return { success: true, sid: result.sid };
    } catch (error) {
      console.error('❌ Failed to send test reminder:', error);
      return { success: false, error: error.message };
    }
  }
  
  // Send test results SMS
  async sendTestResults(phone, name, testResults) {
    if (!this.isConfigured) {
      return { success: false, error: 'SMS service not configured' };
    }
    
    const formattedPhone = this.formatPhoneNumber(phone);
    const status = testResults.isPassed ? 'PASSED' : 'FAILED';
    const message = `Hi ${name}! Your YugaYatra test result: ${testResults.percentage}% - ${status}. Test ID: ${testResults.testId}. ${testResults.isPassed ? 'Congratulations! Our team will contact you soon.' : 'You can retake after 24 hours.'} - YugaYatra`;
    
    try {
      const result = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: formattedPhone
      });
      
      console.log('✅ Test results SMS sent successfully:', result.sid);
      return { success: true, sid: result.sid };
    } catch (error) {
      console.error('❌ Failed to send test results SMS:', error);
      return { success: false, error: error.message };
    }
  }
  
  // Send interview invitation SMS
  async sendInterviewInvitation(phone, name, interviewDetails) {
    if (!this.isConfigured) {
      return { success: false, error: 'SMS service not configured' };
    }
    
    const formattedPhone = this.formatPhoneNumber(phone);
    const message = `Congratulations ${name}! You're selected for YugaYatra interview. Date: ${interviewDetails.date}. Time: ${interviewDetails.time}. Mode: ${interviewDetails.mode}. Contact: +91-9972037182. - YugaYatra`;
    
    try {
      const result = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: formattedPhone
      });
      
      console.log('✅ Interview invitation sent successfully:', result.sid);
      return { success: true, sid: result.sid };
    } catch (error) {
      console.error('❌ Failed to send interview invitation:', error);
      return { success: false, error: error.message };
    }
  }
  
  // Send admin alert SMS
  async sendAdminAlert(message, priority = 'normal') {
    if (!this.isConfigured) {
      return { success: false, error: 'SMS service not configured' };
    }
    
    const adminPhone = process.env.ADMIN_PHONE;
    if (!adminPhone) {
      return { success: false, error: 'Admin phone not configured' };
    }
    
    const formattedPhone = this.formatPhoneNumber(adminPhone);
    const priorityPrefix = priority === 'high' ? '🚨 URGENT: ' : priority === 'medium' ? '⚠️ ALERT: ' : '📢 INFO: ';
    const smsMessage = `${priorityPrefix}${message} - YugaYatra System`;
    
    try {
      const result = await this.client.messages.create({
        body: smsMessage,
        from: this.fromNumber,
        to: formattedPhone
      });
      
      console.log('✅ Admin alert sent successfully:', result.sid);
      return { success: true, sid: result.sid };
    } catch (error) {
      console.error('❌ Failed to send admin alert:', error);
      return { success: false, error: error.message };
    }
  }
  
  // Send bulk SMS
  async sendBulkSMS(phoneNumbers, message, options = {}) {
    if (!this.isConfigured) {
      return { success: false, error: 'SMS service not configured' };
    }
    
    const results = [];
    const delay = options.delay || 1000; // Default 1 second delay between messages
    
    for (const phone of phoneNumbers) {
      try {
        const formattedPhone = this.formatPhoneNumber(phone);
        
        const result = await this.client.messages.create({
          body: message,
          from: this.fromNumber,
          to: formattedPhone
        });
        
        results.push({
          phone: phone,
          success: true,
          sid: result.sid,
          status: result.status
        });
        
        // Add delay to avoid rate limiting
        if (delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
      } catch (error) {
        results.push({
          phone: phone,
          success: false,
          error: error.message,
          code: error.code
        });
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;
    
    console.log(`📱 Bulk SMS completed: ${successCount} sent, ${failureCount} failed`);
    
    return {
      success: true,
      totalSent: successCount,
      totalFailed: failureCount,
      results: results
    };
  }
  
  // Get message status
  async getMessageStatus(messageSid) {
    if (!this.isConfigured) {
      return { success: false, error: 'SMS service not configured' };
    }
    
    try {
      const message = await this.client.messages(messageSid).fetch();
      
      return {
        success: true,
        status: message.status,
        errorCode: message.errorCode,
        errorMessage: message.errorMessage,
        dateCreated: message.dateCreated,
        dateSent: message.dateSent,
        dateUpdated: message.dateUpdated
      };
    } catch (error) {
      console.error('❌ Failed to get message status:', error);
      return { success: false, error: error.message };
    }
  }
  
  // Validate phone number
  async validatePhoneNumber(phone) {
    if (!this.isConfigured) {
      return { success: false, error: 'SMS service not configured' };
    }
    
    try {
      const formattedPhone = this.formatPhoneNumber(phone);
      
      const phoneNumber = await this.client.lookups.v1.phoneNumbers(formattedPhone).fetch();
      
      return {
        success: true,
        isValid: true,
        phoneNumber: phoneNumber.phoneNumber,
        countryCode: phoneNumber.countryCode,
        nationalFormat: phoneNumber.nationalFormat
      };
    } catch (error) {
      if (error.code === 20404) {
        return {
          success: true,
          isValid: false,
          error: 'Invalid phone number'
        };
      }
      
      console.error('❌ Phone validation error:', error);
      return { success: false, error: error.message };
    }
  }
  
  // Get account balance (if needed for monitoring)
  async getAccountBalance() {
    if (!this.isConfigured) {
      return { success: false, error: 'SMS service not configured' };
    }
    
    try {
      const account = await this.client.api.accounts(this.accountSid).fetch();
      
      return {
        success: true,
        balance: account.balance,
        currency: account.currency || 'USD'
      };
    } catch (error) {
      console.error('❌ Failed to get account balance:', error);
      return { success: false, error: error.message };
    }
  }
  
  // Send custom SMS
  async sendCustomSMS(phone, message, options = {}) {
    if (!this.isConfigured) {
      return { success: false, error: 'SMS service not configured' };
    }
    
    const formattedPhone = this.formatPhoneNumber(phone);
    
    const messageOptions = {
      body: message,
      from: this.fromNumber,
      to: formattedPhone,
      ...options
    };
    
    try {
      const result = await this.client.messages.create(messageOptions);
      
      console.log('✅ Custom SMS sent successfully:', result.sid);
      return { 
        success: true, 
        sid: result.sid,
        status: result.status 
      };
    } catch (error) {
      console.error('❌ Failed to send custom SMS:', error);
      return { 
        success: false, 
        error: error.message,
        code: error.code 
      };
    }
  }
}

module.exports = new SMSService(); 