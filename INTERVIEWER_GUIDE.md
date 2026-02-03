# IdentityHub - Full Stack Interviewer Documentation

## Project Overview

**Architecture:**
- **Frontend:** React 19 + Vite + Redux
- **Backend:** Node.js + Express + MongoDB
- **Integration:** Jira Cloud OAuth 2.0, OpenAI API
- **Automation:** Cron-based blog digest scheduler

**Key Capabilities:**
- User authentication and account management (JWT-based)
- Jira Cloud integration with OAuth 2.0
- API key management for external service integrations
- Automated blog digest with AI summarization
- Security findings submission via API
- Scheduled automation using cron jobs


## Architecture Overview

### Backend Architecture

**Entry Point:** `/server.js`
- Express.js server on port 3030
- CORS enabled for development (localhost:3000, 5173, 8080)
- Static file serving for built frontend
- Graceful shutdown handling with SIGTERM/SIGINT
- Initializes OAuth state service and scheduled jobs on startup

**Middleware Stack:**
1. `setupAls.middleware.js` - Async Local Storage Setup (runs on every request)
   - Verifies JWT token from `loginToken` cookie
   - Stores user in AsyncLocalStorage for request context
2. `requireAuth.middleware.js` - JWT Authentication
   - Checks AsyncLocalStorage for logged-in user
   - Returns 401 if not authenticated
3. `requireApiKey.middleware.js` - API Key Authentication
   - Validates Bearer token format
   - Updates last-used timestamp

**Service Layer Pattern:**
- **Controllers** - Handle HTTP requests/responses, validation
- **Services** - Business logic, database operations, external APIs
- **Middlewares** - Cross-cutting concerns (auth, logging, CORS)

### Frontend Architecture

**Entry Point:** `/src/main.jsx`
- React 19 with Vite for development
- Redux store for state management
- React Router v7 for navigation


## Features

### 1. Authentication & Authorization

#### Backend Implementation

**User Authentication:**
- JWT-based authentication with 24-hour token expiration
- Secure httpOnly cookies (`loginToken`)
- Password hashing using bcrypt (10 salt rounds)
- Cookie settings: `sameSite: Lax`, `secure: true` (production)

**API Key Authentication:**
- Bearer token format: `Authorization: Bearer ih_<key>`
- Generated using cryptographically secure `crypto.randomBytes(32)`
- Keys stored as SHA-256 hashes (plain key shown only once)
- Tracks usage via `lastUsedAt` timestamp
- Prefix validation (`ih_` prefix)

**OAuth 2.0 (Jira):**
- Atlassian OAuth 2.0 flow with state-based CSRF protection
- State tokens stored in MongoDB with automatic 5-minute TTL cleanup
- Token encryption/decryption using Cryptr library
- Proactive token refresh (checks expiration before each request)
- Scopes: `read:jira-work`, `write:jira-work`, `read:jira-user`, `offline_access`

#### Frontend Implementation

**User Session Management:**
- Redux store for current user state
- sessionStorage for persistence across page reloads
- Automatic redirect to login on 401 responses
- Protected routes via `ProtectedRoute` HOC
`

### 2. Jira Cloud Integration

#### Backend Implementation

**OAuth Flow:**
- State-based CSRF protection with MongoDB persistence
- Atomic state validation using `findOneAndDelete` (one-time use)
- Secure token storage with encryption
- Automatic cleanup of expired states via MongoDB TTL indexes

**Jira API Features:**
- List accessible projects
- Fetch project metadata (issue types, fields)
- Create Jira tickets with custom fields
- Search tickets with JQL queries
- Filter tickets by projects

**Token Management:**
- Proactive token refresh before each API call
- Encrypted storage with Cryptr (SECRET1)
- Automatic token refresh using refresh token
- Updates database with new tokens

#### Frontend Implementation

**Jira Connection Page:**
- Shows connection status (connected/not connected)
- OAuth initiation button
- Displays connected Jira site URL
- Disconnect button

**Ticket Creation:**
- Form with project and issue type selection
- Summary and description fields
- Creates ticket via API
- Shows success with link to Jira ticket

**Recent Tickets:**
- Lists tickets created from IdentityHub
- Filter by project
- Shows ticket key, summary, status, link

### 3. Automated Blog Digest

**Backend Implementation:**

**Scheduled Automation:**
- Runs every Tuesday at 3:00 PM UTC (configurable via cron expression)
- Manual trigger available: `POST /api/automation/blog-digest`

**Workflow:**
1. **Scrape** latest blog post from Oasis Security blog (`oasis.security/blog`)
2. **Extract** title, author, content, date, and URL
3. **Summarize** content using OpenAI GPT-3.5-turbo
4. **Authenticate** using first available user with Jira
5. **Refresh** expired tokens automatically
6. **Create** Jira ticket with formatted description

**Jira Ticket Format:**
- Summary: `[Blog Digest] {blog_title}`
- Description: Atlassian Document Format (ADF) with:
  - AI-generated summary
  - Full article metadata (title, URL, author)
  - Automation info footer
- Labels: `blog-digest`, `automation`, `nhi`, `created-from-identityhub`
- Issue type: Task

**Error Handling & Fallbacks:**
- Falls back to extractive summary if OpenAI API fails
- Uses basic text extraction if web scraping fails
- User lookup: first user with Jira connected
- Comprehensive error logging

### 4. API Key Management

#### Backend Implementation
- Generate API keys with `ih_` prefix
- List user's active API keys
- Revoke/delete API keys
- Track last usage timestamp
- SHA-256 hashing for secure storage

#### Frontend Implementation
- **ApiKeysPage:** Manage all API keys
- Generate new keys with custom names
- Display key only once (copy to clipboard)
- List all keys with creation date and last used
- Delete/revoke keys

### 5. NHI Findings Integration

**Backend Implementation:**
- Submit security findings via API (requires API key authentication)
- Automatically creates Jira tickets for findings
- Supports custom project and issue type selection
- Validates issue data before creation
- Auto-adds labels: `nhi-finding`, `created-via-api`, `created-from-identityhub`


## Database Models & Collections

**Database:** MongoDB (local: `identityhub-local` / production: `IdentityHub_db`)

### User Collection (`user`)
```javascript
{
  _id: ObjectId,
  name: String,
  email: String,              // Unique
  password: String,           // bcrypt hash
  config: {
    jira: {
      cloudId: String,
      siteUrl: String,
      accessToken: String,    // Encrypted with Cryptr
      refreshToken: String,   // Encrypted with Cryptr
      expiresAt: Number,      // Timestamp
      connectedAt: Date
    }
  }
}
```

### API Keys Collection (`apikeys`)
```javascript
{
  _id: ObjectId,
  userId: ObjectId,
  name: String,
  hashedKey: String,          // SHA-256 hash
  createdAt: Date,
  lastUsedAt: Date,
  isActive: Boolean
}
```

### OAuth State Collection (`oauth_states`)
```javascript
{
  _id: ObjectId,
  userId: String,
  state: String,              
  createdAt: Date,
  expiresAt: Date            // TTL index (auto-deletes after 5 min)
}
```

## Architecture & Design Decisions

### 1. Security-First Approach

**Token Encryption:**
- All Jira OAuth tokens are encrypted at rest using Cryptr library
- Separate encryption for access tokens and refresh tokens
- Never store plain tokens in database

**API Key Security:**
- SHA-256 hashing for API keys (irreversible)
- Plain key shown only once at generation
- Prefix validation prevents accidental exposure

**CSRF Protection:**
- OAuth state tokens with cryptographic randomness
- One-time use via atomic `findOneAndDelete`
- 5-minute TTL for automatic cleanup

**Password Security:**
- bcrypt hashing with 10 salt rounds
- Passwords never logged or exposed in API responses

### 2. Proactive Token Refresh Strategy

**Implementation:**
- Checks token expiration **before** each API request
- Automatically refreshes expired tokens
- Updates database with new tokens
- Prevents 401 errors proactively

**Why this approach:**
- Simple and predictable
- No complex interceptor logic needed
- Token refresh happens in one place (controller layer)
- Easy to debug and test


### 3. MongoDB TTL Indexes for Automatic Cleanup

**OAuth States:**
- TTL index on `expiresAt` field
- MongoDB automatically deletes expired documents
- No need for manual cleanup jobs
- Prevents database bloat

**Benefits:**
- Zero maintenance overhead
- No cron jobs needed for cleanup
- Guaranteed cleanup even if server crashes

### 4. Async Local Storage (ALS) for Request Context

**Why:**
- Provides request-scoped storage without passing `req` object everywhere
- JWT extraction happens once per request
- Services can access `loggedinUser` without coupling to Express


### 5. Service Layer Architecture

**Separation of Concerns:**
- **Controllers** - Handle HTTP requests/responses, validation
- **Services** - Business logic, database operations, external APIs
- **Middlewares** - Cross-cutting concerns (auth, logging, CORS)

**Benefits:**
- Easy to test (services are pure functions)
- Reusable logic (services used by multiple controllers)
- Clear boundaries between layers

### 6. Redux State Management (Frontend)

**Why Redux:**
- Centralized user state accessible from any component
- Predictable state updates (actions + reducers)
- Easy to debug with Redux DevTools


### 7. HTTP Service Layer (Frontend)

**Why abstraction:**
- Single source of truth for API base URL
- Automatic credentials handling
- Centralized error handling
- Easy to add interceptors or logging

### 8. Protected Routes (Frontend)

**Implementation:**
- HOC component wraps protected routes
- Checks sessionStorage for logged-in user
- Redirects to login if not authenticated



### 9. Event Bus Pattern (Frontend)

**Why:**
- Decoupled UI notifications
- Any component can trigger toast messages
- UserMsg component listens and displays


### 10. Graceful Shutdown Handling (Backend)

**Why:**
- Prevents data loss during deployments
- Stops cron jobs cleanly
- Closes database connections properly


## Setup Instructions

### Prerequisites
- Node.js (v16+ recommended)
- MongoDB Atlas account or local MongoDB instance
- Atlassian Developer account for Jira OAuth app
- OpenAI API key

### Backend Setup

#### 1. Environment Variables

Create a `.env` file in the backend root:

```bash
# Database
MONGO_URL="mongodb+srv://<username>:<password>@<cluster>.mongodb.net/"
DB_NAME="IdentityHub_db"

# Server
PORT=3030

# Security
SECRET1='your-encryption-secret-key'
JWT_SECRET='your-jwt-secret-key-min-32-chars'

# Frontend
FRONTEND_URL=http://localhost:5173

# Jira OAuth Configuration
JIRA_CLIENT_ID=your_jira_client_id
JIRA_CLIENT_SECRET=your_jira_client_secret
JIRA_REDIRECT_URI=http://localhost:3030/api/jira/callback

# OpenAI
OPENAI_API_KEY=sk-proj-...

# Automation (Optional)
BLOG_DIGEST_PROJECT_KEY=youe_project_key_for_automation
AUTOMATION_ADMIN_USER_ID=your-mongodb-user-id

```

#### 2. Jira OAuth App Setup

1. Go to [Atlassian Developer Console](https://developer.atlassian.com/console/myapps/)
2. Create a new OAuth 2.0 app
3. Add callback URL: `http://localhost:3030/api/jira/callback`
4. Enable scopes:
   - `read:jira-work`
   - `write:jira-work`
   - `read:jira-user`
   - `offline_access`
5. Copy Client ID and Client Secret to `.env`

**Important:** If your OAuth app is in "Development" mode, only the app owner can authorize.


#### 3. Install & Run

```bash
cd IdentityHub_backend

# Install dependencies
npm install

# Start the server
npm start

# For development with auto-reload
npm run dev
```

### Frontend Setup

#### 1. Install & Run

```bash
cd IdentityHub_frontend

# Install dependencies
npm install

# Start development server (Vite)
npm run dev

# Build for production
npm run build
```

#### 2. Configuration

The frontend automatically detects the environment:
- **Development:** API at `http://localhost:3030/api/`
- **Production:** API at `/api/` (served by backend)

No `.env` file needed for frontend.


## Testing the Application

**Test Scheduled Automation:**

Modify `services/nhi-blog-digest/scheduler.service.js` to run every minute:

```javascript
// Change line 24 from:
const blogDigestJob = cron.schedule('0 15 * * 2', async () => {

// To (runs every minute for testing):
const blogDigestJob = cron.schedule('* * * * *', async () => {
```

Restart server and watch logs:
```bash
tail -f logs/backend.log
```
---

## Complete Demo Script

### Test the system:

### Browser:
```
1. Open http://localhost:5173/

2. Sign up:
   - Name: Demo User
   - Email: demo@example.com
   - Password: Demo123!

3. Login with credentials

4. Connect Jira:
   - Click "Connect to Jira"
   - Authorize on Atlassian
   - Wait for redirect to success page

5. Create Ticket:
   - Navigate to "Create Ticket"
   - Select project
   - Enter summary: "Demo ticket"
   - Enter description: "Testing the system"
   - Click "Create Ticket"

6. Generate API Key:
   - Navigate to "API Keys"
   - Click "Generate New API Key"
   - Name: "Demo Key"
   - Copy the key

7. Test API Key (new terminal):
```

### API Terminal:
```bash
# Save the API key
export API_KEY="ih_your_copied_key"

# Create finding via API
curl -X POST http://localhost:3030/api/nhi-findings/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "projectKey": "your_projectKey",
    "summary": "Demo security finding",
    "description": "Testing API key integration",
    "issuetype": "Bug",
    "priority": "High"
  }'

# Response:
# {
#   "message": "Issue created successfully",
#   "issue": {
#     "key": "NHI-124",
#     "url": "https://your-site.atlassian.net/browse/NHI-124"
#   }
# }

After signup!
# Trigger blog digest
curl -X POST http://localhost:3030/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@example.com","password":"Demo123!"}' \
  -c cookies.txt

curl -X POST http://localhost:3030/api/automation/blog-digest \
  -b cookies.txt

# Response:
# {
#   "message": "Blog digest automation completed successfully",
#   "result": {
#     "success": true,
#     "blogPost": {
#       "title": "Latest Oasis Blog Post Title",
#       "url": "https://www.oasis.security/blog/..."
#     },
#     "jiraTicket": {
#       "key": "NHI-125",
#       "url": "https://your-site.atlassian.net/browse/NHI-125"
#     },
#     "duration": "3.45s"
#   }
# }
```

### Browser:
```
10. View Recent Tickets:
    - Navigate to "Recent Tickets"
    - See all 3 created tickets:
      * Manual ticket from UI
      * NHI finding from API
      * Blog digest automation
```

---

## Edge Cases Considered

### Authentication & Authorization
1. **Read-Only Jira Permissions** - User authenticates but lacks write permissions on selected project
2. **JWT Token Expires During Session** - 24-hour token expiration causes 401 errors mid-session
3. **API Key Outlives User Account** - Deleted user account leaves orphaned active API keys
4. **Duplicate User Registration** - Email uniqueness validation may not be consistent

### Jira Integration
5. **Refresh Token Invalidation** - User revokes access in Atlassian, breaking all operations
6. **OAuth State Expiration** - User takes >5 minutes to authorize, state token expires
7. **Jira Project Deleted** - User attempts ticket creation in archived/deleted project
8. **Required Custom Fields** - Issue type requires fields not supported by application form
9. **Jira Site URL Changes** - Company rebrand invalidates stored siteUrl

### API Key Usage
10. **Concurrent API Key Usage** - Same key used by multiple scanners simultaneously
11. **API Key Name XSS** - Special characters in key name not sanitized for display
12. **Incomplete Payload from Scanner** - External system omits required fields (summary/description)

### Data & Edge Conditions
13. **Description Exceeds Limits** - Content exceeds Jira's character limits causing validation errors
14. **Special Characters Break ADF** - Markdown/ADF characters in content break Jira formatting
15. **Invalid Issue Type** - Requested issue type doesn't exist in target project
16. **Priority Field Unavailable** - Selected issue type doesn't support priority field

### Blog Digest Automation
17. **Blog HTML Structure Changes** - Web scraper breaks when Oasis updates CSS/structure
18. **OpenAI Rate Limit** - API quota exceeded, summary generation fails without proper fallback
19. **No Users with Jira** - Scheduler triggers but no connected users exist
20. **Duplicate Blog Processing** - Same post processed multiple times (no tracking mechanism)
21. **Non-English Content** - Blog post in different language produces unexpected AI summary

### Frontend Issues
22. **Multiple Tabs Same Session** - User logs out in one tab, other tabs retain stale session
23. **Browser Blocks Cookies** - Strict privacy settings prevent JWT cookie from being set
24. **Form Double-Submit** - User double-clicks button creating duplicate tickets


## Assumptions Made

1. **MongoDB Atlas:** Assumed hosted MongoDB (connection string format)
2. **Single Jira Site:** Each user connects to one Jira site (uses first accessible resource)
3. **Task Issue Type:** Blog digest creates "Task" issues (configurable per project)
4. **UTC Timezone:** Scheduled jobs run in UTC (Tuesday 3 PM UTC)
5. **HTTP-Only Cookies:** Session management via httpOnly cookies for XSS protection
6. **Same Origin Frontend:** Frontend runs on configured `FRONTEND_URL`
7. **Unique Email:** User email addresses must be unique
8. **OpenAI Fallback:** If OpenAI fails, falls back to extractive summary
9. **Browser Support:** Modern browsers with ES6+ support
10. **No Role-Based Access:** All authenticated users have same permissions

---

**Tech Stack:** React 19 + Vite + Redux | Node.js + Express + MongoDB | Jira OAuth 2.0 + OpenAI
