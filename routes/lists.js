const express = require('express');
const { List, Team } = require('../models');
const { authenticate, authorizeTeamAccess, authorizeListAccess } = require('../middleware/auth');
const { validate, listSchemas } = require('../middleware/validation');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get all lists for a team
router.get('/team/:teamId', authorizeTeamAccess, async (req, res) => {
  try {
    const lists = await List.find({ 
      team: req.params.teamId, 
      isActive: true 
    })
    .populate('createdBy', 'name email')
    .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: lists
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching lists',
      error: error.message
    });
  }
});

// Create new list
router.post('/', validate(listSchemas.create), async (req, res) => {
  try {
    const { name, description, teamId, tags } = req.body;

    // Verify team access
    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team not found'
      });
    }

    // Check team membership
    if (req.user.role !== 'admin') {
      const isMember = team.members.some(member => 
        member.user.toString() === req.user._id.toString()
      ) || team.owner.toString() === req.user._id.toString();

      if (!isMember) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You are not a member of this team.'
        });
      }
    }

    const list = new List({
      name,
      description,
      team: teamId,
      createdBy: req.user._id,
      tags: tags || []
    });

    await list.save();
    await list.populate('createdBy', 'name email');

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

// Get specific list
router.get('/:listId', authorizeListAccess, async (req, res) => {
  try {
    const list = await List.findById(req.params.listId)
      .populate('createdBy', 'name email')
      .populate('team', 'name');

    res.json({
      success: true,
      data: list
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching list',
      error: error.message
    });
  }
});

// Update list
router.put('/:listId', authorizeListAccess, validate(listSchemas.update), async (req, res) => {
  try {
    const { name, description, tags } = req.body;
    
    const updatedList = await List.findByIdAndUpdate(
      req.params.listId,
      { name, description, tags },
      { new: true, runValidators: true }
    )
    .populate('createdBy', 'name email')
    .populate('team', 'name');

    res.json({
      success: true,
      message: 'List updated successfully',
      data: updatedList
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating list',
      error: error.message
    });
  }
});

// Delete list
router.delete('/:listId', authorizeListAccess, async (req, res) => {
  try {
    // Soft delete - mark as inactive
    await List.findByIdAndUpdate(req.params.listId, { isActive: false });

    res.json({
      success: true,
      message: 'List deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting list',
      error: error.message
    });
  }
});

// Get list statistics
router.get('/:listId/stats', authorizeListAccess, async (req, res) => {
  try {
    const { Contact } = require('../models');
    
    const totalContacts = await Contact.countDocuments({
      lists: req.params.listId,
      isActive: true
    });

    const recentImports = await Contact.countDocuments({
      lists: req.params.listId,
      isActive: true,
      'importedFrom.importedAt': {
        $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
      }
    });

    res.json({
      success: true,
      data: {
        totalContacts,
        recentImports,
        listId: req.params.listId
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching list statistics',
      error: error.message
    });
  }
});

module.exports = router;
