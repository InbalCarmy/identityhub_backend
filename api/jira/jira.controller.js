import { jiraService } from './jira.service.js'
import { userService } from '../user/user.service.js'
import { loggerService } from '../../services/logger.service.js'
import { oauthStateService } from '../../services/oauth-state.service.js'
import { config } from '../../config/index.js'
import crypto from "crypto"


/* Helper function to get and refresh Jira access token if needed */
async function getValidJiraToken(loggedinUser) {
    // loggedinUser is guaranteed to exist by requireAuth middleware
    const user = await userService.getById(loggedinUser._id)
    const jiraConfig = user.config?.jira

    if (!jiraConfig) {
        throw new Error('Jira not connected')
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

    return {
        user,
        accessToken: currentAccessToken,
        jiraConfig
    }
}

export async function initiateOAuth(req, res) {
    try {
        const loggedinUser = req.loggedinUser // Guaranteed by requireAuth middleware

        //Generate random state
        const state = crypto.randomBytes(32).toString("base64url")

        // Store state in database with TTL (5 minutes)
        await oauthStateService.createState(loggedinUser._id.toString(), state, 5)

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
        const loggedinUser = req.loggedinUser // Guaranteed by requireAuth middleware

        if (!code) {
            loggerService.error('OAuth callback: Authorization code missing')
            return res.redirect(`${config.frontendUrl}/jira/error?message=${encodeURIComponent('Authorization code missing')}`)
        }

        // Validate state for CSRF protection (one-time use)
        const userId = loggedinUser._id.toString()
        const isValidState = await oauthStateService.validateAndDeleteState(userId, state)

        if (!isValidState) {
            loggerService.error(`OAuth callback: Invalid or expired state for user ${userId}`)
            return res.redirect(`${config.frontendUrl}/jira/error?message=${encodeURIComponent('Invalid or expired session. Please try connecting again.')}`)
        }

        const tokens = await jiraService.exchangeCodeForTokens(code)
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
        const loggedinUser = req.loggedinUser // Guaranteed by requireAuth middleware

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
        const loggedinUser = req.loggedinUser // Guaranteed by requireAuth middleware

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
        const { accessToken, jiraConfig } = await getValidJiraToken(req.loggedinUser)

        // Get projects
        const projects = await jiraService.getProjects(accessToken, jiraConfig.cloudId)

        res.json(projects)
    } catch (err) {
        loggerService.error('Cannot get projects:', err)

        if (err.message === 'Jira not connected') {
            return res.status(400).send({ err: 'Jira not connected' })
        }

        res.status(500).send({ err: err.message || 'Failed to fetch projects' })
    }
}


export async function getProjectMetadata(req, res) {
    try {
        const { projectKey } = req.params
        const { accessToken, jiraConfig } = await getValidJiraToken(req.loggedinUser)

        const metadata = await jiraService.getProjectMetadata(accessToken, jiraConfig.cloudId, projectKey)
        console.log("metadata:", metadata.projects[0].issueTypes);

        res.json(metadata)
    } catch (err) {
        loggerService.error('Cannot get project metadata:', err)

        if (err.message === 'Jira not connected') {
            return res.status(400).send({ err: 'Jira not connected' })
        }

        res.status(500).send({ err: err.message || 'Failed to fetch project metadata' })
    }
}


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

        // Validate issue data
        const validation = validateIssueData(issueData)
        if (!validation.isValid) {
            loggerService.warn(`Invalid issue data:`, validation.errors)
            return res.status(400).json({
                error: 'Validation error',
                message: 'Invalid issue data',
                details: validation.errors
            })
        }

        const { accessToken, jiraConfig } = await getValidJiraToken(req.loggedinUser)

        const issue = await jiraService.createIssue(accessToken, jiraConfig.cloudId, issueData)

        loggerService.info(`Issue created: ${issue.key}`)
        res.json(issue)
    } catch (err) {
        loggerService.error('Cannot create issue:', err)

        if (err.message === 'Jira not connected') {
            return res.status(400).send({ err: 'Jira not connected' })
        }

        res.status(500).send({ err: err.message || 'Failed to create issue' })
    }
}




export async function getIdentityHubTickets(req, res) {
    try {
        const { maxResults = 10, projectKey } = req.query
        const { accessToken, jiraConfig } = await getValidJiraToken(req.loggedinUser)

        const issues = await jiraService.getIdentityHubTickets(
            accessToken,
            jiraConfig.cloudId,
            parseInt(maxResults),
            projectKey || null
        )

        res.json(issues)
    } catch (err) {
        loggerService.error('Cannot get IdentityHub tickets:', err)

        if (err.message === 'Jira not connected') {
            return res.status(400).send({ err: 'Jira not connected' })
        }

        res.status(500).send({ err: err.message || 'Failed to fetch IdentityHub tickets' })
    }
}
