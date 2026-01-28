export default {
    dbURL: 'mongodb://127.0.0.1:27017',
    dbName: 'jamroom-local',
    secret1: process.env.SECRET1 || 'dev-secret-key-change-in-production',
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
