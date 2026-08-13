import Fastify from 'fastify'
import cors from '@fastify/cors'
import { config } from './lib/config.js'
import { registerAccountRoutes } from './routes/account.js'
import { registerAuthRoutes } from './routes/auth.js'
import { registerCronRoutes } from './routes/cron.js'

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
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type'],
})

app.get('/health', async () => ({ ok: true }))

await registerAuthRoutes(app)
await registerAccountRoutes(app)
await registerCronRoutes(app)

const start = async () => {
  try {
    await app.listen({ host: '0.0.0.0', port: config.port })
  } catch (error) {
    app.log.error(error)
    process.exit(1)
  }
}

await start()
