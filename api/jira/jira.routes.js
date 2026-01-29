import express from 'express'
import { requireAuth } from '../../middlewares/requireAuth.middleware.js'
import { initiateOAuth, handleOAuthCallback, disconnect, getProjects, getProjectMetadata, createIssue, getRecentIssues, getConnectionStatus, getIdentityHubTickets} from './jira.controller.js'

const router = express.Router()

router.use(requireAuth)

// OAuth flow
router.get('/auth', initiateOAuth)
router.get('/callback', handleOAuthCallback)
router.delete('/disconnect', disconnect)
router.get('/status', getConnectionStatus)

// Jira operations
router.get('/projects', getProjects)
router.get('/projects/:projectKey/metadata', getProjectMetadata)
router.post('/issues', createIssue)
router.get('/projects/:projectKey/issues', getRecentIssues)
router.get('/identityhub-tickets', getIdentityHubTickets)

export const jiraRoutes = router
