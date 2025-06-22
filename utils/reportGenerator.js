const PDFDocument = require('pdfkit');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const Test = require('../models/Test');
const Question = require('../models/Question');
const Interview = require('../models/Interview');

class ReportGenerator {
  constructor() {
    this.reportsDir = path.join(__dirname, '../reports');
    this.ensureReportsDirectory();
  }

  ensureReportsDirectory() {
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }
  }

  // Generate comprehensive candidate performance report
  async generateCandidateReport(candidateId, format = 'pdf') {
    try {
      const candidate = await User.findById(candidateId).populate('testHistory');
      if (!candidate) {
        throw new Error('Candidate not found');
      }

      const tests = await Test.find({ user: candidateId }).sort({ createdAt: -1 });
      const interviews = await Interview.find({ candidate: candidateId }).sort({ scheduledDate: -1 });

      const reportData = {
        candidate: {
          id: candidate._id,
          name: candidate.fullName,
          email: candidate.email,
          phone: candidate.phone,
          registrationDate: candidate.createdAt,
          status: candidate.status,
          qualification: candidate.profile?.education?.qualification,
          institution: candidate.profile?.education?.institution
        },
        testSummary: {
          totalAttempts: tests.length,
          bestScore: candidate.testInfo?.bestScore || 0,
          hasQualified: candidate.testInfo?.hasQualified || false,
          lastAttemptDate: candidate.testInfo?.lastAttemptDate
        },
        tests: tests.map(test => ({
          id: test._id,
          attemptNumber: test.attemptNumber,
          score: test.result?.score || 0,
          percentage: test.result?.percentage || 0,
          status: test.status,
          startTime: test.startTime,
          endTime: test.endTime,
          duration: test.result?.timeTaken,
          violations: test.proctoring?.violations?.length || 0
        })),
        interviews: interviews.map(interview => ({
          id: interview._id,
          type: interview.interviewType,
          scheduledDate: interview.scheduledDate,
          status: interview.status,
          position: interview.position,
          feedback: interview.evaluation?.feedback
        }))
      };

      if (format === 'pdf') {
        return await this.generateCandidatePDF(reportData);
      } else if (format === 'excel') {
        return await this.generateCandidateExcel(reportData);
      } else {
        return { success: false, error: 'Unsupported format' };
      }
    } catch (error) {
      console.error('Error generating candidate report:', error);
      return { success: false, error: error.message };
    }
  }

  // Generate system analytics report
  async generateAnalyticsReport(dateRange, format = 'pdf') {
    try {
      const { startDate, endDate } = dateRange;
      
      // Get statistics
      const totalUsers = await User.countDocuments({
        createdAt: { $gte: startDate, $lte: endDate }
      });

      const totalTests = await Test.countDocuments({
        createdAt: { $gte: startDate, $lte: endDate }
      });

      const passedTests = await Test.countDocuments({
        createdAt: { $gte: startDate, $lte: endDate },
        'result.isPassed': true
      });

      const totalQuestions = await Question.countDocuments();
      const totalInterviews = await Interview.countDocuments({
        createdAt: { $gte: startDate, $lte: endDate }
      });

      // Category-wise performance
      const categoryPerformance = await Test.aggregate([
        { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
        { $unwind: '$result.categoryWiseScore' },
        {
          $group: {
            _id: '$result.categoryWiseScore.category',
            avgScore: { $avg: '$result.categoryWiseScore.percentage' },
            totalTests: { $sum: 1 }
          }
        }
      ]);

      // Daily registration trend
      const registrationTrend = await User.aggregate([
        { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      const reportData = {
        period: { startDate, endDate },
        summary: {
          totalUsers,
          totalTests,
          passedTests,
          passRate: totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(2) : 0,
          totalQuestions,
          totalInterviews
        },
        categoryPerformance,
        registrationTrend,
        generatedAt: new Date()
      };

      if (format === 'pdf') {
        return await this.generateAnalyticsPDF(reportData);
      } else if (format === 'excel') {
        return await this.generateAnalyticsExcel(reportData);
      } else {
        return { success: false, error: 'Unsupported format' };
      }
    } catch (error) {
      console.error('Error generating analytics report:', error);
      return { success: false, error: error.message };
    }
  }

  // Generate PDF report for candidate
  async generateCandidatePDF(data) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument();
        const filename = `candidate_report_${data.candidate.id}_${Date.now()}.pdf`;
        const filepath = path.join(this.reportsDir, filename);
        
        doc.pipe(fs.createWriteStream(filepath));

        // Header
        doc.fontSize(20).text('YugaYatra - Candidate Performance Report', 50, 50);
        doc.fontSize(12).text(`Generated on: ${new Date().toLocaleDateString()}`, 50, 80);

        // Candidate Information
        doc.fontSize(16).text('Candidate Information', 50, 120);
        doc.fontSize(12)
           .text(`Name: ${data.candidate.name}`, 50, 150)
           .text(`Email: ${data.candidate.email}`, 50, 170)
           .text(`Phone: ${data.candidate.phone}`, 50, 190)
           .text(`Registration Date: ${new Date(data.candidate.registrationDate).toLocaleDateString()}`, 50, 210)
           .text(`Status: ${data.candidate.status}`, 50, 230);

        // Test Summary
        doc.fontSize(16).text('Test Performance Summary', 50, 270);
        doc.fontSize(12)
           .text(`Total Attempts: ${data.testSummary.totalAttempts}`, 50, 300)
           .text(`Best Score: ${data.testSummary.bestScore}%`, 50, 320)
           .text(`Qualification Status: ${data.testSummary.hasQualified ? 'Qualified' : 'Not Qualified'}`, 50, 340);

        // Test Details
        if (data.tests.length > 0) {
          doc.fontSize(16).text('Test History', 50, 380);
          let yPos = 410;
          
          data.tests.forEach((test, index) => {
            if (yPos > 700) {
              doc.addPage();
              yPos = 50;
            }
            
            doc.fontSize(12)
               .text(`Attempt ${test.attemptNumber}: ${test.percentage}% - ${test.status}`, 50, yPos)
               .text(`Date: ${new Date(test.startTime).toLocaleDateString()}`, 70, yPos + 20);
            yPos += 50;
          });
        }

        doc.end();

        doc.on('end', () => {
          resolve({
            success: true,
            filename,
            filepath,
            size: fs.statSync(filepath).size
          });
        });

        doc.on('error', (error) => {
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  // Generate Excel report for candidate
  async generateCandidateExcel(data) {
    try {
      const workbook = XLSX.utils.book_new();

      // Candidate Info Sheet
      const candidateSheet = XLSX.utils.json_to_sheet([{
        'Name': data.candidate.name,
        'Email': data.candidate.email,
        'Phone': data.candidate.phone,
        'Registration Date': new Date(data.candidate.registrationDate).toLocaleDateString(),
        'Status': data.candidate.status,
        'Total Attempts': data.testSummary.totalAttempts,
        'Best Score': data.testSummary.bestScore,
        'Qualified': data.testSummary.hasQualified ? 'Yes' : 'No'
      }]);

      // Test History Sheet
      const testHistorySheet = XLSX.utils.json_to_sheet(
        data.tests.map((test, index) => ({
          'Attempt': test.attemptNumber,
          'Score': test.percentage + '%',
          'Status': test.status,
          'Date': new Date(test.startTime).toLocaleDateString(),
          'Duration': test.duration || 'N/A',
          'Violations': test.violations
        }))
      );

      XLSX.utils.book_append_sheet(workbook, candidateSheet, 'Candidate Info');
      XLSX.utils.book_append_sheet(workbook, testHistorySheet, 'Test History');

      const filename = `candidate_report_${data.candidate.id}_${Date.now()}.xlsx`;
      const filepath = path.join(this.reportsDir, filename);
      
      XLSX.writeFile(workbook, filepath);

      return {
        success: true,
        filename,
        filepath,
        size: fs.statSync(filepath).size
      };
    } catch (error) {
      throw error;
    }
  }

  // Generate analytics PDF
  async generateAnalyticsPDF(data) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument();
        const filename = `analytics_report_${Date.now()}.pdf`;
        const filepath = path.join(this.reportsDir, filename);
        
        doc.pipe(fs.createWriteStream(filepath));

        // Header
        doc.fontSize(20).text('YugaYatra - System Analytics Report', 50, 50);
        doc.fontSize(12).text(`Period: ${new Date(data.period.startDate).toLocaleDateString()} - ${new Date(data.period.endDate).toLocaleDateString()}`, 50, 80);
        doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 50, 100);

        // Summary Statistics
        doc.fontSize(16).text('Summary Statistics', 50, 140);
        doc.fontSize(12)
           .text(`Total Users: ${data.summary.totalUsers}`, 50, 170)
           .text(`Total Tests: ${data.summary.totalTests}`, 50, 190)
           .text(`Passed Tests: ${data.summary.passedTests}`, 50, 210)
           .text(`Pass Rate: ${data.summary.passRate}%`, 50, 230)
           .text(`Total Questions: ${data.summary.totalQuestions}`, 50, 250)
           .text(`Total Interviews: ${data.summary.totalInterviews}`, 50, 270);

        // Category Performance
        if (data.categoryPerformance.length > 0) {
          doc.fontSize(16).text('Category-wise Performance', 50, 310);
          let yPos = 340;
          
          data.categoryPerformance.forEach(category => {
            doc.fontSize(12).text(`${category._id}: ${category.avgScore.toFixed(2)}% (${category.totalTests} tests)`, 50, yPos);
            yPos += 20;
          });
        }

        doc.end();

        doc.on('end', () => {
          resolve({
            success: true,
            filename,
            filepath,
            size: fs.statSync(filepath).size
          });
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  // Generate analytics Excel
  async generateAnalyticsExcel(data) {
    try {
      const workbook = XLSX.utils.book_new();

      // Summary Sheet
      const summarySheet = XLSX.utils.json_to_sheet([{
        'Total Users': data.summary.totalUsers,
        'Total Tests': data.summary.totalTests,
        'Passed Tests': data.summary.passedTests,
        'Pass Rate (%)': data.summary.passRate,
        'Total Questions': data.summary.totalQuestions,
        'Total Interviews': data.summary.totalInterviews
      }]);

      // Category Performance Sheet
      const categorySheet = XLSX.utils.json_to_sheet(
        data.categoryPerformance.map(cat => ({
          'Category': cat._id,
          'Average Score (%)': cat.avgScore.toFixed(2),
          'Total Tests': cat.totalTests
        }))
      );

      // Registration Trend Sheet
      const trendSheet = XLSX.utils.json_to_sheet(
        data.registrationTrend.map(trend => ({
          'Date': trend._id,
          'Registrations': trend.count
        }))
      );

      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');
      XLSX.utils.book_append_sheet(workbook, categorySheet, 'Category Performance');
      XLSX.utils.book_append_sheet(workbook, trendSheet, 'Registration Trend');

      const filename = `analytics_report_${Date.now()}.xlsx`;
      const filepath = path.join(this.reportsDir, filename);
      
      XLSX.writeFile(workbook, filepath);

      return {
        success: true,
        filename,
        filepath,
        size: fs.statSync(filepath).size
      };
    } catch (error) {
      throw error;
    }
  }

  // Generate test results export
  async generateTestResultsExport(filters = {}) {
    try {
      const query = {};
      
      if (filters.dateRange) {
        query.createdAt = {
          $gte: new Date(filters.dateRange.start),
          $lte: new Date(filters.dateRange.end)
        };
      }
      
      if (filters.status) {
        query.status = filters.status;
      }

      const tests = await Test.find(query)
        .populate('user', 'fullName email phone')
        .sort({ createdAt: -1 });

      const exportData = tests.map(test => ({
        'Test ID': test._id,
        'Candidate Name': test.user?.fullName || 'N/A',
        'Email': test.user?.email || 'N/A',
        'Phone': test.user?.phone || 'N/A',
        'Attempt Number': test.attemptNumber,
        'Score': test.result?.score || 0,
        'Percentage': (test.result?.percentage || 0) + '%',
        'Status': test.status,
        'Passed': test.result?.isPassed ? 'Yes' : 'No',
        'Start Time': new Date(test.startTime).toLocaleString(),
        'End Time': test.endTime ? new Date(test.endTime).toLocaleString() : 'N/A',
        'Duration (minutes)': test.result?.timeTaken || 'N/A',
        'Violations': test.proctoring?.violations?.length || 0
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Test Results');

      const filename = `test_results_export_${Date.now()}.xlsx`;
      const filepath = path.join(this.reportsDir, filename);
      
      XLSX.writeFile(workbook, filepath);

      return {
        success: true,
        filename,
        filepath,
        totalRecords: exportData.length,
        size: fs.statSync(filepath).size
      };
    } catch (error) {
      console.error('Error generating test results export:', error);
      return { success: false, error: error.message };
    }
  }

  // Clean up old reports
  cleanupOldReports(daysToKeep = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const files = fs.readdirSync(this.reportsDir);
      let deletedCount = 0;

      files.forEach(file => {
        const filepath = path.join(this.reportsDir, file);
        const stats = fs.statSync(filepath);
        
        if (stats.mtime < cutoffDate) {
          fs.unlinkSync(filepath);
          deletedCount++;
        }
      });

      console.log(`🧹 Cleaned up ${deletedCount} old reports`);
      return { success: true, deletedCount };
    } catch (error) {
      console.error('Error cleaning up old reports:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new ReportGenerator(); 