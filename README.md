# ses-mailgun-proxy

A lightweight, self-hosted proxy that exposes a **Mailgun-compatible REST API** and delivers email through **AWS SES** (or any SMTP server).

Use it as a drop-in replacement for Mailgun in **Ghost**, Discourse, Mautic, and any other app that supports Mailgun but not native SMTP for newsletter sending.

```
Ghost ──► POST /v3/{domain}/messages ──► ses-mailgun-proxy ──► AWS SES
                                                  ▲
AWS SES ──► SNS topic ──► POST /sns ─────────────┘
                          (stores events, bounces, unsubscribes)

Ghost ──► GET /v3/{domain}/events ──► ses-mailgun-proxy ──► SQLite
```

## Features

- Full send API compatible with Mailgun (`POST /v3/:domain/messages`)
- Event tracking via AWS SNS webhooks (open, click, bounce, complaint, delivery)
- Bounce list management (auto-populated from SES events)
- Unsubscribe list management (auto-populated from SES complaints)
- Automatic SNS subscription confirmation
- Complaint recipients are automatically added to the unsubscribe list
- Permanent bounces are automatically blocked from future sends
- SQLite storage — no external database required
- Single Docker container, ~5 MB image

## Supported Mailgun endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v3/:domain/messages` | Send email |
| GET | `/v3/:domain/events` | List events |
| GET | `/v3/:domain/bounces` | List bounces |
| POST | `/v3/:domain/bounces` | Add bounce |
| DELETE | `/v3/:domain/bounces/:address` | Remove bounce |
| GET | `/v3/:domain/unsubscribes` | List unsubscribes |
| POST | `/v3/:domain/unsubscribes` | Add unsubscribe |
| DELETE | `/v3/:domain/unsubscribes/:address` | Remove unsubscribe |
| POST | `/sns` | AWS SNS webhook receiver |
| GET | `/health` | Health check |

## Quick start

### 1. Clone and configure

```bash
git clone https://github.com/your-username/ses-mailgun-proxy
cd ses-mailgun-proxy
cp .env.example .env
```

Edit `.env`:

```env
PROXY_API_KEY=your-random-secret-key
SMTP_HOST=email-smtp.eu-north-1.amazonaws.com
SMTP_PORT=587
SMTP_USER=YOUR_SES_SMTP_USER
SMTP_PASS=YOUR_SES_SMTP_PASSWORD
SES_CONFIGURATION_SET=your-ses-config-set
NODE_ENV=production
```

### 2. Run with Docker

```bash
docker compose up -d
```

> **Note:** The first build takes ~2 minutes because `better-sqlite3` compiles a native addon. Subsequent builds are cached.

### 3. Configure Ghost

In Ghost Admin go to **Settings → Email newsletter**:

| Field | Value |
|-------|-------|
| Mailgun domain | your sending domain (e.g. `infodev.pl`) |
| Mailgun private API key | value of `PROXY_API_KEY` from your `.env` |
| Mailgun API URL | `https://your-proxy-host.com` |
| Region | EU (or US, doesn't matter) |

If Ghost and the proxy are on the **same Docker network**, set the Mailgun API URL to the internal hostname to avoid going through the public internet:

```
http://ses-mailgun-proxy:3000
```

This is more reliable and avoids TLS overhead for server-to-server calls.

### 4. Set up SES event tracking (optional but recommended)

1. Create an **SNS Topic** in AWS (Standard type)
2. Create a **SES Configuration Set** and add the SNS topic as event destination (select all event types)
3. Add an **SNS Subscription** with protocol `HTTPS` pointing to `https://your-proxy-host.com/sns`
4. Set `SES_CONFIGURATION_SET` in your `.env` to the configuration set name
5. The proxy will auto-confirm the SNS subscription on first contact

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PROXY_API_KEY` | Yes | — | API key for authenticating clients |
| `SMTP_HOST` | Yes | — | SMTP server hostname |
| `SMTP_PORT` | No | `587` | SMTP port |
| `SMTP_SECURE` | No | `false` | Use TLS wrapper (port 465) |
| `SMTP_USER` | Yes | — | SMTP username |
| `SMTP_PASS` | Yes | — | SMTP password |
| `SES_CONFIGURATION_SET` | No | — | SES configuration set name for event tracking |
| `DB_PATH` | No | `./data/events.db` | Path to SQLite database |
| `PORT` | No | `3000` | HTTP port |
| `HOST` | No | `0.0.0.0` | HTTP bind address |
| `LOG_LEVEL` | No | `info` | Pino log level |
| `NODE_ENV` | No | — | Set to `production` to disable pino-pretty dev logging |

## Deployment patterns

### A. Dedicated subdomain (recommended)

Give the proxy its own subdomain (e.g. `mail.yourdomain.com`) with a TLS certificate, then point Ghost's Mailgun API URL at it. SNS webhooks go to `https://mail.yourdomain.com/sns`.

### B. Path-based routing on an existing domain

If you can't create a new subdomain, route `/v3` and `/sns` from an existing domain through your reverse proxy. Example for **Nginx Proxy Manager** using the "Advanced" custom config on the existing host:

```nginx
location /sns {
    proxy_pass http://ses-mailgun-proxy:3000/sns;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location /v3 {
    proxy_pass http://ses-mailgun-proxy:3000/v3;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Then configure Ghost with:
- Mailgun API URL: `http://ses-mailgun-proxy:3000` (internal Docker hostname)
- SNS subscription endpoint: `https://yourdomain.com/sns`

### C. Adding to an existing Ghost docker-compose

```yaml
services:
  ses-mailgun-proxy:
    image: ghcr.io/your-username/ses-mailgun-proxy:latest
    restart: unless-stopped
    env_file: .env.proxy
    volumes:
      - proxy-data:/app/data
    networks:
      - npm_network

volumes:
  proxy-data:
```

## Security

- All API endpoints require HTTP Basic Auth (`api:YOUR_PROXY_API_KEY`)
- SNS messages are verified using AWS signature before processing
- SNS certificate URLs are validated against `*.amazonaws.com` before fetching
- The proxy does not store email content, only event metadata

## License

MIT — see [LICENSE](LICENSE)
