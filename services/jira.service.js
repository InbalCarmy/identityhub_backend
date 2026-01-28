import axios from 'axios'
import Cryptr from 'cryptr'
import { config } from '../config/index.js'

// Initialize encryption for storing tokens securely
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
    encryptTokens,
    decryptTokens
}

/**
 * Step 1 of OAuth: Generate the authorization URL to redirect user to Jira
 * @param {string} state - Random state for CSRF protection
 * @returns {string} - Authorization URL
 */
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

    return authUrl.toString()
}

/**
 * Step 2 of OAuth: Exchange authorization code for access & refresh tokens
 * @param {string} code - Authorization code from Jira callback
 * @returns {Promise<object>} - Token data { access_token, refresh_token, expires_in, scope }
 */
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

/**
 * Refresh expired access token using refresh token
 * @param {string} refreshToken - The refresh token
 * @returns {Promise<object>} - New token data
 */
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

/**
 * Get the Jira Cloud ID (required for API calls)
 * @param {string} accessToken - OAuth access token
 * @returns {Promise<string>} - Cloud ID
 */
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

        // Return the first site's cloud ID
        return response.data[0].id
    } catch (err) {
        console.error('Error getting cloud ID:', err.response?.data || err.message)
        throw new Error('Failed to get Jira cloud ID')
    }
}

/**
 * Get all projects accessible to the user
 * @param {string} accessToken - OAuth access token
 * @param {string} cloudId - Jira cloud ID
 * @returns {Promise<Array>} - Array of projects
 */
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

/**
 * Get project metadata including required fields for issue creation
 * @param {string} accessToken - OAuth access token
 * @param {string} cloudId - Jira cloud ID
 * @param {string} projectKey - Project key
 * @returns {Promise<object>} - Project metadata
 */
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
        return response.data
    } catch (err) {
        console.error('Error getting project metadata:', err.response?.data || err.message)
        throw new Error('Failed to fetch project metadata')
    }
}

/**
 * Create a new issue in Jira
 * @param {string} accessToken - OAuth access token
 * @param {string} cloudId - Jira cloud ID
 * @param {object} issueData - Issue data { project, summary, description, issuetype, priority, etc. }
 * @returns {Promise<object>} - Created issue data
 */
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

/**
 * Get recent issues from a project
 * @param {string} accessToken - OAuth access token
 * @param {string} cloudId - Jira cloud ID
 * @param {string} projectKey - Project key
 * @param {number} maxResults - Max number of issues to return (default 10)
 * @returns {Promise<Array>} - Array of issues
 */
async function getRecentIssues(accessToken, cloudId, projectKey, maxResults = 10) {
    try {
        const jql = `project = ${projectKey} ORDER BY created DESC`

        const response = await axios.get(
            `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/search`,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json'
                },
                params: {
                    jql,
                    maxResults,
                    fields: 'summary,created,status,key'
                }
            }
        )
        return response.data.issues || []
    } catch (err) {
        console.error('Error getting recent issues:', err.response?.data || err.message)
        throw new Error('Failed to fetch recent issues')
    }
}

/**
 * Encrypt tokens before storing in database
 * @param {object} tokens - { access_token, refresh_token, expires_in }
 * @returns {object} - { accessToken: encrypted, refreshToken: encrypted, expiresAt: timestamp }
 */
function encryptTokens(tokens) {
    const expiresAt = Date.now() + (tokens.expires_in * 1000) // Convert seconds to milliseconds

    return {
        accessToken: cryptr.encrypt(tokens.access_token),
        refreshToken: cryptr.encrypt(tokens.refresh_token),
        expiresAt
    }
}

/**
 * Decrypt tokens from database
 * @param {object} encryptedTokens - { accessToken, refreshToken, expiresAt }
 * @returns {object} - { accessToken, refreshToken, expiresAt }
 */
function decryptTokens(encryptedTokens) {
    return {
        accessToken: cryptr.decrypt(encryptedTokens.accessToken),
        refreshToken: cryptr.decrypt(encryptedTokens.refreshToken),
        expiresAt: encryptedTokens.expiresAt
    }
}
