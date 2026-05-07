/**
 * Translates SES event payloads (received via SNS) into
 * Mailgun-compatible event objects for storage and serving.
 */

function translate(sesEvent) {
  const eventType = sesEvent.eventType || sesEvent.notificationType;
  const ts = Math.floor(new Date(sesEvent.mail?.timestamp || Date.now()).getTime() / 1000);
  const messageId = sesEvent.mail?.messageId || null;
  const domain = extractDomain(sesEvent.mail?.source);

  switch (eventType) {
    case 'Bounce': {
      const b = sesEvent.bounce;
      const severity = b.bounceType === 'Permanent' ? 'permanent' : 'temporary';
      return (b.bouncedRecipients || []).map(r => ({
        event: 'failed',
        severity,
        recipient: r.emailAddress,
        messageId,
        domain,
        timestamp: ts,
        raw: sesEvent,
        extra: { code: r.status, error: r.diagnosticCode },
      }));
    }

    case 'Complaint': {
      const c = sesEvent.complaint;
      return (c.complainedRecipients || []).map(r => ({
        event: 'complained',
        severity: 'permanent',
        recipient: r.emailAddress,
        messageId,
        domain,
        timestamp: ts,
        raw: sesEvent,
      }));
    }

    case 'Delivery': {
      const d = sesEvent.delivery;
      return (d.recipients || []).map(r => ({
        event: 'delivered',
        severity: null,
        recipient: r,
        messageId,
        domain,
        timestamp: ts,
        raw: sesEvent,
      }));
    }

    case 'Open': {
      const o = sesEvent.open;
      const openRecipient = (sesEvent.mail?.destination || [])[0] || null;
      return [{
        event: 'opened',
        severity: null,
        recipient: openRecipient,
        messageId,
        domain,
        timestamp: Math.floor(new Date(o?.timestamp || sesEvent.mail?.timestamp || Date.now()).getTime() / 1000),
        raw: sesEvent,
        extra: { ip: o?.ipAddress, userAgent: o?.userAgent },
      }];
    }

    case 'Click': {
      const cl = sesEvent.click;
      const clickRecipient = (sesEvent.mail?.destination || [])[0] || null;
      return [{
        event: 'clicked',
        severity: null,
        recipient: clickRecipient,
        messageId,
        domain,
        timestamp: Math.floor(new Date(cl?.timestamp || sesEvent.mail?.timestamp || Date.now()).getTime() / 1000),
        raw: sesEvent,
        extra: { url: cl?.link, ip: cl?.ipAddress, userAgent: cl?.userAgent },
      }];
    }

    case 'Send':
      return [{
        event: 'accepted',
        severity: null,
        recipient: (sesEvent.mail?.destination || [])[0] || null,
        messageId,
        domain,
        timestamp: ts,
        raw: sesEvent,
      }];

    case 'DeliveryDelay': {
      const dd = sesEvent.deliveryDelay;
      return (dd?.delayedRecipients || []).map(r => ({
        event: 'failed',
        severity: 'temporary',
        recipient: r.emailAddress,
        messageId,
        domain,
        timestamp: ts,
        raw: sesEvent,
        extra: { error: dd.delayType },
      }));
    }

    default:
      return [];
  }
}

function extractDomain(email) {
  if (!email) return null;
  const match = email.match(/@(.+)$/);
  return match ? match[1] : null;
}

/**
 * Format stored event row as Mailgun API response item.
 */
function toMailgunItem(row) {
  return {
    id: String(row.id),
    timestamp: row.timestamp,
    event: row.event,
    severity: row.severity || undefined,
    recipient: row.recipient || undefined,
    message: {
      headers: { 'message-id': row.message_id || '' },
    },
  };
}

module.exports = { translate, toMailgunItem };
