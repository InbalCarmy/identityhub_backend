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
    }
}





