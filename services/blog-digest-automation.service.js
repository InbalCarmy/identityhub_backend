import { blogScraperService } from './blog-scraper.service.js'
import { aiSummaryService } from './ai-summary.service.js'
import { jiraService } from '../api/jira/jira.service.js'
import { userService } from '../api/user/user.service.js'
import { loggerService } from './logger.service.js'
import { config } from '../config/index.js'

/**
 * NHI Blog Digest Automation Service
 * Fetches latest Oasis blog post, generates AI summary, and creates Jira ticket
 */
export const blogDigestAutomationService = {
    runBlogDigest
}

/**
 * Main automation function that orchestrates the blog digest workflow
 * @param {string} userId - Optional user ID to use for Jira. If not provided, finds first user with Jira connected
 * @returns {Promise<Object>} Result of the automation run
 */
async function runBlogDigest(userId = null) {
    const startTime = Date.now()
    loggerService.info('========================================')
    loggerService.info('Starting NHI Blog Digest Automation')
    loggerService.info('========================================')

    try {
        // Step 1: Fetch the latest blog post
        loggerService.info('Step 1: Fetching latest blog post...')
        const blogPost = await blogScraperService.getLatestBlogPost()
        loggerService.info(`✓ Blog post fetched: "${blogPost.title}"`)

        // Step 2: Generate AI summary
        loggerService.info('Step 2: Generating AI-powered summary...')
        const summary = await aiSummaryService.generateBlogSummary(blogPost)
        loggerService.info(`✓ AI summary generated (${summary.length} characters)`)

        // Step 3: Get user with Jira credentials
        loggerService.info('Step 3: Retrieving user credentials...')

        let user
        if (userId) {
            // Use specific user if provided
            user = await userService.getById(userId)
            if (!user || !user.config?.jira) {
                throw new Error('User not found or Jira not connected')
            }
            loggerService.info(`Using user: ${user.email || user._id}`)
        } else {
            // For scheduled runs: find first user with Jira connected
            // First try configured admin user
            const adminUserId = config.automation?.adminUserId
            if (adminUserId) {
                user = await userService.getById(adminUserId)
                if (user && user.config?.jira) {
                    loggerService.info(`Using configured admin user: ${user.email || user._id}`)
                }
            }

            // If no admin user or admin doesn't have Jira, find any user with Jira
            if (!user || !user.config?.jira) {
                loggerService.info('Finding first user with Jira connected...')
                user = await findUserWithJira()
                if (!user) {
                    throw new Error('No users with Jira connected found. At least one user must connect Jira for automation to work.')
                }
                loggerService.info(`Using user: ${user.email || user._id}`)
            }
        }

        // Decrypt Jira tokens
        const { accessToken, refreshToken, expiresAt } = jiraService.decryptTokens(user.config.jira)

        // Check if token needs refresh
        let currentAccessToken = accessToken
        if (Date.now() >= expiresAt) {
            loggerService.info('Access token expired, refreshing...')
            const newTokens = await jiraService.refreshAccessToken(refreshToken)
            const encrypted = jiraService.encryptTokens(newTokens)

            user.config.jira = {
                ...user.config.jira,
                ...encrypted
            }
            await userService.update(user)

            currentAccessToken = newTokens.access_token
            loggerService.info('✓ Access token refreshed')
        }

        loggerService.info('✓ User authenticated')

        // Step 4: Create Jira ticket
        loggerService.info('Step 4: Creating Jira ticket...')

        const projectKey = config.automation?.defaultProjectKey || 'BLOG'

        // Get the first available project if default doesn't exist
        const projects = await jiraService.getProjects(currentAccessToken, user.config.jira.cloudId)

        if (projects.length === 0) {
            throw new Error('No Jira projects available')
        }

        // Use configured project or first available project
        const project = projects.find(p => p.key === projectKey) || projects[0]

        loggerService.info(`Using Jira project: ${project.name} (${project.key})`)

        // Prepare Jira issue data
        const issueData = {
            project: {
                key: project.key
            },
            summary: `[Blog Digest] ${blogPost.title}`,
            description: formatJiraDescription(blogPost, summary),
            issuetype: {
                name: 'Task' // Default to Task, can be configured
            },
            labels: ['blog-digest', 'automation', 'nhi', 'created-from-identityhub']
        }

        const createdIssue = await jiraService.createIssue(
            currentAccessToken,
            user.config.jira.cloudId,
            issueData
        )

        const issueUrl = `${user.config.jira.siteUrl}/browse/${createdIssue.key}`

        loggerService.info(`✓ Jira ticket created: ${createdIssue.key}`)
        loggerService.info(`  URL: ${issueUrl}`)

        // Success!
        const duration = ((Date.now() - startTime) / 1000).toFixed(2)
        loggerService.info('========================================')
        loggerService.info(`✓ Blog Digest Automation Completed in ${duration}s`)
        loggerService.info('========================================')

        return {
            success: true,
            blogPost: {
                title: blogPost.title,
                url: blogPost.url
            },
            jiraTicket: {
                key: createdIssue.key,
                url: issueUrl
            },
            duration: `${duration}s`
        }

    } catch (err) {
        loggerService.error('========================================')
        loggerService.error('✗ Blog Digest Automation Failed')
        loggerService.error(`Error: ${err.message}`)
        loggerService.error('========================================')
        throw err
    }
}

/* Finds the first user with Jira connected */
async function findUserWithJira() {
    try {
        const users = await userService.query()

        // Find first user with Jira config
        for (const user of users) {
            if (user.config?.jira?.accessToken) {
                return user
            }
        }

        return null
    } catch (err) {
        loggerService.error('Error finding user with Jira:', err)
        return null
    }
}

/**
 * Formats the Jira ticket description with blog summary and metadata
 * Returns Atlassian Document Format (ADF)
 */
function formatJiraDescription(blogPost, summary) {
    return {
        type: 'doc',
        version: 1,
        content: [
            {
                type: 'paragraph',
                content: [
                    {
                        type: 'text',
                        text: 'Automated NHI Blog Digest',
                        marks: [{ type: 'strong' }]
                    }
                ]
            },
            {
                type: 'heading',
                attrs: { level: 2 },
                content: [
                    {
                        type: 'text',
                        text: 'Summary'
                    }
                ]
            },
            {
                type: 'paragraph',
                content: [
                    {
                        type: 'text',
                        text: summary
                    }
                ]
            },
            {
                type: 'heading',
                attrs: { level: 2 },
                content: [
                    {
                        type: 'text',
                        text: 'Full Article'
                    }
                ]
            },
            {
                type: 'paragraph',
                content: [
                    {
                        type: 'text',
                        text: 'Title: ',
                        marks: [{ type: 'strong' }]
                    },
                    {
                        type: 'text',
                        text: blogPost.title
                    }
                ]
            },
            {
                type: 'paragraph',
                content: [
                    {
                        type: 'text',
                        text: 'URL: ',
                        marks: [{ type: 'strong' }]
                    },
                    {
                        type: 'text',
                        text: blogPost.url,
                        marks: [
                            {
                                type: 'link',
                                attrs: {
                                    href: blogPost.url
                                }
                            }
                        ]
                    }
                ]
            },
            {
                type: 'paragraph',
                content: [
                    {
                        type: 'text',
                        text: 'Author: ',
                        marks: [{ type: 'strong' }]
                    },
                    {
                        type: 'text',
                        text: blogPost.author
                    }
                ]
            },
            {
                type: 'paragraph',
                content: [
                    {
                        type: 'text',
                        text: 'Published: ',
                        marks: [{ type: 'strong' }]
                    },
                    {
                        type: 'text',
                        text: blogPost.date
                    }
                ]
            },
            {
                type: 'heading',
                attrs: { level: 2 },
                content: [
                    {
                        type: 'text',
                        text: 'Automation Info'
                    }
                ]
            },
            {
                type: 'paragraph',
                content: [
                    {
                        type: 'text',
                        text: 'This ticket was automatically created by the NHI Blog Digest automation.'
                    }
                ]
            },
            {
                type: 'paragraph',
                content: [
                    {
                        type: 'text',
                        text: 'The summary was generated using AI to highlight key security insights from the Oasis Security blog.'
                    }
                ]
            },
            {
                type: 'rule'
            },
            {
                type: 'paragraph',
                content: [
                    {
                        type: 'text',
                        text: 'Generated with IdentityHub Blog Digest Automation',
                        marks: [{ type: 'em' }]
                    }
                ]
            }
        ]
    }
}
