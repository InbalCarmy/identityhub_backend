import axios from 'axios'
import * as cheerio from 'cheerio'
import { loggerService } from '../logger.service.js'

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

        // Step 1: Fetch and parse blog listing page
        const blogListHtml = await fetchBlogListingPage()
        const $ = cheerio.load(blogListHtml)

        // Step 2: Find the latest blog post URL
        const { url: latestPostUrl, title: latestPostTitle } = findLatestBlogPostLink($)

        loggerService.info(`Found latest blog post: ${latestPostTitle}`)

        // Step 3: Fetch and parse the full blog post
        const fullUrl = buildFullUrl(latestPostUrl)
        const postHtml = await fetchBlogPost(fullUrl)
        const post$ = cheerio.load(postHtml)

        // Step 4: Extract all blog post data
        const blogPost = extractBlogPostData(post$, fullUrl, latestPostTitle)

        loggerService.info(`Successfully scraped blog post: "${blogPost.title}"`)
        return blogPost

    } catch (err) {
        loggerService.error('Failed to scrape blog post:', err)
        throw new Error(`Blog scraping failed: ${err.message}`)
    }
}

/* Fetches the blog listing page HTML */
async function fetchBlogListingPage() {
    const response = await axios.get('https://www.oasis.security/blog', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; OasisBlogDigest/1.0)'
        }
    })
    return response.data
}

/**
 * Finds the latest blog post link from the blog listing page
 * @param {CheerioAPI} $ - Cheerio instance loaded with blog listing HTML
 * @returns {{url: string, title: string}} Latest blog post URL and title
 */
function findLatestBlogPostLink($) {
    let latestPostUrl = null
    let latestPostTitle = null

    $('a[href^="/blog/"]').each((i, element) => {
        const href = $(element).attr('href')
        // Skip the main /blog page itself
        if (href && href !== '/blog' && href !== '/blog/' && !latestPostUrl) {
            latestPostUrl = href
            latestPostTitle = $(element).text().trim()
            return false // Break the loop
        }
    })

    if (!latestPostUrl) {
        throw new Error('Could not find any blog posts on the page')
    }

    return { url: latestPostUrl, title: latestPostTitle }
}

/**
 * Converts relative URL to absolute URL
 * @param {string} url - Relative or absolute URL
 * @returns {string} Absolute URL
 */
function buildFullUrl(url) {
    return url.startsWith('http')
        ? url
        : `https://www.oasis.security${url}`
}

/**
 * Fetches a blog post HTML by URL
 * @param {string} url - Full URL to the blog post
 * @returns {Promise<string>} HTML content of the blog post
 */
async function fetchBlogPost(url) {
    const response = await axios.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; OasisBlogDigest/1.0)'
        }
    })
    return response.data
}

/**
 * Extracts all data from a blog post HTML
 * @param {CheerioAPI} post$ - Cheerio instance loaded with blog post HTML
 * @param {string} url - Full URL of the blog post
 * @param {string} fallbackTitle - Fallback title if h1 not found
 * @returns {{title: string, url: string, author: string, date: string, content: string}}
 */
function extractBlogPostData(post$, url, fallbackTitle) {
    const title = extractTitle(post$, fallbackTitle)
    const author = extractAuthor(post$)
    const date = extractDate(post$)
    const content = extractContent(post$)

    return {
        title,
        url,
        author,
        date,
        content: content.substring(0, 4000)
    }
}

/**
 * Extracts the blog post title
 * @param {CheerioAPI} post$ - Cheerio instance
 * @param {string} fallbackTitle - Fallback title
 * @returns {string} Blog post title
 */
function extractTitle(post$, fallbackTitle) {
    return post$('h1').first().text().trim() || fallbackTitle
}

/**
 * Extracts the blog post author
 * @param {CheerioAPI} post$ - Cheerio instance
 * @returns {string} Author name
 */
function extractAuthor(post$) {
    // Can be extended to search for author meta tags or specific selectors
    return 'Oasis Security'
}

/**
 * Extracts the blog post publish date
 * @param {CheerioAPI} post$ - Cheerio instance
 * @returns {string} ISO date string
 */
function extractDate(post$) {
    let date = new Date().toISOString()

    post$('time, .date, .published, [datetime]').each((i, el) => {
        const datetime = post$(el).attr('datetime')
        if (datetime) {
            date = datetime
            return false // Break loop
        }
    })

    return date
}

/**
 * Extracts the blog post content
 * @param {CheerioAPI} post$ - Cheerio instance
 * @returns {string} Blog post content
 */
function extractContent(post$) {
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
                if (text && text.length > 20) {
                    content += text + '\n\n'
                }
            })
            if (content.length > 200) {
                break
            }
        }
    }

    // Fallback: get all text from article or main
    if (!content || content.length < 100) {
        content = post$('article').text().trim() || post$('main').text().trim()
    }

    return content
}
