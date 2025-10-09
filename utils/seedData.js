const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { User, Team, List, Contact } = require('../models');
const config = require('../config');

/**
 * Seed database with sample data for development/testing
 */
async function seedDatabase() {
  try {
    console.log('🌱 Starting database seeding...');
    
    // Connect to database
    await mongoose.connect(config.mongodb.uri);
    console.log('📦 Connected to MongoDB');
    
    // Clear existing data
    await User.deleteMany({});
    await Team.deleteMany({});
    await List.deleteMany({});
    await Contact.deleteMany({});
    console.log('🗑️  Cleared existing data');
    
    // Create admin user
    const adminUser = new User({
      email: 'admin@example.com',
      password: 'admin123',
      name: 'Admin User',
      role: 'admin'
    });
    await adminUser.save();
    console.log('👤 Created admin user: admin@example.com / admin123');
    
    // Create regular user
    const memberUser = new User({
      email: 'member@example.com',
      password: 'member123',
      name: 'Member User',
      role: 'member'
    });
    await memberUser.save();
    console.log('👤 Created member user: member@example.com / member123');
    
    // Create team
    const team = new Team({
      name: 'Sales Team',
      description: 'Main sales team for lead management',
      owner: adminUser._id,
      members: [
        {
          user: adminUser._id,
          role: 'admin',
          joinedAt: new Date()
        },
        {
          user: memberUser._id,
          role: 'member',
          joinedAt: new Date()
        }
      ]
    });
    await team.save();
    
    // Update users with team reference
    await User.findByIdAndUpdate(adminUser._id, { $push: { teams: team._id } });
    await User.findByIdAndUpdate(memberUser._id, { $push: { teams: team._id } });
    
    console.log('🏢 Created team: Sales Team');
    
    // Create lists
    const prospectsList = new List({
      name: 'Prospects',
      description: 'Potential customers and leads',
      team: team._id,
      createdBy: adminUser._id,
      tags: ['sales', 'leads']
    });
    await prospectsList.save();
    
    const customersList = new List({
      name: 'Customers',
      description: 'Existing customers',
      team: team._id,
      createdBy: adminUser._id,
      tags: ['customers', 'active']
    });
    await customersList.save();
    
    console.log('📋 Created lists: Prospects, Customers');
    
    // Create sample contacts
    const sampleContacts = [
      {
        email: 'john.doe@techcorp.com',
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1-555-0123',
        company: 'TechCorp',
        jobTitle: 'CTO',
        lists: [prospectsList._id],
        team: team._id,
        tags: ['enterprise', 'tech'],
        importedFrom: {
          source: 'manual',
          importedAt: new Date()
        }
      },
      {
        email: 'jane.smith@startup.io',
        firstName: 'Jane',
        lastName: 'Smith',
        phone: '+1-555-0124',
        company: 'Startup Inc',
        jobTitle: 'CEO',
        lists: [prospectsList._id],
        team: team._id,
        tags: ['startup', 'ceo'],
        importedFrom: {
          source: 'manual',
          importedAt: new Date()
        }
      },
      {
        email: 'bob.wilson@enterprise.com',
        firstName: 'Bob',
        lastName: 'Wilson',
        phone: '+44-20-1234-5678',
        company: 'Enterprise Solutions',
        jobTitle: 'VP Sales',
        country: 'GB',
        lists: [customersList._id],
        team: team._id,
        tags: ['customer', 'enterprise'],
        importedFrom: {
          source: 'manual',
          importedAt: new Date()
        }
      },
      {
        email: 'alice.brown@consulting.de',
        firstName: 'Alice',
        lastName: 'Brown',
        phone: '+49-30-12345678',
        company: 'Consulting Group',
        jobTitle: 'Director',
        country: 'DE',
        lists: [prospectsList._id],
        team: team._id,
        tags: ['consulting', 'director'],
        importedFrom: {
          source: 'manual',
          importedAt: new Date()
        }
      },
      {
        email: 'carlos.garcia@innovate.es',
        firstName: 'Carlos',
        lastName: 'Garcia',
        phone: '+34-91-123-4567',
        company: 'Innovate Spain',
        jobTitle: 'Product Manager',
        country: 'ES',
        lists: [prospectsList._id],
        team: team._id,
        tags: ['product', 'innovation'],
        importedFrom: {
          source: 'manual',
          importedAt: new Date()
        }
      }
    ];
    
    await Contact.insertMany(sampleContacts);
    console.log('👥 Created sample contacts');
    
    console.log('\n✅ Database seeding completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`   Users: ${await User.countDocuments()}`);
    console.log(`   Teams: ${await Team.countDocuments()}`);
    console.log(`   Lists: ${await List.countDocuments()}`);
    console.log(`   Contacts: ${await Contact.countDocuments()}`);
    
    console.log('\n🔑 Login Credentials:');
    console.log('   Admin: admin@example.com / admin123');
    console.log('   Member: member@example.com / member123');
    
    console.log(`\n🏢 Team ID: ${team._id}`);
    console.log(`📋 Prospects List ID: ${prospectsList._id}`);
    console.log(`📋 Customers List ID: ${customersList._id}`);
    
  } catch (error) {
    console.error('❌ Error seeding database:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
}

// Run seeding if called directly
if (require.main === module) {
  seedDatabase();
}

module.exports = seedDatabase;
