import { dbService } from './db.service.js'
import { loggerService } from './logger.service.js'

const COLLECTION_NAME = 'oauth_states'

export const oauthStateService = {
    createState,
    validateAndDeleteState,
    initializeCollection
}

/**
 * Initialize the collection with TTL index for automatic cleanup
 * Call this once when the server starts
 */
async function initializeCollection() {
    try {
        const collection = await dbService.getCollection(COLLECTION_NAME)

        // Create TTL index - MongoDB will automatically delete documents after expiresAt
        await collection.createIndex(
            { expiresAt: 1 },
            { expireAfterSeconds: 0 }
        )

        // Create index on userId for faster lookups
        await collection.createIndex({ userId: 1 })
    } catch (err) {
        loggerService.error('Failed to initialize OAuth state collection:', err)
        throw err
    }
}

/* Create a new OAuth state for a user */
async function createState(userId, state, expirationMinutes = 5) {
    try {
        const collection = await dbService.getCollection(COLLECTION_NAME)

        const expiresAt = new Date(Date.now() + (expirationMinutes * 60 * 1000))

        // Delete existing states for this user first
        await collection.deleteMany({ userId })

        // Insert new state
        await collection.insertOne({
            userId,
            state,
            expiresAt,
            createdAt: new Date()
        })

        loggerService.info(`OAuth state created for user ${userId}, expires at ${expiresAt.toISOString()}`)
    } catch (err) {
        loggerService.error('Failed to create OAuth state:', err)
        throw err
    }
}

/* Validate the state and delete it */
async function validateAndDeleteState(userId, state) {
    try {
        const collection = await dbService.getCollection(COLLECTION_NAME)

        // Find and delete the state in one operation (atomic)
        const result = await collection.findOneAndDelete({
            userId,
            state,
            expiresAt: { $gt: new Date() }
        })

        if (result) {
            loggerService.info(`OAuth state validated and deleted for user ${userId}`)
            return true
        }

        loggerService.warn(`Invalid or expired OAuth state for user ${userId}`)
        return false
    } catch (err) {
        loggerService.error('Failed to validate OAuth state:', err)
        throw err
    }
}
