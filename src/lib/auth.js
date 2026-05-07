/**
 * Mailgun uses HTTP Basic Auth: "api:{YOUR_API_KEY}"
 * We verify the key matches our configured PROXY_API_KEY.
 */
function verifyAuth(request, reply) {
  const header = request.headers['authorization'] || '';

  if (!header.startsWith('Basic ')) {
    reply.code(401).send({ message: 'Unauthorized' });
    return false;
  }

  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const [prefix, key] = decoded.split(':');

  if (prefix !== 'api' || key !== process.env.PROXY_API_KEY) {
    reply.code(401).send({ message: 'Unauthorized' });
    return false;
  }

  return true;
}

module.exports = { verifyAuth };
