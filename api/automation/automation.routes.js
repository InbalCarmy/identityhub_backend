import express from 'express'
import { requireAuth } from '../../middlewares/requireAuth.middleware.js'
import { triggerBlogDigest } from './automation.controller.js'

const router = express.Router()

// Manual trigger for blog digest automation (requires authentication)
router.post('/blog-digest', requireAuth, triggerBlogDigest)

export const automationRoutes = router
