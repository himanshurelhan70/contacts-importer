const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const store = require('./models/inMemoryStore');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// JWT secret
const JWT_SECRET = 'dev_secret_key_change_in_production_123456789';

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Contacts Importer Microservice API (In-Memory Mode)',
    version: '1.0.0',
    status: 'healthy',
    mode: 'in-memory',
    timestamp: new Date().toISOString()
  });
});

// Authentication middleware
const authenticate = (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = store.findUserById(decoded.userId);
    
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token or user not found.'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Invalid token.'
    });
  }
};

// AUTH ROUTES
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name, role = 'member' } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        message: 'Email, password, and name are required'
      });
    }

    // Check if user exists
    const existingUser = store.findUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const user = store.createUser({
      email: email.toLowerCase(),
      password: hashedPassword,
      name,
      role,
      isActive: true
    });

    // Generate token
    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Remove password from response
    const { password: _, ...userResponse } = user;

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: { user: userResponse, token }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error registering user',
      error: error.message
    });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Find user
    const user = store.findUserByEmail(email);
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Generate token
    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Remove password from response
    const { password: _, ...userResponse } = user;

    res.json({
      success: true,
      message: 'Login successful',
      data: { user: userResponse, token }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error during login',
      error: error.message
    });
  }
});

// TEAM ROUTES
app.get('/api/teams', authenticate, (req, res) => {
  try {
    const teams = store.getUserTeams(req.user._id);
    res.json({ success: true, data: teams });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching teams',
      error: error.message
    });
  }
});

app.post('/api/teams', authenticate, (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Team name is required'
      });
    }

    const team = store.createTeam({
      name,
      description,
      owner: req.user._id,
      members: [{
        user: req.user._id,
        role: 'admin',
        joinedAt: new Date()
      }],
      isActive: true
    });

    res.status(201).json({
      success: true,
      message: 'Team created successfully',
      data: team
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating team',
      error: error.message
    });
  }
});

// LIST ROUTES
app.get('/api/lists/team/:teamId', authenticate, (req, res) => {
  try {
    const { teamId } = req.params;
    const lists = store.getTeamLists(teamId);
    res.json({ success: true, data: lists });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching lists',
      error: error.message
    });
  }
});

app.post('/api/lists', authenticate, (req, res) => {
  try {
    const { name, description, teamId, tags } = req.body;

    if (!name || !teamId) {
      return res.status(400).json({
        success: false,
        message: 'Name and teamId are required'
      });
    }

    const list = store.createList({
      name,
      description,
      team: teamId,
      createdBy: req.user._id,
      tags: tags || [],
      isActive: true,
      permissions: {
        canImport: true,
        canExport: true
      }
    });

    res.status(201).json({
      success: true,
      message: 'List created successfully',
      data: list
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating list',
      error: error.message
    });
  }
});

// CONTACT ROUTES
app.get('/api/contacts/list/:listId', authenticate, (req, res) => {
  try {
    const { listId } = req.params;
    const { page, limit, search } = req.query;
    
    const result = store.getListContacts(listId, { page, limit, search });
    
    res.json({
      success: true,
      data: {
        contacts: result.contacts,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          pages: result.pages
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching contacts',
      error: error.message
    });
  }
});

// IMPORT ROUTES (PUBLIC)
app.post('/api/imports/submit', (req, res) => {
  try {
    const { listId, data, ttl = 60, tags } = req.body;

    if (!listId || !data) {
      return res.status(400).json({
        success: false,
        message: 'listId and data are required'
      });
    }

    // Verify list exists
    const list = store.findListById(listId);
    if (!list || !list.isActive) {
      return res.status(404).json({
        success: false,
        message: 'List not found or inactive'
      });
    }

    // Generate job ID
    const jobId = uuidv4();
    const expiresAt = new Date(Date.now() + (ttl * 1000));

    // Parse data
    const contacts = Array.isArray(data) ? data : JSON.parse(data);

    // Create import job
    const importJob = store.createImportJob({
      jobId,
      listId,
      team: list.team,
      status: 'queued',
      phase: 'pending',
      ttl,
      expiresAt,
      sourceData: JSON.stringify(contacts),
      sourceType: 'json',
      totalRecords: contacts.length,
      tags: tags || []
    });

    // Add to queue for processing
    store.addJobToQueue({
      jobId,
      listId,
      sourceData: contacts,
      tags: tags || []
    });

    res.status(202).json({
      success: true,
      message: 'Import job submitted successfully',
      data: {
        jobId,
        status: 'queued',
        estimatedProcessingTime: `${Math.ceil(contacts.length / 100)} seconds`,
        expiresAt,
        totalRecords: contacts.length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error submitting import job',
      error: error.message
    });
  }
});

app.get('/api/imports/status/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;
    
    const importJob = store.findImportJobById(jobId);
    if (!importJob) {
      return res.status(404).json({
        success: false,
        message: 'Import job not found'
      });
    }

    // Calculate progress
    const now = new Date();
    const elapsedSeconds = Math.floor((now - importJob.createdAt) / 1000);
    const progress = importJob.status === 'completed' ? 100 : Math.min((elapsedSeconds / importJob.ttl) * 100, 100);

    res.json({
      success: true,
      data: {
        jobId: importJob.jobId,
        status: importJob.status,
        phase: importJob.phase,
        progress: Math.floor(progress),
        totalRecords: importJob.totalRecords,
        processedRecords: importJob.processedRecords || 0,
        successfulRecords: importJob.successfulRecords || 0,
        failedRecords: importJob.failedRecords || 0,
        duplicateRecords: importJob.duplicateRecords || 0,
        errors: importJob.errors || [],
        createdAt: importJob.createdAt,
        startedAt: importJob.startedAt,
        completedAt: importJob.completedAt,
        expiresAt: importJob.expiresAt,
        processingTime: importJob.processingTime
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error checking job status',
      error: error.message
    });
  }
});

// API Documentation
app.get('/api/docs', (req, res) => {
  res.json({
    success: true,
    message: 'Contacts Importer API Documentation (In-Memory Mode)',
    mode: 'in-memory',
    note: 'This version runs without MongoDB/Redis for easy testing',
    endpoints: {
      authentication: {
        'POST /api/auth/register': 'Register new user',
        'POST /api/auth/login': 'Login user'
      },
      teams: {
        'GET /api/teams': 'Get user teams',
        'POST /api/teams': 'Create team'
      },
      lists: {
        'GET /api/lists/team/:teamId': 'Get team lists',
        'POST /api/lists': 'Create list'
      },
      contacts: {
        'GET /api/contacts/list/:listId': 'Get list contacts'
      },
      imports: {
        'POST /api/imports/submit': 'Submit import job (PUBLIC)',
        'GET /api/imports/status/:jobId': 'Get job status (PUBLIC)'
      }
    },
    sampleData: {
      register: {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User'
      },
      createTeam: {
        name: 'Sales Team',
        description: 'Main sales team'
      },
      createList: {
        name: 'Prospects',
        description: 'Sales prospects',
        teamId: 'TEAM_ID_HERE'
      },
      importData: {
        listId: 'LIST_ID_HERE',
        data: [
          {
            email: 'john@example.com',
            firstName: 'John',
            lastName: 'Doe',
            phone: '+1-555-0123',
            company: 'Example Corp'
          }
        ]
      }
    }
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: err.message
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

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 Contacts Importer Microservice (In-Memory Mode) running on port ${PORT}`);
  console.log(`📚 API Documentation: http://localhost:${PORT}/api/docs`);
  console.log(`🏥 Health Check: http://localhost:${PORT}/`);
  console.log(`💡 This version runs without MongoDB/Redis for easy testing`);
  console.log(`\n🎯 Quick Start:`);
  console.log(`1. Visit: http://localhost:${PORT}/api/docs`);
  console.log(`2. Register a user: POST /api/auth/register`);
  console.log(`3. Create a team and list`);
  console.log(`4. Submit an import job`);
});
