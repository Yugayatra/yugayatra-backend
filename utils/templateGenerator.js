const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

class TemplateGenerator {
  constructor() {
    this.templateDir = path.join(__dirname, '../templates');
    this.ensureTemplateDirectory();
  }

  ensureTemplateDirectory() {
    if (!fs.existsSync(this.templateDir)) {
      fs.mkdirSync(this.templateDir, { recursive: true });
    }
  }

  generateQuestionTemplate() {
    const headers = [
      'Question Text',
      'Option A',
      'Option B', 
      'Option C',
      'Option D',
      'Correct Answer (A/B/C/D)',
      'Category',
      'Difficulty (easy/moderate/hard)',
      'Explanation',
      'Tags (comma separated)',
      'Time Limit (seconds)',
      'Marks',
      'Negative Marks'
    ];

    const sampleData = [
      [
        'What does HTML stand for?',
        'Hyper Text Markup Language',
        'High Tech Modern Language',
        'Home Tool Markup Language',
        'Hyperlink Text Management Language',
        'A',
        'Web Development',
        'easy',
        'HTML stands for Hyper Text Markup Language, which is the standard markup language for creating web pages.',
        'html, web, markup',
        '60',
        '4',
        '-1'
      ]
    ];

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...sampleData]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Questions');

    const templatePath = path.join(this.templateDir, 'question_template.xlsx');
    XLSX.writeFile(workbook, templatePath);
    return templatePath;
  }

  generateUserTemplate() {
    const headers = [
      'Full Name',
      'Phone',
      'Email',
      'Date of Birth (YYYY-MM-DD)',
      'Gender (Male/Female/Other)',
      'Father Name',
      'Mother Name',
      'Street Address',
      'City',
      'State',
      'Pincode',
      'Education Qualification',
      'Specialization',
      'Institution',
      'Year of Passing',
      'Percentage/CGPA',
      'Experience (Years)',
      'Current Company',
      'Current Role',
      'Skills (comma separated)',
      'Emergency Contact Name',
      'Emergency Contact Phone',
      'Emergency Contact Relation'
    ];

    const sampleData = [
      [
        'John Doe',
        '9876543210',
        'john.doe@email.com',
        '1995-06-15',
        'Male',
        'Robert Doe',
        'Mary Doe',
        '123 Main Street',
        'Mumbai',
        'Maharashtra',
        '400001',
        'Graduate',
        'Computer Science',
        'Mumbai University',
        '2018',
        '85',
        '2',
        'Tech Corp',
        'Software Developer',
        'JavaScript, React, Node.js',
        'Robert Doe',
        '9876543211',
        'Father'
      ]
    ];

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...sampleData]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Users');

    // Set column widths
    worksheet['!cols'] = headers.map(() => ({ width: 20 }));

    const templatePath = path.join(this.templateDir, 'user_template.xlsx');
    XLSX.writeFile(workbook, templatePath);
    return templatePath;
  }

  generateInterviewTemplate() {
    const headers = [
      'Candidate Phone',
      'Candidate Email',
      'Interview Type (Technical/HR/Final/Group Discussion)',
      'Scheduled Date (YYYY-MM-DD)',
      'Scheduled Time (HH:MM)',
      'Duration (minutes)',
      'Interview Mode (Online/Offline)',
      'Position',
      'Department',
      'Interviewer Name',
      'Interviewer Email',
      'Interviewer Designation',
      'Meeting Link',
      'Location Address',
      'Location City',
      'Instructions',
      'Documents Required (comma separated)',
      'Notification Channels (email,sms,whatsapp)'
    ];

    const sampleData = [
      [
        '9876543210',
        'candidate@email.com',
        'Technical',
        '2024-01-15',
        '10:00',
        '60',
        'Online',
        'Software Developer',
        'Technology',
        'Jane Smith',
        'jane.smith@yugayatra.com',
        'Technical Lead',
        'https://meet.google.com/xyz-abc-def',
        '',
        '',
        'Please join 5 minutes early. Keep your resume and ID ready.',
        'Resume, ID Card, Educational Certificates',
        'email,sms'
      ]
    ];

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...sampleData]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Interviews');

    worksheet['!cols'] = headers.map(() => ({ width: 20 }));

    const templatePath = path.join(this.templateDir, 'interview_template.xlsx');
    XLSX.writeFile(workbook, templatePath);
    return templatePath;
  }

  generateTestConfigTemplate() {
    const headers = [
      'Test Name',
      'Description',
      'Duration (minutes)',
      'Total Questions',
      'Passing Percentage',
      'Max Attempts',
      'Negative Marking (true/false)',
      'Marks per Question',
      'Negative Marks',
      'Enable Proctoring (true/false)',
      'Random Questions (true/false)',
      'Show Results Immediately (true/false)',
      'Categories (comma separated)',
      'Difficulty Distribution (easy:moderate:hard)'
    ];

    const sampleData = [
      [
        'JavaScript Developer Test',
        'Comprehensive test for JavaScript developer role',
        '60',
        '50',
        '70',
        '3',
        'true',
        '4',
        '-1',
        'true',
        'true',
        'false',
        'JavaScript, React, Node.js, Database',
        '30:40:30'
      ]
    ];

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...sampleData]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Test Configuration');

    worksheet['!cols'] = headers.map(() => ({ width: 25 }));

    const templatePath = path.join(this.templateDir, 'test_config_template.xlsx');
    XLSX.writeFile(workbook, templatePath);
    return templatePath;
  }

  getTemplate(type) {
    switch (type.toLowerCase()) {
      case 'question':
      case 'questions':
        return this.generateQuestionTemplate();
      case 'user':
      case 'users':
        return this.generateUserTemplate();
      case 'interview':
      case 'interviews':
        return this.generateInterviewTemplate();
      case 'test':
      case 'tests':
        return this.generateTestConfigTemplate();
      default:
        throw new Error('Invalid template type');
    }
  }

  getAllTemplates() {
    return {
      question: this.generateQuestionTemplate(),
      user: this.generateUserTemplate(),
      interview: this.generateInterviewTemplate(),
      test: this.generateTestConfigTemplate()
    };
  }

  validateQuestionData(data) {
    const errors = [];
    const requiredFields = ['questionText', 'optionA', 'optionB', 'optionC', 'optionD', 'correctAnswer', 'category', 'difficulty'];
    
    data.forEach((row, index) => {
      const rowErrors = [];
      
      requiredFields.forEach(field => {
        if (!row[field] || String(row[field]).trim() === '') {
          rowErrors.push(`${field} is required`);
        }
      });

      if (row.correctAnswer && !['A', 'B', 'C', 'D'].includes(row.correctAnswer.toUpperCase())) {
        rowErrors.push('Correct answer must be A, B, C, or D');
      }

      if (row.difficulty && !['easy', 'moderate', 'hard'].includes(row.difficulty.toLowerCase())) {
        rowErrors.push('Difficulty must be easy, moderate, or hard');
      }

      if (rowErrors.length > 0) {
        errors.push({
          row: index + 2, // +2 because Excel rows start from 1 and first row is header
          errors: rowErrors
        });
      }
    });

    return errors;
  }

  validateUserData(data) {
    const errors = [];
    const requiredFields = ['fullName', 'phone', 'email', 'dateOfBirth', 'gender'];
    
    data.forEach((row, index) => {
      const rowErrors = [];
      
      requiredFields.forEach(field => {
        if (!row[field] || String(row[field]).trim() === '') {
          rowErrors.push(`${field} is required`);
        }
      });

      // Validate phone number
      if (row.phone && !/^\d{10}$/.test(row.phone)) {
        rowErrors.push('Phone number must be 10 digits');
      }

      // Validate email
      if (row.email && !/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(row.email)) {
        rowErrors.push('Invalid email format');
      }

      // Validate gender
      if (row.gender && !['Male', 'Female', 'Other', 'Prefer not to say'].includes(row.gender)) {
        rowErrors.push('Gender must be Male, Female, Other, or Prefer not to say');
      }

      if (rowErrors.length > 0) {
        errors.push({
          row: index + 2,
          errors: rowErrors
        });
      }
    });

    return errors;
  }

  validateInterviewData(data) {
    const errors = [];
    const requiredFields = ['candidatePhone', 'interviewType', 'scheduledDate', 'scheduledTime', 'position', 'interviewerName'];
    
    data.forEach((row, index) => {
      const rowErrors = [];
      
      requiredFields.forEach(field => {
        if (!row[field] || String(row[field]).trim() === '') {
          rowErrors.push(`${field} is required`);
        }
      });

      // Validate interview type
      if (row.interviewType && !['Technical', 'HR', 'Final', 'Group Discussion'].includes(row.interviewType)) {
        rowErrors.push('Interview type must be Technical, HR, Final, or Group Discussion');
      }

      // Validate interview mode
      if (row.interviewMode && !['Online', 'Offline'].includes(row.interviewMode)) {
        rowErrors.push('Interview mode must be Online or Offline');
      }

      // Validate date format
      if (row.scheduledDate && !/^\d{4}-\d{2}-\d{2}$/.test(row.scheduledDate)) {
        rowErrors.push('Scheduled date must be in YYYY-MM-DD format');
      }

      // Validate time format
      if (row.scheduledTime && !/^\d{2}:\d{2}$/.test(row.scheduledTime)) {
        rowErrors.push('Scheduled time must be in HH:MM format');
      }

      if (rowErrors.length > 0) {
        errors.push({
          row: index + 2,
          errors: rowErrors
        });
      }
    });

    return errors;
  }
}

module.exports = new TemplateGenerator(); 