const { verifyAuth } = require('../lib/auth');
const { queryEvents } = require('../lib/db');
const { toMailgunItem } = require('../lib/ses-to-mailgun');

/**
 * GET /v3/:domain/events
 * Returns stored events in Mailgun-compatible format.
 *
 * Supported query params:
 *   event    - filter by event type (failed, delivered, opened, clicked, etc.)
 *   begin    - Unix timestamp (start)
 *   end      - Unix timestamp (end)
 *   limit    - max results (default 100)
 */
async function eventsRoutes(fastify) {
  fastify.get('/:domain/events', async (request, reply) => {
    if (!verifyAuth(request, reply)) return;

    const domain = request.params.domain;
    const { event, begin, end, limit } = request.query;

    const rows = queryEvents({
      domain,
      event,
      begin: begin ? Number(begin) : undefined,
      end:   end   ? Number(end)   : undefined,
      limit: limit ? Math.min(Number(limit), 300) : 100,
    });

    const items = rows.map(toMailgunItem);

    return reply.send({
      items,
      paging: {
        next:     '',
        previous: '',
        first:    '',
        last:     '',
      },
    });
  });
}

module.exports = eventsRoutes;
