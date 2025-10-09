const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const connectDB = require('./models/database');
const config = require('./config');

// Import routes
const authRoutes = require('./routes/auth');
const teamRoutes = require('./routes/teams');
const listRoutes = require('./routes/lists');
const contactRoutes = require('./routes/contacts');
const importsRoutes = require('./routes/imports-simple');

// Import middleware
const { apiLimiter } = require('./middleware/rateLimiter');

const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : true,
  credentials: true
}));

// Rate limiting
app.use(apiLimiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Contacts Importer Microservice API (MongoDB Only)',
    version: '1.0.0',
    status: 'healthy',
    database: 'MongoDB Atlas',
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/lists', listRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/imports', importsRoutes);

// API documentation endpoint
app.get('/api/docs', (req, res) => {
  res.json({
    success: true,
    message: 'Contacts Importer API Documentation (MongoDB Only)',
    database: 'MongoDB Atlas Connected',
    note: 'Import endpoints working with synchronous processing (no Redis needed)',
    endpoints: {
      authentication: {
        'POST /api/auth/register': 'Register new user',
        'POST /api/auth/login': 'Login user (returns access + refresh tokens)',
        'POST /api/auth/refresh': 'Refresh tokens',
        'GET /api/auth/verify': 'Verify JWT token'
      },
      teams: {
        'GET /api/teams': 'Get user teams',
        'POST /api/teams': 'Create team',
        'GET /api/teams/:id': 'Get team details',
        'PUT /api/teams/:id': 'Update team',
        'DELETE /api/teams/:id': 'Delete team',
        'POST /api/teams/:id/members': 'Add team member',
        'DELETE /api/teams/:id/members/:userId': 'Remove team member'
      },
      lists: {
        'GET /api/lists/team/:teamId': 'Get team lists',
        'POST /api/lists': 'Create list',
        'GET /api/lists/:id': 'Get list details',
        'PUT /api/lists/:id': 'Update list',
        'DELETE /api/lists/:id': 'Delete list',
        'GET /api/lists/:id/stats': 'Get list statistics'
      },
      contacts: {
        'GET /api/contacts/list/:listId': 'Get list contacts',
        'POST /api/contacts': 'Create contact',
        'GET /api/contacts/:id': 'Get contact details',
        'PUT /api/contacts/:id': 'Update contact',
        'DELETE /api/contacts/:id': 'Delete contact'
      },
      imports: {
        'POST /api/imports/submit': 'Submit import job (PUBLIC, requires Idempotency-Key)',
        'GET /api/imports/status/:jobId': 'Get job status (PUBLIC)',
        'GET /api/imports/:jobId/result': 'Get job result (AUTH required)'
      }
    },
    authentication: {
      type: 'JWT Bearer Token',
      header: 'Authorization: Bearer <token>',
      accessTokenTTL: '15 minutes',
      refreshTokenTTL: '7 days'
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      message: 'File too large. Maximum size is 10MB.'
    });
  }
  
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: config.server.nodeEnv === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    availableEndpoints: '/api/docs'
  });
});

// Start server
const startServer = async () => {
  try {
    // Connect to database
    await connectDB();
    
    const PORT = config.server.port;
    app.listen(PORT, () => {
      console.log(`🚀 Contacts Importer Microservice (MongoDB Only) running on port ${PORT}`);
      console.log(`📚 API Documentation: http://localhost:${PORT}/api/docs`);
      console.log(`🏥 Health Check: http://localhost:${PORT}/`);
      console.log(`🗄️  Database: MongoDB Atlas Connected`);
      console.log(`⚠️  Note: Import endpoints require Redis setup`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
