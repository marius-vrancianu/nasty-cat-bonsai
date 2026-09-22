# Comments worker

The only piece of this site that runs code. Everything else is static files.

Readers post a comment; this stores it and emails you one message with
**Approve · Decline · Spam** buttons. You tap one from your inbox. There is no
dashboard, no login, and nothing that expires — which is the entire point.

## What it does

- Accepts comments, holds them, and publishes nothing until you say so.
- Emails you once per comment. Blocked submissions are dropped in silence,
  so a spammer never reaches your inbox at all.
- Addresses the moderation email back to the commenter, so Reply in your
  mail client writes to them personally. Nothing here ever emails a reader
  automatically; stored addresses expire after 90 days.
- Blocks spam by link domain (the part that doesn't rotate), by IP for 30
  days, and by address for a year. Every block is undoable from the page you
  land on.
- Deletes a post's comments when the post itself disappears, after a 30-day
  grace period and a warning email.

## First deploy — from a browser

The whole thing can be set up and maintained without Node, git or wrangler on
your own machine, the same way the site itself deploys. See GUIDE.md §6.10 for
the click-by-click version; in short:

1. Create a KV namespace called `COMMENTS` in the Cloudflare dashboard
   (**Storage & Databases → KV → Create**) and paste its id into
   `wrangler.toml`.
2. Create a Cloudflare API token with the **Edit Cloudflare Workers** template.
3. Add six repository secrets under **Settings → Secrets and variables →
   Actions**: `CLOUDFLARE_API_TOKEN`, `SIGNING_KEY`, `EMAIL_KEY`, `HASH_KEY`,
   `RESEND_API_KEY`, `ADMIN_EMAIL`.
4. **Actions → Deploy comments worker → Run workflow.**

That workflow runs the test suite first and refuses to deploy if it fails.
It also pushes the five worker secrets on every run, so rotating one means
changing it in GitHub and pressing the button again.

## First deploy — from a terminal

Only if you prefer it. Everything above happens here instead:

```sh
npm install -g wrangler
wrangler login

# 1. Storage
wrangler kv namespace create COMMENTS
#    → paste the printed id into wrangler.toml

# 2. Secrets. The first three are just long random strings; generate each
#    with:  openssl rand -base64 32
wrangler secret put SIGNING_KEY      # signs the links in your emails
wrangler secret put EMAIL_KEY        # encrypts stored addresses (AES-GCM)
wrangler secret put HASH_KEY         # fingerprints blocked IPs and addresses
wrangler secret put RESEND_API_KEY   # resend.com → API keys
wrangler secret put ADMIN_EMAIL      # where moderation mail goes

# 3. Ship it
wrangler deploy
#    → copy the printed *.workers.dev URL into WORKER_URL in wrangler.toml
#      and into comments.apiUrl in ../src/_data/site.js, then deploy again
wrangler deploy
```

**Never rotate the three keys casually.** `EMAIL_KEY` decrypts stored
addresses — change it and you can never read back the ones already stored,
so those commenters become unanswerable. `HASH_KEY`
underpins the blocklist, and `SIGNING_KEY` validates links in emails you have
already received.

### On Resend

Every email this worker sends goes to `ADMIN_EMAIL` and nowhere else, so
Resend's free tier needs **no verified domain** — its default
`onboarding@resend.dev` sender delivers to the account owner, which is you.
Leave `FROM_EMAIL` alone unless you ever buy a domain.

Replies to commenters are not sent by this worker at all: the moderation
email carries `reply_to` set to the commenter's address, so answering happens
in your own mail client, from your own mailbox.

## Maintenance

None. No dependencies to bump, no tokens that expire, no server to patch.

The free tiers it lives inside: 100,000 Worker requests/day, 100,000 KV
reads/day, **1,000 KV writes/day**, and 100 Resend emails/day (3,000 a
month, but the daily cap binds first). The KV write limit is the tightest
of them, which is why every free check in `validate.js` runs before
anything touches storage. Checked against Cloudflare's and Resend's
published limits, September 2026.

## Routes

| Route | Who calls it |
|---|---|
| `GET /comments?post=<slug>` | the widget, on every post page (KV read, edge-cached by Cloudflare) |
| `POST /comments` | the widget's form |
| `GET\|POST /m/<action>` | you, from a moderation email |
| `GET\|POST /o/<keep\|purge>` | you, from an orphaned-post email |
| `GET\|POST /u` | you, forgetting one address without deleting its comment |
| `GET /export?t=…` | you, for a backup |
| `GET /reconcile?t=…` | you, to force the orphan check early |

`/export` and `/reconcile` need a token signed with action `export`. Mint one
locally with `node tools/sign-export.mjs` (see that file).

## Backups

KV is the only copy of your data. `/export` returns everything as JSON —
comments, their status and timestamps, and whether an address is stored,
but never the address itself.

## Shape of the data

```
comment:<id>          the full record, with the encrypted address
post:<slug>           approved comments only — one read serves a page
block:ip:<fp>         30 days
block:email:<fp>      1 year
block:domain:<host>   1 year
unspam:<id>           what a Spam press blocked, so Undo can lift it  (30 days)
used:<fp>             spent single-use tokens
rl:w:<fp>, rl:d:<fp>  rate-limit counters, per 10 minutes and per day
orphan:<slug>         a vanished post, and when its clock started
meta:*                counters the weekly job keeps between runs
```

No raw IP address is ever written, and no response can emit an email address.

## Moving off Cloudflare

`src/` is plain `Request`/`Response` JavaScript with no dependencies. Deno
Deploy, Netlify Functions, Vercel and Bun all speak it; you would swap the
`env.COMMENTS` KV calls for whatever key/value store you land on. Swapping
Resend is the single `send()` function in `src/mail.js`.
