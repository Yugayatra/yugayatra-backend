class WhatsAppService {
  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
    this.fromNumber = process.env.TWILIO_WHATSAPP_NUMBER; // Format: whatsapp:+1234567890
    
    if (this.accountSid && this.authToken && this.fromNumber) {
      try {
        const twilio = require('twilio');
        this.client = twilio(this.accountSid, this.authToken);
        this.isConfigured = true;
        console.log('📱 WhatsApp service initialized successfully');
      } catch (error) {
        this.isConfigured = false;
        this.client = null;
        console.warn('⚠️ WhatsApp service initialization failed:', error.message);
      }
    } else {
      this.isConfigured = false;
      this.client = null;
      console.warn('⚠️ WhatsApp service not configured - Twilio credentials missing');
    }
  }

  // Check if WhatsApp service is properly configured
  isAvailable() {
    return this.isConfigured;
  }

  // Format phone number for WhatsApp
  formatWhatsAppNumber(phone) {
    // Remove any non-digit characters
    const cleaned = phone.replace(/\D/g, '');
    
    // If it's a 10-digit Indian number, add country code
    if (cleaned.length === 10) {
      return `whatsapp:+91${cleaned}`;
    }
    
    // If it already has country code
    if (cleaned.length === 12 && cleaned.startsWith('91')) {
      return `whatsapp:+${cleaned}`;
    }
    
    // If it starts with +91
    if (phone.startsWith('+91')) {
      return `whatsapp:${phone}`;
    }
    
    // Default case - assume Indian number
    return `whatsapp:+91${cleaned}`;
  }

  // Send WhatsApp OTP
  async sendOTP(phone, otp, name, purpose = 'verification') {
    if (!this.isConfigured) {
      console.log('📱 WhatsApp service not configured, skipping OTP message');
      return { success: false, error: 'WhatsApp service not configured' };
    }

    const formattedPhone = this.formatWhatsAppNumber(phone);
    const message = `*YugaYatra ${purpose.toUpperCase()} OTP*\n\nDear ${name},\n\nYour verification code is: *${otp}*\n\nValid for 10 minutes. Do not share this code.\n\n- YugaYatra Team`;
    
    try {
      const result = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: formattedPhone
      });
      
      console.log('✅ WhatsApp OTP sent successfully:', result.sid);
      return { 
        success: true, 
        sid: result.sid,
        status: result.status 
      };
    } catch (error) {
      console.error('❌ Failed to send WhatsApp OTP:', error);
      return { 
        success: false, 
        error: error.message,
        code: error.code 
      };
    }
  }

  // Send test results WhatsApp message
  async sendTestResults(phone, name, testResults) {
    if (!this.isConfigured) {
      return { success: false, error: 'WhatsApp service not configured' };
    }

    const formattedPhone = this.formatWhatsAppNumber(phone);
    const status = testResults.isPassed ? '✅ PASSED' : '❌ FAILED';
    const emoji = testResults.isPassed ? '🎉' : '💪';
    
    const message = `*YugaYatra Test Results* ${emoji}\n\nHi ${name}!\n\n*Test Score:* ${testResults.percentage}%\n*Status:* ${status}\n*Test ID:* ${testResults.testId}\n\n${testResults.isPassed ? 'Congratulations! 🎊\nOur team will contact you soon for the next steps.' : 'Keep practicing! 📚\nYou can retake the test after 24 hours.'}\n\n- YugaYatra Team`;
    
    try {
      const result = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: formattedPhone
      });
      
      console.log('✅ WhatsApp test results sent successfully:', result.sid);
      return { success: true, sid: result.sid };
    } catch (error) {
      console.error('❌ Failed to send WhatsApp test results:', error);
      return { success: false, error: error.message };
    }
  }

  // Send interview invitation WhatsApp message
  async sendInterviewInvitation(phone, name, interviewDetails) {
    if (!this.isConfigured) {
      return { success: false, error: 'WhatsApp service not configured' };
    }

    const formattedPhone = this.formatWhatsAppNumber(phone);
    const message = `*🎉 Interview Invitation - YugaYatra*\n\nCongratulations ${name}!\n\nYou have been selected for an interview.\n\n*📅 Date:* ${interviewDetails.date}\n*🕐 Time:* ${interviewDetails.time}\n*💻 Mode:* ${interviewDetails.mode}\n*👔 Type:* ${interviewDetails.type}\n*📍 Position:* ${interviewDetails.position}\n\n${interviewDetails.meetingLink ? `*🔗 Meeting Link:* ${interviewDetails.meetingLink}\n\n` : ''}*📞 Contact:* +91-9972037182\n\nBest of luck! 🍀\n\n- YugaYatra Team`;
    
    try {
      const result = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: formattedPhone
      });
      
      console.log('✅ WhatsApp interview invitation sent successfully:', result.sid);
      return { success: true, sid: result.sid };
    } catch (error) {
      console.error('❌ Failed to send WhatsApp interview invitation:', error);
      return { success: false, error: error.message };
    }
  }

  // Send custom WhatsApp message
  async sendCustomMessage(phone, message, options = {}) {
    if (!this.isConfigured) {
      return { success: false, error: 'WhatsApp service not configured' };
    }

    const formattedPhone = this.formatWhatsAppNumber(phone);
    
    try {
      const result = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: formattedPhone,
        ...options
      });
      
      console.log('✅ Custom WhatsApp message sent successfully:', result.sid);
      return { success: true, sid: result.sid };
    } catch (error) {
      console.error('❌ Failed to send custom WhatsApp message:', error);
      return { success: false, error: error.message };
    }
  }

  // Send bulk WhatsApp messages
  async sendBulkMessages(phoneNumbers, message, options = {}) {
    if (!this.isConfigured) {
      return { success: false, error: 'WhatsApp service not configured' };
    }

    const results = [];
    const delay = options.delay || 2000; // Default 2 second delay between messages

    for (const phone of phoneNumbers) {
      try {
        const result = await this.sendCustomMessage(phone, message, options);
        results.push({ phone, ...result });
        
        // Add delay between messages to avoid rate limiting
        if (delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      } catch (error) {
        results.push({ 
          phone, 
          success: false, 
          error: error.message 
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;

    console.log(`📊 Bulk WhatsApp messages: ${successCount} sent, ${failureCount} failed`);

    return {
      success: successCount > 0,
      results,
      summary: {
        total: results.length,
        sent: successCount,
        failed: failureCount
      }
    };
  }
}

module.exports = new WhatsAppService(); 