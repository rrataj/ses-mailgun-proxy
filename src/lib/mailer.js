const nodemailer = require('nodemailer');

let _transport = null;

function getTransport() {
  if (_transport) return _transport;

  _transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return _transport;
}

/**
 * Sends an email and returns the message ID.
 * @param {object} opts - nodemailer mail options
 * @returns {Promise<string>} messageId
 */
async function sendMail(opts) {
  const transport = getTransport();

  // Attach SES configuration set for event tracking (if configured)
  const configSet = process.env.SES_CONFIGURATION_SET;
  const headers = opts.headers || {};
  if (configSet) {
    headers['X-SES-CONFIGURATION-SET'] = configSet;
  }

  const info = await transport.sendMail({ ...opts, headers });

  // SES assigns its own message-id visible in SNS events.
  // It appears in the SMTP response: "250 Ok 0110019e02d22ba1-xxxx-000000"
  // We return this SES ID so Ghost stores it as provider_id and can later
  // match incoming SNS events (which also carry the SES message-id).
  const sesIdMatch = (info.response || '').match(/\b([0-9a-f]+-[0-9a-f-]+-000000)\b/i);
  if (sesIdMatch) {
    return sesIdMatch[1];
  }

  // Fallback: strip angle brackets from nodemailer's generated ID
  return (info.messageId || '').replace(/^<|>$/g, '');
}

module.exports = { sendMail };
