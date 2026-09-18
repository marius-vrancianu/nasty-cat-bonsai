/* Nasty Cat Bonsai — comments.
 *
 * One Worker, one KV namespace, and no dashboard anywhere. Every act of
 * moderation happens by tapping a signed link in an email, which is the
 * whole design: nothing to log into, nothing to visit, nothing to remember.
 *
 * KV layout
 *   comment:<id>          full record, including the encrypted address
 *   post:<slug>           the APPROVED comments, denormalised — one read
 *                         serves a page, which is why reads are cheap
 *   block:ip:<fp>         30 days   (dynamic IPs get reassigned; these expire)
 *   block:email:<fp>      1 year
 *   block:domain:<host>   1 year
 *   used:<fp>             spent single-use tokens
 *   rl:*                  rate-limit counters
 *   orphan:<slug>         a post that vanished, and when the clock started
 *   meta:*                counters the cron needs between runs
 *
 * Nothing here holds a raw IP address, and no response path can emit an
 * email address. Both are load-bearing; see validate.js and crypto.js.
 */

import {
  fingerprint, signToken, verifyToken, encryptEmail, decryptEmail, randomId,
} from "./crypto.js";
import { checkShape, cleanSubmission, linkedDomains, normaliseEmail, LIMITS } from "./validate.js";
import { send, moderationMail, replyMail, orphanMail, floodMail } from "./mail.js";
import { confirmPage, confirmSimple, donePage, errorPage } from "./pages.js";

const DAY = 86400;
const ORPHAN_GRACE_DAYS = 30;
const MAIL_PER_HOUR = 10;      // past this, one summary instead of a flood

/* ---------------------------------------------------------------- helpers */

function json(data, env, status = 200, cache = 0) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": env.SITE_ORIGIN || "*",
      "cache-control": cache ? `public, max-age=${cache}` : "no-store",
    },
  });
}

function postUrl(env, slug) {
  return `${(env.SITE_URL || "").replace(/\/$/, "")}${slug}`;
}

const kvGet = (env, key) => env.COMMENTS.get(key, "json");
const kvPut = (env, key, value, opts) =>
  env.COMMENTS.put(key, JSON.stringify(value), opts);

/* The public shape of a comment. Everything not named here — the encrypted
   address, the moderation status, the submitter's IP fingerprint — stays
   server-side. Adding a field here is the one change that could leak. */
function publicView(c) {
  return { id: c.id, parentId: c.parentId || "", nick: c.nick, text: c.text, ts: c.ts };
}

async function blocked(env, { ip, email, text }) {
  const checks = [];
  if (ip) checks.push(fingerprint(env.HASH_KEY, ip).then((fp) => `block:ip:${fp}`));
  if (email) checks.push(fingerprint(env.HASH_KEY, email).then((fp) => `block:email:${fp}`));
  for (const host of linkedDomains(text)) checks.push(Promise.resolve(`block:domain:${host}`));
  const keys = await Promise.all(checks);
  const hits = await Promise.all(keys.map((k) => env.COMMENTS.get(k)));
  return hits.some(Boolean);
}

/* Written to only after the free checks have passed — see validate.js for
   why that ordering matters to the daily write budget. */
async function rateLimited(env, ip) {
  const fp = await fingerprint(env.HASH_KEY, ip);
  const windowKey = `rl:w:${fp}`;
  const dayKey = `rl:d:${fp}`;
  const [w, d] = await Promise.all([env.COMMENTS.get(windowKey), env.COMMENTS.get(dayKey)]);
  const wn = Number(w || 0) + 1;
  const dn = Number(d || 0) + 1;
  if (wn > LIMITS.perWindow || dn > LIMITS.perDay) return true;
  await Promise.all([
    env.COMMENTS.put(windowKey, String(wn), { expirationTtl: LIMITS.windowSeconds }),
    env.COMMENTS.put(dayKey, String(dn), { expirationTtl: DAY }),
  ]);
  return false;
}

/* Single-use enforcement for approve/decline/spam. "remove" is deliberately
   exempt: that link has to keep working for as long as the email exists in
   your archive, and removing an already-removed comment is a no-op anyway. */
async function spendToken(env, token, action) {
  if (action === "remove") return true;
  const fp = await fingerprint(env.HASH_KEY, token);
  if (await env.COMMENTS.get(`used:${fp}`)) return false;
  await env.COMMENTS.put(`used:${fp}`, "1", { expirationTtl: 400 * DAY });
  return true;
}

async function mailAllowed(env) {
  const hour = new Date().toISOString().slice(0, 13);
  const key = `meta:mail:${hour}`;
  const n = Number((await env.COMMENTS.get(key)) || 0) + 1;
  await env.COMMENTS.put(key, String(n), { expirationTtl: 2 * 3600 });
  if (n === MAIL_PER_HOUR + 1) {
    await send(env, floodMail(env, { count: n, since: `${hour}:00 UTC` }));
  }
  return n <= MAIL_PER_HOUR;
}

/* ------------------------------------------------------------- submission */

async function handleSubmit(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ ok: false }, env, 400);
  }

  // One response for every rejection below, so a bot learns nothing about
  // which check caught it — and a human who trips a limit is not accused.
  const accepted = json({ ok: true, held: true }, env);

  if (checkShape(body)) return accepted;

  const c = cleanSubmission(body);
  const ip = request.headers.get("cf-connecting-ip") || "";

  if (await blocked(env, { ip, email: c.email, text: c.text })) {
    const month = new Date().toISOString().slice(0, 7);
    const key = `meta:blocked:${month}`;
    const n = Number((await env.COMMENTS.get(key)) || 0) + 1;
    await env.COMMENTS.put(key, String(n));
    return accepted;
  }

  if (ip && (await rateLimited(env, ip))) return accepted;

  const id = randomId();
  const record = {
    id,
    post: c.post,
    postTitle: String(body.postTitle || c.post).slice(0, 200),
    parentId: c.parentId,
    nick: c.nick,
    text: c.text,
    emailEnc: await encryptEmail(env.EMAIL_KEY, c.email),
    emailFp: c.email ? await fingerprint(env.HASH_KEY, c.email) : "",
    ipFp: ip ? await fingerprint(env.HASH_KEY, ip) : "",
    ts: Date.now(),
    status: "pending",
  };
  await kvPut(env, `comment:${id}`, record);

  if (await mailAllowed(env)) {
    const links = {};
    for (const a of ["approve", "decline", "spam"]) {
      links[a] = `${env.WORKER_URL}/m/${a}?t=${await signToken(env.SIGNING_KEY, a, id, 400 * DAY)}`;
    }
    links.remove = `${env.WORKER_URL}/m/remove?t=${await signToken(env.SIGNING_KEY, "remove", id, 0)}`;
    const mail = moderationMail(env, { ...record, hasEmail: Boolean(c.email) }, links, {
      title: record.postTitle,
      url: postUrl(env, c.post),
    });
    await send(env, { to: env.ADMIN_EMAIL, ...mail });
  }

  return accepted;
}

/* ------------------------------------------------------------- moderation */

async function performAction(env, action, id) {
  const record = await kvGet(env, `comment:${id}`);
  if (!record) return errorPage("That comment is no longer stored.");

  const listKey = `post:${record.post}`;
  const list = (await kvGet(env, listKey)) || { items: [] };

  if (action === "approve") {
    if (record.status !== "approved") {
      record.status = "approved";
      list.items.push(publicView(record));
      list.items.sort((a, b) => a.ts - b.ts);
      await Promise.all([kvPut(env, `comment:${id}`, record), kvPut(env, listKey, list)]);
      await notifyParent(env, record);
    }
    return donePage("Published",
      `It is live on <a href="${postUrl(env, record.post)}">${record.postTitle}</a> within a minute.`);
  }

  if (action === "decline" || action === "remove") {
    list.items = list.items.filter((i) => i.id !== id);
    await Promise.all([env.COMMENTS.delete(`comment:${id}`), kvPut(env, listKey, list)]);
    return donePage(action === "remove" ? "Removed" : "Declined",
      "The comment is gone, and so is any address stored with it.");
  }

  if (action === "spam") {
    const domains = linkedDomains(record.text);
    const writes = [
      env.COMMENTS.put(`block:ip:${record.ipFp}`, "1", { expirationTtl: 30 * DAY }),
    ];
    if (record.emailFp) {
      writes.push(env.COMMENTS.put(`block:email:${record.emailFp}`, "1", { expirationTtl: 365 * DAY }));
    }
    for (const host of domains) {
      writes.push(env.COMMENTS.put(`block:domain:${host}`, "1", { expirationTtl: 365 * DAY }));
    }
    list.items = list.items.filter((i) => i.id !== id);
    writes.push(kvPut(env, listKey, list));
    writes.push(kvPut(env, `unspam:${id}`, { ipFp: record.ipFp, emailFp: record.emailFp, domains },
      { expirationTtl: 30 * DAY }));
    writes.push(env.COMMENTS.delete(`comment:${id}`));
    await Promise.all(writes);

    const undo = await signToken(env.SIGNING_KEY, "unspam", id, 30 * DAY);
    const bits = [record.ipFp ? "the sender's IP for 30 days" : null,
      record.emailFp ? "their address for a year" : null,
      domains.length ? `${domains.map((d) => `<code>${d}</code>`).join(", ")} for a year` : null,
    ].filter(Boolean);
    return donePage("Marked as spam",
      `Binned, and blocked: ${bits.join(", ")}. Future submissions matching any of these are dropped silently — you won't hear about them.`,
      undo);
  }

  if (action === "unspam") {
    const u = await kvGet(env, `unspam:${id}`);
    if (!u) return errorPage("There is nothing left to unblock.");
    await Promise.all([
      u.ipFp ? env.COMMENTS.delete(`block:ip:${u.ipFp}`) : null,
      u.emailFp ? env.COMMENTS.delete(`block:email:${u.emailFp}`) : null,
      ...(u.domains || []).map((d) => env.COMMENTS.delete(`block:domain:${d}`)),
      env.COMMENTS.delete(`unspam:${id}`),
    ].filter(Boolean));
    return donePage("Unblocked",
      "The IP, address and domains are off the blocklist. The comment itself stays deleted.");
  }

  return errorPage("Unknown action.");
}

/* Reply notification. Only ever fired from approve — if this ran on
   submission, anyone could push mail to your readers before you had seen it. */
async function notifyParent(env, reply) {
  if (!reply.parentId) return;
  const parent = await kvGet(env, `comment:${reply.parentId}`);
  if (!parent || !parent.emailEnc) return;
  const to = await decryptEmail(env.EMAIL_KEY, parent.emailEnc);
  if (!to) return;
  const unsubscribe =
    `${env.WORKER_URL}/u?t=${await signToken(env.SIGNING_KEY, "unsub", parent.id, 0)}`;
  const mail = replyMail(env, {
    parentNick: parent.nick,
    replyNick: reply.nick,
    text: reply.text,
    postTitle: reply.postTitle,
    postUrl: postUrl(env, reply.post),
    unsubscribe,
  });
  await send(env, { to, ...mail });
}

/* ------------------------------------------------------- orphan reconcile */

async function listCommentKeys(env) {
  const out = [];
  let cursor;
  do {
    const page = await env.COMMENTS.list({ prefix: "comment:", cursor });
    out.push(...page.keys.map((k) => k.name));
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return out;
}

async function purgePost(env, slug) {
  const keys = await listCommentKeys(env);
  let removed = 0;
  for (const key of keys) {
    const rec = await kvGet(env, key);
    if (rec && rec.post === slug) {
      await env.COMMENTS.delete(key);
      removed++;
    }
  }
  await Promise.all([
    env.COMMENTS.delete(`post:${slug}`),
    env.COMMENTS.delete(`orphan:${slug}`),
  ]);
  return removed;
}

/* Weekly. Deletes things, so every guard here is deliberate: a broken build
   serving a 404 or an empty manifest must never be read as "the author
   deleted every post". */
async function reconcile(env) {
  const url = `${(env.SITE_URL || "").replace(/\/$/, "")}/comments-posts.json`;
  let live;
  try {
    const res = await fetch(url, { cf: { cacheTtl: 0 } });
    if (!res.ok) return { skipped: `manifest-${res.status}` };
    live = await res.json();
  } catch (e) {
    return { skipped: "manifest-unreachable" };
  }
  if (!Array.isArray(live) || live.length < 1) return { skipped: "manifest-empty" };

  // A cliff means a broken build far more often than it means a purge.
  const lastCount = Number((await env.COMMENTS.get("meta:postcount")) || 0);
  if (lastCount && live.length < lastCount / 2) return { skipped: "manifest-cliff" };
  await env.COMMENTS.put("meta:postcount", String(live.length));

  const liveSet = new Set(live);

  /* Count from the comment records, not from the post: lists. A post: key
     only exists once something has been APPROVED, so a vanished post whose
     comments were all still pending would otherwise never be reconciled —
     and its records, encrypted addresses included, would sit there forever.
     The post: keys are unioned in as well so an emptied list is still tidied
     up. Both listings are cheap: this runs weekly. */
  const counts = new Map();
  const bump = (slug) => counts.set(slug, (counts.get(slug) || 0) + 1);

  for (const key of await listCommentKeys(env)) {
    const rec = await kvGet(env, key);
    if (rec && rec.post) bump(rec.post);
  }

  let cursor;
  do {
    const page = await env.COMMENTS.list({ prefix: "post:", cursor });
    for (const k of page.keys) {
      const slug = k.name.slice("post:".length);
      if (!counts.has(slug)) counts.set(slug, 0);
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);

  const withComments = new Set(counts.keys());

  const now = Date.now();
  const report = { orphaned: [], purged: [], restored: [] };

  for (const slug of withComments) {
    const orphanKey = `orphan:${slug}`;
    const orphan = await kvGet(env, orphanKey);

    if (liveSet.has(slug)) {
      // It came back — a rename undone, or a build that had failed.
      if (orphan) {
        await env.COMMENTS.delete(orphanKey);
        report.restored.push(slug);
      }
      continue;
    }

    if (!orphan) {
      const stored = counts.get(slug) || 0;
      if (!stored) {
        // A post: list left behind with nothing in it. Nothing to warn about.
        await env.COMMENTS.delete(`post:${slug}`);
        continue;
      }
      await kvPut(env, orphanKey, { since: now });
      const deleteOn = new Date(now + ORPHAN_GRACE_DAYS * DAY * 1000)
        .toISOString().slice(0, 10);
      const keep = `${env.WORKER_URL}/o/keep?t=${await signToken(env.SIGNING_KEY, "keep", slug, 60 * DAY)}`;
      const purge = `${env.WORKER_URL}/o/purge?t=${await signToken(env.SIGNING_KEY, "purge", slug, 60 * DAY)}`;
      await send(env, {
        to: env.ADMIN_EMAIL,
        ...orphanMail(env, { slug, count: stored, deleteOn, keep, purge }),
      });
      report.orphaned.push(slug);
    } else if (now - orphan.since > ORPHAN_GRACE_DAYS * DAY * 1000) {
      await purgePost(env, slug);
      report.purged.push(slug);
    }
  }
  return report;
}

/* ------------------------------------------------------------------ routes */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "access-control-allow-origin": env.SITE_ORIGIN || "*",
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-headers": "content-type",
          "access-control-max-age": "86400",
        },
      });
    }

    if (path === "/comments" && request.method === "GET") {
      const slug = url.searchParams.get("post") || "";
      if (!/^[a-z0-9/-]{1,120}$/.test(slug)) return json({ items: [] }, env, 400);
      /* No HTTP caching, deliberately. Cloudflare does not edge-cache a
         Worker's own responses, so a max-age here would only have cached in
         the READER's browser — which is the one place staleness is felt:
         someone who just commented, or a comment you just approved, would
         be invisible for the length of the TTL. The read is already cheap
         without it, because KV get() is itself cached at the edge (60s by
         default), which is the saving that actually matters. */
      const list = (await env.COMMENTS.get(`post:${slug}`, { type: "json", cacheTtl: 60 })) || { items: [] };
      return json({ items: list.items }, env);
    }

    if (path === "/comments" && request.method === "POST") {
      return handleSubmit(request, env);
    }

    // Moderation: GET shows the confirmation, POST does the thing.
    const m = path.match(/^\/m\/(approve|decline|spam|remove|unspam)$/);
    if (m) {
      const action = m[1];
      const token = request.method === "POST"
        ? (await request.formData()).get("t")
        : url.searchParams.get("t");
      const claim = await verifyToken(env.SIGNING_KEY, token);
      if (!claim || claim.action !== action) return errorPage("This link is not valid or has expired.");

      if (request.method === "GET") {
        if (action === "unspam") return errorPage("Undo happens from the button, not a link.");
        const record = await kvGet(env, `comment:${claim.id}`);
        if (!record) return errorPage("That comment is no longer stored.");
        return confirmPage(action, token, record, record.postTitle);
      }
      if (!(await spendToken(env, token, action))) {
        return errorPage("This link has already been used.");
      }
      return performAction(env, action, claim.id);
    }

    // Orphaned-post decisions, from the weekly reconcile email.
    const o = path.match(/^\/o\/(keep|purge)$/);
    if (o) {
      const action = o[1];
      const token = request.method === "POST"
        ? (await request.formData()).get("t")
        : url.searchParams.get("t");
      const claim = await verifyToken(env.SIGNING_KEY, token);
      if (!claim || claim.action !== action) return errorPage("This link is not valid or has expired.");
      if (request.method === "GET") {
        return confirmSimple(`/o/${action}`, token,
          action === "keep" ? "Keep these comments?" : "Delete these comments now?",
          action === "keep"
            ? `The comments for <code>${claim.id}</code> will be kept indefinitely, even though the post is gone.`
            : `Every comment stored for <code>${claim.id}</code> will be deleted, addresses included. This cannot be undone.`,
          action === "keep" ? "Keep them" : "Delete them now");
      }
      if (action === "keep") {
        await env.COMMENTS.delete(`orphan:${claim.id}`);
        return donePage("Kept", "They stay put. You will not be asked about this post again.");
      }
      const n = await purgePost(env, claim.id);
      return donePage("Deleted", `${n} comment${n === 1 ? "" : "s"} removed, addresses included.`);
    }

    // Unsubscribe from reply notifications — deletes the address rather than
    // flagging it, so this doubles as a self-serve erasure request.
    if (path === "/u") {
      const token = request.method === "POST"
        ? (await request.formData()).get("t")
        : url.searchParams.get("t");
      const claim = await verifyToken(env.SIGNING_KEY, token);
      if (!claim || claim.action !== "unsub") return errorPage("This link is not valid.");
      if (request.method === "GET") {
        return confirmSimple("/u", token, "Stop reply notifications?",
          "Your address will be deleted from the comment it was stored with. Your comment itself stays published.",
          "Yes, delete my address");
      }
      const record = await kvGet(env, `comment:${claim.id}`);
      if (record) {
        record.emailEnc = "";
        record.emailFp = "";
        await kvPut(env, `comment:${claim.id}`, record);
      }
      return donePage("Deleted", "Your address is gone. You will not hear from this site again.");
    }

    if (path === "/export") {
      const claim = await verifyToken(env.SIGNING_KEY, url.searchParams.get("t"));
      if (!claim || claim.action !== "export") return json({ error: "unauthorised" }, env, 403);
      const keys = await listCommentKeys(env);
      const items = [];
      for (const key of keys) {
        const rec = await kvGet(env, key);
        // The backup carries whether an address exists, never the address.
        if (rec) items.push({ ...rec, emailEnc: undefined, emailFp: undefined, hasEmail: Boolean(rec.emailEnc) });
      }
      return json({ exported: new Date().toISOString(), count: items.length, items }, env);
    }

    if (path === "/reconcile") {
      const claim = await verifyToken(env.SIGNING_KEY, url.searchParams.get("t"));
      if (!claim || claim.action !== "export") return json({ error: "unauthorised" }, env, 403);
      return json(await reconcile(env), env);
    }

    return json({ error: "not-found" }, env, 404);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(reconcile(env));
  },
};

export { reconcile, purgePost };
