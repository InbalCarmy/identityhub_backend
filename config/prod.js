export default {
    dbURL: process.env.MONGO_URL,
    dbName: process.env.DB_NAME,
    secret1: process.env.SECRET1,
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
    jira: {
        clientId: process.env.JIRA_CLIENT_ID,
        clientSecret: process.env.JIRA_CLIENT_SECRET,
        redirectUri: process.env.JIRA_REDIRECT_URI || 'http://localhost:3030/api/jira/callback',
        scopes: [
            'read:jira-work',
            'write:jira-work',
            'read:jira-user',
            'offline_access'
        ]
    },
    openai: {
        apiKey: process.env.OPENAI_API_KEY
    },
    automation: {
        // Optional: Preferred user ID for scheduled automation tasks
        // If not set, will use the first available user with Jira connected
        adminUserId: process.env.AUTOMATION_ADMIN_USER_ID,
        // Default Jira project key for blog digest tickets
        defaultProjectKey: process.env.BLOG_DIGEST_PROJECT_KEY || 'BLOG'
    }
}





