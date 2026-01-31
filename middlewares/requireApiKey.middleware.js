import { apikeyService } from '../api/apikey/apikey.service.js'
import { loggerService } from '../services/logger.service.js'

/**
 * Middleware to authenticate requests using API keys
 * Checks for API key in Authorization header: "Bearer ih_xxxxx"
 */
export async function requireApiKey(req, res, next) {
    try {
        const authHeader = req.headers.authorization

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            loggerService.warn('API request missing authorization header')
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Missing or invalid authorization header. Expected: Authorization: Bearer <api-key>'
            })
        }

        const apiKey = authHeader.substring(7) // Remove 'Bearer ' prefix

        if (!apiKey) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'API key is required'
            })
        }

        // Validate API key
        const validation = await apikeyService.validateApiKey(apiKey)

        if (!validation) {
            loggerService.warn(`Invalid API key attempt: ${apiKey.substring(0, 10)}...`)
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Invalid or expired API key'
            })
        }

        // Attach user info to request
        req.apiKeyAuth = {
            userId: validation.userId,
            keyId: validation.keyId
        }

        next()
    } catch (err) {
        loggerService.error('API key authentication error:', err)
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to authenticate API key'
        })
    }
}
