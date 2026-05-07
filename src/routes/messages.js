const { verifyAuth } = require('../lib/auth');
const { sendMail } = require('../lib/mailer');
const { isUnsubscribed } = require('../lib/db');

/**
 * POST /v3/:domain/messages
 * Mailgun send message endpoint.
 * Accepts multipart/form-data with fields:
 *   from, to, subject, text, html, h:*, recipient-variables, etc.
 *
 * Ghost uses Mailgun recipient variables (%recipient.uuid% etc.) for
 * per-member tracking URLs. We parse recipient-variables and substitute
 * them before sending so Ghost's open/click tracking works correctly.
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

    // Parse recipient-variables (Ghost sends per-member uuid, unsubscribe_url, etc.)
    let recipientVars = {};
    const rvRaw = field('recipient-variables');
    if (rvRaw) {
      try { recipientVars = JSON.parse(rvRaw); } catch (_) {}
    }

    // Parse recipients list
    const recipients = to.split(',').map(s => s.trim()).filter(Boolean);

    // Send one email per recipient with variables substituted
    const results = [];
    for (const recipient of recipients) {
      const email = recipient.replace(/.*<(.+)>.*/, '$1').trim();

      if (isUnsubscribed(email)) {
        fastify.log.info({ domain, email }, 'Recipient unsubscribed, skipping');
        continue;
      }

      // Build per-recipient variable map
      const vars = recipientVars[email] || {};

      // Substitute %recipient.KEY% and %recipient_KEY% patterns
      const substitute = (str) => {
        if (!str) return str;
        return str
          .replace(/%recipient\.([^%]+)%/g, (_, key) => vars[key] ?? '')
          .replace(/%recipient_([^%]+)%/g,   (_, key) => vars[key] ?? '');
      };

      try {
        const messageId = await sendMail({
          from,
          to: recipient,
          subject: substitute(subject),
          text:    substitute(text),
          html:    substitute(html),
          headers,
        });

        fastify.log.info({ domain, email, messageId }, 'Message sent via SES');
        results.push(messageId);
      } catch (err) {
        fastify.log.error({ err, domain, email }, 'Failed to send message');
        return reply.code(500).send({ message: `Failed to send message: ${err.message}` });
      }
    }

    if (results.length === 0) {
      fastify.log.info({ domain, to }, 'All recipients unsubscribed, skipping send');
      return reply.send({ id: `<skipped-unsubscribed@${domain}>`, message: 'Skipped. All recipients unsubscribed.' });
    }

    return reply.send({
      id: results[0] || `<${Date.now()}.proxy@${domain}>`,
      message: 'Queued. Thank you.',
    });
  });
}

module.exports = messagesRoutes;
