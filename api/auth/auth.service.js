import Cryptr from 'cryptr'
import bcrypt from 'bcrypt'

import { userService } from '../user/user.service.js'
import { loggerService } from '../../services/logger.service.js'

const cryptr = new Cryptr(process.env.SECRET1)

export const authService = {
    getLoginToken,
    validateToken,
    login,
    signup
}


function getLoginToken(user) {
    const str = JSON.stringify(user)
    const encryptedStr = cryptr.encrypt(str)
    return encryptedStr
}

function validateToken(token) {
    try {
        const json = cryptr.decrypt(token)
        const loggedinUser = JSON.parse(json)
        return loggedinUser
    } catch (err) {
        console.log('Invalid login token')
    }
    return null
}

async function login(email, password) {
    var user = await userService.getByEmail(email)
    if (!user) throw 'Unkown Email'

    const match = await bcrypt.compare(password, user.password)
    if (!match) throw 'Invalid email or password'

        const miniUser = {
            _id: user._id.toString(),  // Convert ObjectId to string
            name: user.name,
            email: user.email,
            isOnboarded: user.isOnboarded || false,
            preferences: user.preferences || null
        }
    return miniUser
}

async function signup({ email, name, password, isOnboarded }) {
    const saltRounds = 10


    loggerService.debug(`auth.service - signup with name: ${name}, email: ${email}`)
    if (!name || !password || !email) throw 'Missing required signup information'

    const userExist = await userService.getByEmail(email)
    if (userExist) throw 'This email already taken'

    const hash = await bcrypt.hash(password, saltRounds)
    return userService.add({ email, password: hash, name, isOnboarded })
}