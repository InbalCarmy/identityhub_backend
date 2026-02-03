import { blogScraperService } from './blog-scraper.service.js'
import { aiSummaryService } from './ai-summary.service.js'
import { jiraService } from '../../api/jira/jira.service.js'
import { userService } from '../../api/user/user.service.js'
import { loggerService } from '../logger.service.js'
import { config } from '../../config/index.js'

/**
 * NHI Blog Digest Automation Service
 * Fetches latest Oasis blog post, generates AI summary, and creates Jira ticket
 */
export const blogDigestAutomationService = {
    runBlogDigest
}

/* Main automation function that orchestrates the blog digest workflow */
async function runBlogDigest(userId = null) {
    const startTime = Date.now()

    try {
        // Step 1: Fetch and summarize blog post
        const blogPost = await fetchBlogPost()
        const summary = await generateSummary(blogPost)

        // Step 2: Get user and authenticate with Jira
        const user = await getUserForAutomation(userId)
        const accessToken = await getValidAccessToken(user)

        // Step 3: Create Jira ticket
        const { issue, issueUrl } = await createJiraTicket(user, blogPost, summary, accessToken)

        // Step 4: Return success result
        const duration = ((Date.now() - startTime) / 1000).toFixed(2)
        loggerService.info(`Blog Digest Automation Completed in ${duration}s`)

        return buildSuccessResult(blogPost, issue, issueUrl, duration)

    } catch (err) {
        loggerService.error('Blog Digest Automation Failed')
        loggerService.error(`Error: ${err.message}`)
        throw err
    }
}

/* Fetches the latest blog post */
async function fetchBlogPost() {
    loggerService.info('Step 1: Fetching latest blog post')
    const blogPost = await blogScraperService.getLatestBlogPost()
    loggerService.info(`Blog post fetched: "${blogPost.title}"`)
    return blogPost
}

/* Generates AI summary for a blog post */
async function generateSummary(blogPost) {
    loggerService.info('Step 2: Generating AI-powered summary')
    const summary = await aiSummaryService.generateBlogSummary(blogPost)
    loggerService.info(`AI summary generated (${summary.length} characters)`)
    return summary
}

/* Gets the user to use for automation */
async function getUserForAutomation(userId) {
    loggerService.info('Step 3: Retrieving user credentials')

    if (userId) {
        return await getSpecificUser(userId)
    } else {
        return await getAutomationUser()
    }
}

/* Gets a specific user by ID and validates Jira connection */
async function getSpecificUser(userId) {
    const user = await userService.getById(userId)
    if (!user || !user.config?.jira) {
        throw new Error('User not found or Jira not connected')
    }
    loggerService.info(`Using user: ${user.email || user._id}`)
    return user
}

/* Gets the configured admin user or first user with Jira for scheduled automation */
async function getAutomationUser() {
    // First try configured admin user
    const adminUserId = config.automation?.adminUserId
    if (adminUserId) {
        const adminUser = await userService.getById(adminUserId)
        if (adminUser && adminUser.config?.jira) {
            loggerService.info(`Using configured admin user: ${adminUser.email || adminUser._id}`)
            return adminUser
        }
    }

    // If no admin user or admin doesn't have Jira, find any user with Jira
    loggerService.info('Finding first user with Jira connected...')
    const user = await findUserWithJira()
    if (!user) {
        throw new Error('No users with Jira connected found. At least one user must connect Jira for automation to work.')
    }
    loggerService.info(`Using user: ${user.email || user._id}`)
    return user
}

/* Gets a valid access token, refreshing if necessary */
async function getValidAccessToken(user) {
    const { accessToken, refreshToken, expiresAt } = jiraService.decryptTokens(user.config.jira)

    if (Date.now() < expiresAt) {
        loggerService.info('User authenticated')
        return accessToken
    }

    // Token expired, refresh it
    loggerService.info('Access token expired, refreshing...')
    const newTokens = await jiraService.refreshAccessToken(refreshToken)
    const encrypted = jiraService.encryptTokens(newTokens)

    user.config.jira = {
        ...user.config.jira,
        ...encrypted
    }
    await userService.update(user)

    loggerService.info('Access token refreshed')
    return newTokens.access_token
}

/* Creates a Jira ticket for the blog digest */
async function createJiraTicket(user, blogPost, summary, accessToken) {
    loggerService.info('Step 4: Creating Jira ticket')

    const project = await selectJiraProject(accessToken, user.config.jira.cloudId)
    const issueData = buildIssueData(project, blogPost, summary)

    const createdIssue = await jiraService.createIssue(
        accessToken,
        user.config.jira.cloudId,
        issueData
    )

    const issueUrl = `${user.config.jira.siteUrl}/browse/${createdIssue.key}`

    loggerService.info(`Jira ticket created: ${createdIssue.key}`)
    loggerService.info(`  URL: ${issueUrl}`)

    return { issue: createdIssue, issueUrl }
}

/* Selects the Jira project to use */
async function selectJiraProject(accessToken, cloudId) {
    const projectKey = config.automation?.defaultProjectKey || 'BLOG'
    const projects = await jiraService.getProjects(accessToken, cloudId)

    if (projects.length === 0) {
        throw new Error('No Jira projects available')
    }

    const project = projects.find(p => p.key === projectKey) || projects[0]
    loggerService.info(`Using Jira project: ${project.name} (${project.key})`)

    return project
}

/* Builds the Jira issue data object */
function buildIssueData(project, blogPost, summary) {
    return {
        project: {
            key: project.key
        },
        summary: `[Blog Digest] ${blogPost.title}`,
        description: formatJiraDescription(blogPost, summary),
        issuetype: {
            name: 'Task'
        },
        labels: ['blog-digest', 'automation', 'nhi', 'created-from-identityhub']
    }
}

/* Builds the success result object */
function buildSuccessResult(blogPost, issue, issueUrl, duration) {
    return {
        success: true,
        blogPost: {
            title: blogPost.title,
            url: blogPost.url
        },
        jiraTicket: {
            key: issue.key,
            url: issueUrl
        },
        duration: `${duration}s`
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
