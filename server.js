import 'dotenv/config'
import http from 'http'
import path from 'path'
import cors from 'cors'
import express from 'express'
import cookieParser from 'cookie-parser'
import { authRoutes } from './api/auth/auth.routes.js'
import { userRoutes } from './api/user/user.routes.js'
import { jiraRoutes } from './api/jira/jira.routes.js'

import { setupAsyncLocalStorage } from './middlewares/setupAls.middleware.js'

const app = express()
const server = http.createServer(app)

// Express App Config
app.use(cookieParser())
app.use(express.json())

app.all('*', setupAsyncLocalStorage)

if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve('public')))
} else {
    const corsOptions = {
        origin: [
            'http://127.0.0.1:8080',
            'http://localhost:3000',
            'http://127.0.0.1:5173',
            'http://localhost:5173'
        ],
        credentials: true
    }
    app.use(cors(corsOptions))
}
app.use('/api/auth', authRoutes)
app.use('/api/user', userRoutes)
app.use('/api/jira', jiraRoutes)

// // Serve the frontend for any non-API routes (MUST be last!)
// app.get('*', (req, res) => {
//     res.sendFile(path.resolve('public/index.html'))
// })

app.get('/', (req, res) => {
    res.json({ message: 'IdentityHub API Server', version: '1.0.0' })
})

import { loggerService} from './services/logger.service.js'
const port = process.env.PORT || 3030

server.listen(port, () => {
    loggerService.info('Server is running on: ' + `http://localhost:${port}/`)
})



