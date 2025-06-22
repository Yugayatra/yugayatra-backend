const express = require('express');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const Question = require('../models/Question');
const { protectAdmin, checkPermission } = require('../middleware/auth');

const router = express.Router();

// Multer configuration for CSV upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/questions';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `questions-${uniqueSuffix}.csv`);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Question validation rules
const questionValidation = [
  body('questionText')
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage('Question text must be between 10 and 1000 characters'),
  body('questionType')
    .isIn(['Multiple Choice', 'True/False', 'Fill in the Blank'])
    .withMessage('Invalid question type'),
  body('category')
    .isIn([
      'General Knowledge',
      'Logical Reasoning',
      'Quantitative Aptitude',
      'English Language',
      'Computer Knowledge',
      'Current Affairs',
      'Technical Knowledge',
      'Analytical Reasoning',
      'Verbal Ability',
      'Data Interpretation'
    ])
    .withMessage('Invalid category'),
  body('difficulty')
    .isIn(['Easy', 'Moderate', 'Hard'])
    .withMessage('Invalid difficulty level'),
  body('points')
    .optional()
    .isInt({ min: 1, max: 10 })
    .withMessage('Points must be between 1 and 10'),
  body('negativePoints')
    .optional()
    .isInt({ min: 0, max: 5 })
    .withMessage('Negative points must be between 0 and 5')
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

// @route   GET /api/questions
// @desc    Get all questions with filtering and pagination
// @access  Private (Admin)
router.get('/', protectAdmin, checkPermission('questions', 'view'), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const {
      category,
      difficulty,
      status,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;
    
    // Build query
    const query = {};
    
    if (category) query.category = category;
    if (difficulty) query.difficulty = difficulty;
    if (status) query.status = status;
    
    if (search) {
      query.$or = [
        { questionText: { $regex: search, $options: 'i' } },
        { subcategory: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }
    
    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    const questions = await Question.find(query)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('approvedBy', 'fullName');
    
    const totalQuestions = await Question.countDocuments(query);
    
    res.status(200).json({
      success: true,
      data: {
        questions: questions,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalQuestions / limit),
          totalQuestions: totalQuestions,
          hasNextPage: page < Math.ceil(totalQuestions / limit),
          hasPrevPage: page > 1
        }
      }
    });
    
  } catch (error) {
    console.error('Get Questions Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get questions'
    });
  }
});

// @route   GET /api/questions/:id
// @desc    Get single question by ID
// @access  Private (Admin)
router.get('/:id', protectAdmin, checkPermission('questions', 'view'), async (req, res) => {
  try {
    const question = await Question.findById(req.params.id)
      .populate('approvedBy', 'fullName');
    
    if (!question) {
      return res.status(404).json({
        success: false,
        error: 'Question not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: {
        question: question
      }
    });
    
  } catch (error) {
    console.error('Get Question Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get question'
    });
  }
});

// @route   POST /api/questions
// @desc    Create new question
// @access  Private (Admin)
router.post('/', 
  protectAdmin, 
  checkPermission('questions', 'create'),
  questionValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const questionData = {
        ...req.body,
        createdBy: req.admin.fullName,
        lastModifiedBy: req.admin.fullName
      };
      
      // Validate options for multiple choice questions
      if (questionData.questionType === 'Multiple Choice') {
        if (!questionData.options || questionData.options.length < 2) {
          return res.status(400).json({
            success: false,
            error: 'Multiple choice questions must have at least 2 options'
          });
        }
        
        const correctOptions = questionData.options.filter(opt => opt.isCorrect);
        if (correctOptions.length !== 1) {
          return res.status(400).json({
            success: false,
            error: 'Multiple choice questions must have exactly one correct answer'
          });
        }
      }
      
      // Validate correct answer for other question types
      if (questionData.questionType !== 'Multiple Choice' && !questionData.correctAnswer) {
        return res.status(400).json({
          success: false,
          error: 'Correct answer is required for this question type'
        });
      }
      
      const question = new Question(questionData);
      await question.save();
      
      // Update admin stats
      await req.admin.updateQuestionStats('created');
      
      res.status(201).json({
        success: true,
        message: 'Question created successfully',
        data: {
          question: question
        }
      });
      
    } catch (error) {
      console.error('Create Question Error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create question'
      });
    }
  }
);

// @route   PUT /api/questions/:id
// @desc    Update question
// @access  Private (Admin)
router.put('/:id',
  protectAdmin,
  checkPermission('questions', 'edit'),
  questionValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const question = await Question.findById(req.params.id);
      
      if (!question) {
        return res.status(404).json({
          success: false,
          error: 'Question not found'
        });
      }
      
      // Create version before updating
      const changeReason = req.body.changeReason || 'Question updated';
      await question.createVersion(req.body, changeReason, req.admin.fullName);
      
      // Update admin stats
      await req.admin.updateQuestionStats('edited');
      
      res.status(200).json({
        success: true,
        message: 'Question updated successfully',
        data: {
          question: question
        }
      });
      
    } catch (error) {
      console.error('Update Question Error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update question'
      });
    }
  }
);

// @route   DELETE /api/questions/:id
// @desc    Delete question
// @access  Private (Admin)
router.delete('/:id', protectAdmin, checkPermission('questions', 'delete'), async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    
    if (!question) {
      return res.status(404).json({
        success: false,
        error: 'Question not found'
      });
    }
    
    // Check if question is being used in any active tests
    const Test = require('../models/Test');
    const activeTests = await Test.countDocuments({
      'questions.questionId': question._id,
      status: { $in: ['In Progress', 'Scheduled'] }
    });
    
    if (activeTests > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete question that is being used in active tests'
      });
    }
    
    // Soft delete by changing status to Archived
    question.status = 'Archived';
    question.lastModifiedBy = req.admin.fullName;
    question.lastModifiedAt = new Date();
    
    await question.save();
    
    // Update admin stats
    await req.admin.updateQuestionStats('deleted');
    
    res.status(200).json({
      success: true,
      message: 'Question deleted successfully'
    });
    
  } catch (error) {
    console.error('Delete Question Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete question'
    });
  }
});

// @route   POST /api/questions/:id/approve
// @desc    Approve question
// @access  Private (Admin)
router.post('/:id/approve', protectAdmin, checkPermission('questions', 'approve'), async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    
    if (!question) {
      return res.status(404).json({
        success: false,
        error: 'Question not found'
      });
    }
    
    question.isApproved = true;
    question.status = 'Active';
    question.approvedBy = req.admin._id;
    question.approvedAt = new Date();
    
    if (req.body.reviewComments) {
      question.reviewComments.push(req.body.reviewComments);
    }
    
    await question.save();
    
    // Update admin stats
    await req.admin.updateQuestionStats('approved');
    
    res.status(200).json({
      success: true,
      message: 'Question approved successfully',
      data: {
        question: question
      }
    });
    
  } catch (error) {
    console.error('Approve Question Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to approve question'
    });
  }
});

// @route   POST /api/questions/:id/reject
// @desc    Reject question
// @access  Private (Admin)
router.post('/:id/reject', protectAdmin, checkPermission('questions', 'approve'), async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    
    if (!question) {
      return res.status(404).json({
        success: false,
        error: 'Question not found'
      });
    }
    
    question.isApproved = false;
    question.status = 'Inactive';
    
    if (req.body.rejectionReason) {
      question.reviewComments.push(`REJECTED: ${req.body.rejectionReason}`);
    }
    
    await question.save();
    
    // Update admin stats
    await req.admin.updateQuestionStats('rejected');
    
    res.status(200).json({
      success: true,
      message: 'Question rejected successfully',
      data: {
        question: question
      }
    });
    
  } catch (error) {
    console.error('Reject Question Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reject question'
    });
  }
});

// @route   POST /api/questions/bulk-upload
// @desc    Bulk upload questions via CSV
// @access  Private (Admin)
router.post('/bulk-upload', 
  protectAdmin, 
  checkPermission('questions', 'bulkUpload'),
  upload.single('csvFile'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'CSV file is required'
        });
      }
      
      const questions = [];
      const errors = [];
      let lineNumber = 1;
      
      // Read and parse CSV file
      const csvData = await new Promise((resolve, reject) => {
        const results = [];
        
        fs.createReadStream(req.file.path)
          .pipe(csv())
          .on('data', (data) => {
            lineNumber++;
            results.push({ ...data, lineNumber });
          })
          .on('end', () => {
            resolve(results);
          })
          .on('error', (error) => {
            reject(error);
          });
      });
      
      // Process each row
      for (const row of csvData) {
        try {
          // Validate required fields
          if (!row.questionText || !row.category || !row.difficulty) {
            errors.push({
              line: row.lineNumber,
              error: 'Missing required fields: questionText, category, difficulty'
            });
            continue;
          }
          
          // Parse options for multiple choice questions
          let options = [];
          if (row.questionType === 'Multiple Choice') {
            if (!row.options) {
              errors.push({
                line: row.lineNumber,
                error: 'Options are required for multiple choice questions'
              });
              continue;
            }
            
            try {
              const optionData = JSON.parse(row.options);
              options = optionData.map(opt => ({
                text: opt.text,
                isCorrect: opt.isCorrect === true || opt.isCorrect === 'true'
              }));
              
              // Validate options
              if (options.length < 2) {
                errors.push({
                  line: row.lineNumber,
                  error: 'Multiple choice questions must have at least 2 options'
                });
                continue;
              }
              
              const correctOptions = options.filter(opt => opt.isCorrect);
              if (correctOptions.length !== 1) {
                errors.push({
                  line: row.lineNumber,
                  error: 'Multiple choice questions must have exactly one correct answer'
                });
                continue;
              }
            } catch (parseError) {
              errors.push({
                line: row.lineNumber,
                error: 'Invalid options format. Expected JSON array.'
              });
              continue;
            }
          }
          
          // Create question object
          const questionData = {
            questionText: row.questionText.trim(),
            questionType: row.questionType || 'Multiple Choice',
            category: row.category,
            subcategory: row.subcategory || '',
            difficulty: row.difficulty,
            points: parseInt(row.points) || (row.difficulty === 'Easy' ? 2 : row.difficulty === 'Hard' ? 4 : 3),
            negativePoints: parseInt(row.negativePoints) || 1,
            options: options,
            correctAnswer: row.correctAnswer || '',
            explanation: row.explanation || '',
            tags: row.tags ? row.tags.split(',').map(tag => tag.trim()) : [],
            source: row.source || '',
            author: row.author || '',
            createdBy: req.admin.fullName,
            status: 'Draft'
          };
          
          questions.push(questionData);
          
        } catch (error) {
          errors.push({
            line: row.lineNumber,
            error: error.message
          });
        }
      }
      
      // Insert valid questions
      let insertedCount = 0;
      if (questions.length > 0) {
        try {
          const insertedQuestions = await Question.insertMany(questions, { ordered: false });
          insertedCount = insertedQuestions.length;
        } catch (insertError) {
          // Handle duplicate key errors and other insertion errors
          if (insertError.writeErrors) {
            insertError.writeErrors.forEach(writeError => {
              errors.push({
                line: writeError.index + 2, // +2 because of header row and 0-based index
                error: writeError.errmsg
              });
            });
            insertedCount = insertError.result.nInserted || 0;
          } else {
            throw insertError;
          }
        }
      }
      
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);
      
      res.status(200).json({
        success: true,
        message: `Bulk upload completed. ${insertedCount} questions inserted.`,
        data: {
          totalProcessed: csvData.length,
          successful: insertedCount,
          failed: errors.length,
          errors: errors.slice(0, 10) // Limit errors shown to first 10
        }
      });
      
    } catch (error) {
      console.error('Bulk Upload Error:', error);
      
      // Clean up uploaded file
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      
      res.status(500).json({
        success: false,
        error: 'Bulk upload failed'
      });
    }
  }
);

// @route   GET /api/questions/template/download
// @desc    Download CSV template for bulk upload
// @access  Private (Admin)
router.get('/template/download', protectAdmin, checkPermission('questions', 'bulkUpload'), (req, res) => {
  try {
    const templatePath = path.join(__dirname, '..', 'templates', 'questions_template.csv');
    
    // Create template if it doesn't exist
    if (!fs.existsSync(templatePath)) {
      const templateDir = path.dirname(templatePath);
      if (!fs.existsSync(templateDir)) {
        fs.mkdirSync(templateDir, { recursive: true });
      }
      
      const templateContent = `questionText,questionType,category,subcategory,difficulty,points,negativePoints,options,correctAnswer,explanation,tags,source,author
"What is the capital of India?","Multiple Choice","General Knowledge","Geography","Easy",2,1,"[{""text"":""New Delhi"",""isCorrect"":true},{""text"":""Mumbai"",""isCorrect"":false},{""text"":""Kolkata"",""isCorrect"":false},{""text"":""Chennai"",""isCorrect"":false}]","","Delhi is the capital and New Delhi is the seat of government","geography,india,capital","Sample Source","Sample Author"
"The Earth is flat","True/False","General Knowledge","Science","Easy",2,1,"","False","The Earth is approximately spherical in shape","science,earth,geography","Sample Source","Sample Author"`;
      
      fs.writeFileSync(templatePath, templateContent);
    }
    
    res.download(templatePath, 'questions_template.csv', (err) => {
      if (err) {
        console.error('Template Download Error:', err);
        res.status(500).json({
          success: false,
          error: 'Failed to download template'
        });
      }
    });
    
  } catch (error) {
    console.error('Template Download Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to download template'
    });
  }
});

// @route   GET /api/questions/stats
// @desc    Get question statistics
// @access  Private (Admin)
router.get('/stats/overview', protectAdmin, checkPermission('questions', 'view'), async (req, res) => {
  try {
    const stats = await Question.aggregate([
      {
        $group: {
          _id: null,
          totalQuestions: { $sum: 1 },
          activeQuestions: { $sum: { $cond: [{ $eq: ['$status', 'Active'] }, 1, 0] } },
          approvedQuestions: { $sum: { $cond: ['$isApproved', 1, 0] } },
          draftQuestions: { $sum: { $cond: [{ $eq: ['$status', 'Draft'] }, 1, 0] } },
          avgQualityScore: { $avg: '$qualityScore' }
        }
      }
    ]);
    
    const categoryStats = await Question.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          activeCount: { $sum: { $cond: [{ $eq: ['$status', 'Active'] }, 1, 0] } }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);
    
    const difficultyStats = await Question.aggregate([
      {
        $group: {
          _id: '$difficulty',
          count: { $sum: 1 },
          avgSuccessRate: { $avg: '$successRate' }
        }
      }
    ]);
    
    res.status(200).json({
      success: true,
      data: {
        overview: stats[0] || {
          totalQuestions: 0,
          activeQuestions: 0,
          approvedQuestions: 0,
          draftQuestions: 0,
          avgQualityScore: 0
        },
        categoryBreakdown: categoryStats,
        difficultyBreakdown: difficultyStats
      }
    });
    
  } catch (error) {
    console.error('Question Stats Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get question statistics'
    });
  }
});

module.exports = router; 