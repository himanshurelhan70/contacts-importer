const axios = require('axios');

/**
 * Test script to check which endpoints are working
 */
async function testEndpoints() {
  const baseUrl = 'http://localhost:3000';
  
  console.log('🧪 Testing Contacts Importer API Endpoints...\n');
  
  const tests = [
    {
      name: 'Health Check',
      method: 'GET',
      url: `${baseUrl}/`,
      description: 'Basic server health check'
    },
    {
      name: 'API Documentation',
      method: 'GET', 
      url: `${baseUrl}/api/docs`,
      description: 'API documentation endpoint'
    },
    {
      name: 'Register User',
      method: 'POST',
      url: `${baseUrl}/api/auth/register`,
      data: {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
        role: 'admin'
      },
      description: 'Test user registration with MongoDB'
    }
  ];

  for (const test of tests) {
    try {
      console.log(`\n🔍 Testing: ${test.name}`);
      console.log(`   ${test.method} ${test.url}`);
      console.log(`   ${test.description}`);
      
      let response;
      if (test.method === 'GET') {
        response = await axios.get(test.url);
      } else if (test.method === 'POST') {
        const config = {
          headers: {
            'Content-Type': 'application/json',
            ...test.headers
          }
        };
        response = await axios.post(test.url, test.data, config);
      }
      
      console.log(`   ✅ Status: ${response.status}`);
      if (response.data.message) {
        console.log(`   📝 Message: ${response.data.message}`);
      }
      
    } catch (error) {
      if (error.response) {
        console.log(`   ❌ Status: ${error.response.status}`);
        console.log(`   📝 Error: ${error.response.data.message || 'Unknown error'}`);
        
        // Some errors are expected (like DB connection issues)
        if (error.response.status === 500 && error.response.data.message?.includes('connect')) {
          console.log(`   💡 Expected: Database not connected`);
        }
      } else {
        console.log(`   ❌ Network Error: ${error.message}`);
      }
    }
  }
  
  console.log('\n📊 Test Summary:');
  console.log('   - Health check and docs should work');
  console.log('   - Auth endpoints will fail without MongoDB');
  console.log('   - Import endpoints will fail without MongoDB + Redis');
  console.log('\n💡 To test fully, either:');
  console.log('   1. Use: node index-simple.js (in-memory version)');
  console.log('   2. Set up MongoDB + Redis and run: node index.js');
}

// Run if called directly
if (require.main === module) {
  testEndpoints().catch(console.error);
}

module.exports = testEndpoints;
