const jwt = require('jsonwebtoken');
const { User, Team } = require('../models');
const config = require('../config');

// JWT Authentication middleware
const authenticate = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    const decoded = jwt.verify(token, config.jwt.secret);
    const user = await User.findById(decoded.userId).populate('teams');
    
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

// Role-based authorization middleware
const authorize = (roles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.'
      });
    }

    if (roles.length && !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions.'
      });
    }

    next();
  };
};

// Team membership authorization
const authorizeTeamAccess = async (req, res, next) => {
  try {
    const teamId = req.params.teamId || req.body.teamId || req.query.teamId;
    
    if (!teamId) {
      return res.status(400).json({
        success: false,
        message: 'Team ID is required.'
      });
    }

    // Admin users have access to all teams
    if (req.user.role === 'admin') {
      return next();
    }

    // Check if user is a member of the team
    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team not found.'
      });
    }

    const isMember = team.members.some(member => 
      member.user.toString() === req.user._id.toString()
    ) || team.owner.toString() === req.user._id.toString();

    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You are not a member of this team.'
      });
    }

    req.team = team;
    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error checking team access.',
      error: error.message
    });
  }
};

// List-level authorization
const authorizeListAccess = async (req, res, next) => {
  try {
    const { List } = require('../models');
    const listId = req.params.listId || req.body.listId || req.query.listId;
    
    if (!listId) {
      return res.status(400).json({
        success: false,
        message: 'List ID is required.'
      });
    }

    const list = await List.findById(listId).populate('team');
    if (!list) {
      return res.status(404).json({
        success: false,
        message: 'List not found.'
      });
    }

    // Admin users have access to all lists
    if (req.user.role === 'admin') {
      req.list = list;
      return next();
    }

    // Check team membership
    const team = list.team;
    const isMember = team.members.some(member => 
      member.user.toString() === req.user._id.toString()
    ) || team.owner.toString() === req.user._id.toString();

    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You do not have access to this list.'
      });
    }

    req.list = list;
    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error checking list access.',
      error: error.message
    });
  }
};

module.exports = {
  authenticate,
  authorize,
  authorizeTeamAccess,
  authorizeListAccess
};
