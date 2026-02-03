# IdentityHub
## Overview

IdentityHub is a Non-Human Identity (NHI) management platform. This platform is used for tracking and managing service accounts, API keys, service principals, and other machine identities across cloud environments.

This is a full-stack platform that securely integrates Jira Cloud with:

* User-based OAuth authentication
* API key access for external systems

## Prerequisites

* Node.js (v16+)
* MongoDB Atlas or local MongoDB
* Atlassian Developer account (Jira OAuth app)
* OpenAI API key
* Jira Cloud site with issue creation permissions

---

## Tech Stack

* **Frontend:** React 19, Vite, Redux
* **Backend:** Node.js, Express
* **Database:** MongoDB
* **Integrations:** Jira Cloud OAuth 2.0, OpenAI API


## Core Features

### Authentication & Access

* JWT authentication (httpOnly cookies)
* API key authentication (`Authorization: Bearer ih_*`)
* bcrypt password hashing
* Async Local Storage for request-scoped user context

### Jira Cloud Integration

* OAuth 2.0 with state-based CSRF protection
* Encrypted token storage
* Automatic token refresh
* Create, search, and filter Jira issues

### API Key Management

* One-time visible API keys
* SHA-256 hashing at rest
* Usage tracking and revocation

### Security Findings API

* Submit findings via API key
* Automatically creates Jira tickets
* Validates issue data before creation


## Setup Instructions

### Backend Setup

```bash
cd IdentityHub_backend
npm install
npm start
```

#### Required `.env`

```bash
# Database
MONGO_URL=
DB_NAME=IdentityHub_db

# Server
PORT=3030

# Security
JWT_SECRET=
ENCRYPTION_KEY=

# Frontend
FRONTEND_URL=http://localhost:5173

# Jira OAuth
JIRA_CLIENT_ID=
JIRA_CLIENT_SECRET=
JIRA_REDIRECT_URI=http://localhost:3030/api/jira/callback

# OpenAI
OPENAI_API_KEY=


# Automation (Optional)
BLOG_DIGEST_PROJECT_KEY=your_project_key_for_automation
AUTOMATION_ADMIN_USER_ID=your-mongodb-user-id
```

---

### Jira OAuth App Setup

1. Go to [https://developer.atlassian.com/console/myapps/](https://developer.atlassian.com/console/myapps/)
2. Create a new OAuth 2.0 app
3. Add callback URL:

   ```
   http://localhost:3030/api/jira/callback
   ```
4. Enable scopes:

   * `read:jira-work`
   * `write:jira-work`
   * `read:jira-user`
   * `offline_access`
5. Copy Client ID and Client Secret to `.env`

**Note:** Apps in *Development mode* can only be authorized by the app owner.

---

### Frontend Setup

```bash
cd IdentityHub_frontend
npm install
npm run dev
```


## Database Models & Collections

### User (`user`)

```js
{
  _id: ObjectId,
  name: String,
  email: String,
  password: String,
  config: {
    jira: {
      cloudId: String,
      siteUrl: String,
      accessToken: String,
      refreshToken: String,
      expiresAt: Number,
      connectedAt: Date
    }
  }
}
```

### API Keys (`apikeys`)

```js
{
  _id: ObjectId,
  userId: ObjectId,
  name: String,
  hashedKey: String,
  createdAt: Date,
  lastUsedAt: Date,
  isActive: Boolean
}
```

### OAuth State (`oauth_states`)

```js
{
  _id: ObjectId,
  userId: String,
  state: String,
  createdAt: Date,
  expiresAt: Date
}
```

---

## Design Decisions

* **Proactive token refresh** before every Jira API call
* **Encrypted OAuth tokens** at rest (Cryptr)
* **MongoDB TTL indexes** for OAuth state cleanup
* **API keys hashed** and never stored in plaintext
* **AsyncLocalStorage** instead of passing `req` through services

---

## Assumptions

* Each user connects to **one Jira site**
* All authenticated users have equal permissions
* OpenAI failures fall back to extractive summaries

---

## Edge Cases Considered

### Authentication & Authorization
1. **Read-Only Jira Permissions** - User authenticates but lacks write permissions on selected project (Not implemented)
2. **JWT Token Expires During Session** - 24-hour token expiration causes 401 errors mid-session 
3. **API Key Outlives User Account** - Deleted user account leaves orphaned active API keys (Not implemented)
4. **User Signup With Used email** - User email addresses must be unique.

### Jira Integration
5. **OAuth State Expiration** - User takes >5 minutes to authorize, state token expires 
6. **Required Custom Fields** - Issue type requires fields not supported by application form

### API Key Usage

7. **Incomplete Payload from Scanner** - External system omits required fields (summary/description) (Not implemented)

### Data & Edge Conditions
8. **Description Exceeds Limits** - Content exceeds Jira's character limits causing validation errors (Not implemented)
9. **Invalid Issue Type** - Requested issue type doesn't exist in target project, (Not implemented in API only through UI)

### Frontend Issues
10. **Multiple Tabs Same Session** - User logs out in one tab, other tabs retain stale session
11. **Form Double-Submit** - User double-clicks button creating duplicate tickets


---

## Demo Script

### Browser

1. Open `http://localhost:5173`
2. Sign up and log in
3. Connect Jira via OAuth
4. Create a Jira ticket from UI
5. Generate an API key

---

### API (Terminal)

```bash
export API_KEY="ih_your_key"

curl -X POST http://localhost:3030/api/nhi-findings/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "projectKey": "<your-project-key>",
    "summary": "Demo security finding",
    "description": "Testing API integration",
    "issuetype": "Bug",
    "priority": "High"
  }'
```
---

## Blog Digest Automation

**What it does**

* Runs on a cron schedule or via manual trigger
* Scrapes the latest Oasis Security blog post
* Generates an AI summary
* Creates a Jira ticket on behalf of a connected user
* The automation is part of IdentityHub's backend

**Test Scheduled Automation:**

Modify `services/nhi-blog-digest/scheduler.service.js` to run every minute:

```javascript
// Change line 24 from:
const blogDigestJob = cron.schedule('0 15 * * 2', async () => {

// To (runs every minute for testing):
const blogDigestJob = cron.schedule('* * * * *', async () => {
```

Or trigger manually:

```bash
curl -X POST http://localhost:3030/api/automation/blog-digest \
  -b cookies.txt
```