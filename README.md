# YugaYatra Test System Backend API

A comprehensive backend API system for managing internship tests, user authentication, question banks, and administrative operations for YugaYatra Retail (OPC) Pvt Ltd.

## 🚀 Features

### Core Functionality

- **User Management**: Registration, OTP verification, profile management
- **Test System**: Timed tests with multiple question types, proctoring, and auto-evaluation
- **Question Bank**: CRUD operations, bulk upload via CSV, approval workflow
- **Admin Panel**: Dashboard, analytics, candidate management, reporting
- **Authentication**: JWT-based auth with role-based permissions
- **Notifications**: Email and SMS integration for OTP and results

### Security Features

- Rate limiting and request validation
- Secure file uploads with type validation
- Input sanitization and SQL injection prevention
- JWT token blacklisting for secure logout
- Admin activity logging and audit trails

## 📋 Prerequisites

- Node.js (v14 or higher)
- MongoDB (v4.4 or higher)
- Gmail account for email service
- Twilio account for SMS service (optional)

## 🛠️ Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd YugaYatra-Website/backend
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Environment Configuration**

   Create a `.env` file in the backend directory with the following variables:

   ```env
   # Database Configuration
   MONGODB_URI=mongodb://localhost:27017/yugayatra_test_db
   DB_NAME=yugayatra_test_db
   
   # JWT Configuration
   JWT_SECRET=your_super_secret_jwt_key_here
   JWT_EXPIRE=7d
   
   # Server Configuration
   PORT=5000
   NODE_ENV=development
   
   # Email Configuration (Gmail)
   EMAIL_SERVICE=gmail
   EMAIL_USER=your_email@gmail.com
   EMAIL_PASS=your_app_specific_password
   EMAIL_FROM=your_email@gmail.com
   
   # Twilio SMS Configuration (Optional)
   TWILIO_ACCOUNT_SID=your_twilio_account_sid
   TWILIO_AUTH_TOKEN=your_twilio_auth_token
   TWILIO_PHONE_NUMBER=+1234567890
   
   # Admin Configuration
   ADMIN_PHONE=9972037182
   ADMIN_EMAIL=admin@yugayatra.com
   
   # Test Configuration
   TEST_DURATION_MINUTES=30
   MAX_ATTEMPTS=5
   PASSING_PERCENTAGE=65
   QUESTIONS_PER_TEST=30
   
   # Security
   BCRYPT_SALT_ROUNDS=12
   RATE_LIMIT_WINDOW_MS=900000
   RATE_LIMIT_MAX_REQUESTS=100
   ```

4. **Setup Gmail App Password**

   - Go to your Google Account settings
   - Enable 2-Factor Authentication
   - Generate an App Password for "Mail"
   - Use this password in `EMAIL_PASS`

5. **Setup Twilio (Optional)**

   - Create a Twilio account
   - Get your Account SID and Auth Token
   - Purchase a phone number
   - Add credentials to `.env`

## 🚦 Running the Application

### Development Mode

```bash
npm run dev
```

### Production Mode

```bash
npm start
```

The server will start on `http://localhost:5000` (or your specified PORT).

## 📊 Database Setup

The application uses MongoDB with Mongoose ODM. The database will be automatically created when you first run the application.

### Collections Created

- **users**: Candidate profiles and test information
- **questions**: Question bank with categories and difficulty levels
- **tests**: Test sessions and results
- **admins**: Admin users with permissions

## 🔐 API Authentication

### User Authentication

```javascript
// Registration
POST /api/auth/register
{
  "phone": "9876543210",
  "email": "user@example.com",
  "fullName": "John Doe",
  "termsAccepted": "true",
  "dataProcessingConsent": "true"
}

// OTP Verification
POST /api/auth/verify-otp
{
  "phone": "9876543210",
  "otp": "123456"
}

// Login
POST /api/auth/login
{
  "phone": "9876543210"
}
```

### Admin Authentication

```javascript
// Admin Login (restricted to configured phone number)
POST /api/auth/admin/login
{
  "phone": "9972037182"
}

// Admin OTP Verification
POST /api/auth/admin/verify
{
  "phone": "9972037182",
  "otp": "123456"
}
```

## 📝 API Endpoints

### Authentication Routes (`/api/auth`)

- `POST /register` - User registration
- `POST /verify-otp` - Verify registration OTP
- `POST /login` - User login
- `POST /login-verify` - Verify login OTP
- `POST /resend-otp` - Resend OTP
- `POST /logout` - User logout
- `GET /me` - Get current user info
- `POST /admin/login` - Admin login
- `POST /admin/verify` - Admin OTP verification
- `POST /admin/logout` - Admin logout
- `GET /admin/me` - Get current admin info

### User Routes (`/api/users`)

- `GET /profile` - Get user profile
- `PUT /profile` - Update user profile (with file uploads)
- `GET /test-eligibility` - Check test eligibility
- `GET /test-history` - Get user's test history
- `GET /test-result/:testId` - Get detailed test result
- `PUT /change-phone` - Change phone number
- `DELETE /account` - Delete user account

### Question Routes (`/api/questions`)

- `GET /` - Get all questions (with filtering)
- `GET /:id` - Get single question
- `POST /` - Create new question
- `PUT /:id` - Update question
- `DELETE /:id` - Delete question
- `POST /:id/approve` - Approve question
- `POST /:id/reject` - Reject question
- `POST /bulk-upload` - Bulk upload via CSV
- `GET /template/download` - Download CSV template
- `GET /stats/overview` - Get question statistics

### Test Routes (`/api/tests`)

- `POST /start` - Start new test session
- `POST /begin/:testId` - Begin test (start timer)
- `PUT /answer/:testId` - Submit answer
- `PUT /flag/:testId` - Flag question for review
- `POST /submit/:testId` - Submit test
- `GET /status/:testId` - Get test status
- `POST /proctoring/:testId` - Report violations

### Admin Routes (`/api/admin`)

- `GET /dashboard` - Admin dashboard overview
- `GET /analytics` - Detailed analytics
- `GET /candidates` - Get candidates list
- `GET /candidate/:id` - Get candidate details
- `PUT /candidate/:id/status` - Update candidate status
- `POST /bulk-notification` - Send bulk notifications
- `GET /reports/export` - Export data reports
- `GET /activity-log` - Admin activity log
- `POST /system/backup` - Create system backup

## 📤 File Upload Endpoints

### User Profile Files

```javascript
PUT /api/users/profile
Content-Type: multipart/form-data

Fields:
- photo: Image file (JPG, PNG) - max 5MB
- resume: PDF or DOC file - max 5MB
- idCard: Image or PDF file - max 5MB
- profile: JSON string with profile data
```

### Bulk Question Upload

```javascript
POST /api/questions/bulk-upload
Content-Type: multipart/form-data

Fields:
- csvFile: CSV file with question data
```

## 📋 CSV Template for Questions

Download the template from `/api/questions/template/download` or use this format:

```csv
questionText,questionType,category,subcategory,difficulty,points,negativePoints,options,correctAnswer,explanation,tags,source,author
"What is the capital of India?","Multiple Choice","General Knowledge","Geography","Easy",2,1,"[{""text"":""New Delhi"",""isCorrect"":true},{""text"":""Mumbai"",""isCorrect"":false}]","","Delhi is the capital","geography,india","Sample","Author"
```

## 🔧 Configuration Options

### Test Configuration

- `TEST_DURATION_MINUTES`: Test duration (default: 30)
- `QUESTIONS_PER_TEST`: Number of questions (default: 30)
- `MAX_ATTEMPTS`: Maximum test attempts (default: 5)
- `PASSING_PERCENTAGE`: Passing percentage (default: 65)

### Question Distribution

- Easy: 30% of questions
- Moderate: 30% of questions
- Hard: 40% of questions

### Scoring System

- Correct Answer: +3 points (Easy), +3 points (Moderate), +4 points (Hard)
- Wrong Answer: -1 point
- Unanswered: 0 points

## 🚀 Deployment

### Using PM2 (Recommended)

```bash
# Install PM2 globally
npm install -g pm2

# Start the application
pm2 start server.js --name yugayatra-api

# Save PM2 configuration
pm2 save

# Setup PM2 to start on system boot
pm2 startup
```

### Environment Variables for Production

```env
NODE_ENV=production
MONGODB_URI=mongodb://your-production-db-url
JWT_SECRET=your-super-secure-production-secret
EMAIL_USER=your-production-email
EMAIL_PASS=your-production-password
```

### Nginx Configuration (Optional)

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location /api {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 🐛 Troubleshooting

### Common Issues

1. **MongoDB Connection Error**
   - Ensure MongoDB is running
   - Check connection string in `.env`
   - Verify network connectivity

2. **Email Service Not Working**
   - Enable 2FA on Gmail
   - Generate and use App Password
   - Check firewall settings

3. **SMS Service Not Working**
   - Verify Twilio credentials
   - Check phone number format
   - Ensure account has credits

4. **JWT Token Issues**
   - Ensure JWT_SECRET is set
   - Check token expiration settings
   - Verify token format in requests

### Debug Mode

```bash
# Enable debug logging
DEBUG=* npm run dev

# Enable only app debugging
DEBUG=yugayatra:* npm run dev
```

## 📈 Monitoring & Logging

### Health Check

```bash
curl http://localhost:5000/health
```

### Log Files

- Application logs: Console output
- Error logs: Captured by PM2
- Access logs: Can be configured with Morgan

### Performance Monitoring

- Database query performance
- API response times
- Memory usage tracking
- Error rate monitoring

## 🤝 Contributing

1. Follow the existing code structure
2. Add proper error handling
3. Include input validation
4. Write clear commit messages
5. Test thoroughly before pushing

## 📞 Support

For technical support or questions:

- Email: [yugayatraretail@gmail.com](mailto:yugayatraretail@gmail.com)
- Phone: +91-9972037182

## 📄 License

This project is proprietary to YugaYatra Retail (OPC) Pvt Ltd.

---

**Last Updated**: December 2024
**Version**: 1.0.0
