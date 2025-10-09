const { Contact, ImportJob, List } = require('../models');
const ContactEnrichment = require('./enrichment');
const { importQueue } = require('./queue');

/**
 * Import worker that processes import jobs
 */
class ImportWorker {
  
  /**
   * Process import job
   */
  static async processImportJob(job) {
    const { jobId, listId, sourceData, sourceType, tags, ttl } = job.data;
    
    console.log(`Processing import job: ${jobId}`);
    
    try {
      // Update job status to processing
      await ImportJob.findOneAndUpdate(
        { jobId },
        { 
          status: 'processing',
          phase: 'validating',
          startedAt: new Date()
        }
      );
      
      // Check if job has expired
      const importJob = await ImportJob.findOne({ jobId });
      if (!importJob) {
        throw new Error('Import job not found');
      }
      
      if (new Date() > importJob.expiresAt) {
        await ImportJob.findOneAndUpdate(
          { jobId },
          { 
            status: 'expired',
            phase: 'failed',
            completedAt: new Date()
          }
        );
        throw new Error('Import job has expired');
      }
      
      // Parse source data
      let contacts;
      try {
        contacts = typeof sourceData === 'string' ? JSON.parse(sourceData) : sourceData;
      } catch (error) {
        throw new Error('Invalid source data format');
      }
      
      if (!Array.isArray(contacts)) {
        throw new Error('Source data must be an array of contacts');
      }
      
      // Update progress
      await ImportJob.findOneAndUpdate(
        { jobId },
        { 
          totalRecords: contacts.length,
          phase: 'validating'
        }
      );
      
      // Validate contacts
      const validatedContacts = [];
      const errors = [];
      
      for (let i = 0; i < contacts.length; i++) {
        try {
          const contact = contacts[i];
          
          // Basic validation
          if (!contact.email) {
            errors.push({
              row: i + 1,
              field: 'email',
              message: 'Email is required',
              data: contact
            });
            continue;
          }
          
          if (!ContactEnrichment.isValidEmail(contact.email)) {
            errors.push({
              row: i + 1,
              field: 'email',
              message: 'Invalid email format',
              data: contact
            });
            continue;
          }
          
          validatedContacts.push(contact);
        } catch (error) {
          errors.push({
            row: i + 1,
            field: 'general',
            message: error.message,
            data: contacts[i]
          });
        }
      }
      
      // Update progress
      await ImportJob.findOneAndUpdate(
        { jobId },
        { 
          phase: 'deduplicating',
          errors: errors
        }
      );
      
      // Deduplicate by email within the import
      const deduplicatedContacts = [];
      const seenEmails = new Set();
      let duplicateCount = 0;
      
      for (const contact of validatedContacts) {
        const email = contact.email.toLowerCase();
        if (seenEmails.has(email)) {
          duplicateCount++;
          continue;
        }
        seenEmails.add(email);
        deduplicatedContacts.push(contact);
      }
      
      // Update progress
      await ImportJob.findOneAndUpdate(
        { jobId },
        { 
          phase: 'enriching',
          duplicateRecords: duplicateCount
        }
      );
      
      // Enrich contacts
      const enrichedContacts = ContactEnrichment.enrichContacts(deduplicatedContacts);
      
      // Update progress
      await ImportJob.findOneAndUpdate(
        { jobId },
        { 
          phase: 'saving'
        }
      );
      
      // Get list and team info
      const list = await List.findById(listId).populate('team');
      if (!list) {
        throw new Error('Target list not found');
      }
      
      // Save contacts to database
      let successCount = 0;
      let failCount = 0;
      
      for (let i = 0; i < enrichedContacts.length; i++) {
        try {
          const contactData = enrichedContacts[i];
          
          // Check if contact already exists in team
          let existingContact = await Contact.findOne({
            email: contactData.email.toLowerCase(),
            team: list.team._id,
            isActive: true
          });
          
          if (existingContact) {
            // Add to list if not already present
            if (!existingContact.lists.includes(listId)) {
              existingContact.lists.push(listId);
              
              // Add tags if provided
              if (tags && tags.length > 0) {
                const newTags = tags.filter(tag => !existingContact.tags.includes(tag));
                existingContact.tags.push(...newTags);
              }
              
              await existingContact.save();
            }
            successCount++;
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
              team: list.team._id,
              tags: tags || [],
              customFields: contactData.customFields || {},
              importedFrom: {
                jobId: jobId,
                source: sourceType,
                importedAt: new Date()
              }
            });
            
            await newContact.save();
            successCount++;
          }
          
          // Update progress periodically
          if (i % 10 === 0) {
            await ImportJob.findOneAndUpdate(
              { jobId },
              { 
                processedRecords: i + 1,
                successfulRecords: successCount,
                failedRecords: failCount
              }
            );
            
            // Update job progress
            job.progress(Math.round(((i + 1) / enrichedContacts.length) * 100));
          }
          
        } catch (error) {
          failCount++;
          errors.push({
            row: i + 1,
            field: 'database',
            message: error.message,
            data: enrichedContacts[i]
          });
        }
      }
      
      // Final update
      const processingTime = Date.now() - new Date(importJob.startedAt).getTime();
      
      await ImportJob.findOneAndUpdate(
        { jobId },
        { 
          status: 'completed',
          phase: 'completed',
          processedRecords: enrichedContacts.length,
          successfulRecords: successCount,
          failedRecords: failCount,
          duplicateRecords: duplicateCount,
          errors: errors,
          completedAt: new Date(),
          processingTime: processingTime
        }
      );
      
      console.log(`Import job ${jobId} completed successfully`);
      
      return {
        jobId,
        status: 'completed',
        totalRecords: contacts.length,
        processedRecords: enrichedContacts.length,
        successfulRecords: successCount,
        failedRecords: failCount,
        duplicateRecords: duplicateCount,
        processingTime: processingTime
      };
      
    } catch (error) {
      console.error(`Import job ${jobId} failed:`, error.message);
      
      // Update job status to failed
      await ImportJob.findOneAndUpdate(
        { jobId },
        { 
          status: 'failed',
          phase: 'failed',
          completedAt: new Date(),
          $push: {
            errors: {
              row: 0,
              field: 'system',
              message: error.message,
              data: null
            }
          }
        }
      );
      
      throw error;
    }
  }
}

// Register the worker
importQueue.process('processImport', 5, async (job) => {
  return await ImportWorker.processImportJob(job);
});

module.exports = ImportWorker;
