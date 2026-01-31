import { apikeyService } from './apikey.service.js'
import { loggerService } from '../../services/logger.service.js'

/**
 * Generate a new API key
 * POST /api/apikeys
 */
export async function generateKey(req, res) {
    try {
        const loggedinUser = req.loggedinUser
        if (!loggedinUser) {
            return res.status(401).send({ err: 'Not authenticated' })
        }

        const { name } = req.body

        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return res.status(400).json({
                error: 'Validation error',
                message: 'API key name is required'
            })
        }

        const apiKeyData = await apikeyService.generateApiKey(
            loggedinUser._id.toString(),
            name.trim()
        )

        // The onlyvtime the plain API key is shown
        res.status(201).json({
            message: 'API key created successfully. Save it now - you won\'t be able to see it again!',
            apiKey: apiKeyData.apiKey,
            id: apiKeyData.id,
            name: apiKeyData.name,
            createdAt: apiKeyData.createdAt
        })
    } catch (err) {
        loggerService.error('Cannot generate API key:', err)
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to generate API key'
        })
    }
}

/**
 * Get all API keys for the authenticated user
 * GET /api/apikeys
 */
export async function getAllKeys(req, res) {
    try {
        const loggedinUser = req.loggedinUser
        if (!loggedinUser) {
            return res.status(401).send({ err: 'Not authenticated' })
        }

        const apiKeys = await apikeyService.getAll(loggedinUser._id.toString())

        res.json({
            apiKeys,
            total: apiKeys.length
        })
    } catch (err) {
        loggerService.error('Cannot get API keys:', err)
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to retrieve API keys'
        })
    }
}

/**
 * Delete an API key
 * DELETE /api/apikeys/:keyId
 */
export async function deleteKey(req, res) {
    try {
        const loggedinUser = req.loggedinUser
        if (!loggedinUser) {
            return res.status(401).send({ err: 'Not authenticated' })
        }

        const { keyId } = req.params

        await apikeyService.remove(keyId, loggedinUser._id.toString())

        res.json({
            message: 'API key deleted successfully'
        })
    } catch (err) {
        loggerService.error('Cannot delete API key:', err)

        if (err.message.includes('not found') || err.message.includes('unauthorized')) {
            return res.status(404).json({
                error: 'Not found',
                message: 'API key not found or you don\'t have permission to delete it'
            })
        }

        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to delete API key'
        })
    }
}
