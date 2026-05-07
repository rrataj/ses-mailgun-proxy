const { verifyAuth } = require('../lib/auth');
const { getUnsubscribes, insertUnsubscribe, deleteUnsubscribe } = require('../lib/db');

/**
 * GET  /v3/:domain/unsubscribes        - list
 * POST /v3/:domain/unsubscribes        - add
 * DEL  /v3/:domain/unsubscribes/:addr  - delete
 */
async function unsubscribesRoutes(fastify) {
  fastify.get('/:domain/unsubscribes', async (request, reply) => {
    if (!verifyAuth(request, reply)) return;

    const rows = getUnsubscribes();

    return reply.send({
      items: rows.map(r => ({
        address:    r.address,
        tag:        r.tag || '*',
        created_at: new Date(r.created_at * 1000).toUTCString(),
      })),
      total_count: rows.length,
    });
  });

  fastify.post('/:domain/unsubscribes', async (request, reply) => {
    if (!verifyAuth(request, reply)) return;

    const body    = request.body || {};
    const field   = k => { const f = body[k]; return f ? (f.value ?? f) : undefined; };
    const address = field('address');

    if (!address) return reply.code(400).send({ message: 'Missing address' });

    insertUnsubscribe({ address, tag: field('tag') });

    return reply.send({ message: 'Address has been added to the unsubscribes table', address });
  });

  fastify.delete('/:domain/unsubscribes/:address', async (request, reply) => {
    if (!verifyAuth(request, reply)) return;

    deleteUnsubscribe(request.params.address);

    return reply.send({ message: 'Unsubscribe event has been removed', address: request.params.address });
  });
}

module.exports = unsubscribesRoutes;
