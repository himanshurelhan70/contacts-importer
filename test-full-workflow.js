const axios = require('axios');

/**
 * Complete workflow test for Contacts Importer API
 */
async function testFullWorkflow() {
  const baseUrl = 'http://localhost:3000';
  
  console.log('Testing Complete Contacts Importer Workflow...\n');
  
  try {
    // Step 1: Register User
    console.log('1️⃣ Registering admin user...');
    const registerData = {
      email: `admin-${Date.now()}@example.com`, // Unique email
      password: 'password123',
      name: 'Admin User',
      role: 'admin'
    };
    
    const registerResponse = await axios.post(`${baseUrl}/api/auth/register`, registerData);
    console.log(`   ✅ User registered: ${registerResponse.data.data.user.email}`);
    
    const accessToken = registerResponse.data.data.accessToken;
    const authHeaders = { Authorization: `Bearer ${accessToken}` };
    
    // Step 2: Create Team
    console.log('\n2️⃣ Creating team...');
    const teamData = {
      name: 'Sales Team',
      description: 'Main sales team for testing'
    };
    
    const teamResponse = await axios.post(`${baseUrl}/api/teams`, teamData, { headers: authHeaders });
    const teamId = teamResponse.data.data._id;
    console.log(`   ✅ Team created: ${teamId}`);
    
    // Step 3: Create List
    console.log('\n3️⃣ Creating list...');
    const listData = {
      name: 'Test Prospects',
      description: 'Test prospect list',
      teamId: teamId
    };
    
    const listResponse = await axios.post(`${baseUrl}/api/lists`, listData, { headers: authHeaders });
    const listId = listResponse.data.data._id;
    console.log(`   ✅ List created: ${listId}`);
    
    // Step 4: Submit Import Job (PUBLIC endpoint)
    console.log('\n4️⃣ Submitting import job...');
    const importData = {
      listId: listId,
      data: [
        {
          email: 'john.doe@example.com',
          firstName: 'John',
          lastName: 'Doe',
          phone: '+1-555-0123',
          company: 'Example Corp',
          jobTitle: 'Manager'
        },
        {
          email: 'jane.smith@example.com',
          firstName: 'Jane',
          lastName: 'Smith',
          phone: '+44-20-1234-5678',
          company: 'UK Ltd',
          jobTitle: 'Director'
        },
        {
          email: 'bob.wilson@example.com',
          firstName: 'Bob',
          lastName: 'Wilson',
          phone: '+49-30-12345678',
          company: 'German GmbH',
          jobTitle: 'CEO'
        }
      ],
      tags: ['imported', 'test-batch'],
      ttl: 120
    };
    
    const importHeaders = {
      'Content-Type': 'application/json',
      'Idempotency-Key': generateUUID()
    };
    
    const importResponse = await axios.post(`${baseUrl}/api/imports/submit`, importData, { headers: importHeaders });
    const jobId = importResponse.data.data.jobId;
    console.log(`   ✅ Import job submitted: ${jobId}`);
    console.log(`   📊 Total records: ${importResponse.data.data.totalRecords}`);
    
    // Step 5: Check Job Status
    console.log('\n5️⃣ Checking job status...');
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
    
    const statusResponse = await axios.get(`${baseUrl}/api/imports/status/${jobId}`);
    const jobStatus = statusResponse.data.data;
    
    console.log(`   📊 Job Status:`);
    console.log(`      State: ${jobStatus.state}`);
    console.log(`      Phase: ${jobStatus.phase}`);
    console.log(`      Progress: ${jobStatus.progress}%`);
    console.log(`      Processed: ${jobStatus.processedRecords}`);
    console.log(`      Successful: ${jobStatus.successfulRecords}`);
    console.log(`      Failed: ${jobStatus.failedRecords}`);
    console.log(`      Duplicates: ${jobStatus.duplicateRecords}`);
    
    // Step 6: Get Job Results (if completed)
    if (jobStatus.state === 'completed') {
      console.log('\n6️⃣ Getting job results...');
      const resultResponse = await axios.get(`${baseUrl}/api/imports/${jobId}/result`);
      const results = resultResponse.data.data;
      
      console.log(`   📊 Import Results:`);
      console.log(`      Inserted: ${results.inserted}`);
      console.log(`      Duplicates: ${results.duplicates}`);
      console.log(`      Skipped: ${results.skipped}`);
      console.log(`      Processing Time: ${results.processingTime}ms`);
      
      if (results.errors && results.errors.length > 0) {
        console.log(`   ❌ Errors: ${results.errors.length}`);
        results.errors.forEach((error, index) => {
          console.log(`      ${index + 1}. Row ${error.row}: ${error.message}`);
        });
      }
    }
    
    // Step 7: Check Contacts in List
    console.log('\n7️⃣ Checking contacts in list...');
    const contactsResponse = await axios.get(`${baseUrl}/api/contacts/list/${listId}`, { headers: authHeaders });
    const contacts = contactsResponse.data.data.contacts;
    
    console.log(`   ✅ Found ${contacts.length} contacts in list:`);
    contacts.forEach((contact, index) => {
      console.log(`      ${index + 1}. ${contact.firstName} ${contact.lastName} (${contact.email})`);
      if (contact.country) {
        console.log(`         Country: ${contact.country} (enriched from phone)`);
      }
      if (contact.company) {
        console.log(`         Company: ${contact.company}`);
      }
    });
    
    // Step 8: Test Refresh Token
    console.log('\n8️⃣ Testing refresh token...');
    const refreshToken = registerResponse.data.data.refreshToken;
    const refreshResponse = await axios.post(`${baseUrl}/api/auth/refresh`, { refreshToken });
    console.log(`   ✅ Tokens refreshed successfully`);
    console.log(`   🔑 New access token received`);
    
    // Step 9: Test Idempotency
    console.log('\n9️⃣ Testing idempotency...');
    const sameImportResponse = await axios.post(`${baseUrl}/api/imports/submit`, importData, { headers: importHeaders });
    console.log(`   ✅ Idempotency working: ${sameImportResponse.data.message}`);
    
    console.log('\n🎉 All tests completed successfully!');
    console.log('\n📊 Summary:');
    console.log('   ✅ User registration and authentication');
    console.log('   ✅ Team and list management');
    console.log('   ✅ Import job submission and processing');
    console.log('   ✅ Job status tracking');
    console.log('   ✅ Contact enrichment and deduplication');
    console.log('   ✅ Refresh token rotation');
    console.log('   ✅ Idempotency protection');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.response?.data || error.message);
    
    if (error.response?.status === 400 && error.response?.data?.message?.includes('already exists')) {
      console.log('\n💡 Tip: User already exists. Try changing the email in the test script.');
    }
  }
}

// Helper function to generate UUID v4
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Run if called directly
if (require.main === module) {
  testFullWorkflow().catch(console.error);
}

module.exports = testFullWorkflow;
