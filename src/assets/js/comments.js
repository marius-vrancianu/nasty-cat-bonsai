/* Comments. The thread is ours — stored by the worker in comments-worker/,
   rendered here — so there is no third-party script, no iframe and no
   second document to parse. Just this file and one JSON fetch.

   Nothing runs until the reader scrolls within ~600px of the section, so a
   visitor who reads a post and leaves pays nothing at all for a feature they
   never looked at. Browsers without IntersectionObserver load immediately.

   Every value that came from a person is written with textContent or
   createTextNode. There is no innerHTML in this file, and there should never
   be one: the worker stores comments as plain text precisely so that the only
   way to get markup onto the page is to put it here. */
(function () {
  "use strict";

  var root = document.querySelector("[data-comments]");
  if (!root) return;

  var api = root.dataset.api.replace(/\/$/, "");
  var post = root.dataset.post;
  var postTitle = root.dataset.postTitle;

  var list = root.querySelector(".comment-list");
  var note = root.querySelector(".comment-note");
  var form = root.querySelector(".comment-form");
  var replying = root.querySelector(".comment-replying");
  var replyingTo = root.querySelector(".comment-replying-to");
  var cancelReply = root.querySelector(".comment-cancel-reply");
  var submit = form.querySelector(".comment-submit");

  var NICK_KEY = "commentNick";
  var parentId = "";
  var loaded = false;

  /* When the form first became visible to a human. The worker rejects
     anything submitted within three seconds of it, which no one typing a
     sentence can trip but most bots do. */
  var renderedAt = Date.now();

  var dateFormat = new Intl.DateTimeFormat("en-US", {
    month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
  });

  function say(message, kind) {
    note.textContent = message || "";
    note.className = "comment-note" + (kind ? " is-" + kind : "");
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function renderOne(item, isReply) {
    var li = el("li", "comment" + (isReply ? " is-reply" : ""));
    li.id = "comment-" + item.id;

    var head = el("p", "comment-head");
    head.appendChild(el("span", "comment-author", item.nick));
    head.appendChild(document.createTextNode(" "));
    var time = el("time", "comment-date", dateFormat.format(new Date(item.ts)));
    time.dateTime = new Date(item.ts).toISOString();
    head.appendChild(time);
    li.appendChild(head);

    li.appendChild(el("div", "comment-text", item.text));

    /* One level of nesting only, which is what a blog thread actually needs
       and what keeps this readable on a phone. A reply to a reply attaches
       to the same parent rather than indenting further — see groupByParent. */
    if (!isReply) {
      var button = el("button", "comment-reply", "Reply");
      button.type = "button";
      button.addEventListener("click", function () { startReply(item); });
      li.appendChild(button);
    }
    return li;
  }

  function groupByParent(items) {
    var byId = {};
    var i;
    for (i = 0; i < items.length; i++) byId[items[i].id] = items[i];

    var tops = [];
    var children = {};
    for (i = 0; i < items.length; i++) {
      var item = items[i];
      var parent = item.parentId && byId[item.parentId];
      // a reply to a reply belongs to the top-level comment above both
      while (parent && parent.parentId && byId[parent.parentId]) parent = byId[parent.parentId];
      if (parent) {
        (children[parent.id] = children[parent.id] || []).push(item);
      } else {
        tops.push(item);
      }
    }
    return { tops: tops, children: children };
  }

  function render(items) {
    list.textContent = "";
    if (!items.length) {
      list.hidden = true;
      say("No comments yet.");
      return;
    }
    var grouped = groupByParent(items);
    for (var i = 0; i < grouped.tops.length; i++) {
      var top = grouped.tops[i];
      list.appendChild(renderOne(top, false));
      var kids = grouped.children[top.id] || [];
      for (var j = 0; j < kids.length; j++) list.appendChild(renderOne(kids[j], true));
    }
    list.hidden = false;
    say("");
  }

  function startReply(item) {
    parentId = item.id;
    replyingTo.textContent = item.nick;
    replying.hidden = false;
    var anchor = document.getElementById("comment-" + item.id);
    if (anchor && anchor.nextSibling) {
      // sit the form directly under the thread being answered
      anchor.parentNode.insertBefore(form, anchor.nextSibling);
    }
    form.querySelector("[name=text]").focus();
  }

  function endReply() {
    parentId = "";
    replying.hidden = true;
    root.appendChild(form);
  }

  cancelReply.addEventListener("click", endReply);

  function load() {
    if (loaded) return;
    loaded = true;
    say("Loading comments…");

    fetch(api + "/comments?post=" + encodeURIComponent(post), { credentials: "omit" })
      .then(function (res) {
        if (!res.ok) throw new Error(res.status);
        return res.json();
      })
      .then(function (data) { render(data.items || []); })
      .catch(function () {
        /* Say so in one line rather than failing silently. */
        list.hidden = true;
        say("Comments couldn’t be loaded just now. The form below still works.", "error");
      });

    try {
      var saved = localStorage.getItem(NICK_KEY);
      if (saved) form.querySelector("[name=nick]").value = saved;
    } catch (e) {
      /* private mode — the field just starts empty */
    }
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var nick = form.querySelector("[name=nick]").value.trim();
    var text = form.querySelector("[name=text]").value.trim();
    var email = form.querySelector("[name=email]").value.trim();

    if (!nick || !text) {
      say("A name and a comment, please.", "error");
      return;
    }

    submit.disabled = true;
    say("Sending…");

    fetch(api + "/comments", {
      method: "POST",
      credentials: "omit",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        post: post,
        postTitle: postTitle,
        parentId: parentId,
        nick: nick,
        email: email,
        text: text,
        website: form.querySelector("[name=website]").value,
        rendered: renderedAt,
      }),
    })
      .then(function (res) {
        if (!res.ok) throw new Error(res.status);
        return res.json();
      })
      .then(function () {
        try {
          localStorage.setItem(NICK_KEY, nick);
        } catch (e) {
          /* private mode — the name just won't be remembered */
        }
        form.querySelector("[name=text]").value = "";
        endReply();
        say("Thank you — your comment is with me, and appears once I have read it.", "ok");
      })
      .catch(function () {
        say("That didn’t send. Try again in a moment?", "error");
      })
      .then(function () {
        submit.disabled = false;
        renderedAt = Date.now();
      });
  });

  if (!("IntersectionObserver" in window)) {
    load();
    return;
  }

  var io = new IntersectionObserver(function (entries) {
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].isIntersecting) {
        io.disconnect();
        load();
        return;
      }
    }
  }, { rootMargin: "600px 0px" });

  io.observe(root);
})();
