import axios from 'axios'
import * as cheerio from 'cheerio'
import { loggerService } from './logger.service.js'

/**
 * Service for scraping blog posts from Oasis Security blog
 */
export const blogScraperService = {
    getLatestBlogPost
}

/**
 * Fetches the latest blog post from oasis.security/blog
 * @returns {Promise<{title: string, url: string, author: string, date: string, content: string}>}
 */
async function getLatestBlogPost() {
    try {
        loggerService.info('Fetching latest blog post from Oasis Security blog...')

        // Step 1: Fetch the blog listing page
        const blogListResponse = await axios.get('https://www.oasis.security/blog', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; OasisBlogDigest/1.0)'
            }
        })

        const $ = cheerio.load(blogListResponse.data)

        // Step 2: Find the first blog post link
        // Looking for anchor tags that link to /blog/[slug]
        let latestPostUrl = null
        let latestPostTitle = null

        $('a[href^="/blog/"]').each((i, element) => {
            const href = $(element).attr('href')
            // Skip the main /blog page itself
            if (href && href !== '/blog' && href !== '/blog/' && !latestPostUrl) {
                latestPostUrl = href
                // Try to get title from the link text or nearby heading
                latestPostTitle = $(element).text().trim()
                return false // Break the loop
            }
        })

        if (!latestPostUrl) {
            throw new Error('Could not find any blog posts on the page')
        }

        loggerService.info(`Found latest blog post: ${latestPostTitle}`)

        // Step 3: Fetch the full blog post content
        const fullUrl = latestPostUrl.startsWith('http')
            ? latestPostUrl
            : `https://www.oasis.security${latestPostUrl}`

        const postResponse = await axios.get(fullUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; OasisBlogDigest/1.0)'
            }
        })

        const post$ = cheerio.load(postResponse.data)

        // Extract metadata and content
        const title = post$('h1').first().text().trim() || latestPostTitle

        // Try to find author and date
        let author = 'Oasis Security'
        let date = new Date().toISOString()

        // Look for common author/date patterns
        post$('time, .date, .published, [datetime]').each((i, el) => {
            const datetime = post$(el).attr('datetime')
            if (datetime) {
                date = datetime
            }
        })

        // Extract main content - look for paragraphs in article or main content area
        let content = ''
        const contentSelectors = [
            'article p',
            'main p',
            '.post-content p',
            '.content p',
            'p'
        ]

        for (const selector of contentSelectors) {
            const paragraphs = post$(selector)
            if (paragraphs.length > 0) {
                paragraphs.each((i, el) => {
                    const text = post$(el).text().trim()
                    if (text && text.length > 20) { // Filter out short/empty paragraphs
                        content += text + '\n\n'
                    }
                })
                if (content.length > 200) {
                    break // We have enough content
                }
            }
        }

        // If still no content, get all text
        if (!content || content.length < 100) {
            content = post$('article').text().trim() || post$('main').text().trim()
        }

        const blogPost = {
            title,
            url: fullUrl,
            author,
            date,
            content: content.substring(0, 4000) 
        }

        loggerService.info(`Successfully scraped blog post: "${title}"`)
        return blogPost

    } catch (err) {
        loggerService.error('Failed to scrape blog post:', err)
        throw new Error(`Blog scraping failed: ${err.message}`)
    }
}
