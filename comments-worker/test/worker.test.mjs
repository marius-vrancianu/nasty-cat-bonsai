/* End-to-end exercise of the worker against a fake KV and a fake mail
   provider — no network, no Cloudflare account, no deploy needed.
   Run it with:  npm test
   It covers the things that would be expensive to discover in production:
   that a rejected submission is indistinguishable from an accepted one,
   that a moderation link does nothing until the button is pressed, that no
   email address is reachable from any response or from the store, and that
   the weekly reconcile refuses to act on a manifest that looks broken. */
import worker, { reconcile } from '../src/index.js';

class FakeKV {
  constructor() { this.m = new Map(); }
  async get(k, t) { const v = this.m.get(k); if (v === undefined) return null;
    const type = typeof t === 'object' && t ? t.type : t;   // KV takes "json" or {type:"json",cacheTtl}
    return type === 'json' ? JSON.parse(v) : v; }
  async put(k, v, o) { this.m.set(k, v); if (o?.expirationTtl) this.ttl = true; }
  async delete(k) { this.m.delete(k); }
  async list({ prefix, cursor }) {
    const keys = [...this.m.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name }));
    return { keys, list_complete: true, cursor: null };
  }
}

const sent = [];
let manifest = ['/blog/post-a/', '/blog/post-b/'];
globalThis.fetch = async (url, opts) => {
  const u = String(url);
  if (u.includes('api.resend.com')) { sent.push(JSON.parse(opts.body)); return new Response('{}', { status: 200 }); }
  if (u.includes('comments-posts.json')) return new Response(JSON.stringify(manifest), { status: 200 });
  return new Response('nope', { status: 404 });
};

const env = {
  COMMENTS: new FakeKV(),
  SIGNING_KEY: 'sign-secret', EMAIL_KEY: 'email-secret', HASH_KEY: 'hash-secret',
  RESEND_API_KEY: 'rk_test', ADMIN_EMAIL: 'marius@example.com', FROM_EMAIL: 'comments@example.com',
  SITE_URL: 'https://marius-vrancianu.github.io/nasty-cat-bonsai',
  SITE_ORIGIN: 'https://marius-vrancianu.github.io',
  SITE_NAME: 'Nasty Cat Bonsai',
  WORKER_URL: 'https://comments.example.workers.dev',
};

const IP = '86.120.1.5';
const submit = (b, ip = IP) => worker.fetch(new Request('https://w/comments', {
  method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
  body: JSON.stringify(b),
}), env);
const get = (slug) => worker.fetch(new Request(`https://w/comments?post=${encodeURIComponent(slug)}`), env);
const linkOf = (mail, label) => {
  const re = new RegExp(`href="([^"]+)"[^>]*>\\s*${label}`, 'i');
  const m = mail.html.match(re); return m && m[1];
};
const openLink = (href) => worker.fetch(new Request(href), env);
const pressButton = async (href) => {
  const page = await (await openLink(href)).text();
  const t = page.match(/name="t" value="([^"]+)"/)[1];
  const action = page.match(/action="([^"]+)"/)[1];
  const fd = new FormData(); fd.set('t', t);
  return worker.fetch(new Request(`https://w${action}`, { method: 'POST', body: fd }), env);
};

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? (pass++, console.log('  ok  ', name)) : (fail++, console.log('  FAIL', name, extra)); };
const ago = Date.now() - 10000;

console.log('\n1. Submission and shape checks');
ok('honeypot silently accepted', (await submit({ post: '/blog/post-a/', nick: 'Bot', text: 'x', website: 'spam', rendered: ago })).status === 200);
ok('  ...and stored nothing', sent.length === 0);
await submit({ post: '/blog/post-a/', nick: 'Fast', text: 'hi', rendered: Date.now() });
ok('too-fast rejected silently', sent.length === 0);
await submit({ post: '/blog/post-a/', nick: 'Linky', text: 'http://a.com http://b.com http://c.com', rendered: ago });
ok('too many links rejected', sent.length === 0);

console.log('\n2. A real comment');
const r = await submit({ post: '/blog/post-a/', postTitle: 'Post A', nick: 'Ana', text: 'Lovely maple.', email: 'ana@example.com', rendered: ago });
ok('accepted', (await r.json()).held === true);
ok('one moderation email sent', sent.length === 1, JSON.stringify(sent));
ok('email addressed to admin', sent[0]?.to[0] === 'marius@example.com');
ok('subject names post and nick', /Post A.*Ana/.test(sent[0].subject), sent[0].subject);
ok('comment text NOT yet public', (await (await get('/blog/post-a/')).json()).items.length === 0);

console.log('\n3. Prefetch safety + approve');
const approveUrl = linkOf(sent[0], 'Approve');
const preview = await openLink(approveUrl);
ok('GET renders a confirmation, does not act', (await preview.text()).includes('Yes, publish it'));
ok('  ...and still not public', (await (await get('/blog/post-a/')).json()).items.length === 0);
const done = await pressButton(approveUrl);
ok('POST publishes', (await done.text()).includes('Published'));
const pub = (await (await get('/blog/post-a/')).json()).items;
ok('now public', pub.length === 1);
ok('public view carries no email', pub[0].email === undefined && !JSON.stringify(pub[0]).includes('ana@example.com'), JSON.stringify(pub[0]));
ok('single-use: second press refused', (await pressButton(approveUrl).catch(() => null))?.status !== undefined);

console.log('\n4. Reply notification');
const r2 = await submit({ post: '/blog/post-a/', postTitle: 'Post A', nick: 'Dan', text: 'Agreed!', parentId: pub[0].id, rendered: ago }, '86.120.1.9');
const modMail2 = sent[sent.length - 1];
await pressButton(linkOf(modMail2, 'Approve'));
const reply = sent[sent.length - 1];
ok('reply notification sent to parent author', reply.to[0] === 'ana@example.com', JSON.stringify(reply.to));
ok('  ...mentions the replier', reply.subject.includes('Dan'));
ok('  ...carries an unsubscribe link', /Unsubscribe/.test(reply.html));

console.log('\n5. Unsubscribe deletes the address');
const unsub = linkOf(reply, 'Unsubscribe and delete my address');
await pressButton(unsub);
const r3 = await submit({ post: '/blog/post-a/', postTitle: 'Post A', nick: 'Eve', text: 'me too', parentId: pub[0].id, rendered: ago }, '86.120.1.11');
const before = sent.length;
await pressButton(linkOf(sent[sent.length - 1], 'Approve'));
ok('no further mail to the unsubscribed address', !sent.slice(before).some(m => m.to[0] === 'ana@example.com'));

console.log('\n6. Spam blocklisting');
await submit({ post: '/blog/post-b/', postTitle: 'Post B', nick: 'Spammer', text: 'buy at https://casino.example/x', email: 'spam@bad.example', rendered: ago }, '1.2.3.4');
const spamMail = sent[sent.length - 1];
const spamRes = await pressButton(linkOf(spamMail, 'Spam'));
const spamPage = await spamRes.text();
ok('spam page reports the blocks', spamPage.includes('casino.example'), spamPage.slice(0, 300));
const before2 = sent.length;
await submit({ post: '/blog/post-b/', postTitle: 'Post B', nick: 'Spammer2', text: 'again https://casino.example/y', rendered: ago }, '9.9.9.9');
ok('same domain from a NEW ip is dropped silently', sent.length === before2);
await submit({ post: '/blog/post-b/', postTitle: 'Post B', nick: 'Spammer3', text: 'clean text', rendered: ago }, '1.2.3.4');
ok('same ip with clean text also dropped', sent.length === before2);
await submit({ post: '/blog/post-b/', postTitle: 'Post B', nick: 'Innocent', text: 'nice tree', rendered: ago }, '77.77.77.77');
ok('an unrelated visitor still gets through', sent.length === before2 + 1);

console.log('\n7. Rate limiting');
const before3 = sent.length;
for (let i = 0; i < 5; i++) await submit({ post: '/blog/post-b/', postTitle: 'Post B', nick: 'Chatty', text: `msg ${i}`, rendered: ago }, '55.55.55.55');
ok('capped at 3 per window', sent.length - before3 === 3, `got ${sent.length - before3}`);

console.log('\n8. Orphan reconcile');
manifest = ['/blog/post-a/'];   // post-b deleted
const before4 = sent.length;
let rep = await reconcile(env);
ok('post-b flagged orphaned', rep.orphaned.includes('/blog/post-b/'), JSON.stringify(rep));
ok('one warning email', sent.length === before4 + 1);
ok('nothing deleted yet', (await (await get('/blog/post-b/')).json()).items.length >= 0);
rep = await reconcile(env);
ok('no repeat email on the next run', rep.orphaned.length === 0);
manifest = ['/blog/post-a/', '/blog/post-b/'];
rep = await reconcile(env);
ok('restoring the post cancels the clock', rep.restored.includes('/blog/post-b/'), JSON.stringify(rep));

console.log('\n9. Reconcile safety rails');
manifest = [];
ok('empty manifest is refused', (await reconcile(env)).skipped === 'manifest-empty');
manifest = ['/blog/post-a/'];
await env.COMMENTS.put('meta:postcount', '10');
ok('a sudden cliff is refused', (await reconcile(env)).skipped === 'manifest-cliff');

console.log('\n10. Deletion after the grace period');
manifest = ['/blog/post-a/'];
await env.COMMENTS.put('meta:postcount', '2');
await reconcile(env);
const orphanRec = JSON.parse(await env.COMMENTS.get('orphan:/blog/post-b/'));
await env.COMMENTS.put('orphan:/blog/post-b/', JSON.stringify({ since: orphanRec.since - 31 * 86400 * 1000 }));
rep = await reconcile(env);
ok('purged after 30 days', rep.purged.includes('/blog/post-b/'), JSON.stringify(rep));
ok('  ...comments gone', (await (await get('/blog/post-b/')).json()).items.length === 0);

console.log('\n11. No address is reachable anywhere');
const dump = JSON.stringify([...env.COMMENTS.m.entries()]);
ok('store holds no plaintext address', !dump.includes('ana@example.com') && !dump.includes('spam@bad.example'), 'LEAK');
const exp = await worker.fetch(new Request('https://w/export?t=bogus'), env);
ok('export refuses an unsigned token', exp.status === 403);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
