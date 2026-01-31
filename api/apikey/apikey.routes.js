import express from 'express'
import { requireAuth } from '../../middlewares/requireAuth.middleware.js'
import { generateKey, getAllKeys, deleteKey } from './apikey.controller.js'

const router = express.Router()

// All routes require user authentication (not API key)
router.use(requireAuth)

// generate a new API key
router.post('/', generateKey)

// get all API keys for the authenticated user
router.get('/', getAllKeys)

// delete an API key
router.delete('/:keyId', deleteKey)

export const apikeyRoutes = router
