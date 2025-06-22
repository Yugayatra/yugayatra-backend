const emailService = require('./emailService');
const smsService = require('./smsService');
const whatsappService = require('./whatsappService');
const cron = require('node-cron');

class NotificationService {
  constructor() {
    this.scheduledJobs = new Map();
    this.setupScheduledJobs();
  }

  /**
   * Send notification via multiple channels
   */
  async sendMultiChannelNotification(recipient, type, data, channels = ['email']) {
    const results = {};
    
    try {
      // Send Email
      if (channels.includes('email') && recipient.email) {
        results.email = await this.sendEmailNotification(recipient, type, data);
      }

      // Send SMS
      if (channels.includes('sms') && recipient.phone) {
        results.sms = await this.sendSMSNotification(recipient, type, data);
      }

      // Send WhatsApp
      if (channels.includes('whatsapp') && recipient.phone) {
        results.whatsapp = await this.sendWhatsAppNotification(recipient, type, data);
      }

      return {
        success: true,
        results
      };
    } catch (error) {
      console.error('Multi-channel notification error:', error);
      return {
        success: false,
        error: error.message,
        results
      };
    }
  }

  /**
   * Send email notification
   */
  async sendEmailNotification(recipient, type, data) {
    try {
      switch (type) {
        case 'otp':
          return await emailService.sendOTPEmail(recipient.email, data.otp, recipient.name);
        
        case 'test_invitation':
          return await emailService.sendTestInvitation(recipient.email, recipient.name, data);
        
        case 'test_reminder':
          return await emailService.sendTestReminder(recipient.email, recipient.name, data);
        
        case 'test_results':
          return await emailService.sendTestResults(recipient.email, recipient.name, data);
        
        case 'interview_invitation':
          return await emailService.sendInterviewInvitation(recipient.email, recipient.name, data);
        
        case 'interview_reminder':
          return await emailService.sendInterviewReminder(recipient.email, recipient.name, data);
        
        case 'interview_confirmation':
          return await emailService.sendInterviewConfirmation(recipient.email, recipient.name, data);
        
        case 'interview_reschedule':
          return await emailService.sendInterviewReschedule(recipient.email, recipient.name, data);
        
        default:
          throw new Error('Unknown email notification type');
      }
    } catch (error) {
      console.error('Email notification error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send SMS notification
   */
  async sendSMSNotification(recipient, type, data) {
    try {
      switch (type) {
        case 'otp':
          return await smsService.sendOTP(recipient.phone, data.otp, recipient.name);
        
        case 'test_invitation':
          return await smsService.sendTestInvitation(recipient.phone, recipient.name, data);
        
        case 'test_reminder':
          return await smsService.sendTestReminder(recipient.phone, recipient.name, data);
        
        case 'test_results':
          return await smsService.sendTestResults(recipient.phone, recipient.name, data);
        
        case 'interview_invitation':
          return await smsService.sendInterviewInvitation(recipient.phone, recipient.name, data);
        
        case 'interview_reminder':
          return await smsService.sendInterviewReminder(recipient.phone, recipient.name, data);
        
        default:
          throw new Error('Unknown SMS notification type');
      }
    } catch (error) {
      console.error('SMS notification error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send WhatsApp notification
   */
  async sendWhatsAppNotification(recipient, type, data) {
    try {
      switch (type) {
        case 'otp':
          return await whatsappService.sendOTP(recipient.phone, data.otp, recipient.name);
        
        case 'test_invitation':
          return await whatsappService.sendTestInvitation(recipient.phone, recipient.name, data);
        
        case 'interview_invitation':
          return await whatsappService.sendInterviewInvitation(recipient.phone, recipient.name, data);
        
        default:
          throw new Error('Unknown WhatsApp notification type');
      }
    } catch (error) {
      console.error('WhatsApp notification error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Schedule notification for future delivery
   */
  async scheduleNotification(recipient, type, data, deliveryTime, channels = ['email']) {
    const jobId = `${type}_${recipient.phone || recipient.email}_${Date.now()}`;
    const cronExpression = this.convertToCronExpression(deliveryTime);
    
    try {
      const job = cron.schedule(cronExpression, async () => {
        console.log(`Executing scheduled notification: ${jobId}`);
        await this.sendMultiChannelNotification(recipient, type, data, channels);
        this.scheduledJobs.delete(jobId);
      }, {
        scheduled: false
      });

      job.start();
      this.scheduledJobs.set(jobId, job);

      return {
        success: true,
        jobId,
        scheduledFor: deliveryTime
      };
    } catch (error) {
      console.error('Schedule notification error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Cancel scheduled notification
   */
  cancelScheduledNotification(jobId) {
    const job = this.scheduledJobs.get(jobId);
    if (job) {
      job.destroy();
      this.scheduledJobs.delete(jobId);
      return { success: true };
    }
    return { success: false, error: 'Job not found' };
  }

  /**
   * Setup recurring notification jobs
   */
  setupScheduledJobs() {
    // Daily reminder for pending test invitations (9 AM)
    cron.schedule('0 9 * * *', async () => {
      console.log('Running daily test reminder job...');
      await this.sendDailyTestReminders();
    });

    // Interview reminders (every hour from 8 AM to 8 PM)
    cron.schedule('0 8-20 * * *', async () => {
      console.log('Running hourly interview reminder job...');
      await this.sendInterviewReminders();
    });

    // Weekly digest for admins (Monday 10 AM)
    cron.schedule('0 10 * * 1', async () => {
      console.log('Running weekly admin digest job...');
      await this.sendWeeklyDigest();
    });
  }

  /**
   * Send daily test reminders
   */
  async sendDailyTestReminders() {
    try {
      const User = require('../models/User');
      const pendingUsers = await User.find({
        'testInfo.hasQualified': false,
        'testInfo.totalAttempts': { $lt: 5 },
        isVerified: true,
        status: 'Active',
        createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
      });

      for (const user of pendingUsers) {
        const notificationChannels = user.preferences?.notifications || ['email'];
        
        await this.sendMultiChannelNotification(
          {
            name: user.fullName,
            email: user.email,
            phone: user.phone
          },
          'test_reminder',
          {
            testLink: process.env.FRONTEND_URL + '/test',
            attemptsRemaining: 5 - user.testInfo.totalAttempts
          },
          notificationChannels
        );
      }

      console.log(`Sent daily test reminders to ${pendingUsers.length} users`);
    } catch (error) {
      console.error('Daily test reminder error:', error);
    }
  }

  /**
   * Send interview reminders
   */
  async sendInterviewReminders() {
    try {
      const Interview = require('../models/Interview');
      const now = new Date();
      const reminderTime = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours from now

      const upcomingInterviews = await Interview.find({
        scheduledDate: {
          $gte: now,
          $lte: reminderTime
        },
        status: 'Scheduled',
        reminderSent: false
      }).populate('candidate', 'fullName email phone preferences');

      for (const interview of upcomingInterviews) {
        const notificationChannels = interview.candidate.preferences?.notifications || ['email', 'sms'];
        
        await this.sendMultiChannelNotification(
          {
            name: interview.candidate.fullName,
            email: interview.candidate.email,
            phone: interview.candidate.phone
          },
          'interview_reminder',
          {
            date: interview.scheduledDate.toLocaleDateString(),
            time: interview.scheduledDate.toLocaleTimeString(),
            type: interview.interviewType,
            meetingLink: interview.meetingLink,
            interviewer: interview.interviewer
          },
          notificationChannels
        );

        // Mark reminder as sent
        interview.reminderSent = true;
        await interview.save();
      }

      console.log(`Sent interview reminders for ${upcomingInterviews.length} interviews`);
    } catch (error) {
      console.error('Interview reminder error:', error);
    }
  }

  /**
   * Send weekly digest to admins
   */
  async sendWeeklyDigest() {
    try {
      const User = require('../models/User');
      const Test = require('../models/Test');
      const Interview = require('../models/Interview');
      
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      
      // Get weekly stats
      const [newUsers, completedTests, scheduledInterviews] = await Promise.all([
        User.countDocuments({ createdAt: { $gte: weekAgo } }),
        Test.countDocuments({ createdAt: { $gte: weekAgo }, status: 'Evaluated' }),
        Interview.countDocuments({ createdAt: { $gte: weekAgo } })
      ]);

      const digestData = {
        period: 'Last 7 days',
        stats: {
          newUsers,
          completedTests,
          scheduledInterviews
        }
      };

      // Send to admin email
      await emailService.sendWeeklyDigest(
        process.env.ADMIN_EMAIL,
        'Admin',
        digestData
      );

      console.log('Weekly digest sent to admin');
    } catch (error) {
      console.error('Weekly digest error:', error);
    }
  }

  /**
   * Send bulk notifications
   */
  async sendBulkNotifications(recipients, type, data, channels = ['email']) {
    const results = [];
    const batchSize = 10;
    
    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);
      const batchPromises = batch.map(recipient => 
        this.sendMultiChannelNotification(recipient, type, data, channels)
      );
      
      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults);
      
      // Add delay between batches to avoid rate limiting
      if (i + batchSize < recipients.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    return {
      total: recipients.length,
      successful: results.filter(r => r.status === 'fulfilled' && r.value.success).length,
      failed: results.filter(r => r.status === 'rejected' || !r.value.success).length,
      results
    };
  }

  /**
   * Convert Date to cron expression
   */
  convertToCronExpression(date) {
    const d = new Date(date);
    return `${d.getMinutes()} ${d.getHours()} ${d.getDate()} ${d.getMonth() + 1} *`;
  }

  /**
   * Get notification preferences for user
   */
  getUserNotificationPreferences(user) {
    return user.preferences?.notifications || ['email'];
  }

  /**
   * Update user notification preferences
   */
  async updateNotificationPreferences(userId, preferences) {
    try {
      const User = require('../models/User');
      await User.findByIdAndUpdate(userId, {
        'preferences.notifications': preferences
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = new NotificationService(); 