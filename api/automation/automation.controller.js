import { blogDigestAutomationService } from '../../services/nhi-blog-digest/blog-digest-automation.service.js'
import { loggerService } from '../../services/logger.service.js'

/**
 * Controller for manual automation triggers (for testing and admin purposes)
 */

/**
 * Manually trigger the blog digest automation
 * POST /api/automation/blog-digest
 */
export async function triggerBlogDigest(req, res) {
    try {
        const loggedinUser = req.loggedinUser

        if (!loggedinUser) {
            return res.status(401).send({ err: 'Not authenticated' })
        }

        loggerService.info(`Manual blog digest triggered by user ${loggedinUser._id}`)

        // Pass the logged-in user's ID to use their Jira credentials
        const result = await blogDigestAutomationService.runBlogDigest(loggedinUser._id)

        res.json({
            message: 'Blog digest automation completed successfully',
            result
        })

    } catch (err) {
        loggerService.error('Manual blog digest trigger failed:', err)
        res.status(500).send({
            err: 'Automation failed',
            message: err.message
        })
    }
}
