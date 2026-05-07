const crypto = require('crypto');
const fetch = require('node-fetch');

// Cache certificates to avoid re-fetching
const certCache = new Map();

async function getCert(url) {
  if (certCache.has(url)) return certCache.get(url);

  // Only allow AWS SNS certificate URLs
  if (!url.match(/^https:\/\/sns\.[a-z0-9-]+\.amazonaws\.com\//)) {
    throw new Error(`Untrusted certificate URL: ${url}`);
  }

  const res = await fetch(url);
  const cert = await res.text();
  certCache.set(url, cert);
  return cert;
}

function buildSignatureString(msg) {
  const type = msg.Type;

  if (type === 'Notification') {
    return [
      'Message', msg.Message,
      'MessageId', msg.MessageId,
      'Subject', msg.Subject,
      'Timestamp', msg.Timestamp,
      'TopicArn', msg.TopicArn,
      'Type', msg.Type,
    ].filter((_, i, a) => i % 2 === 0 ? !!a[i + 1] : true)
      .reduce((acc, val, i, a) => i % 2 === 0 ? acc + val + '\n' + a[i + 1] + '\n' : acc, '');
  }

  if (type === 'SubscriptionConfirmation' || type === 'UnsubscribeConfirmation') {
    return [
      'Message', msg.Message,
      'MessageId', msg.MessageId,
      'SubscribeURL', msg.SubscribeURL,
      'Timestamp', msg.Timestamp,
      'Token', msg.Token,
      'TopicArn', msg.TopicArn,
      'Type', msg.Type,
    ].reduce((acc, val, i, a) => i % 2 === 0 ? acc + val + '\n' + a[i + 1] + '\n' : acc, '');
  }

  throw new Error(`Unknown SNS message type: ${type}`);
}

async function verifySnsMessage(msg) {
  if (msg.SignatureVersion !== '1') {
    throw new Error(`Unsupported SignatureVersion: ${msg.SignatureVersion}`);
  }

  const cert = await getCert(msg.SigningCertURL);
  const sigString = buildSignatureString(msg);
  const signature = Buffer.from(msg.Signature, 'base64');

  const verify = crypto.createVerify('SHA1');
  verify.update(sigString);

  if (!verify.verify(cert, signature)) {
    throw new Error('SNS message signature verification failed');
  }
}

module.exports = { verifySnsMessage };
