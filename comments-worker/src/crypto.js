/* Crypto helpers. Three separate keys, deliberately: SIGNING_KEY proves a
   moderation link came from us, EMAIL_KEY encrypts stored addresses, and
   HASH_KEY fingerprints blocked IPs and addresses. Separating them means a
   leak of one never becomes a leak of another — in particular, the blocklist
   can be handed to anyone without exposing who is on it. */

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64urlEncode(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str) {
  const s = str.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "=".repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" },
    false, ["sign", "verify"]
  );
}

/* Keyed fingerprint. Used for IPs and email addresses on the blocklist,
   where we only ever need to ask "have I seen this exact value before" —
   never to read it back. Unkeyed SHA-256 would be brute-forceable here
   (there are only ~4 billion IPv4 addresses), which is why this is an HMAC. */
export async function fingerprint(secret, value) {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(String(value)));
  return b64urlEncode(new Uint8Array(sig)).slice(0, 32);
}

/* Signed action tokens, as carried by every link in a moderation email.
   The signature covers the action AND the comment id together, so an
   "approve" link can never be replayed as a "spam" one, or moved to a
   different comment. */
export async function signToken(secret, action, id, ttlSeconds) {
  const exp = ttlSeconds ? Math.floor(Date.now() / 1000) + ttlSeconds : 0;
  const payload = `${action}.${id}.${exp}`;
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return `${b64urlEncode(enc.encode(payload))}.${b64urlEncode(new Uint8Array(sig))}`;
}

export async function verifyToken(secret, token) {
  if (typeof token !== "string" || token.length > 512) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  let payload, sig;
  try {
    payload = dec.decode(b64urlDecode(token.slice(0, dot)));
    sig = b64urlDecode(token.slice(dot + 1));
  } catch (e) {
    return null;
  }
  const key = await hmacKey(secret);
  // crypto.subtle.verify is constant-time; never compare signatures with ===
  const ok = await crypto.subtle.verify("HMAC", key, sig, enc.encode(payload));
  if (!ok) return null;
  /* Split on the FIRST and LAST dot rather than every dot: the id is a post
     slug on the orphan routes, and a slug is free to contain one. Splitting
     naively would silently truncate it and the token would verify against
     the wrong post. */
  const first = payload.indexOf(".");
  const last = payload.lastIndexOf(".");
  if (first < 1 || last <= first) return null;
  const action = payload.slice(0, first);
  const id = payload.slice(first + 1, last);
  const exp = payload.slice(last + 1);
  if (!action || !id) return null;
  if (Number(exp) && Number(exp) < Math.floor(Date.now() / 1000)) return null;
  return { action, id };
}

/* AES-GCM at rest for email addresses. Reversible because the address is
   shown in the moderation email so Marius can reply personally (the site
   sends no automated mail to readers). The Worker holds the key, so this
   guards against the store being read without the code (a stray export, a
   bug returning too much), not against the code itself. The first lock is
   that no response path ever emits an address; this is the second. */
async function aesKey(secret) {
  const material = await crypto.subtle.digest("SHA-256", enc.encode(secret));
  return crypto.subtle.importKey("raw", material, { name: "AES-GCM" }, false,
    ["encrypt", "decrypt"]);
}

export async function encryptEmail(secret, plain) {
  if (!plain) return "";
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await aesKey(secret);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plain));
  return `${b64urlEncode(iv)}.${b64urlEncode(new Uint8Array(ct))}`;
}

export async function decryptEmail(secret, blob) {
  if (!blob) return "";
  try {
    const [ivPart, ctPart] = blob.split(".");
    const key = await aesKey(secret);
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64urlDecode(ivPart) }, key, b64urlDecode(ctPart)
    );
    return dec.decode(pt);
  } catch (e) {
    return "";
  }
}

export function randomId() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  // time-prefixed so keys sort chronologically in a KV list
  return `${Date.now().toString(36)}-${b64urlEncode(bytes)}`;
}
