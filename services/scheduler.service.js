import cron from 'node-cron'
import { blogDigestAutomationService } from './blog-digest-automation.service.js'
import { loggerService } from './logger.service.js'

/* Scheduler Service for running automated tasks */
export const schedulerService = {
    startScheduledJobs,
    stopScheduledJobs
}

let scheduledJobs = []

/* Starts all scheduled automation jobs */
function startScheduledJobs() {
    loggerService.info('Starting scheduled automation jobs...')

    // Schedule: Run blog digest every Monday at 9:00 AM
    // Cron format: minute hour day-of-month month day-of-week
    // '0 9 * * 1' = At 9:00 AM every Monday
    const blogDigestJob = cron.schedule('0 9 * * 1', async () => {
        loggerService.info('Triggered: Weekly Blog Digest (Monday 9:00 AM)')
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
        schedule: 'Every Monday at 9:00 AM UTC',
        job: blogDigestJob
    })

    ////  run daily at 8:00 AM
    // const dailyDigestJob = cron.schedule('0 8 * * *', async () => {
    //     loggerService.info('Triggered: Daily Blog Digest (8:00 AM)')
    //     try {
    //         await blogDigestAutomationService.runBlogDigest()
    //     } catch (err) {
    //         loggerService.error('Scheduled blog digest failed:', err)
    //     }
    // }, {
    //     scheduled: true,
    //     timezone: 'UTC'
    // })
    // scheduledJobs.push({
    //     name: 'Daily Blog Digest',
    //     schedule: 'Every day at 8:00 AM UTC',
    //     job: dailyDigestJob
    // })

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
    loggerService.info('✓ All scheduled jobs stopped')
}

/**
 * Common cron schedule examples:
 *
 * Every minute:        '* * * * *'
 * Every 5 minutes:     '*//* 5 * * * *'
 * Every hour:          '0 * * * *'
 * Every day at 9 AM:   '0 9 * * *'
 * Every Monday 9 AM:   '0 9 * * 1'
 * Every 1st of month:  '0 9 1 * *'
 * Weekdays at 9 AM:    '0 9 * * 1-5'
 */
