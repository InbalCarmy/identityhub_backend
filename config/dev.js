export default {
    dbURL: 'mongodb://127.0.0.1:27017',
    dbName: 'identityhub-local',
    encryption_key: process.env.ENCRYPTION_KEY || 'dev-secret-key-change-in-production',
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
    }
}
