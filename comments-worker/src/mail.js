/* Outbound mail, via Resend. This is the one external dependency in the
   system and the only one that could ever need replacing: everything
   provider-specific is the fetch in send() below, so swapping to Brevo or
   MailerSend is this function and nothing else. */

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

async function send(env, { to, subject, html }) {
  if (!env.RESEND_API_KEY) return { ok: false, error: "no-api-key" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: env.FROM_EMAIL || "onboarding@resend.dev",
      to: [to],
      subject,
      html,
    }),
  });
  if (!res.ok) return { ok: false, error: `resend-${res.status}` };
  return { ok: true };
}

/* One visual language for all three mails: the site's paper and rust, a
   serif stack, and buttons big enough to hit with a thumb. Inline styles
   only — mail clients discard <style> blocks. */
function shell(inner) {
  return `<div style="font-family:Georgia,'Times New Roman',serif;background:#e3dbca;padding:24px;color:#222">
  <div style="max-width:560px;margin:0 auto;background:#e3dbca">${inner}
    <p style="font-size:12px;color:#6b6659;margin-top:28px;border-top:1px solid rgba(28,26,23,.2);padding-top:12px">
      Sent by your own comment worker. No dashboard, no login — the links above are the whole system.
    </p>
  </div>
</div>`;
}

function button(href, label, primary) {
  const bg = primary ? "#9a2104" : "transparent";
  const fg = primary ? "#e3dbca" : "#9a2104";
  return `<a href="${href}" style="display:inline-block;padding:11px 22px;margin:0 8px 8px 0;
    background:${bg};color:${fg};border:1px solid #9a2104;border-radius:4px;
    text-decoration:none;font-size:15px">${label}</a>`;
}

/* The moderation mail. Approve / Decline / Spam are single-use; Remove is
   not, and does not expire — that is what turns your Gmail archive into the
   moderation history, so an approved comment can still be pulled later
   without there being a dashboard anywhere. */
export function moderationMail(env, comment, links, post) {
  const parent = comment.parentId
    ? `<p style="font-size:14px;color:#545c2f;margin:0 0 6px">In reply to an existing comment.</p>` : "";
  return {
    subject: `Comment on "${post.title}" — by ${comment.nick}`,
    html: shell(`
    <h1 style="font-size:20px;font-weight:normal;color:#9a2104;margin:0 0 4px">New comment awaiting you</h1>
    <p style="font-size:14px;color:#545c2f;margin:0 0 18px">on <a href="${post.url}" style="color:#545c2f">${escapeHtml(post.title)}</a></p>
    ${parent}
    <p style="font-size:15px;margin:0 0 4px"><strong>${escapeHtml(comment.nick)}</strong>${
      comment.hasEmail ? ` <span style="color:#545c2f;font-size:13px">(left an email for reply notifications)</span>` : ""
    }</p>
    <blockquote style="margin:0 0 22px;padding:12px 16px;border-left:3px solid #9a2104;
      background:rgba(28,26,23,.04);font-size:15px;line-height:1.6;white-space:pre-wrap">${escapeHtml(comment.text)}</blockquote>
    <p style="margin:0 0 6px">
      ${button(links.approve, "Approve", true)}
      ${button(links.decline, "Decline", false)}
      ${button(links.spam, "Spam", false)}
    </p>
    <p style="font-size:13px;color:#6b6659;margin:14px 0 0">
      Spam also blocks any link domains, plus this sender's IP for 30 days.
      Keep this email: <a href="${links.remove}" style="color:#6b6659">remove this comment later</a>.
    </p>`),
  };
}

export function replyMail(env, { parentNick, replyNick, text, postTitle, postUrl, unsubscribe }) {
  return {
    subject: `${replyNick} replied to your comment on "${postTitle}"`,
    html: shell(`
    <h1 style="font-size:20px;font-weight:normal;color:#9a2104;margin:0 0 18px">Someone replied to you</h1>
    <p style="font-size:15px;margin:0 0 4px">Hello ${escapeHtml(parentNick)} — <strong>${escapeHtml(replyNick)}</strong> replied to your comment on
      <a href="${postUrl}" style="color:#9a2104">${escapeHtml(postTitle)}</a>:</p>
    <blockquote style="margin:14px 0 22px;padding:12px 16px;border-left:3px solid #9a2104;
      background:rgba(28,26,23,.04);font-size:15px;line-height:1.6;white-space:pre-wrap">${escapeHtml(text)}</blockquote>
    <p>${button(postUrl, "Read the thread", true)}</p>
    <p style="font-size:12px;color:#6b6659;margin:18px 0 0">
      You are getting this only because you left your address when you commented on ${escapeHtml(env.SITE_NAME || "the site")}.
      It is stored encrypted, never shown on the page and never shared.
      <a href="${unsubscribe}" style="color:#6b6659">Unsubscribe and delete my address</a>.
    </p>`),
  };
}

/* Sent once when a post disappears from the site. The 30-day clock is
   already running by the time this arrives — Keep stops it, Delete now
   skips the wait. Doing nothing is also an answer. */
export function orphanMail(env, { slug, count, deleteOn, keep, purge }) {
  return {
    subject: `${count} comment${count === 1 ? "" : "s"} orphaned — "${slug}" is gone`,
    html: shell(`
    <h1 style="font-size:20px;font-weight:normal;color:#9a2104;margin:0 0 18px">A post disappeared</h1>
    <p style="font-size:15px;line-height:1.6;margin:0 0 18px">
      <code>${escapeHtml(slug)}</code> is no longer on the site, but it still has
      <strong>${count}</strong> comment${count === 1 ? "" : "s"} stored. They will be deleted on
      <strong>${deleteOn}</strong>, addresses and all.</p>
    <p style="font-size:14px;line-height:1.6;color:#545c2f;margin:0 0 18px">
      If you only renamed the post, put the old slug back and they reattach by themselves —
      that is what the delay is for.</p>
    <p>${button(keep, "Keep them", true)} ${button(purge, "Delete now", false)}</p>`),
  };
}

export function floodMail(env, { count, since }) {
  return {
    subject: `${count} comments held — possible flood`,
    html: shell(`
    <h1 style="font-size:20px;font-weight:normal;color:#9a2104;margin:0 0 18px">Unusual volume</h1>
    <p style="font-size:15px;line-height:1.6">
      ${count} submissions have arrived since ${escapeHtml(since)}, so individual emails are paused
      to keep your inbox usable. They are all stored and waiting; nothing was lost.
      Approve or bin them with <code>/export</code>, or mark one as Spam to blocklist the source.</p>`),
  };
}

export { send };
