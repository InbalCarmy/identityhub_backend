
import { asyncLocalStorage } from '../services/als.service.js'

export function requireAuth(req, res, next) {
	const store = asyncLocalStorage.getStore()
	const loggedinUser = store?.loggedinUser
	req.loggedinUser = loggedinUser

	if (!loggedinUser) return res.status(401).send('Not Authenticated')
	next()
}


