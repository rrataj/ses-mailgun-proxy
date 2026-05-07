const fastify = require('fastify')({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  },
});

fastify.register(require('@fastify/multipart'), {
  attachFieldsToBody: true,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
});

// Routes
fastify.register(require('./routes/messages'), { prefix: '/v3' });
fastify.register(require('./routes/events'),   { prefix: '/v3' });
fastify.register(require('./routes/bounces'),  { prefix: '/v3' });
fastify.register(require('./routes/unsubscribes'), { prefix: '/v3' });
fastify.register(require('./routes/sns'));

// Health check
fastify.get('/health', async () => ({ status: 'ok', version: '0.1.0' }));

module.exports = fastify;
