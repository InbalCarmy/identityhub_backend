import { jiraService } from './jira.service.js'
import { userService } from '../user/user.service.js'
import { loggerService } from '../../services/logger.service.js'
import { config } from '../../config/index.js'

// In-memory store for OAuth state tokens 
// Key: userId, Value: { state, expiresAt }
const oauthStateStore = new Map()

// clean expired states every 10 minutes
setInterval(() => {
    const now = Date.now()
    for (const [userId, data] of oauthStateStore.entries()) {
        if (data.expiresAt < now) {
            oauthStateStore.delete(userId)
        }
    }
}, 10 * 60 * 1000)


export async function initiateOAuth(req, res) {
    try {
        const loggedinUser = req.loggedinUser
        if (!loggedinUser) {
            return res.status(401).send({ err: 'Not authenticated' })
        }
        //generate random state
        const state = Math.random().toString(36).substring(7)

        // Store state with user ID and expiration (5 minutes)
        oauthStateStore.set(loggedinUser._id.toString(), {
            state,
            expiresAt: Date.now() + (5 * 60 * 1000) // 5 minutes
        })

        const authUrl = jiraService.getAuthorizationUrl(state)

        loggerService.info(`OAuth initiated for user ${loggedinUser._id}, state: ${state}`)
        res.json({ authUrl })
    } catch (err) {
        loggerService.error('Cannot initiate OAuth:', err)
        res.status(500).send({ err: 'Failed to initiate OAuth' })
    }
}


export async function handleOAuthCallback(req, res) {
    try {
        const { code, state } = req.query
        const loggedinUser = req.loggedinUser

        if (!loggedinUser) {
            loggerService.error('OAuth callback: User not authenticated')
            return res.redirect(`${config.frontendUrl}/jira/error?message=${encodeURIComponent('Not authenticated')}`)
        }

        if (!code) {
            loggerService.error('OAuth callback: Authorization code missing')
            return res.redirect(`${config.frontendUrl}/jira/error?message=${encodeURIComponent('Authorization code missing')}`)
        }

        // Validate state for CSRF protection
        const userId = loggedinUser._id.toString()
        const storedStateData = oauthStateStore.get(userId)

        if (!storedStateData) {
            loggerService.error(`OAuth callback: No stored state found for user ${userId}`)
            return res.redirect(`${config.frontendUrl}/jira/error?message=${encodeURIComponent('Invalid session. Please try connecting again.')}`)
        }

        if (storedStateData.state !== state) {
            loggerService.error(`OAuth callback: State mismatch for user ${userId}. Expected: ${storedStateData.state}, Got: ${state}`)
            oauthStateStore.delete(userId) 
            return res.redirect(`${config.frontendUrl}/jira/error?message=${encodeURIComponent('Security validation failed. Please try again.')}`)
        }

        if (storedStateData.expiresAt < Date.now()) {
            loggerService.error(`OAuth callback: State expired for user ${userId}`)
            oauthStateStore.delete(userId)
            return res.redirect(`${config.frontendUrl}/jira/error?message=${encodeURIComponent('Session expired. Please try connecting again.')}`)
        }

        // State is valid, remove it from store (onr time use)
        oauthStateStore.delete(userId)

        // change code for tokens
        const tokens = await jiraService.exchangeCodeForTokens(code)

        // get cloud ID and site URL
        const { cloudId, siteUrl } = await jiraService.getCloudId(tokens.access_token)

        // Encrypt and prepare tokens for storage
        const encryptedTokens = jiraService.encryptTokens(tokens)

        const updatedUser = await userService.getById(loggedinUser._id)
        updatedUser.config = updatedUser.config || {}
        updatedUser.config.jira = {
            cloudId,
            siteUrl,
            ...encryptedTokens,
            connectedAt: new Date()
        }

        await userService.update(updatedUser)

        loggerService.info(`Jira connected successfully for user ${loggedinUser._id}`)

        res.redirect(`${config.frontendUrl}/jira/success`)
    } catch (err) {
        loggerService.error('OAuth callback error:', err)
        res.redirect(`${config.frontendUrl}/jira/error?message=${encodeURIComponent(err.message)}`)
    }
}


 export async function disconnect(req, res) {
    try {
        const loggedinUser = req.loggedinUser
        if (!loggedinUser) {
            return res.status(401).send({ err: 'Not authenticated' })
        }

        const user = await userService.getById(loggedinUser._id)
        if (user.config && user.config.jira) {
            delete user.config.jira
            await userService.update(user)
        }

        loggerService.info(`Jira disconnected for user ${loggedinUser._id}`)
        res.json({ message: 'Jira disconnected successfully' })
    } catch (err) {
        loggerService.error('Cannot disconnect Jira:', err)
        res.status(500).send({ err: 'Failed to disconnect Jira' })
    }
}


export async function getConnectionStatus(req, res) {
    try {
        const loggedinUser = req.loggedinUser
        if (!loggedinUser) {
            return res.status(401).send({ err: 'Not authenticated' })
        }

        const user = await userService.getById(loggedinUser._id)
        const isConnected = !!(user.config?.jira?.accessToken)

        res.json({
            isConnected,
            connectedAt: user.config?.jira?.connectedAt || null,
            siteUrl: user.config?.jira?.siteUrl || null
        })
    } catch (err) {
        loggerService.error('Cannot get connection status:', err)
        res.status(500).send({ err: 'Failed to get connection status' })
    }
}


export async function getProjects(req, res) {
    try {
        const loggedinUser = req.loggedinUser
        if (!loggedinUser) {
            return res.status(401).send({ err: 'Not authenticated' })
        }

        const user = await userService.getById(loggedinUser._id)
        const jiraConfig = user.config?.jira

        if (!jiraConfig) {
            return res.status(400).send({ err: 'Jira not connected' })
        }

        // Decrypt tokens
        const { accessToken, refreshToken, expiresAt } = jiraService.decryptTokens(jiraConfig)

        // Check if token expired and refresh if needed
        let currentAccessToken = accessToken
        if (Date.now() >= expiresAt) {
            loggerService.info(`Access token expired for user ${loggedinUser._id}, refreshing...`)
            const newTokens = await jiraService.refreshAccessToken(refreshToken)
            const encrypted = jiraService.encryptTokens(newTokens)

            // Update user with new tokens
            user.config.jira = {
                ...jiraConfig,
                ...encrypted
            }
            await userService.update(user)

            currentAccessToken = newTokens.access_token
            loggerService.info(`Access token refreshed for user ${loggedinUser._id}`)
        }


        // Get projects
        const projects = await jiraService.getProjects(currentAccessToken, jiraConfig.cloudId)

        res.json(projects)
    } catch (err) {
        loggerService.error('Cannot get projects:', err)
        res.status(500).send({ err: err.message || 'Failed to fetch projects' })
    }
}


export async function getProjectMetadata(req, res) {
    try {
        const { projectKey } = req.params
        const loggedinUser = req.loggedinUser

        if (!loggedinUser) {
            return res.status(401).send({ err: 'Not authenticated' })
        }

        const user = await userService.getById(loggedinUser._id)
        const jiraConfig = user.config?.jira

        if (!jiraConfig) {
            return res.status(400).send({ err: 'Jira not connected' })
        }

        const { accessToken, refreshToken, expiresAt } = jiraService.decryptTokens(jiraConfig)

        // Check if token expired and refresh if needed
        let currentAccessToken = accessToken
        if (Date.now() >= expiresAt) {
            loggerService.info(`Access token expired for user ${loggedinUser._id}, refreshing...`)
            const newTokens = await jiraService.refreshAccessToken(refreshToken)
            const encrypted = jiraService.encryptTokens(newTokens)

            // Update user with new tokens
            user.config.jira = {
                ...jiraConfig,
                ...encrypted
            }
            await userService.update(user)

            currentAccessToken = newTokens.access_token
            loggerService.info(`Access token refreshed for user ${loggedinUser._id}`)
        }


        const metadata = await jiraService.getProjectMetadata(currentAccessToken, jiraConfig.cloudId, projectKey)
        console.log("metadata:", metadata.projects[0].issueTypes);
        
        res.json(metadata)
    } catch (err) {
        loggerService.error('Cannot get project metadata:', err)
        res.status(500).send({ err: err.message || 'Failed to fetch project metadata' })
    }
}

/**
 * Validation for Jira issue creation
 */
function validateIssueData(data) {
    const errors = []

    // Required fields
    if (!data.project || typeof data.project !== 'object') {
        errors.push('project is required and must be an object')
    } else if (!data.project.key || typeof data.project.key !== 'string') {
        errors.push('project.key is required and must be a string')
    }

    if (!data.summary || typeof data.summary !== 'string' || data.summary.trim().length === 0) {
        errors.push('summary is required and must be a non-empty string')
    }

    if (!data.issuetype || typeof data.issuetype !== 'object') {
        errors.push('issuetype is required and must be an object')
    } else if (!data.issuetype.name && !data.issuetype.id) {
        errors.push('issuetype.name or issuetype.id is required')
    }

    // Optional fields validation
    if (data.description && typeof data.description !== 'string' && typeof data.description !== 'object') {
        errors.push('description must be a string or an object (Atlassian Document Format)')
    }

    if (data.priority && typeof data.priority !== 'object') {
        errors.push('priority must be an object with name or id')
    }

    if (data.labels && !Array.isArray(data.labels)) {
        errors.push('labels must be an array of strings')
    }


    return {
        isValid: errors.length === 0,
        errors
    }
}

export async function createIssue(req, res) {
    try {
        const issueData = req.body
        const loggedinUser = req.loggedinUser
        if (!loggedinUser) {
            return res.status(401).send({ err: 'Not authenticated' })
        }

        // Validate issue data
        const validation = validateIssueData(issueData)
        if (!validation.isValid) {
            loggerService.warn(`Invalid issue data from user ${loggedinUser._id}:`, validation.errors)
            return res.status(400).json({
                error: 'Validation error',
                message: 'Invalid issue data',
                details: validation.errors
            })
        }

        const user = await userService.getById(loggedinUser._id)
        const jiraConfig = user.config?.jira

        if (!jiraConfig) {
            return res.status(400).send({ err: 'Jira not connected' })
        }

        // Decrypt tokens
        const { accessToken, refreshToken, expiresAt } = jiraService.decryptTokens(jiraConfig)

        // Check if token expired and refresh if needed
        let currentAccessToken = accessToken
        if (Date.now() >= expiresAt) {
            loggerService.info(`Access token expired for user ${loggedinUser._id}, refreshing...`)
            const newTokens = await jiraService.refreshAccessToken(refreshToken)
            const encrypted = jiraService.encryptTokens(newTokens)

            // Update user with new tokens
            user.config.jira = {
                ...jiraConfig,
                ...encrypted
            }
            await userService.update(user)

            currentAccessToken = newTokens.access_token
            loggerService.info(`Access token refreshed for user ${loggedinUser._id}`)
        }

        const issue = await jiraService.createIssue(currentAccessToken, jiraConfig.cloudId, issueData)

        loggerService.info(`Issue created: ${issue.key} for user ${loggedinUser._id}`)
        res.json(issue)
    } catch (err) {
        loggerService.error('Cannot create issue:', err)
        res.status(500).send({ err: err.message || 'Failed to create issue' })
    }
}


// export async function getRecentIssues(req, res) {
//     try {
//         const { projectKey } = req.params
//         const { maxResults = 10 } = req.query
//         const loggedinUser = req.loggedinUser

//         if (!loggedinUser) {
//             return res.status(401).send({ err: 'Not authenticated' })
//         }

//         const user = await userService.getById(loggedinUser._id)
//         const jiraConfig = user.preferences?.jira

//         if (!jiraConfig) {
//             return res.status(400).send({ err: 'Jira not connected' })
//         }

//         const { accessToken } = jiraService.decryptTokens(jiraConfig)
//         const issues = await jiraService.getRecentIssues(
//             accessToken,
//             jiraConfig.cloudId,
//             projectKey,
//             parseInt(maxResults)
//         )

//         res.json(issues)
//     } catch (err) {
//         loggerService.error('Cannot get recent issues:', err)
//         res.status(500).send({ err: err.message || 'Failed to fetch recent issues' })
//     }
// }

export async function getIdentityHubTickets(req, res) {
    try {
        const { maxResults = 10 } = req.query
        const loggedinUser = req.loggedinUser

        if (!loggedinUser) {
            return res.status(401).send({ err: 'Not authenticated' })
        }

        const user = await userService.getById(loggedinUser._id)
        const jiraConfig = user.config?.jira

        if (!jiraConfig) {
            return res.status(400).send({ err: 'Jira not connected' })
        }

        // Decrypt tokens
        const { accessToken, refreshToken, expiresAt } = jiraService.decryptTokens(jiraConfig)

        // Check if token expired and refresh if needed
        let currentAccessToken = accessToken
        if (Date.now() >= expiresAt) {
            loggerService.info(`Access token expired for user ${loggedinUser._id}, refreshing...`)
            const newTokens = await jiraService.refreshAccessToken(refreshToken)
            const encrypted = jiraService.encryptTokens(newTokens)

            // Update user with new tokens
            user.config.jira = {
                ...jiraConfig,
                ...encrypted
            }
            await userService.update(user)

            currentAccessToken = newTokens.access_token
            loggerService.info(`Access token refreshed for user ${loggedinUser._id}`)
        }

        const issues = await jiraService.getIdentityHubTickets(
            currentAccessToken,
            jiraConfig.cloudId,
            parseInt(maxResults)
        )

        res.json(issues)
    } catch (err) {
        loggerService.error('Cannot get IdentityHub tickets:', err)
        res.status(500).send({ err: err.message || 'Failed to fetch IdentityHub tickets' })
    }
}
