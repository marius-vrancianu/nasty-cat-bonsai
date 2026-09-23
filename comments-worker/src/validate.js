/* Submission checks, cheapest first — that ordering is load-bearing, not
   tidiness. Everything above the rate limiter is pure CPU; the rate limiter
   is the first thing that WRITES to KV, and the free tier allows 1,000
   writes a day. A bot storm must therefore be turned away by the free checks,
   or it could spend the daily write budget and lock out real commenters. */

export const LIMITS = {
  nick: 40,
  text: 2000,
  links: 2,
  minSeconds: 3,      // humans take longer than this to write anything
  perWindow: 3,       // comments per IP per 10 minutes
  windowSeconds: 600,
  perDay: 10,
};

const EMAIL_RE = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/;

/* Domains linked in a comment, lowercased and de-duplicated. These are what
   the Spam button actually blocks: real spam is a campaign, and the address
   and IP rotate freely while the URL being promoted does not. */
export function linkedDomains(text) {
  const out = new Set();
  const re = /https?:\/\/([^\s/?#"'<>)]+)/gi;
  let m;
  while ((m = re.exec(text))) {
    const host = m[1].toLowerCase().replace(/^www\./, "").split(":")[0];
    if (host) out.add(host);
  }
  return [...out];
}

export function countLinks(text) {
  return (text.match(/https?:\/\//gi) || []).length;
}

/* Normalised for fingerprinting only. Lowercase and trim, nothing cleverer:
   stripping Gmail's dots and +tags would catch more aliases but would also
   collide addresses that belong to different people at other providers. */
export function normaliseEmail(email) {
  return String(email || "").trim().toLowerCase();
}

/* Shape checks. Returns null when the submission is fine, or a reason.
   Reasons are for OUR logs — the response to the client is deliberately
   identical either way, so a bot learns nothing about which check caught it. */
export function checkShape(body) {
  if (!body || typeof body !== "object") return "malformed";

  // The honeypot: a field hidden from humans by CSS. Anything in it is a bot.
  if (body.website) return "honeypot";

  const nick = String(body.nick || "").trim();
  const text = String(body.text || "").trim();
  const email = normaliseEmail(body.email);
  const post = String(body.post || "").trim();

  if (!post || !/^[a-z0-9/-]{1,120}$/.test(post)) return "bad-post";
  if (!nick || nick.length > LIMITS.nick) return "bad-nick";
  if (!text || text.length > LIMITS.text) return "bad-text";
  if (email && (email.length > 160 || !EMAIL_RE.test(email))) return "bad-email";
  if (countLinks(text) > LIMITS.links) return "too-many-links";

  // Time on form: comments.js sends when the form rendered. A bot posting
  // straight to the endpoint omits it or sends something absurd.
  const elapsed = (Date.now() - Number(body.rendered || 0)) / 1000;
  if (!Number.isFinite(elapsed) || elapsed < LIMITS.minSeconds) return "too-fast";

  return null;
}

export function cleanSubmission(body) {
  return {
    post: String(body.post).trim(),
    parentId: body.parentId ? String(body.parentId).slice(0, 40) : "",
    nick: String(body.nick).trim().slice(0, LIMITS.nick),
    text: String(body.text).trim().slice(0, LIMITS.text),
    email: normaliseEmail(body.email),
  };
}
