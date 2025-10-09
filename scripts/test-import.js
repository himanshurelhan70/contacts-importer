const axios = require('axios');
const fs = require('fs');

/**
 * Test script for import functionality
 */
async function testImport() {
  const baseUrl = 'http://localhost:3000/api';
  
  console.log('🧪 Testing Contacts Importer API...\n');
  
  try {
    // 1. Health check
    console.log('1️⃣ Health check...');
    const healthResponse = await axios.get('http://localhost:3000');
    console.log('✅ Server is healthy:', healthResponse.data.message);
    
    // 2. Login to get auth token
    console.log('\n2️⃣ Logging in...');
    const loginResponse = await axios.post(`${baseUrl}/auth/login`, {
      email: 'admin@example.com',
      password: 'admin123'
    });
    
    const token = loginResponse.data.data.token;
    const authHeaders = { Authorization: `Bearer ${token}` };
    console.log('✅ Login successful');
    
    // 3. Get teams
    console.log('\n3️⃣ Getting teams...');
    const teamsResponse = await axios.get(`${baseUrl}/teams`, { headers: authHeaders });
    const team = teamsResponse.data.data[0];
    console.log(`✅ Found team: ${team.name} (ID: ${team._id})`);
    
    // 4. Get lists
    console.log('\n4️⃣ Getting lists...');
    const listsResponse = await axios.get(`${baseUrl}/lists/team/${team._id}`, { headers: authHeaders });
    const list = listsResponse.data.data[0];
    console.log(`✅ Found list: ${list.name} (ID: ${list._id})`);
    
    // 5. Submit import job (PUBLIC endpoint - no auth needed)
    console.log('\n5️⃣ Submitting import job...');
    const importData = [
      {
        email: 'test1@example.com',
        firstName: 'Test',
        lastName: 'User 1',
        phone: '+1-555-1001',
        company: 'Test Company 1',
        jobTitle: 'Manager'
      },
      {
        email: 'test2@example.com',
        firstName: 'Test',
        lastName: 'User 2',
        phone: '+44-20-1234-1002',
        company: 'Test Company 2',
        jobTitle: 'Director'
      },
      {
        email: 'test3@example.com',
        firstName: 'Test',
        lastName: 'User 3',
        phone: '+49-30-1234-1003',
        company: 'Test Company 3',
        jobTitle: 'CEO'
      },
      {
        email: 'invalid-email', // This should cause a validation error
        firstName: 'Invalid',
        lastName: 'User'
      }
    ];
    
    const importResponse = await axios.post(`${baseUrl}/imports/submit`, {
      listId: list._id,
      data: importData,
      ttl: 120,
      tags: ['test-import', 'api-test']
    });
    
    const jobId = importResponse.data.data.jobId;
    console.log(`✅ Import job submitted: ${jobId}`);
    console.log(`   Status: ${importResponse.data.data.status}`);
    console.log(`   Total records: ${importResponse.data.data.totalRecords}`);
    
    // 6. Poll job status
    console.log('\n6️⃣ Polling job status...');
    let jobCompleted = false;
    let attempts = 0;
    const maxAttempts = 30;
    
    while (!jobCompleted && attempts < maxAttempts) {
      attempts++;
      
      const statusResponse = await axios.get(`${baseUrl}/imports/status/${jobId}`);
      const status = statusResponse.data.data;
      
      console.log(`   Attempt ${attempts}: ${status.status} - ${status.phase} (${status.progress}%)`);
      
      if (status.status === 'completed' || status.status === 'failed' || status.status === 'expired') {
        jobCompleted = true;
        
        console.log('\n📊 Final Results:');
        console.log(`   Status: ${status.status}`);
        console.log(`   Total Records: ${status.totalRecords}`);
        console.log(`   Processed: ${status.processedRecords}`);
        console.log(`   Successful: ${status.successfulRecords}`);
        console.log(`   Failed: ${status.failedRecords}`);
        console.log(`   Duplicates: ${status.duplicateRecords}`);
        console.log(`   Processing Time: ${status.processingTime}ms`);
        
        if (status.errors && status.errors.length > 0) {
          console.log('\n❌ Errors:');
          status.errors.forEach((error, index) => {
            console.log(`   ${index + 1}. Row ${error.row}: ${error.message}`);
          });
        }
      } else {
        // Wait 2 seconds before next poll
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    if (!jobCompleted) {
      console.log('⏰ Job polling timed out');
    }
    
    // 7. Check contacts in list
    console.log('\n7️⃣ Checking contacts in list...');
    const contactsResponse = await axios.get(`${baseUrl}/contacts/list/${list._id}`, { headers: authHeaders });
    const contacts = contactsResponse.data.data.contacts;
    
    console.log(`✅ Found ${contacts.length} contacts in list:`);
    contacts.forEach((contact, index) => {
      console.log(`   ${index + 1}. ${contact.firstName} ${contact.lastName} (${contact.email}) - ${contact.company || 'No company'}`);
      if (contact.country) {
        console.log(`      Country: ${contact.country} (enriched from phone)`);
      }
    });
    
    // 8. Get import history
    console.log('\n8️⃣ Getting import history...');
    const historyResponse = await axios.get(`${baseUrl}/imports/history`, { headers: authHeaders });
    const jobs = historyResponse.data.data.jobs;
    
    console.log(`✅ Found ${jobs.length} import jobs in history:`);
    jobs.forEach((job, index) => {
      console.log(`   ${index + 1}. ${job.jobId} - ${job.status} (${job.totalRecords} records)`);
    });
    
    console.log('\n🎉 All tests completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.response?.data || error.message);
    
    if (error.response?.status === 404) {
      console.log('\n💡 Tip: Make sure to run the seed script first:');
      console.log('   node utils/seedData.js');
    }
  }
}

// Run test if called directly
if (require.main === module) {
  testImport();
}

module.exports = testImport;
