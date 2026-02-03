import cron from 'node-cron'
import { blogDigestAutomationService } from './blog-digest-automation.service.js'
import { loggerService } from '../logger.service.js'

/* Scheduler Service for running automated tasks */
export const schedulerService = {
    startScheduledJobs,
    stopScheduledJobs
}

let scheduledJobs = []

/* Starts all scheduled automation jobs */
function startScheduledJobs() {
    loggerService.info('Starting scheduled automation jobs...')

    // Get current time in UTC for debugging
    const now = new Date()
    loggerService.info(`Current UTC time: ${now.toISOString()}`)
    loggerService.info(`Current UTC time (readable): ${now.toUTCString()}`)

    // Schedule: Run blog digest every Tuesday at 3:00 PM UTC
    // For testing: Change to '* * * * *' to run every minute
    const blogDigestJob = cron.schedule('0 15 * * 2', async () => {
        loggerService.info('Triggered: Weekly Blog Digest (Tuesday 3:00 PM UTC)')
        try {
            await blogDigestAutomationService.runBlogDigest()
        } catch (err) {
            loggerService.error('Scheduled blog digest failed:', err)
        }
    }, {
        scheduled: true,
        timezone: 'UTC'
    })

    scheduledJobs.push({
        name: 'Weekly Blog Digest',
        schedule: 'Every Tuesday at 3:00 PM UTC',
        job: blogDigestJob
    })

    loggerService.info(`✓ Started ${scheduledJobs.length} scheduled job(s):`)
    scheduledJobs.forEach(job => {
        loggerService.info(`  - ${job.name}: ${job.schedule}`)
    })
}

/* Stops all scheduled jobs (for graceful shutdown) */
function stopScheduledJobs() {
    loggerService.info('Stopping all scheduled jobs...')
    scheduledJobs.forEach(job => {
        job.job.stop()
    })
    scheduledJobs = []
    loggerService.info('All scheduled jobs stopped')
}