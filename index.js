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
  origin: process.env.NODE_ENV === 'production' ? false : true, // Configure for production
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
    message: 'Contacts Importer Backend API',
    version: '1.0.0',
    status: 'operational',
    environment: process.env.NODE_ENV || 'development',
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
    message: 'Contacts Importer Backend - API Documentation',
    endpoints: {
      authentication: {
        'POST /api/auth/register': 'Register new user',
        'POST /api/auth/login': 'Login user',
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
        'DELETE /api/contacts/:id': 'Delete contact',
        'DELETE /api/contacts/:id/lists/:listId': 'Remove contact from list'
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
      refreshTokenTTL: '7 days',
      note: 'Import endpoints are public and do not require authentication'
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
  
  if (err.message === 'Only CSV and JSON files are allowed') {
    return res.status(400).json({
      success: false,
      message: err.message
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

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start server
const startServer = async () => {
  try {
    // Connect to database
    await connectDB();
    
    const PORT = config.server.port;
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`API Documentation: http://localhost:${PORT}/api/docs`);
      console.log(`Health Check: http://localhost:${PORT}/`);
      console.log(`Environment: ${config.server.nodeEnv}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
