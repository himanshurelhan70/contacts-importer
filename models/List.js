const mongoose = require('mongoose');

const listSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  team: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Team',
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  tags: [{
    type: String,
    trim: true
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  // List-level permissions
  permissions: {
    canImport: {
      type: Boolean,
      default: true
    },
    canExport: {
      type: Boolean,
      default: true
    }
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
listSchema.index({ team: 1 });
listSchema.index({ createdBy: 1 });
listSchema.index({ name: 1, team: 1 });

module.exports = mongoose.model('List', listSchema);
