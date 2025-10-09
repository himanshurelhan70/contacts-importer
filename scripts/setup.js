#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Setting up Contacts Importer Microservice...\n');

// Check if required services are running
function checkService(command, serviceName) {
  try {
    execSync(command, { stdio: 'ignore' });
    console.log(`✅ ${serviceName} is running`);
    return true;
  } catch (error) {
    console.log(`❌ ${serviceName} is not running`);
    return false;
  }
}

// Check MongoDB
const mongoRunning = checkService('mongosh --eval "db.runCommand({ping: 1})" --quiet', 'MongoDB');

// Check Redis
const redisRunning = checkService('redis-cli ping', 'Redis');

if (!mongoRunning || !redisRunning) {
  console.log('\n⚠️  Please ensure MongoDB and Redis are running before starting the application.');
  console.log('\nTo start MongoDB: mongod');
  console.log('To start Redis: redis-server');
  console.log('\nOr use Docker:');
  console.log('docker run -d -p 27017:27017 --name mongodb mongo');
  console.log('docker run -d -p 6379:6379 --name redis redis');
}

// Check if .env exists
if (!fs.existsSync('.env')) {
  console.log('\n📝 Creating .env file from .env.example...');
  fs.copyFileSync('.env.example', '.env');
  console.log('✅ .env file created');
  console.log('⚠️  Please review and update the .env file with your configuration');
} else {
  console.log('✅ .env file exists');
}

// Install dependencies if node_modules doesn't exist
if (!fs.existsSync('node_modules')) {
  console.log('\n📦 Installing dependencies...');
  try {
    execSync('npm install', { stdio: 'inherit' });
    console.log('✅ Dependencies installed');
  } catch (error) {
    console.log('❌ Failed to install dependencies');
    process.exit(1);
  }
} else {
  console.log('✅ Dependencies already installed');
}

console.log('\n🎯 Next steps:');
console.log('1. Review and update .env file if needed');
console.log('2. Ensure MongoDB and Redis are running');
console.log('3. Seed the database: npm run seed');
console.log('4. Start the server: npm run dev');
console.log('5. Test the API: npm run test-import');

console.log('\n📚 Useful commands:');
console.log('npm run dev        - Start development server');
console.log('npm run seed       - Seed database with sample data');
console.log('npm run test-import - Run API tests');
console.log('npm start          - Start production server');

console.log('\n🌐 API Endpoints:');
console.log('Health Check: http://localhost:3000');
console.log('API Docs: http://localhost:3000/api/docs');
console.log('Import Submit: POST http://localhost:3000/api/imports/submit');

console.log('\n✨ Setup complete! Happy coding! ✨');
