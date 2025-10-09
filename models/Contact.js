const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  firstName: {
    type: String,
    trim: true
  },
  lastName: {
    type: String,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  company: {
    type: String,
    trim: true
  },
  jobTitle: {
    type: String,
    trim: true
  },
  // Enriched data
  country: {
    type: String,
    trim: true
  },
  // List membership
  lists: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'List'
  }],
  team: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Team',
    required: true
  },
  tags: [{
    type: String,
    trim: true
  }],
  // Import tracking
  importedFrom: {
    jobId: {
      type: String
    },
    source: {
      type: String,
      enum: ['csv', 'json', 'api', 'manual']
    },
    importedAt: {
      type: Date,
      default: Date.now
    }
  },
  // Custom fields for flexibility
  customFields: {
    type: Map,
    of: String
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Compound index for deduplication by email within team
contactSchema.index({ email: 1, team: 1 }, { unique: true });
contactSchema.index({ team: 1 });
contactSchema.index({ lists: 1 });
contactSchema.index({ phone: 1 });

module.exports = mongoose.model('Contact', contactSchema);
