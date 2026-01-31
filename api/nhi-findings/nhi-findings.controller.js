import { jiraService } from '../jira/jira.service.js'
import { userService } from '../user/user.service.js'
import { loggerService } from '../../services/logger.service.js'

/**
 * Validation schema for NHI finding
 */
function validateNHIFinding(data) {
    const errors = []

    // Required fields
    if (!data.projectKey || typeof data.projectKey !== 'string') {
        errors.push('projectKey is required and must be a string')
    }

    if (!data.summary || typeof data.summary !== 'string' || data.summary.trim().length === 0) {
        errors.push('summary is required and must be a non-empty string')
    }

    if (!data.description || typeof data.description !== 'string' || data.description.trim().length === 0) {
        errors.push('description is required and must be a non-empty string')
    }

    // Optional fields validation
    if (data.issueType && typeof data.issueType !== 'string') {
        errors.push('issueType must be a string')
    }

    if (data.priority && typeof data.priority !== 'string') {
        errors.push('priority must be a string')
    }

    if (data.labels && !Array.isArray(data.labels)) {
        errors.push('labels must be an array of strings')
    }

    return {
        isValid: errors.length === 0,
        errors
    }
}

/**
 * Create NHI finding ticket via API
 * POST /api/nhi-findings
 */
export async function createNHIFinding(req, res) {
    try {
        const userId = req.apiKeyAuth.userId

        // Validate input
        const validation = validateNHIFinding(req.body)
        if (!validation.isValid) {
            loggerService.warn(`Invalid NHI finding data from user ${userId}:`, validation.errors)
            return res.status(400).json({
                error: 'Validation error',
                message: 'Invalid input data',
                details: validation.errors
            })
        }

        const {
            projectKey,
            summary,
            description,
            issueType = 'Bug', // Default to Bug if not specified
            priority,
            labels = []
        } = req.body

        // Get user's Jira configuration
        const user = await userService.getById(userId)
        const jiraConfig = user.config?.jira


        if (!jiraConfig) {
            loggerService.warn(`User ${userId} attempted to create NHI finding without Jira connection`)
            return res.status(400).json({
                error: 'Configuration error',
                message: 'Jira is not connected for this user. Please connect Jira through the web interface first.'
            })
        }

        // Decrypt tokens
        const { accessToken, refreshToken, expiresAt } = jiraService.decryptTokens(jiraConfig)

        // Check if token expired and refresh if needed
        let currentAccessToken = accessToken
        if (Date.now() >= expiresAt) {
            loggerService.info(`Access token expired for user ${userId}, refreshing...`)
            const newTokens = await jiraService.refreshAccessToken(refreshToken)
            const encrypted = jiraService.encryptTokens(newTokens)

            // Update user with new tokens
            user.config.jira = {
                ...jiraConfig,
                ...encrypted
            }
            await userService.update(user)

            currentAccessToken = newTokens.access_token
            loggerService.info(`Access token refreshed for user ${userId}`)
        }

        console.log("access token:", currentAccessToken);
        

        // Build Jira issue data
        const issueData = {
            project: {
                key: projectKey
            },
            summary: summary.trim(),
            description: {
                type: 'doc',
                version: 1,
                content: [
                    {
                        type: 'paragraph',
                        content: [
                            {
                                type: 'text',
                                text: description.trim()
                            }
                        ]
                    }
                ]
            },
            issuetype: {
                name: issueType
            }
        }

        //if priority provided
        if (priority) {
            issueData.priority = {
                name: priority
            }
        }

        issueData.labels = [
            ...labels,
            'nhi-finding',
            'created-via-api',
            'created-from-identityhub'
        ]

        const issue = await jiraService.createIssue(currentAccessToken, jiraConfig.cloudId, issueData)
        console.log("issue:", issue);
        
        loggerService.info(`NHI finding created via API: ${issue.key} by user ${userId}`)

        res.status(201).json({
            success: true,
            ticket: {
                key: issue.key,
                id: issue.id,
                url: `${jiraConfig.siteUrl}/browse/${issue.key}`
            }
        })
    } catch (err) {
        loggerService.error('Cannot create NHI finding via API:', err)

        // Handle specific Jira errors
        if (err.message.includes('project') || err.message.includes('Project')) {
            return res.status(404).json({
                error: 'Not found',
                message: 'Project not found or you don\'t have access to it'
            })
        }

        if (err.message.includes('issue type') || err.message.includes('issuetype')) {
            return res.status(400).json({
                error: 'Invalid issue type',
                message: 'The specified issue type is not valid for this project'
            })
        }

        res.status(500).json({
            error: 'Internal server error',
            message: err.message || 'Failed to create NHI finding'
        })
    }
}

/**
 * Get NHI findings created via API for the authenticated user
 * GET /api/nhi-findings
 */
// export async function getNHIFindings(req, res) {
//     try {
//         const userId = req.apiKeyAuth.userId
//         const { maxResults = 50, projectKey } = req.query

//         const user = await userService.getById(userId)
//         const jiraConfig = user.preferences?.jira

//         if (!jiraConfig) {
//             return res.status(400).json({
//                 error: 'Configuration error',
//                 message: 'Jira is not connected for this user'
//             })
//         }

//         const { accessToken, refreshToken, expiresAt } = jiraService.decryptTokens(jiraConfig)

//         // Check if token expired and refresh if needed
//         let currentAccessToken = accessToken
//         if (Date.now() >= expiresAt) {
//             const newTokens = await jiraService.refreshAccessToken(refreshToken)
//             const encrypted = jiraService.encryptTokens(newTokens)

//             // Update user with new tokens
//             user.preferences.jira = {
//                 ...jiraConfig,
//                 ...encrypted
//             }
//             await userService.update(user)

//             currentAccessToken = newTokens.access_token
//         }

//         // Build JQL query
//         let jql = 'labels = "created-via-api" AND labels = "nhi-finding"'
//         if (projectKey) {
//             jql += ` AND project = "${projectKey}"`
//         }
//         jql += ' ORDER BY created DESC'

//         // Search for issues
//         const response = await jiraService.searchIssues(
//             currentAccessToken,
//             jiraConfig.cloudId,
//             jql,
//             parseInt(maxResults)
//         )

//         const findings = response.issues.map(issue => ({
//             key: issue.key,
//             id: issue.id,
//             summary: issue.fields.summary,
//             status: issue.fields.status.name,
//             priority: issue.fields.priority?.name || 'None',
//             created: issue.fields.created,
//             updated: issue.fields.updated,
//             url: `${jiraConfig.siteUrl}/browse/${issue.key}`
//         }))

//         res.json({
//             total: response.total,
//             findings
//         })
//     } catch (err) {
//         loggerService.error('Cannot get NHI findings:', err)
//         res.status(500).json({
//             error: 'Internal server error',
//             message: 'Failed to retrieve NHI findings'
//         })
//     }
// }
