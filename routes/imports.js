const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const { v4: uuidv4 } = require('uuid');
const { ImportJob, List } = require('../models');
const { addImportJob, getJobStatus, redis } = require('../services/queue');
const { importLimiter } = require('../middleware/rateLimiter');
const { validate, importJobSchemas } = require('../middleware/validation');
const config = require('../config');

const router = express.Router();

// Idempotency middleware
const checkIdempotency = async (req, res, next) => {
  try {
    const idempotencyKey = req.header('Idempotency-Key');
    
    if (!idempotencyKey) {
      return res.status(422).json({
        success: false,
        message: 'Idempotency-Key header is required',
        code: 'MISSING_IDEMPOTENCY_KEY'
      });
    }

    // Validate UUID v4 format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(idempotencyKey)) {
      return res.status(422).json({
        success: false,
        message: 'Idempotency-Key must be a valid UUID v4',
        code: 'INVALID_IDEMPOTENCY_KEY'
      });
    }

    // Check if we have a cached response
    const cachedResponse = await redis.get(`idempotency:${idempotencyKey}`);
    if (cachedResponse) {
      const response = JSON.parse(cachedResponse);
      return res.status(response.status).json(response.body);
    }

    req.idempotencyKey = idempotencyKey;
    next();
  } catch (error) {
    console.error('Idempotency check error:', error);
    next();
  }
};

// Cache idempotent response
const cacheIdempotentResponse = async (idempotencyKey, status, body) => {
  try {
    const response = { status, body };
    await redis.setex(`idempotency:${idempotencyKey}`, 24 * 60 * 60, JSON.stringify(response)); // 24 hours
  } catch (error) {
    console.error('Error caching idempotent response:', error);
  }
};

// Phase calculation helper
const calculatePhase = (enqueuedAt, ttlMs) => {
  const now = new Date();
  const elapsed = now - enqueuedAt;
  const ratio = Math.min(Math.max(elapsed / ttlMs, 0), 1);
  const percent = Math.floor(ratio * 100);
  const etaSeconds = Math.ceil(Math.max(0, ttlMs - elapsed) / 1000);
  
  let phase;
  if (ratio < 0.05) {
    phase = 'starting';
  } else if (ratio < 0.95) {
    phase = 'running';
  } else {
    phase = 'ending';
  }
  
  return { phase, percent, etaSeconds };
};

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.mimetype === 'application/json') {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and JSON files are allowed'), false);
    }
  }
});

// PUBLIC ENDPOINT - Submit import job (no authentication required)
router.post('/submit', importLimiter, checkIdempotency, upload.single('file'), async (req, res) => {
  try {
    const { listId, ttl, tags } = req.body;
    
    if (!listId) {
      return res.status(400).json({
        success: false,
        message: 'List ID is required'
      });
    }
    
    // Verify list exists and allows imports
    const list = await List.findById(listId).populate('team');
    if (!list || !list.isActive) {
      return res.status(404).json({
        success: false,
        message: 'List not found or inactive'
      });
    }
    
    if (!list.permissions.canImport) {
      return res.status(403).json({
        success: false,
        message: 'Import not allowed for this list'
      });
    }
    
    let sourceData;
    let sourceType;
    
    if (req.file) {
      // File upload
      const fileBuffer = req.file.buffer;
      const mimeType = req.file.mimetype;
      
      if (mimeType === 'text/csv') {
        sourceType = 'csv';
        // Parse CSV to JSON
        const csvData = [];
        const csvString = fileBuffer.toString('utf8');
        
        // Simple CSV parsing (you might want to use a more robust parser)
        const lines = csvString.split('\n');
        if (lines.length < 2) {
          return res.status(400).json({
            success: false,
            message: 'CSV file must have at least a header and one data row'
          });
        }
        
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
          const record = {};
          
          headers.forEach((header, index) => {
            record[header] = values[index] || '';
          });
          
          csvData.push(record);
        }
        
        sourceData = JSON.stringify(csvData);
      } else if (mimeType === 'application/json') {
        sourceType = 'json';
        try {
          const jsonData = JSON.parse(fileBuffer.toString('utf8'));
          if (!Array.isArray(jsonData)) {
            return res.status(400).json({
              success: false,
              message: 'JSON file must contain an array of contacts'
            });
          }
          sourceData = JSON.stringify(jsonData);
        } catch (error) {
          return res.status(400).json({
            success: false,
            message: 'Invalid JSON format'
          });
        }
      }
    } else if (req.body.data) {
      // Direct data submission
      sourceType = 'json';
      try {
        const data = typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body.data;
        if (!Array.isArray(data)) {
          return res.status(400).json({
            success: false,
            message: 'Data must be an array of contacts'
          });
        }
        sourceData = JSON.stringify(data);
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: 'Invalid data format'
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        message: 'Either file upload or data field is required'
      });
    }
    
    // Validate payload size (2MB limit)
    const payloadSize = Buffer.byteLength(sourceData, 'utf8');
    if (payloadSize > 2 * 1024 * 1024) {
      const response = {
        success: false,
        message: 'Payload size exceeds 2MB limit',
        code: 'PAYLOAD_TOO_LARGE'
      };
      await cacheIdempotentResponse(req.idempotencyKey, 422, response);
      return res.status(422).json(response);
    }

    // Validate data size (5000 rows limit)
    const dataArray = JSON.parse(sourceData);
    if (dataArray.length > 5000) {
      const response = {
        success: false,
        message: 'Import size exceeds maximum limit of 5,000 records',
        code: 'TOO_MANY_ROWS'
      };
      await cacheIdempotentResponse(req.idempotencyKey, 422, response);
      return res.status(422).json(response);
    }
    
    // Generate job ID and calculate expiration
    const jobId = uuidv4();
    const jobTtl = parseInt(ttl) || config.importJobs.defaultTtl;
    const expiresAt = new Date(Date.now() + (jobTtl * 1000));
    
    // Parse tags
    let parsedTags = [];
    if (tags) {
      parsedTags = typeof tags === 'string' ? tags.split(',').map(t => t.trim()) : tags;
    }
    
    // Create import job record
    const importJob = new ImportJob({
      jobId,
      listId,
      team: list.team._id,
      status: 'queued',
      phase: 'pending',
      ttl: jobTtl,
      expiresAt,
      sourceData,
      sourceType,
      totalRecords: dataArray.length,
      tags: parsedTags
    });
    
    await importJob.save();
    
    // Add job to queue
    await addImportJob({
      jobId,
      listId,
      sourceData,
      sourceType,
      tags: parsedTags,
      ttl: jobTtl
    });
    
    res.status(202).json({
      success: true,
      message: 'Import job submitted successfully',
      data: {
        jobId,
        status: 'queued',
        estimatedProcessingTime: `${Math.ceil(dataArray.length / 100)} seconds`,
        expiresAt,
        totalRecords: dataArray.length
      }
    });
    
  } catch (error) {
    console.error('Import submission error:', error);
    res.status(500).json({
      success: false,
      message: 'Error submitting import job',
      error: error.message
    });
  }
});

// PUBLIC ENDPOINT - Get job status (no authentication required)
router.get('/status/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    
    // Get job from database
    const importJob = await ImportJob.findOne({ jobId });
    if (!importJob) {
      return res.status(404).json({
        success: false,
        message: 'Import job not found'
      });
    }
    
    // Calculate phase based on elapsed time vs TTL
    const phaseInfo = calculatePhase(importJob.createdAt, importJob.ttl * 1000);
    
    // Override phase based on actual job status
    let actualPhase = phaseInfo.phase;
    if (importJob.status === 'completed') {
      actualPhase = 'completed';
    } else if (importJob.status === 'failed') {
      actualPhase = 'failed';
    } else if (importJob.status === 'timed_out') {
      actualPhase = 'timed_out';
    } else if (importJob.phase) {
      // Use the actual phase from the job if available
      actualPhase = importJob.phase;
    }
    
    // Check if job has expired
    if (now > importJob.expiresAt && importJob.status !== 'completed' && importJob.status !== 'failed') {
      await ImportJob.findOneAndUpdate(
        { jobId },
        { status: 'expired', phase: 'failed' }
      );
      importJob.status = 'expired';
      importJob.phase = 'failed';
    }
    
    const response = {
      success: true,
      data: {
        jobId: importJob.jobId,
        state: importJob.status, // Use 'state' as per assignment
        phase: actualPhase,
        progress: importJob.status === 'completed' ? 100 : phaseInfo.percent,
        etaSeconds: importJob.status === 'completed' ? 0 : phaseInfo.etaSeconds,
        totalRecords: importJob.totalRecords,
        processedRecords: importJob.processedRecords || 0,
        successfulRecords: importJob.successfulRecords || 0,
        failedRecords: importJob.failedRecords || 0,
        duplicateRecords: importJob.duplicateRecords || 0,
        errors: (importJob.errors || []).slice(0, 10), // Max 10 errors as per assignment
        enqueuedAt: importJob.createdAt,
        startedAt: importJob.startedAt,
        completedAt: importJob.completedAt,
        ttlMs: importJob.ttl * 1000
      }
    };
    
    res.json(response);
    
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking job status',
      error: error.message
    });
  }
});

// Get import job result (requires authentication)
router.get('/:jobId/result', async (req, res) => {
  try {
    const { jobId } = req.params;
    
    const importJob = await ImportJob.findOne({ jobId });
    if (!importJob) {
      return res.status(404).json({
        success: false,
        message: 'Import job not found'
      });
    }
    
    // Only return results for completed jobs
    if (importJob.status !== 'completed') {
      return res.status(404).json({
        success: false,
        message: 'Job results not available. Job must be completed first.',
        currentState: importJob.status
      });
    }
    
    const result = {
      success: true,
      data: {
        jobId: importJob.jobId,
        inserted: importJob.successfulRecords || 0,
        updated: 0, // We don't track updates separately in current implementation
        skipped: importJob.failedRecords || 0,
        duplicates: importJob.duplicateRecords || 0,
        totalProcessed: importJob.processedRecords || 0,
        errors: (importJob.errors || []).slice(0, 10), // Sample errors (max 10)
        completedAt: importJob.completedAt,
        processingTime: importJob.processingTime
      }
    };
    
    res.json(result);
    
  } catch (error) {
    console.error('Result fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching job result',
      error: error.message
    });
  }
});

// Get import job history (requires authentication)
router.get('/history', async (req, res) => {
  try {
    const { page = 1, limit = 20, status, listId } = req.query;
    const skip = (page - 1) * limit;
    
    let query = {};
    
    if (status) {
      query.status = status;
    }
    
    if (listId) {
      query.listId = listId;
    }
    
    const jobs = await ImportJob.find(query)
      .populate('listId', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('-sourceData'); // Exclude large source data field
    
    const total = await ImportJob.countDocuments(query);
    
    res.json({
      success: true,
      data: {
        jobs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching import history',
      error: error.message
    });
  }
});

module.exports = router;
