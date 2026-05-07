const { verifyAuth } = require('../lib/auth');
const { sendMail } = require('../lib/mailer');
const { isUnsubscribed } = require('../lib/db');

/**
 * POST /v3/:domain/messages
 * Mailgun send message endpoint.
 * Accepts multipart/form-data with fields:
 *   from, to, cc, bcc, subject, text, html, h:*, o:tag, etc.
 */
async function messagesRoutes(fastify) {
  fastify.post('/:domain/messages', async (request, reply) => {
    if (!verifyAuth(request, reply)) return;

    const domain = request.params.domain;
    const body   = request.body || {};

    // Helper: extract field value from multipart body
    const field = (key) => {
      const f = body[key];
      if (!f) return undefined;
      if (Array.isArray(f)) return f.map(x => x.value ?? x).join(', ');
      return f.value ?? f;
    };

    const from    = field('from');
    const to      = field('to');
    const cc      = field('cc');
    const bcc     = field('bcc');
    const subject = field('subject');
    const text    = field('text');
    const html    = field('html');

    if (!from || !to || !subject) {
      return reply.code(400).send({ message: 'Missing required fields: from, to, subject' });
    }

    // Collect custom headers (h: prefix)
    const headers = {};
    for (const [key, val] of Object.entries(body)) {
      if (key.startsWith('h:')) {
        headers[key.slice(2)] = val.value ?? val;
      }
    }

    // Filter out unsubscribed recipients
    const recipients = to.split(',').map(s => s.trim()).filter(Boolean);
    const allowed    = recipients.filter(r => {
      const email = r.replace(/.*<(.+)>.*/, '$1').trim();
      return !isUnsubscribed(email);
    });

    if (allowed.length === 0) {
      fastify.log.info({ domain, to }, 'All recipients unsubscribed, skipping send');
      return reply.send({ id: `<skipped-unsubscribed@${domain}>`, message: 'Skipped. All recipients unsubscribed.' });
    }

    try {
      const messageId = await sendMail({
        from,
        to: allowed.join(', '),
        cc,
        bcc,
        subject,
        text,
        html,
        headers,
      });

      fastify.log.info({ domain, to: allowed, messageId }, 'Message sent via SES');

      return reply.send({
        id: messageId || `<${Date.now()}.proxy@${domain}>`,
        message: 'Queued. Thank you.',
      });
    } catch (err) {
      fastify.log.error({ err, domain, to }, 'Failed to send message');
      return reply.code(500).send({ message: `Failed to send message: ${err.message}` });
    }
  });
}

module.exports = messagesRoutes;
