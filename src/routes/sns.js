const fetch = require('node-fetch');
const { verifySnsMessage } = require('../lib/sns-verify');
const { translate } = require('../lib/ses-to-mailgun');
const { insertEvent, insertBounce, insertUnsubscribe } = require('../lib/db');

/**
 * POST /sns
 * Receives SNS notifications from AWS (SES event destination).
 * Handles:
 *   - SubscriptionConfirmation  (auto-confirms the subscription)
 *   - Notification              (translates SES events and stores them)
 */
async function snsRoutes(fastify) {
  fastify.post('/sns', {
    config: { rawBody: true },
  }, async (request, reply) => {
    let msg;

    try {
      const raw = typeof request.body === 'string'
        ? request.body
        : JSON.stringify(request.body);
      msg = JSON.parse(raw);
    } catch {
      return reply.code(400).send({ message: 'Invalid JSON body' });
    }

    // Verify the SNS message signature
    try {
      await verifySnsMessage(msg);
    } catch (err) {
      fastify.log.warn({ err }, 'SNS signature verification failed');
      return reply.code(403).send({ message: 'Signature verification failed' });
    }

    // Auto-confirm subscription
    if (msg.Type === 'SubscriptionConfirmation') {
      fastify.log.info({ topicArn: msg.TopicArn }, 'Confirming SNS subscription');
      try {
        await fetch(msg.SubscribeURL);
        fastify.log.info('SNS subscription confirmed');
      } catch (err) {
        fastify.log.error({ err }, 'Failed to confirm SNS subscription');
        return reply.code(500).send({ message: 'Subscription confirmation failed' });
      }
      return reply.send({ message: 'Subscription confirmed' });
    }

    // Handle notification
    if (msg.Type === 'Notification') {
      let sesEvent;
      try {
        sesEvent = JSON.parse(msg.Message);
      } catch {
        fastify.log.warn('Failed to parse SNS Message payload');
        return reply.send({ message: 'OK' });
      }

      const events = translate(sesEvent);

      for (const ev of events) {
        insertEvent({
          event:     ev.event,
          severity:  ev.severity,
          recipient: ev.recipient,
          messageId: ev.messageId,
          domain:    ev.domain,
          timestamp: ev.timestamp,
          raw:       ev.raw,
        });

        // Auto-add permanent bounces to bounce list
        if (ev.event === 'failed' && ev.severity === 'permanent' && ev.recipient) {
          insertBounce({
            address: ev.recipient,
            code:    ev.extra?.code,
            error:   ev.extra?.error,
          });
        }

        // Auto-add complaints to unsubscribe list
        if (ev.event === 'complained' && ev.recipient) {
          insertUnsubscribe({ address: ev.recipient, tag: 'complaint' });
          fastify.log.info({ address: ev.recipient }, 'Added complaint to unsubscribes');
        }
      }

      fastify.log.info({ count: events.length, type: sesEvent.eventType }, 'SES events stored');
      return reply.send({ message: 'OK', stored: events.length });
    }

    return reply.send({ message: 'OK' });
  });
}

module.exports = snsRoutes;
