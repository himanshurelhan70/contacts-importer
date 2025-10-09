const mongoose = require('mongoose');

const importJobSchema = new mongoose.Schema({
  jobId: {
    type: String,
    required: true,
    unique: true
  },
  listId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'List',
    required: true
  },
  team: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Team',
    required: true
  },
  status: {
    type: String,
    enum: ['queued', 'processing', 'completed', 'failed', 'expired'],
    default: 'queued'
  },
  phase: {
    type: String,
    enum: ['pending', 'validating', 'deduplicating', 'enriching', 'saving', 'completed', 'failed'],
    default: 'pending'
  },
  // Job configuration
  ttl: {
    type: Number,
    default: 60 // seconds
  },
  expiresAt: {
    type: Date,
    required: true
  },
  // Data and processing info
  sourceData: {
    type: String, // JSON string of the import data
    required: true
  },
  sourceType: {
    type: String,
    enum: ['csv', 'json'],
    required: true
  },
  // Processing results
  totalRecords: {
    type: Number,
    default: 0
  },
  processedRecords: {
    type: Number,
    default: 0
  },
  successfulRecords: {
    type: Number,
    default: 0
  },
  failedRecords: {
    type: Number,
    default: 0
  },
  duplicateRecords: {
    type: Number,
    default: 0
  },
  // Error tracking
  errors: [{
    row: Number,
    field: String,
    message: String,
    data: mongoose.Schema.Types.Mixed
  }],
  // Processing metadata
  startedAt: Date,
  completedAt: Date,
  processingTime: Number, // milliseconds
  // Tags to apply to imported contacts
  tags: [{
    type: String,
    trim: true
  }]
}, {
  timestamps: true
});

// TTL index for automatic cleanup of expired jobs
importJobSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
importJobSchema.index({ jobId: 1 });
importJobSchema.index({ listId: 1 });
importJobSchema.index({ team: 1 });
importJobSchema.index({ status: 1 });

module.exports = mongoose.model('ImportJob', importJobSchema);
