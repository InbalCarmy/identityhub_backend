import axios from 'axios'
import Cryptr from 'cryptr'
import { config } from '../../config/index.js'

const cryptr = new Cryptr(config.secret1)

export const jiraService = {
    getAuthorizationUrl,
    exchangeCodeForTokens,
    refreshAccessToken,
    getCloudId,
    getProjects,
    getProjectMetadata,
    createIssue,
    getRecentIssues,
    getIdentityHubTickets,
    // searchIssues,
    encryptTokens,
    decryptTokens
}


function getAuthorizationUrl(state) {
    const clientId = config.jira.clientId
    const redirectUri = config.jira.redirectUri
    const scopes = config.jira.scopes.join(' ')

    const authUrl = new URL('https://auth.atlassian.com/authorize')
    authUrl.searchParams.append('audience', 'api.atlassian.com')
    authUrl.searchParams.append('client_id', clientId)
    authUrl.searchParams.append('scope', scopes)
    authUrl.searchParams.append('redirect_uri', redirectUri)
    authUrl.searchParams.append('state', state)
    authUrl.searchParams.append('response_type', 'code')
    authUrl.searchParams.append('prompt', 'consent')

    console.log("url:", authUrl);
    
    return authUrl.toString()
}


async function exchangeCodeForTokens(code) {
    const tokenUrl = 'https://auth.atlassian.com/oauth/token'

    const body = {
        grant_type: 'authorization_code',
        client_id: config.jira.clientId,
        client_secret: config.jira.clientSecret,
        code,
        redirect_uri: config.jira.redirectUri
    }

    try {
        const response = await axios.post(tokenUrl, body, {
            headers: { 'Content-Type': 'application/json' }
        })
        return response.data
    } catch (err) {
        console.error('Error exchanging code for tokens:')
        console.error('Status:', err.response?.status)
        console.error('Data:', JSON.stringify(err.response?.data, null, 2))
        console.error('Request body:', JSON.stringify(body, null, 2))
        throw new Error(`Failed to exchange authorization code: ${err.response?.data?.error || err.message}`)
    }
}


async function refreshAccessToken(refreshToken) {
    const tokenUrl = 'https://auth.atlassian.com/oauth/token'

    const body = {
        grant_type: 'refresh_token',
        client_id: config.jira.clientId,
        client_secret: config.jira.clientSecret,
        refresh_token: refreshToken
    }

    try {
        const response = await axios.post(tokenUrl, body, {
            headers: { 'Content-Type': 'application/json' }
        })
        return response.data
    } catch (err) {
        console.error('Error refreshing access token:', err.response?.data || err.message)
        throw new Error('Failed to refresh access token')
    }
}


async function getCloudId(accessToken) {
    try {
        const response = await axios.get('https://api.atlassian.com/oauth/token/accessible-resources', {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
            }
        })

        if (!response.data || response.data.length === 0) {
            throw new Error('No accessible Jira sites found')
        }

        // Return both cloud ID and site URL
        return {
            cloudId: response.data[0].id,
            siteUrl: response.data[0].url
        }
    } catch (err) {
        console.error('Error getting cloud ID:', err.response?.data || err.message)
        throw new Error('Failed to get Jira cloud ID')
    }
}




async function getProjects(accessToken, cloudId) {

    try {
        const response = await axios.get(
            `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/project/search`,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json'
                }
            }
        )
        return response.data.values || []
    } catch (err) {
        console.error('Error getting projects:', err.response?.data || err.message)
        throw new Error('Failed to fetch Jira projects')
    }
}


async function getProjectMetadata(accessToken, cloudId, projectKey) {
    try {
        const response = await axios.get(
            `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue/createmeta`,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json'
                },
                params: {
                    projectKeys: projectKey,
                    expand: 'projects.issuetypes.fields'
                }
            }
        )
        console.log('Full metadata response:', JSON.stringify(response.data, null, 2))
        return response.data
    } catch (err) {
        console.error('Error getting project metadata:', err.response?.data || err.message)
        throw new Error('Failed to fetch project metadata')
    }
}


async function createIssue(accessToken, cloudId, issueData) {
    try {
        const response = await axios.post(
            `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue`,
            { fields: issueData },
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            }
        )
        
        return response.data
    } catch (err) {
        console.error('Error creating issue:', err.response?.data || err.message)
        throw new Error(err.response?.data?.errors ?
            JSON.stringify(err.response.data.errors) :
            'Failed to create Jira issue')
    }
}


async function getRecentIssues(accessToken, cloudId, projectKey, maxResults = 10) {
    try {
        const jql = `project = ${projectKey} ORDER BY created DESC`

        const response = await axios.post(
            `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/search/jql`,
            {
                jql,
                maxResults,
                fields: ['summary', 'created', 'status', 'key']
            },
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            }
        )
        return response.data.issues || []
    } catch (err) {
        console.error('Error getting recent issues:', err.response?.data || err.message)
        throw new Error('Failed to fetch recent issues')
    }
}

async function getIdentityHubTickets(accessToken, cloudId, maxResults = 10) {
    try {
        const jql = `labels = "created-from-identityhub" ORDER BY created DESC`

        const response = await axios.post(
            `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/search/jql`,
            {
                jql,
                maxResults,
                fields: ['summary', 'created', 'status', 'key', 'project']
            },
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            }
        )
        return response.data.issues || []
    } catch (err) {
        console.error('Error getting IdentityHub tickets:', err.response?.data || err.message)
        throw new Error('Failed to fetch IdentityHub tickets')
    }
}

/**
 * Search for issues using JQL
 */
// async function searchIssues(accessToken, cloudId, jql, maxResults = 50) {
//     try {
//         const response = await axios.post(
//             `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/search/jql`,
//             {
//                 jql,
//                 maxResults,
//                 fields: ['summary', 'created', 'updated', 'status', 'priority', 'key', 'project']
//             },
//             {
//                 headers: {
//                     'Authorization': `Bearer ${accessToken}`,
//                     'Accept': 'application/json',
//                     'Content-Type': 'application/json'
//                 }
//             }
//         )
//         return {
//             issues: response.data.issues || [],
//             total: response.data.total || 0
//         }
//     } catch (err) {
//         console.error('Error searching issues:', err.response?.data || err.message)
//         throw new Error('Failed to search issues')
//     }
// }


function encryptTokens(tokens) {
    const expiresAt = Date.now() + (tokens.expires_in * 1000) // Convert seconds to milliseconds

    return {
        accessToken: cryptr.encrypt(tokens.access_token),
        refreshToken: cryptr.encrypt(tokens.refresh_token),
        expiresAt
    }
}


function decryptTokens(encryptedTokens) {
    return {
        accessToken: cryptr.decrypt(encryptedTokens.accessToken),
        refreshToken: cryptr.decrypt(encryptedTokens.refreshToken),
        expiresAt: encryptedTokens.expiresAt
    }
}
