# Contributing

Contributions are welcome. Here is how to get started.

## Setup

```bash
git clone https://github.com/your-username/ses-mailgun-proxy
cd ses-mailgun-proxy
npm install
cp .env.example .env
# fill in your SES credentials in .env
node index.js
```

## Project structure

```
src/
  lib/
    auth.js          API key verification (Mailgun Basic Auth format)
    db.js            SQLite storage (events, bounces, unsubscribes)
    mailer.js        SMTP sender via nodemailer
    ses-to-mailgun.js SES event format -> Mailgun event format
    sns-verify.js    AWS SNS message signature verification
  routes/
    messages.js      POST /v3/:domain/messages  (send email)
    events.js        GET  /v3/:domain/events
    bounces.js       GET/POST/DELETE /v3/:domain/bounces
    unsubscribes.js  GET/POST/DELETE /v3/:domain/unsubscribes
    sns.js           POST /sns (SNS webhook receiver)
  server.js          Fastify app setup
index.js             Entry point
```

## Guidelines

- Keep dependencies minimal
- Every route must verify auth before processing
- New SMTP backends (Postmark, SendGrid, etc.) should be added as adapters in `src/lib/`
- Open an issue before starting large changes

## Adding a new SMTP backend

1. Create `src/lib/backends/your-backend.js` with a `sendMail(opts)` function
2. Add a `SMTP_BACKEND=your-backend` env var
3. Update `src/lib/mailer.js` to load the backend based on the env var
4. Add documentation to README

## Reporting issues

Please include:
- Ghost version (if applicable)
- Node.js version
- Relevant log output (with secrets redacted)
