import express from 'express'
import { requireApiKey } from '../../middlewares/requireApiKey.middleware.js'
import { createNHIFinding } from './nhi-findings.controller.js'

const router = express.Router()

router.use(requireApiKey)

//create a new NHI finding ticket
router.post('/', createNHIFinding)

export const nhiFindingsRoutes = router
