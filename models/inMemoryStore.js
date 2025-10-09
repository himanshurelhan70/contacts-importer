/**
 * In-memory data store for testing without MongoDB/Redis
 */
class InMemoryStore {
  constructor() {
    this.users = new Map();
    this.teams = new Map();
    this.lists = new Map();
    this.contacts = new Map();
    this.importJobs = new Map();
    this.jobQueue = [];
    this.idCounter = 1;
  }

  // Generate unique ID
  generateId() {
    return (this.idCounter++).toString();
  }

  // User operations
  createUser(userData) {
    const id = this.generateId();
    const user = {
      _id: id,
      ...userData,
      teams: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.users.set(id, user);
    return user;
  }

  findUserByEmail(email) {
    for (const user of this.users.values()) {
      if (user.email === email) {
        return user;
      }
    }
    return null;
  }

  findUserById(id) {
    return this.users.get(id) || null;
  }

  // Team operations
  createTeam(teamData) {
    const id = this.generateId();
    const team = {
      _id: id,
      ...teamData,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.teams.set(id, team);
    return team;
  }

  findTeamById(id) {
    return this.teams.get(id) || null;
  }

  getUserTeams(userId) {
    const teams = [];
    for (const team of this.teams.values()) {
      if (team.owner === userId || team.members.some(m => m.user === userId)) {
        teams.push(team);
      }
    }
    return teams;
  }

  // List operations
  createList(listData) {
    const id = this.generateId();
    const list = {
      _id: id,
      ...listData,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.lists.set(id, list);
    return list;
  }

  findListById(id) {
    return this.lists.get(id) || null;
  }

  getTeamLists(teamId) {
    const lists = [];
    for (const list of this.lists.values()) {
      if (list.team === teamId && list.isActive !== false) {
        lists.push(list);
      }
    }
    return lists;
  }

  // Contact operations
  createContact(contactData) {
    const id = this.generateId();
    const contact = {
      _id: id,
      ...contactData,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.contacts.set(id, contact);
    return contact;
  }

  findContactById(id) {
    return this.contacts.get(id) || null;
  }

  findContactByEmail(email, teamId) {
    for (const contact of this.contacts.values()) {
      if (contact.email === email && contact.team === teamId && contact.isActive !== false) {
        return contact;
      }
    }
    return null;
  }

  getListContacts(listId, options = {}) {
    const { page = 1, limit = 50, search } = options;
    const skip = (page - 1) * limit;
    
    let contacts = [];
    for (const contact of this.contacts.values()) {
      if (contact.lists.includes(listId) && contact.isActive !== false) {
        if (search) {
          const searchLower = search.toLowerCase();
          if (
            contact.email?.toLowerCase().includes(searchLower) ||
            contact.firstName?.toLowerCase().includes(searchLower) ||
            contact.lastName?.toLowerCase().includes(searchLower) ||
            contact.company?.toLowerCase().includes(searchLower)
          ) {
            contacts.push(contact);
          }
        } else {
          contacts.push(contact);
        }
      }
    }

    // Sort by creation date (newest first)
    contacts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Pagination
    const total = contacts.length;
    const paginatedContacts = contacts.slice(skip, skip + limit);

    return {
      contacts: paginatedContacts,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / limit)
    };
  }

  // Import job operations
  createImportJob(jobData) {
    const job = {
      ...jobData,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.importJobs.set(jobData.jobId, job);
    return job;
  }

  findImportJobById(jobId) {
    return this.importJobs.get(jobId) || null;
  }

  updateImportJob(jobId, updates) {
    const job = this.importJobs.get(jobId);
    if (job) {
      Object.assign(job, updates, { updatedAt: new Date() });
      this.importJobs.set(jobId, job);
    }
    return job;
  }

  // Queue operations
  addJobToQueue(jobData) {
    this.jobQueue.push(jobData);
    // Simulate async processing
    setTimeout(() => this.processJob(jobData), 1000);
    return { id: jobData.jobId };
  }

  async processJob(jobData) {
    const { jobId, listId, sourceData, tags } = jobData;
    
    try {
      // Update job status
      this.updateImportJob(jobId, {
        status: 'processing',
        phase: 'validating',
        startedAt: new Date()
      });

      // Parse data
      const contacts = typeof sourceData === 'string' ? JSON.parse(sourceData) : sourceData;
      
      // Simulate processing phases
      await this.sleep(500);
      this.updateImportJob(jobId, { phase: 'deduplicating' });
      
      await this.sleep(500);
      this.updateImportJob(jobId, { phase: 'enriching' });
      
      await this.sleep(500);
      this.updateImportJob(jobId, { phase: 'saving' });

      // Process contacts
      let successCount = 0;
      let failCount = 0;
      const errors = [];

      const list = this.findListById(listId);
      if (!list) {
        throw new Error('List not found');
      }

      for (let i = 0; i < contacts.length; i++) {
        try {
          const contactData = contacts[i];
          
          if (!contactData.email) {
            errors.push({
              row: i + 1,
              field: 'email',
              message: 'Email is required'
            });
            failCount++;
            continue;
          }

          // Check for existing contact
          let existingContact = this.findContactByEmail(contactData.email, list.team);
          
          if (existingContact) {
            // Add to list if not already present
            if (!existingContact.lists.includes(listId)) {
              existingContact.lists.push(listId);
            }
            successCount++;
          } else {
            // Create new contact
            this.createContact({
              email: contactData.email.toLowerCase(),
              firstName: contactData.firstName,
              lastName: contactData.lastName,
              phone: contactData.phone,
              company: contactData.company,
              jobTitle: contactData.jobTitle,
              lists: [listId],
              team: list.team,
              tags: tags || [],
              isActive: true,
              importedFrom: {
                jobId: jobId,
                source: 'json',
                importedAt: new Date()
              }
            });
            successCount++;
          }
        } catch (error) {
          errors.push({
            row: i + 1,
            field: 'general',
            message: error.message
          });
          failCount++;
        }
      }

      // Complete job
      this.updateImportJob(jobId, {
        status: 'completed',
        phase: 'completed',
        totalRecords: contacts.length,
        processedRecords: contacts.length,
        successfulRecords: successCount,
        failedRecords: failCount,
        errors: errors,
        completedAt: new Date(),
        processingTime: 2000
      });

    } catch (error) {
      this.updateImportJob(jobId, {
        status: 'failed',
        phase: 'failed',
        completedAt: new Date(),
        errors: [{ row: 0, field: 'system', message: error.message }]
      });
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Clear all data
  clear() {
    this.users.clear();
    this.teams.clear();
    this.lists.clear();
    this.contacts.clear();
    this.importJobs.clear();
    this.jobQueue = [];
    this.idCounter = 1;
  }
}

// Export singleton instance
module.exports = new InMemoryStore();
