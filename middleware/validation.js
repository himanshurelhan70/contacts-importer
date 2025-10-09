const Joi = require('joi');

// Validation middleware factory
const validate = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      });
    }
    next();
  };
};

// User validation schemas
const userSchemas = {
  register: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    name: Joi.string().min(2).max(50).required(),
    role: Joi.string().valid('admin', 'member').default('member')
  }),
  
  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
  })
};

// Team validation schemas
const teamSchemas = {
  create: Joi.object({
    name: Joi.string().min(2).max(100).required(),
    description: Joi.string().max(500).optional()
  }),
  
  update: Joi.object({
    name: Joi.string().min(2).max(100).optional(),
    description: Joi.string().max(500).optional()
  }),
  
  addMember: Joi.object({
    userId: Joi.string().required(),
    role: Joi.string().valid('admin', 'member').default('member')
  })
};

// List validation schemas
const listSchemas = {
  create: Joi.object({
    name: Joi.string().min(2).max(100).required(),
    description: Joi.string().max(500).optional(),
    teamId: Joi.string().required(),
    tags: Joi.array().items(Joi.string().max(50)).optional()
  }),
  
  update: Joi.object({
    name: Joi.string().min(2).max(100).optional(),
    description: Joi.string().max(500).optional(),
    tags: Joi.array().items(Joi.string().max(50)).optional()
  })
};

// Contact validation schemas
const contactSchemas = {
  create: Joi.object({
    email: Joi.string().email().required(),
    firstName: Joi.string().max(50).optional(),
    lastName: Joi.string().max(50).optional(),
    phone: Joi.string().max(20).optional(),
    company: Joi.string().max(100).optional(),
    jobTitle: Joi.string().max(100).optional(),
    listIds: Joi.array().items(Joi.string()).required(),
    tags: Joi.array().items(Joi.string().max(50)).optional(),
    customFields: Joi.object().pattern(Joi.string(), Joi.string()).optional()
  }),
  
  update: Joi.object({
    firstName: Joi.string().max(50).optional(),
    lastName: Joi.string().max(50).optional(),
    phone: Joi.string().max(20).optional(),
    company: Joi.string().max(100).optional(),
    jobTitle: Joi.string().max(100).optional(),
    tags: Joi.array().items(Joi.string().max(50)).optional(),
    customFields: Joi.object().pattern(Joi.string(), Joi.string()).optional()
  })
};

// Import job validation schemas
const importJobSchemas = {
  create: Joi.object({
    listId: Joi.string().required(),
    data: Joi.alternatives().try(
      Joi.array().items(Joi.object()),
      Joi.string()
    ).required(),
    sourceType: Joi.string().valid('csv', 'json').required(),
    ttl: Joi.number().min(10).max(3600).optional(),
    tags: Joi.array().items(Joi.string().max(50)).optional()
  })
};

module.exports = {
  validate,
  userSchemas,
  teamSchemas,
  listSchemas,
  contactSchemas,
  importJobSchemas
};
