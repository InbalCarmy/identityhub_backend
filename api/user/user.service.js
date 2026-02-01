import { loggerService } from '../../services/logger.service.js'
import { dbService } from '../../services/db.service.js'
import { ObjectId } from 'mongodb'


export const userService = {
    query,
    getById,
    // remove,
    add,
    getByEmail,
    update
}

async function query() {
    const criteria = _buildCriteria()
    try {
        const collection = await dbService.getCollection('user')
        var users = await collection.find(criteria).toArray()
        users = users.map(user => {
            delete user.password
            user.createdAt = user._id.getTimestamp()
            return user
        })
        return users
    } catch (err) {
        loggerService.error('cannot find users', err)
        throw err
    }
}


async function getById(userId) {
    try {
        var criteria = { _id: ObjectId.createFromHexString(userId) }

        const collection = await dbService.getCollection('user')
        const user = await collection.findOne(criteria)
        delete user.password

        criteria = { byUserId: userId }


        return user
    } catch (err) {
        loggerService.error(`while finding user by id: ${userId}`, err)
        throw err
    }
}

// async function remove(userId) {
//     try {
//         const criteria = { _id: ObjectId.createFromHexString(userId) }

//         const collection = await dbService.getCollection('user')
//         await collection.deleteOne(criteria)
//     } catch (err) {
//         loggerService.error(`cannot remove user ${userId}`, err)
//         throw err
//     }
// }

async function add(user) {
    
    try {
        const userToAdd = {
            name: user.name,
            password: user.password,
            email: user.email,
        }
        const collection = await dbService.getCollection('user')
        await collection.insertOne(userToAdd)
        return userToAdd
    } catch (err) {
        loggerService.error('cannot add user', err)
        throw err
    }
}

async function update(user) {
    try {
        // Convert _id to ObjectId if it's a string
        const userId = typeof user._id === 'string'
            ? ObjectId.createFromHexString(user._id)
            : user._id

        // peek only updatable properties
        const userToSave = {
            name: user.name,
            email: user.email,
        }

        // Include config if provided (for Jira tokens, etc.)
        if (user.config) {
            userToSave.config = user.config
        }

        const collection = await dbService.getCollection('user')
        await collection.updateOne({ _id: userId }, { $set: userToSave })

        // Return the updated user with original _id
        return { ...userToSave, _id: user._id }
    } catch (err) {
        loggerService.error(`cannot update user ${user._id}`, err)
        throw err
    }
}

async function getByEmail(email) {
    try {
        const collection = await dbService.getCollection('user')
        const user = await collection.findOne({ email })
        return user
    } catch (err) {
        loggerService.error(`while finding user by email: ${email}`, err)
        throw err
    }
}

function _buildCriteria() {
    // Build query criteria (currently returns empty object to get all users)
    return {}
}

