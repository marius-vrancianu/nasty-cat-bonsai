/* The handful of pages the Worker serves to a browser. They exist for one
   reason: a moderation link must NOT act when it is merely fetched. Mail
   scanners and some clients follow every URL in a message to check it is
   safe, which would silently approve or bin real comments. So the link opens
   this page, and the action happens on a POST from the button — one extra
   tap, immune to prefetching, and a guard against a fat thumb.

   Styled from the site's own tokens rather than imported, because this is a
   different origin and a stylesheet fetch here would be a pointless round
   trip on a page you look at for two seconds. */

import { escapeHtml } from "./mail.js";

const CSS = `
  :root { color-scheme: light dark; --washi:#e3dbca; --ink:#222; --rust:#9a2104; --hair:rgba(28,26,23,.2) }
  @media (prefers-color-scheme: dark) {
    :root { --washi:#222; --ink:#d7cab0; --rust:#86914b; --hair:rgba(215,202,176,.28) }
  }
  * { box-sizing: border-box }
  body { margin:0; padding:40px 20px; background:var(--washi); color:var(--ink);
         font-family:Georgia,'Times New Roman',serif; line-height:1.6 }
  main { max-width:560px; margin:0 auto }
  h1 { font-size:26px; font-weight:400; color:var(--rust); margin:0 0 6px }
  p.sub { font-size:14px; opacity:.75; margin:0 0 24px }
  blockquote { margin:0 0 24px; padding:12px 16px; border-left:3px solid var(--rust);
               background:rgba(128,128,128,.08); white-space:pre-wrap; font-size:15px }
  button { font:inherit; font-size:15px; padding:11px 24px; border-radius:4px; cursor:pointer;
           background:var(--rust); color:var(--washi); border:1px solid var(--rust) }
  button.ghost { background:transparent; color:var(--rust) }
  form { display:inline }
  .row { display:flex; gap:10px; flex-wrap:wrap }
  .note { font-size:13px; opacity:.7; margin-top:22px }
  code { font-family:ui-monospace,Menlo,Consolas,monospace; font-size:13px }
`;

function page(title, body) {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${escapeHtml(title)}</title><style>${CSS}</style></head>
<body><main>${body}</main></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex" } }
  );
}

const VERBS = {
  approve: { h: "Publish this comment?", btn: "Yes, publish it", ghost: false },
  decline: { h: "Decline this comment?", btn: "Yes, decline it", ghost: true },
  spam:    { h: "Mark as spam?", btn: "Yes, it's spam", ghost: true },
  remove:  { h: "Remove this comment?", btn: "Yes, remove it", ghost: true },
};

export function confirmPage(action, token, comment, postTitle) {
  const v = VERBS[action];
  const extra = action === "spam"
    ? `<p class="note">This also blocks any domains linked in the comment for a year,
        the sender's address for a year, and their IP for 30 days. The next page lets you undo it.</p>`
    : "";
  return page(v.h, `
    <h1>${escapeHtml(v.h)}</h1>
    <p class="sub">${escapeHtml(comment.nick)} · ${escapeHtml(postTitle)}</p>
    <blockquote>${escapeHtml(comment.text)}</blockquote>
    <form method="POST" action="/m/${action}">
      <input type="hidden" name="t" value="${escapeHtml(token)}">
      <button type="submit"${v.ghost ? ' class="ghost"' : ""}>${escapeHtml(v.btn)}</button>
    </form>
    ${extra}`);
}

export function donePage(heading, detail, undo) {
  const undoForm = undo
    ? `<form method="POST" action="/m/unspam">
         <input type="hidden" name="t" value="${escapeHtml(undo)}">
         <button type="submit" class="ghost">Undo — unblock all three</button>
       </form>`
    : "";
  return page(heading, `<h1>${escapeHtml(heading)}</h1><p>${detail}</p>${undoForm}`);
}

export function confirmSimple(action, token, heading, detail, btn) {
  return page(heading, `
    <h1>${escapeHtml(heading)}</h1>
    <p>${detail}</p>
    <form method="POST" action="${action}">
      <input type="hidden" name="t" value="${escapeHtml(token)}">
      <button type="submit" class="ghost">${escapeHtml(btn)}</button>
    </form>`);
}

export function errorPage(message) {
  return page("That link didn't work", `
    <h1>That link didn't work</h1>
    <p>${escapeHtml(message)}</p>
    <p class="note">Moderation links are single-use, so this usually just means
    you already dealt with this one.</p>`);
}
