const mongoose = require('mongoose');

class DatabaseConfig {
  constructor() {
    this.connectionString = process.env.MONGODB_URI || 'mongodb://localhost:27017/yugayatra_test_db';
    
    // Validate MongoDB URI in production
    if (process.env.NODE_ENV === 'production' && !process.env.MONGODB_URI) {
      console.error('❌ MONGODB_URI environment variable is required in production');
      process.exit(1);
    }
    
    this.options = {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000, // Increased timeout
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000, // Added connection timeout
      family: 4 // Force IPv4
    };
  }

  async connect() {
    try {
      mongoose.set('strictQuery', false);
      
      const conn = await mongoose.connect(this.connectionString, this.options);
      
      console.log(`🗄️  MongoDB Connected: ${conn.connection.host}`);
      console.log(`📊 Database: ${conn.connection.name}`);
      
      // Handle connection events
      this.handleConnectionEvents();
      
      return conn;
    } catch (error) {
      console.error('❌ Database connection error:', error.message);
      process.exit(1);
    }
  }

  handleConnectionEvents() {
    mongoose.connection.on('connected', () => {
      console.log('✅ Mongoose connected to MongoDB');
    });

    mongoose.connection.on('error', (err) => {
      console.error('❌ Mongoose connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('⚠️  Mongoose disconnected from MongoDB');
    });

    // Handle process termination
    process.on('SIGINT', async () => {
      try {
        await mongoose.connection.close();
        console.log('📋 Mongoose connection closed through app termination');
        process.exit(0);
      } catch (error) {
        console.error('❌ Error closing mongoose connection:', error);
        process.exit(1);
      }
    });
  }

  async disconnect() {
    try {
      await mongoose.connection.close();
      console.log('📋 Database connection closed');
    } catch (error) {
      console.error('❌ Error closing database connection:', error);
    }
  }

  getConnectionStatus() {
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };
    
    return {
      status: states[mongoose.connection.readyState],
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      name: mongoose.connection.name
    };
  }

  async createIndexes() {
    try {
      console.log('🔍 Creating database indexes...');
      
      // User collection indexes
      await mongoose.connection.db.collection('users').createIndexes([
        { key: { phone: 1 }, unique: true },
        { key: { email: 1 }, unique: true },
        { key: { 'testInfo.lastAttemptDate': -1 } },
        { key: { createdAt: -1 } },
        { key: { 'otp.expiresAt': 1 }, expireAfterSeconds: 0 }
      ]);

      // Question collection indexes
      await mongoose.connection.db.collection('questions').createIndexes([
        { key: { category: 1, difficulty: 1 } },
        { key: { status: 1 } },
        { key: { createdAt: -1 } }
      ]);

      // Test collection indexes
      await mongoose.connection.db.collection('tests').createIndexes([
        { key: { user: 1, createdAt: -1 } },
        { key: { status: 1 } },
        { key: { createdAt: -1 } }
      ]);

      // Interview collection indexes
      await mongoose.connection.db.collection('interviews').createIndexes([
        { key: { candidate: 1 } },
        { key: { scheduledDate: 1 } },
        { key: { status: 1 } },
        { key: { createdAt: -1 } }
      ]);

      // Admin collection indexes
      await mongoose.connection.db.collection('admins').createIndexes([
        { key: { phone: 1 }, unique: true },
        { key: { email: 1 }, sparse: true, unique: true },
        { key: { 'otp.expiresAt': 1 }, expireAfterSeconds: 0 }
      ]);

      console.log('✅ Database indexes created successfully');
    } catch (error) {
      console.error('❌ Error creating database indexes:', error);
    }
  }
}

module.exports = new DatabaseConfig(); 