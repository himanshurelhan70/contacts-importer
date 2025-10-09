const express = require('express');
const { Team, User } = require('../models');
const { authenticate, authorize, authorizeTeamAccess } = require('../middleware/auth');
const { validate, teamSchemas } = require('../middleware/validation');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get all teams (admin) or user's teams (member)
router.get('/', async (req, res) => {
  try {
    let teams;
    
    if (req.user.role === 'admin') {
      teams = await Team.find({ isActive: true })
        .populate('owner', 'name email')
        .populate('members.user', 'name email');
    } else {
      teams = await Team.find({
        $or: [
          { owner: req.user._id },
          { 'members.user': req.user._id }
        ],
        isActive: true
      })
      .populate('owner', 'name email')
      .populate('members.user', 'name email');
    }

    res.json({
      success: true,
      data: teams
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching teams',
      error: error.message
    });
  }
});

// Create new team
router.post('/', validate(teamSchemas.create), async (req, res) => {
  try {
    const { name, description } = req.body;

    const team = new Team({
      name,
      description,
      owner: req.user._id,
      members: [{
        user: req.user._id,
        role: 'admin',
        joinedAt: new Date()
      }]
    });

    await team.save();
    await team.populate('owner', 'name email');
    await team.populate('members.user', 'name email');

    // Add team to user's teams array
    await User.findByIdAndUpdate(req.user._id, {
      $addToSet: { teams: team._id }
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

// Get specific team
router.get('/:teamId', authorizeTeamAccess, async (req, res) => {
  try {
    const team = await Team.findById(req.params.teamId)
      .populate('owner', 'name email')
      .populate('members.user', 'name email');

    res.json({
      success: true,
      data: team
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching team',
      error: error.message
    });
  }
});

// Update team
router.put('/:teamId', authorizeTeamAccess, validate(teamSchemas.update), async (req, res) => {
  try {
    const { name, description } = req.body;
    const team = req.team;

    // Check if user is team owner or admin
    if (team.owner.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only team owners can update team details'
      });
    }

    const updatedTeam = await Team.findByIdAndUpdate(
      req.params.teamId,
      { name, description },
      { new: true, runValidators: true }
    )
    .populate('owner', 'name email')
    .populate('members.user', 'name email');

    res.json({
      success: true,
      message: 'Team updated successfully',
      data: updatedTeam
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating team',
      error: error.message
    });
  }
});

// Add member to team
router.post('/:teamId/members', authorizeTeamAccess, validate(teamSchemas.addMember), async (req, res) => {
  try {
    const { userId, role } = req.body;
    const team = req.team;

    // Check if user is team owner or admin
    if (team.owner.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only team owners can add members'
      });
    }

    // Check if user exists
    const userToAdd = await User.findById(userId);
    if (!userToAdd) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user is already a member
    const isAlreadyMember = team.members.some(member => 
      member.user.toString() === userId
    );

    if (isAlreadyMember) {
      return res.status(400).json({
        success: false,
        message: 'User is already a member of this team'
      });
    }

    // Add member to team
    team.members.push({
      user: userId,
      role: role || 'member',
      joinedAt: new Date()
    });

    await team.save();

    // Add team to user's teams array
    await User.findByIdAndUpdate(userId, {
      $addToSet: { teams: team._id }
    });

    await team.populate('members.user', 'name email');

    res.json({
      success: true,
      message: 'Member added successfully',
      data: team
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error adding member',
      error: error.message
    });
  }
});

// Remove member from team
router.delete('/:teamId/members/:userId', authorizeTeamAccess, async (req, res) => {
  try {
    const { userId } = req.params;
    const team = req.team;

    // Check if user is team owner or admin
    if (team.owner.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only team owners can remove members'
      });
    }

    // Cannot remove team owner
    if (team.owner.toString() === userId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot remove team owner'
      });
    }

    // Remove member from team
    team.members = team.members.filter(member => 
      member.user.toString() !== userId
    );

    await team.save();

    // Remove team from user's teams array
    await User.findByIdAndUpdate(userId, {
      $pull: { teams: team._id }
    });

    res.json({
      success: true,
      message: 'Member removed successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error removing member',
      error: error.message
    });
  }
});

// Delete team
router.delete('/:teamId', authorizeTeamAccess, async (req, res) => {
  try {
    const team = req.team;

    // Check if user is team owner or admin
    if (team.owner.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only team owners can delete the team'
      });
    }

    // Soft delete - mark as inactive
    await Team.findByIdAndUpdate(req.params.teamId, { isActive: false });

    // Remove team from all members' teams arrays
    const memberIds = team.members.map(member => member.user);
    await User.updateMany(
      { _id: { $in: memberIds } },
      { $pull: { teams: team._id } }
    );

    res.json({
      success: true,
      message: 'Team deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting team',
      error: error.message
    });
  }
});

module.exports = router;
