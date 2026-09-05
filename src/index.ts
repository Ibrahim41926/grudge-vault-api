import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import { config } from './lib/config.js'
import { registerAccountRoutes } from './routes/account.js'
import { registerAuthRoutes } from './routes/auth.js'
import { registerCronRoutes } from './routes/cron.js'
import { registerFileRoutes } from './routes/files.js'
import { registerGrudgeRoutes } from './routes/grudges.js'
import { registerNotificationRoutes } from './routes/notifications.js'
import { registerOAuthRoutes } from './routes/oauth.js'
import { registerPeopleRoutes } from './routes/people.js'
import { registerReminderRoutes } from './routes/reminders.js'
import { registerTagRoutes } from './routes/tags.js'
import { registerUploadRoutes } from './routes/uploads.js'

const app = Fastify({
  logger: true,
})

await app.register(cors, {
  origin(origin, callback) {
    if (!origin) {
      callback(null, true)
      return
    }

    if (config.corsOrigins.includes(origin)) {
      callback(null, true)
      return
    }

    callback(new Error(`Origin ${origin} not allowed by CORS`), false)
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type'],
  credentials: true,
})

await app.register(cookie)

await app.register(multipart, {
  limits: { fileSize: config.maxUploadSizeBytes },
})

app.get('/health', async () => ({ ok: true }))

await registerAuthRoutes(app)
await registerOAuthRoutes(app)
await registerAccountRoutes(app)
await registerCronRoutes(app)
await registerFileRoutes(app)
await registerUploadRoutes(app)
await registerGrudgeRoutes(app)
await registerPeopleRoutes(app)
await registerTagRoutes(app)
await registerReminderRoutes(app)
await registerNotificationRoutes(app)

const start = async () => {
  try {
    await app.listen({ host: '0.0.0.0', port: config.port })
  } catch (error) {
    app.log.error(error)
    process.exit(1)
  }
}

await start()
