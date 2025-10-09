const express = require('express');
const { Contact, List } = require('../models');
const { authenticate, authorizeListAccess } = require('../middleware/auth');
const { validate, contactSchemas } = require('../middleware/validation');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get contacts from a specific list
router.get('/list/:listId', authorizeListAccess, async (req, res) => {
  try {
    const { page = 1, limit = 50, search, tags } = req.query;
    const skip = (page - 1) * limit;

    // Build query
    let query = {
      lists: req.params.listId,
      isActive: true
    };

    // Add search functionality
    if (search) {
      query.$or = [
        { email: { $regex: search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { company: { $regex: search, $options: 'i' } }
      ];
    }

    // Filter by tags
    if (tags) {
      const tagArray = tags.split(',').map(tag => tag.trim());
      query.tags = { $in: tagArray };
    }

    const contacts = await Contact.find(query)
      .populate('lists', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Contact.countDocuments(query);

    res.json({
      success: true,
      data: {
        contacts,
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
      message: 'Error fetching contacts',
      error: error.message
    });
  }
});

// Create new contact
router.post('/', validate(contactSchemas.create), async (req, res) => {
  try {
    const { email, firstName, lastName, phone, company, jobTitle, listIds, tags, customFields } = req.body;

    // Verify all lists exist and user has access
    const lists = await List.find({ _id: { $in: listIds }, isActive: true }).populate('team');
    
    if (lists.length !== listIds.length) {
      return res.status(400).json({
        success: false,
        message: 'One or more lists not found'
      });
    }

    // Check access to all lists
    for (const list of lists) {
      if (req.user.role !== 'admin') {
        const team = list.team;
        const isMember = team.members.some(member => 
          member.user.toString() === req.user._id.toString()
        ) || team.owner.toString() === req.user._id.toString();

        if (!isMember) {
          return res.status(403).json({
            success: false,
            message: `Access denied to list: ${list.name}`
          });
        }
      }
    }

    // Get team from first list (assuming all lists belong to same team)
    const teamId = lists[0].team._id;

    // Check for duplicate email within team
    const existingContact = await Contact.findOne({ email, team: teamId, isActive: true });
    if (existingContact) {
      // Add to new lists if not already present
      const newLists = listIds.filter(listId => 
        !existingContact.lists.includes(listId)
      );
      
      if (newLists.length > 0) {
        existingContact.lists.push(...newLists);
        await existingContact.save();
      }

      return res.status(200).json({
        success: true,
        message: 'Contact already exists, added to new lists',
        data: existingContact
      });
    }

    const contact = new Contact({
      email,
      firstName,
      lastName,
      phone,
      company,
      jobTitle,
      lists: listIds,
      team: teamId,
      tags: tags || [],
      customFields: customFields || {},
      importedFrom: {
        source: 'manual',
        importedAt: new Date()
      }
    });

    await contact.save();
    await contact.populate('lists', 'name');

    res.status(201).json({
      success: true,
      message: 'Contact created successfully',
      data: contact
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Contact with this email already exists in the team'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error creating contact',
      error: error.message
    });
  }
});

// Get specific contact
router.get('/:contactId', async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.contactId)
      .populate('lists', 'name team')
      .populate('team', 'name');

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }

    // Check access through team membership
    if (req.user.role !== 'admin') {
      const team = contact.team;
      const isMember = team.members?.some(member => 
        member.user.toString() === req.user._id.toString()
      ) || team.owner?.toString() === req.user._id.toString();

      if (!isMember) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }
    }

    res.json({
      success: true,
      data: contact
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching contact',
      error: error.message
    });
  }
});

// Update contact
router.put('/:contactId', validate(contactSchemas.update), async (req, res) => {
  try {
    const { firstName, lastName, phone, company, jobTitle, tags, customFields } = req.body;

    const contact = await Contact.findById(req.params.contactId).populate('team');
    
    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }

    // Check access
    if (req.user.role !== 'admin') {
      const team = contact.team;
      const isMember = team.members?.some(member => 
        member.user.toString() === req.user._id.toString()
      ) || team.owner?.toString() === req.user._id.toString();

      if (!isMember) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }
    }

    const updatedContact = await Contact.findByIdAndUpdate(
      req.params.contactId,
      { firstName, lastName, phone, company, jobTitle, tags, customFields },
      { new: true, runValidators: true }
    ).populate('lists', 'name');

    res.json({
      success: true,
      message: 'Contact updated successfully',
      data: updatedContact
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating contact',
      error: error.message
    });
  }
});

// Delete contact
router.delete('/:contactId', async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.contactId).populate('team');
    
    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }

    // Check access
    if (req.user.role !== 'admin') {
      const team = contact.team;
      const isMember = team.members?.some(member => 
        member.user.toString() === req.user._id.toString()
      ) || team.owner?.toString() === req.user._id.toString();

      if (!isMember) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }
    }

    // Soft delete
    await Contact.findByIdAndUpdate(req.params.contactId, { isActive: false });

    res.json({
      success: true,
      message: 'Contact deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting contact',
      error: error.message
    });
  }
});

// Remove contact from specific list
router.delete('/:contactId/lists/:listId', authorizeListAccess, async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.contactId);
    
    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }

    // Remove list from contact
    contact.lists = contact.lists.filter(listId => 
      listId.toString() !== req.params.listId
    );

    await contact.save();

    res.json({
      success: true,
      message: 'Contact removed from list successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error removing contact from list',
      error: error.message
    });
  }
});

module.exports = router;
