import jwt from 'jsonwebtoken'
import bcrypt from 'bcrypt'

import { userService } from '../user/user.service.js'
import { loggerService } from '../../services/logger.service.js'

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key'

export const authService = {
    getLoginToken,
    verifyToken,
    login,
    signup
}

/* Generates a JWT token for a user */
function getLoginToken(user) {
    const payload = {
        _id: user._id,
        name: user.name,
        email: user.email
    }
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' })
    return token
}

/* Decoded user object or null if invalid */
function verifyToken(token) {
    try {
        const decoded = jwt.verify(token, JWT_SECRET)
        return {
            _id: decoded._id,
            name: decoded.name,
            email: decoded.email
        }
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            loggerService.warn('JWT token expired')
        } else if (err.name === 'JsonWebTokenError') {
            loggerService.warn('Invalid JWT token')
        } else {
            loggerService.error('JWT validation error:', err)
        }
        return null
    }
}

/* Authenticates a user with email and password */
async function login(email, password) {
    const user = await userService.getByEmail(email)
    if (!user) throw 'Unknown email address'

    const match = await bcrypt.compare(password, user.password)
    if (!match) throw 'Invalid email or password'

    const miniUser = {
        _id: user._id.toString(),
        name: user.name,
        email: user.email,
    }
    return miniUser
}

/* Creates a new user account */
async function signup({ email, name, password }) {
    const saltRounds = 10

    loggerService.debug(`auth.service - signup with name: ${name}, email: ${email}`)
    if (!name || !password || !email) throw 'Missing required signup information'

    const userExist = await userService.getByEmail(email)
    if (userExist) throw 'This email already taken'

    const hash = await bcrypt.hash(password, saltRounds)
    return userService.add({ email, password: hash, name })
}
