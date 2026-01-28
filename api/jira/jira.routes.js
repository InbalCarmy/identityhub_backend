import express from 'express'
import { requireAuth } from '../../middlewares/requireAuth.middleware.js'
import { jiraController } from './jira.controller.js'

const router = express.Router()

// All routes require authentication
router.use(requireAuth)

// OAuth flow
router.get('/auth', jiraController.initiateOAuth)
router.get('/callback', jiraController.handleOAuthCallback)
router.delete('/disconnect', jiraController.disconnect)
router.get('/status', jiraController.getConnectionStatus)

// Jira operations
router.get('/projects', jiraController.getProjects)
router.get('/projects/:projectKey/metadata', jiraController.getProjectMetadata)
router.post('/issues', jiraController.createIssue)
router.get('/projects/:projectKey/issues', jiraController.getRecentIssues)

export const jiraRoutes = router
