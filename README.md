# Contacts Importer Backend

Enterprise-grade backend service for importing and managing contacts with team-based access control, role-based permissions, and automated data processing capabilities.

## Features

- **Team-based Access Control**: Multi-tenant architecture with role-based permissions
- **Public Import API**: External integrations can submit import jobs without authentication
- **Background Job Processing**: Asynchronous import processing with configurable TTL
- **Data Enrichment**: Automatic country detection from phone numbers, email domain parsing
- **Deduplication**: Email-based deduplication within teams
- **Multiple Import Formats**: Support for CSV and JSON imports
- **Job Status Tracking**: Real-time status polling with phase information
- **Rate Limiting**: Built-in protection against abuse
- **Comprehensive Validation**: Input validation and error tracking

## Architecture

### Core Components

1. **Authentication & Authorization**
   - JWT-based authentication
   - Role-based access control (admin/member)
   - Team-level and list-level permissions

2. **Data Models**
   - Users, Teams, Lists, Contacts, ImportJobs
   - MongoDB with Mongoose ODM
   - Proper indexing for performance

3. **Background Processing**
   - Redis-backed job queue using Bull
   - Configurable job TTL and retry logic
   - Automatic cleanup of expired jobs

4. **Import Pipeline**
   - Validation → Deduplication → Enrichment → Saving
   - Error tracking and progress reporting
   - Support for large datasets

## API Endpoints

### Authentication (Private)
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/verify` - Verify JWT token

### Teams Management (Private)
- `GET /api/teams` - Get user teams
- `POST /api/teams` - Create team
- `GET /api/teams/:id` - Get team details
- `PUT /api/teams/:id` - Update team
- `DELETE /api/teams/:id` - Delete team
- `POST /api/teams/:id/members` - Add team member
- `DELETE /api/teams/:id/members/:userId` - Remove team member

### Lists Management (Private)
- `GET /api/lists/team/:teamId` - Get team lists
- `POST /api/lists` - Create list
- `GET /api/lists/:id` - Get list details
- `PUT /api/lists/:id` - Update list
- `DELETE /api/lists/:id` - Delete list
- `GET /api/lists/:id/stats` - Get list statistics

### Contacts Management (Private)
- `GET /api/contacts/list/:listId` - Get list contacts
- `POST /api/contacts` - Create contact
- `GET /api/contacts/:id` - Get contact details
- `PUT /api/contacts/:id` - Update contact
- `DELETE /api/contacts/:id` - Delete contact

### Import Jobs (Public + Private)
- `POST /api/imports/submit` - Submit import job (**PUBLIC**)
- `GET /api/imports/status/:jobId` - Get job status (**PUBLIC**)
- `GET /api/imports/history` - Get import history (Private)

## Installation & Setup

### Prerequisites
- Node.js 16+
- MongoDB 4.4+
- Redis 6+

### Installation

1. **Clone and install dependencies:**
```bash
npm install
```

2. **Configure environment:**
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Start required services:**
```bash
# Start MongoDB (if not running)
mongod

# Start Redis (if not running)
redis-server
```

4. **Run the application:**
```bash
# Development
npm run dev

# Production
npm start
```

## Configuration

Key environment variables in `.env`:

```bash
# Database
MONGODB_URI=mongodb://localhost:27017/contacts_importer
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRES_IN=24h

# Server
PORT=3000
NODE_ENV=development

# Import Jobs
DEFAULT_JOB_TTL=60
MAX_IMPORT_SIZE=10000
```

## Usage Examples

### 1. Register and Create Team

```bash
# Register user
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "password123",
    "name": "Admin User",
    "role": "admin"
  }'

# Login to get token
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "password123"
  }'

# Create team (use token from login)
curl -X POST http://localhost:3000/api/teams \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Sales Team",
    "description": "Main sales team"
  }'
```

### 2. Create List and Submit Import

```bash
# Create list
curl -X POST http://localhost:3000/api/lists \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Prospects",
    "description": "Sales prospects",
    "teamId": "TEAM_ID_FROM_ABOVE"
  }'

# Submit import job (PUBLIC - no auth required)
curl -X POST http://localhost:3000/api/imports/submit \
  -H "Content-Type: application/json" \
  -d '{
    "listId": "LIST_ID_FROM_ABOVE",
    "data": [
      {
        "email": "john@example.com",
        "firstName": "John",
        "lastName": "Doe",
        "phone": "+1234567890",
        "company": "Example Corp"
      }
    ],
    "ttl": 120,
    "tags": ["imported", "prospect"]
  }'
```

### 3. Check Import Status

```bash
# Check job status (PUBLIC - no auth required)
curl http://localhost:3000/api/imports/status/JOB_ID_FROM_SUBMIT
```

## Import Job Phases

Based on elapsed time vs TTL, jobs progress through phases:

- **pending** (0-10% of TTL)
- **validating** (10-30% of TTL)
- **deduplicating** (30-50% of TTL)
- **enriching** (50-80% of TTL)
- **saving** (80-100% of TTL)
- **completed** or **failed**

## Data Enrichment

The service automatically enriches contact data:

1. **Phone Number Processing**
   - Country detection from phone numbers
   - Phone number normalization
   - International format conversion

2. **Email Processing**
   - Email validation and normalization
   - Company name extraction from domain
   - Common email provider filtering

3. **Name Processing**
   - Name capitalization and formatting
   - Trimming and cleanup

## Security Features

- **JWT Authentication** with configurable expiration
- **Rate Limiting** on all endpoints
- **Input Validation** using Joi schemas
- **Helmet.js** security headers
- **CORS** configuration
- **File Upload Limits** (10MB max)

## Monitoring & Maintenance

### Health Check
```bash
curl http://localhost:3000/
```

### API Documentation
```bash
curl http://localhost:3000/api/docs
```

### Queue Statistics
The import queue automatically manages job lifecycle and provides statistics for monitoring.

## Error Handling

The service provides comprehensive error handling:

- **Validation Errors**: Detailed field-level validation messages
- **Authentication Errors**: Clear auth failure messages
- **Import Errors**: Row-level error tracking with context
- **System Errors**: Proper error logging and user-friendly messages

## Performance Considerations

- **Database Indexing**: Optimized indexes for common queries
- **Job Queue**: Configurable concurrency and retry logic
- **Memory Management**: Streaming for large file processing
- **Connection Pooling**: Efficient database connections

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

ISC License - see package.json for details
