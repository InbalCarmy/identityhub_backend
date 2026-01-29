import { jiraService } from './jira.service.js'
import { userService } from '../user/user.service.js'
import { loggerService } from '../../services/logger.service.js'

// In-memory store for OAuth state tokens (with automatic cleanup)
// Key: userId, Value: { state, expiresAt }
const oauthStateStore = new Map()

// Clean up expired states every 10 minutes
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
        // Generate random state for CSRF protection
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
            return res.redirect(`http://localhost:5173/jira/error?message=${encodeURIComponent('Not authenticated')}`)
        }

        if (!code) {
            loggerService.error('OAuth callback: Authorization code missing')
            return res.redirect(`http://localhost:5173/jira/error?message=${encodeURIComponent('Authorization code missing')}`)
        }

        // Validate state for CSRF protection
        const userId = loggedinUser._id.toString()
        const storedStateData = oauthStateStore.get(userId)

        if (!storedStateData) {
            loggerService.error(`OAuth callback: No stored state found for user ${userId}`)
            return res.redirect(`http://localhost:5173/jira/error?message=${encodeURIComponent('Invalid session. Please try connecting again.')}`)
        }

        if (storedStateData.state !== state) {
            loggerService.error(`OAuth callback: State mismatch for user ${userId}. Expected: ${storedStateData.state}, Got: ${state}`)
            oauthStateStore.delete(userId) // Clean up
            return res.redirect(`http://localhost:5173/jira/error?message=${encodeURIComponent('Security validation failed. Please try again.')}`)
        }

        if (storedStateData.expiresAt < Date.now()) {
            loggerService.error(`OAuth callback: State expired for user ${userId}`)
            oauthStateStore.delete(userId) // Clean up
            return res.redirect(`http://localhost:5173/jira/error?message=${encodeURIComponent('Session expired. Please try connecting again.')}`)
        }

        // State is valid, remove it from store (one-time use)
        oauthStateStore.delete(userId)

        // Exchange code for tokens
        const tokens = await jiraService.exchangeCodeForTokens(code)

        // Get cloud ID
        const cloudId = await jiraService.getCloudId(tokens.access_token)

        // Encrypt and prepare tokens for storage
        const encryptedTokens = jiraService.encryptTokens(tokens)

        const updatedUser = await userService.getById(loggedinUser._id)
        updatedUser.preferences = updatedUser.preferences || {}
        updatedUser.preferences.jira = {
            cloudId,
            ...encryptedTokens,
            connectedAt: new Date()
        }

        await userService.update(updatedUser)

        loggerService.info(`Jira connected successfully for user ${loggedinUser._id}`)

        res.redirect(`http://localhost:5173/jira/success`)
    } catch (err) {
        loggerService.error('OAuth callback error:', err)
        res.redirect(`http://localhost:5173/jira/error?message=${encodeURIComponent(err.message)}`)
    }
}


 export async function disconnect(req, res) {
    try {
        const loggedinUser = req.loggedinUser
        if (!loggedinUser) {
            return res.status(401).send({ err: 'Not authenticated' })
        }

        const user = await userService.getById(loggedinUser._id)
        if (user.preferences && user.preferences.jira) {
            delete user.preferences.jira
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
        const isConnected = !!(user.preferences?.jira?.accessToken)

        res.json({
            isConnected,
            connectedAt: user.preferences?.jira?.connectedAt || null
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
        const jiraConfig = user.preferences?.jira

        if (!jiraConfig) {
            return res.status(400).send({ err: 'Jira not connected' })
        }

        // Decrypt tokens
        const { accessToken, refreshToken, expiresAt } = jiraService.decryptTokens(jiraConfig)

        // Check if token expired and refresh if needed
        let currentAccessToken = accessToken
        if (Date.now() >= expiresAt) {
            const newTokens = await jiraService.refreshAccessToken(refreshToken)
            const encrypted = jiraService.encryptTokens(newTokens)

            // Update user with new tokens
            user.preferences.jira = {
                ...jiraConfig,
                ...encrypted
            }
            await userService.update(user)

            currentAccessToken = newTokens.access_token
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
        const jiraConfig = user.preferences?.jira

        if (!jiraConfig) {
            return res.status(400).send({ err: 'Jira not connected' })
        }

        const { accessToken } = jiraService.decryptTokens(jiraConfig)
        const metadata = await jiraService.getProjectMetadata(accessToken, jiraConfig.cloudId, projectKey)

        res.json(metadata)
    } catch (err) {
        loggerService.error('Cannot get project metadata:', err)
        res.status(500).send({ err: err.message || 'Failed to fetch project metadata' })
    }
}

export async function createIssue(req, res) {
    try {
        const issueData = req.body
        const loggedinUser = req.loggedinUser

        if (!loggedinUser) {
            return res.status(401).send({ err: 'Not authenticated' })
        }

        const user = await userService.getById(loggedinUser._id)
        const jiraConfig = user.preferences?.jira

        if (!jiraConfig) {
            return res.status(400).send({ err: 'Jira not connected' })
        }

        const { accessToken } = jiraService.decryptTokens(jiraConfig)
        const issue = await jiraService.createIssue(accessToken, jiraConfig.cloudId, issueData)

        loggerService.info(`Issue created: ${issue.key} for user ${loggedinUser._id}`)
        res.json(issue)
    } catch (err) {
        loggerService.error('Cannot create issue:', err)
        res.status(500).send({ err: err.message || 'Failed to create issue' })
    }
}

/**
 * Get recent issues from a project
 */
export async function getRecentIssues(req, res) {
    try {
        const { projectKey } = req.params
        const { maxResults = 10 } = req.query
        const loggedinUser = req.loggedinUser

        if (!loggedinUser) {
            return res.status(401).send({ err: 'Not authenticated' })
        }

        const user = await userService.getById(loggedinUser._id)
        const jiraConfig = user.preferences?.jira

        if (!jiraConfig) {
            return res.status(400).send({ err: 'Jira not connected' })
        }

        const { accessToken } = jiraService.decryptTokens(jiraConfig)
        const issues = await jiraService.getRecentIssues(
            accessToken,
            jiraConfig.cloudId,
            projectKey,
            parseInt(maxResults)
        )

        res.json(issues)
    } catch (err) {
        loggerService.error('Cannot get recent issues:', err)
        res.status(500).send({ err: err.message || 'Failed to fetch recent issues' })
    }
}
