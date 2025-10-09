const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { ImportJob, List, Contact } = require('../models');
const ContactEnrichment = require('../services/enrichment');

const router = express.Router();

// Simple import endpoint without Redis queue (synchronous processing)
router.post('/submit', async (req, res) => {
  try {
    const { listId, data, ttl = 60, tags } = req.body;
    const idempotencyKey = req.header('Idempotency-Key');
    
    // Basic validation
    if (!listId || !data) {
      return res.status(422).json({
        success: false,
        message: 'listId and data are required',
        code: 'MISSING_REQUIRED_FIELDS'
      });
    }

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

    // Check for existing job with same idempotency key
    const existingJob = await ImportJob.findOne({ 
      'meta.idempotencyKey': idempotencyKey 
    });
    
    if (existingJob) {
      return res.status(200).json({
        success: true,
        message: 'Import job already processed (idempotent)',
        data: {
          jobId: existingJob.jobId,
          state: existingJob.status,
          totalRecords: existingJob.totalRecords
        }
      });
    }

    // Verify list exists
    const list = await List.findById(listId);
    if (!list || list.deletedAt) {
      return res.status(404).json({
        success: false,
        message: 'List not found or inactive'
      });
    }

    // Parse and validate data
    const contacts = Array.isArray(data) ? data : JSON.parse(data);
    
    // Validate payload size and row count
    const payloadSize = Buffer.byteLength(JSON.stringify(contacts), 'utf8');
    if (payloadSize > 2 * 1024 * 1024) {
      return res.status(422).json({
        success: false,
        message: 'Payload size exceeds 2MB limit',
        code: 'PAYLOAD_TOO_LARGE'
      });
    }

    if (contacts.length > 5000) {
      return res.status(422).json({
        success: false,
        message: 'Import size exceeds maximum limit of 5,000 records',
        code: 'TOO_MANY_ROWS'
      });
    }

    // Generate job ID
    const jobId = uuidv4();
    const enqueuedAt = new Date();
    const ttlMs = ttl * 1000;

    // Create import job
    const importJob = new ImportJob({
      jobId,
      listId,
      team: list.team,
      status: 'processing',
      phase: 'validating',
      ttl,
      expiresAt: new Date(enqueuedAt.getTime() + ttlMs),
      sourceData: JSON.stringify(contacts),
      sourceType: 'json',
      totalRecords: contacts.length,
      tags: tags || [],
      meta: { idempotencyKey }
    });

    await importJob.save();

    // Process synchronously (simulate background processing)
    try {
      let successCount = 0;
      let failCount = 0;
      let duplicateCount = 0;
      const errors = [];

      // Update phase to processing
      importJob.status = 'processing';
      importJob.phase = 'deduplicating';
      importJob.startedAt = new Date();
      await importJob.save();

      // Deduplicate within payload
      const seenEmails = new Set();
      const deduplicatedContacts = [];
      
      for (const contact of contacts) {
        const email = contact.email?.toLowerCase();
        if (!email) {
          errors.push({
            row: contacts.indexOf(contact) + 1,
            field: 'email',
            message: 'Email is required'
          });
          failCount++;
          continue;
        }

        if (seenEmails.has(email)) {
          duplicateCount++;
          continue;
        }
        
        seenEmails.add(email);
        deduplicatedContacts.push(contact);
      }

      // Update phase to enriching
      importJob.phase = 'enriching';
      await importJob.save();

      // Enrich contacts
      const enrichedContacts = ContactEnrichment.enrichContacts(deduplicatedContacts);

      // Update phase to saving
      importJob.phase = 'saving';
      await importJob.save();

      // Save contacts to database
      for (let i = 0; i < enrichedContacts.length; i++) {
        try {
          const contactData = enrichedContacts[i];
          
          // Check if contact already exists in list
          let existingContact = await Contact.findOne({
            email: contactData.email.toLowerCase(),
            lists: listId
          });
          
          if (existingContact) {
            duplicateCount++;
          } else {
            // Create new contact
            const newContact = new Contact({
              email: contactData.email.toLowerCase(),
              firstName: contactData.firstName,
              lastName: contactData.lastName,
              phone: contactData.phone,
              company: contactData.company,
              jobTitle: contactData.jobTitle,
              country: contactData.country,
              lists: [listId],
              team: list.team,
              tags: tags || [],
              importedFrom: {
                jobId: jobId,
                source: 'json',
                importedAt: new Date()
              }
            });
            
            await newContact.save();
            successCount++;
          }
        } catch (error) {
          failCount++;
          errors.push({
            row: i + 1,
            field: 'database',
            message: error.message
          });
        }
      }

      // Complete job
      const processingTime = Date.now() - importJob.startedAt.getTime();
      
      importJob.status = 'completed';
      importJob.phase = 'completed';
      importJob.processedRecords = enrichedContacts.length;
      importJob.successfulRecords = successCount;
      importJob.failedRecords = failCount;
      importJob.duplicateRecords = duplicateCount;
      importJob.errors = errors;
      importJob.completedAt = new Date();
      importJob.processingTime = processingTime;
      
      await importJob.save();

      console.log(`✅ Import job ${jobId} completed: ${successCount} inserted, ${duplicateCount} duplicates, ${failCount} failed`);

    } catch (processingError) {
      console.error(`❌ Import job ${jobId} failed:`, processingError.message);
      
      importJob.status = 'failed';
      importJob.phase = 'failed';
      importJob.completedAt = new Date();
      importJob.errors = [{ row: 0, field: 'system', message: processingError.message }];
      await importJob.save();
    }

    // Return response
    res.status(202).json({
      success: true,
      message: 'Import job submitted and processed successfully',
      data: {
        jobId,
        state: 'queued',
        totalRecords: contacts.length,
        note: 'Processing synchronously (no Redis queue)'
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

// Get job status
router.get('/status/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    
    const importJob = await ImportJob.findOne({ jobId });
    if (!importJob) {
      return res.status(404).json({
        success: false,
        message: 'Import job not found'
      });
    }

    // Calculate phase info
    const now = new Date();
    const elapsed = now - importJob.createdAt;
    const ttlMs = importJob.ttl * 1000;
    const ratio = Math.min(Math.max(elapsed / ttlMs, 0), 1);
    const percent = Math.floor(ratio * 100);
    const etaSeconds = Math.ceil(Math.max(0, ttlMs - elapsed) / 1000);

    res.json({
      success: true,
      data: {
        jobId: importJob.jobId,
        state: importJob.status,
        phase: importJob.phase,
        progress: importJob.status === 'completed' ? 100 : percent,
        etaSeconds: importJob.status === 'completed' ? 0 : etaSeconds,
        totalRecords: importJob.totalRecords,
        processedRecords: importJob.processedRecords || 0,
        successfulRecords: importJob.successfulRecords || 0,
        failedRecords: importJob.failedRecords || 0,
        duplicateRecords: importJob.duplicateRecords || 0,
        errors: (importJob.errors || []).slice(0, 10),
        enqueuedAt: importJob.createdAt,
        startedAt: importJob.startedAt,
        completedAt: importJob.completedAt,
        ttlMs: ttlMs
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

// Get job result
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
    
    if (importJob.status !== 'completed') {
      return res.status(404).json({
        success: false,
        message: 'Job results not available. Job must be completed first.',
        currentState: importJob.status
      });
    }
    
    res.json({
      success: true,
      data: {
        jobId: importJob.jobId,
        inserted: importJob.successfulRecords || 0,
        updated: 0,
        skipped: importJob.failedRecords || 0,
        duplicates: importJob.duplicateRecords || 0,
        totalProcessed: importJob.processedRecords || 0,
        errors: (importJob.errors || []).slice(0, 10),
        completedAt: importJob.completedAt,
        processingTime: importJob.processingTime
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching job result',
      error: error.message
    });
  }
});

module.exports = router;
