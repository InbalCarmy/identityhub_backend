import { dbService } from '../../services/db.service.js'
import { loggerService } from '../../services/logger.service.js'
import crypto from 'crypto'
import { ObjectId } from 'mongodb'

const API_KEY_PREFIX = 'ih_'

export const apikeyService = {
    generateApiKey,
    validateApiKey,
    getAll,
    remove,
    getById
}


async function generateApiKey(userId, name) {
    try {
        const apiKey = crypto.randomBytes(32).toString('hex')

        // Hash the API key before storing
        const hashedKey = hashApiKey(apiKey)

        const apiKeyDoc = {
            userId: ObjectId.createFromHexString(userId),
            name,
            hashedKey,
            createdAt: new Date(),
            lastUsedAt: null,
            isActive: true
        }

        const collection = await dbService.getCollection('apikeys')
        const result = await collection.insertOne(apiKeyDoc)

        loggerService.info(`API key created for user ${userId}: ${name}`)

        // Return the plain API key only once (won't be stored)
        return {
            id: result.insertedId.toString(),
            apiKey: `${API_KEY_PREFIX}${apiKey}`,
            name,
            createdAt: apiKeyDoc.createdAt
        }
    } catch (err) {
        loggerService.error('Cannot generate API key', err)
        throw err
    }
}

/**
 * Validate an API key and return associated user
 */
async function validateApiKey(apiKey) {
    try {
        // Remove prefix if present
        const cleanKey = apiKey.startsWith(API_KEY_PREFIX)
            ? apiKey.substring(API_KEY_PREFIX.length)
            : apiKey
        const hashedKey = hashApiKey(cleanKey)

        const collection = await dbService.getCollection('apikeys')
        const apiKeyDoc = await collection.findOne({
            hashedKey,
            isActive: true
        })

        if (!apiKeyDoc) {
            return null
        }

        // Update last used timestamp
        await collection.updateOne(
            { _id: apiKeyDoc._id },
            { $set: { lastUsedAt: new Date() } }
        )

        return {
            userId: apiKeyDoc.userId.toString(),
            keyId: apiKeyDoc._id.toString()
        }
    } catch (err) {
        loggerService.error('Cannot validate API key', err)
        return null
    }
}

/**
 * Get all API keys for a user (without revealing the actual keys)
 */
async function getAll(userId) {
    try {
        const collection = await dbService.getCollection('apikeys')
        const apiKeys = await collection
            .find({ userId: ObjectId.createFromHexString(userId) })
            .project({ hashedKey: 0 }) // Don't return hashed keys
            .toArray()

        return apiKeys.map(key => ({
            id: key._id.toString(),
            name: key.name,
            createdAt: key.createdAt,
            lastUsedAt: key.lastUsedAt,
            isActive: key.isActive
        }))
    } catch (err) {
        loggerService.error('Cannot get API keys', err)
        throw err
    }
}

/**
 * Get API key by ID
 */
async function getById(keyId) {
    try {
        const collection = await dbService.getCollection('apikeys')
        const apiKey = await collection.findOne({ _id: ObjectId.createFromHexString(keyId) })

        if (!apiKey) return null

        return {
            id: apiKey._id.toString(),
            userId: apiKey.userId.toString(),
            name: apiKey.name,
            createdAt: apiKey.createdAt,
            lastUsedAt: apiKey.lastUsedAt,
            isActive: apiKey.isActive
        }
    } catch (err) {
        loggerService.error('Cannot get API key by ID', err)
        throw err
    }
}

/**
 * Revoke/delete an API key
 */
async function remove(keyId, userId) {
    try {
        const collection = await dbService.getCollection('apikeys')
        const result = await collection.deleteOne({
            _id: ObjectId.createFromHexString(keyId),
            userId: ObjectId.createFromHexString(userId)
        })

        if (result.deletedCount === 0) {
            throw new Error('API key not found or unauthorized')
        }

        loggerService.info(`API key ${keyId} deleted by user ${userId}`)
        return true
    } catch (err) {
        loggerService.error('Cannot delete API key', err)
        throw err
    }
}

/**
 * Hash an API key using SHA-256
 */
function hashApiKey(apiKey) {
    return crypto
        .createHash('sha256')
        .update(apiKey)
        .digest('hex')
}
