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

    // mailgun.js SDK calls `new URL(value)` on every paging key.
    // Empty strings cause an uncaught exception and events are silently dropped.
    // Omit keys that have no real URL — SDK handles missing keys gracefully.
    const baseUrl = `https://api.mailgun.net/v3/${domain}/events`;
    const paging = {
      first: `${baseUrl}?${new URLSearchParams({ ...request.query, page: 'first' })}`,
      last:  `${baseUrl}?${new URLSearchParams({ ...request.query, page: 'last' })}`,
    };
    // Only add next/previous if there might be more pages
    if (items.length >= (limit ? Math.min(Number(limit), 300) : 100)) {
      paging.next = `${baseUrl}?${new URLSearchParams({ ...request.query, page: 'next' })}`;
    }

    return reply.send({ items, paging });
  });
}

module.exports = eventsRoutes;
