import OpenAI from 'openai'
import { loggerService } from '../logger.service.js'
import { config } from '../../config/index.js'

/**
 * Service for generating AI-powered summaries using OpenAI
 */
export const aiSummaryService = {
    generateBlogSummary
}

/* Generates a concise summary of a blog post using AI */
async function generateBlogSummary(blogPost) {
    try {
        loggerService.info(`Generating AI summary for blog post: "${blogPost.title}"`)

        // Check if OpenAI API key is configured
        if (!config.openai?.apiKey) {
            loggerService.warn('OpenAI API key not configured, using fallback summary')
            return generateFallbackSummary(blogPost)
        }

        const openai = new OpenAI({
            apiKey: config.openai.apiKey
        })

        const prompt = `You are a technical writer creating a summary for a security blog post.

Blog Title: ${blogPost.title}

Blog Content:
${blogPost.content}

Please create a concise, professional summary (3-4 sentences) that captures:
1. The main problem or topic discussed
2. The key solution or approach presented
3. The practical impact or takeaway

Write in a clear, technical style suitable for a Jira ticket description.`

        const response = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
                {
                    role: 'system',
                    content: 'You are a technical writer specializing in security and identity management topics. Create clear, concise summaries suitable for security team knowledge bases.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            max_tokens: 300,
            temperature: 0.7
        })

        const summary = response.choices[0].message.content.trim()
        loggerService.info('AI summary generated successfully')
        return summary

    } catch (err) {
        loggerService.error('Failed to generate AI summary:', err)
        loggerService.warn('Falling back to basic summary')
        return generateFallbackSummary(blogPost)
    }
}

/* Generates a basic fallback summary when AI is unavailable */
function generateFallbackSummary(blogPost) {
    const sentences = blogPost.content.split(/[.!?]+/).filter(s => s.trim().length > 0)
    const summary = sentences.slice(0, 3).join('. ') + '.'

    return summary.substring(0, 500)
}
