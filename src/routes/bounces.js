const { verifyAuth } = require('../lib/auth');
const { getBounces, insertBounce, deleteBounce } = require('../lib/db');

/**
 * GET  /v3/:domain/bounces        - list bounces
 * POST /v3/:domain/bounces        - add bounce
 * GET  /v3/:domain/bounces/:addr  - get single bounce
 * DEL  /v3/:domain/bounces/:addr  - delete bounce
 */
async function bouncesRoutes(fastify) {
  fastify.get('/:domain/bounces', async (request, reply) => {
    if (!verifyAuth(request, reply)) return;

    const rows = getBounces({ domain: request.params.domain });

    return reply.send({
      items: rows.map(r => ({
        address:    r.address,
        code:       r.code || '550',
        error:      r.error || '',
        created_at: new Date(r.created_at * 1000).toUTCString(),
      })),
      total_count: rows.length,
    });
  });

  fastify.get('/:domain/bounces/:address', async (request, reply) => {
    if (!verifyAuth(request, reply)) return;

    const rows = getBounces();
    const row  = rows.find(r => r.address === request.params.address);

    if (!row) return reply.code(404).send({ message: 'Bounce not found' });

    return reply.send({
      address:    row.address,
      code:       row.code || '550',
      error:      row.error || '',
      created_at: new Date(row.created_at * 1000).toUTCString(),
    });
  });

  fastify.post('/:domain/bounces', async (request, reply) => {
    if (!verifyAuth(request, reply)) return;

    const body    = request.body || {};
    const field   = k => { const f = body[k]; return f ? (f.value ?? f) : undefined; };
    const address = field('address');

    if (!address) return reply.code(400).send({ message: 'Missing address' });

    insertBounce({ address, code: field('code'), error: field('error') });

    return reply.send({ message: 'Address has been added to the bounces table', address });
  });

  fastify.delete('/:domain/bounces/:address', async (request, reply) => {
    if (!verifyAuth(request, reply)) return;

    deleteBounce(request.params.address);

    return reply.send({ message: 'Bounce has been removed', address: request.params.address });
  });
}

module.exports = bouncesRoutes;
