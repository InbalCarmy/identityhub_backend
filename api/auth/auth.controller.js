import { authService } from './auth.service.js'
import { loggerService } from './../../services/logger.service.js';

export async function login(req, res) {
    const { email, password } = req.body

    try {
        const user = await authService.login(email, password)
        loggerService.info('User login: ', user)
        
        const loginToken = authService.getLoginToken(user)
        // res.cookie('loginToken', loginToken, { sameSite: 'None', secure: true })
        res.cookie('loginToken', loginToken, { sameSite: 'Lax', httpOnly: false })
        res.json(user)
    } catch (err) {
        loggerService.error('Failed to Login ' + err)
        res.status(401).send({ err: 'Failed to Login' })
    }
}

export async function signup(req, res) {
    try {
        const credentials = req.body
                
        const account = await authService.signup(credentials)
        loggerService.debug(`auth.route - new account created: ` + JSON.stringify(account))
        
        const user = await authService.login(credentials.email, credentials.password)
        loggerService.info('User signup:', user)
        
        const loginToken = authService.getLoginToken(user)
        res.cookie('loginToken', loginToken, { sameSite: 'None', secure: true })
        
        res.json(user)
    } catch (err) {
        loggerService.error('Failed to signup ' + err)
        res.status(400).send({ err: 'Failed to signup' })
    }
}

export async function logout(req, res) {
    try {
        res.clearCookie('loginToken')
        res.send({ msg: 'Logged out successfully' })
    } catch (err) {
        res.status(400).send({ err: 'Failed to logout' })
    }
}