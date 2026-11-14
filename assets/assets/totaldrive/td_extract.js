/*
 * XT – read a TotalDrive account for "Import from TotalDrive".
 *
 * Runs on web.totaldrive.app after the instructor has logged in there
 * themselves: inside the XT Android app's login screen, from the
 * "XT import" bookmark in Safari/Chrome (iPhone and computers), or from the
 * iPhone "XT import" shortcut (Shortcuts → Run JavaScript on Web Page, which
 * fetches this file from app.xtdriving.com and runs it, so it stays up to
 * date; the text goes back via completion() and the shortcut copies it).
 *
 * READ-ONLY, ALWAYS. This script:
 *  - only sends GET requests (fetch with method 'GET'; nothing else exists here)
 *  - only to the addresses in ALLOWED below (active pupil list, pupil pages)
 *  - never clicks anything and never runs TotalDrive's own page code; it
 *    reads the text that comes back with DOMParser (which runs no scripts)
 * Nothing in TotalDrive can be changed or deleted by it.
 *
 * Result: {v, source, readAt, pupils:[…], errors:[…]} handed to XT.
 * Hand-over (11 Nov 2026): "Send to XT" opens app.xtdriving.com in a new tab
 * and passes the text straight to it, tab to tab (window messages; nothing
 * goes through a server). "Copy for XT" + Paste in XT is the fallback, and
 * the iPhone shortcut still copies it (the panel offers Copy for XT too, in
 * case the shortcut's own copy didn't happen).
 * Keep it plain ES2017 (no build step) – it is also used as a bookmarklet.
 */
(function () {
  'use strict';
  if (window.__xtTdRunning) return;
  window.__xtTdRunning = true;

  var HOST = 'web.totaldrive.app';
  // The only pages this script may ask for. Active pupils only (agreed with
  // Leigh 7 Nov 2026): the other pupil lists are never read.
  var ALLOWED = [/^server_pupils\.php\?/, /^pupil\.php\?user_id=\d+$/];

  var android = window.XtImport; // set by the XT Android app
  // The iPhone shortcut's Run JavaScript on Web Page gives us completion().
  var shortcut = !android && typeof completion === 'function' ? completion : null;
  var errors = [];

  function say(text, n, total) {
    if (android && android.progress) android.progress(text, n || 0, total || 0);
    else ui.status(text);
  }

  function get(path) {
    if (!ALLOWED.some(function (r) { return r.test(path); })) {
      return Promise.reject(new Error('Not allowed: ' + path));
    }
    return fetch('/' + path, { method: 'GET', credentials: 'same-origin', redirect: 'error', cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('TotalDrive said ' + r.status + ' for ' + path.split('?')[0]);
        return r.text();
      });
  }

  function wait(ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); }

  // The first {...} object in a call like fn({...}, {...}), respecting strings.
  function firstObject(s) {
    var i = s.indexOf('{');
    if (i < 0) return null;
    var depth = 0, inStr = false, esc = false;
    for (var j = i; j < s.length; j++) {
      var c = s[j];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
      } else if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) {
        try { return JSON.parse(s.slice(i, j + 1)); } catch (e) { return null; }
      }
    }
    return null;
  }

  // The object after the first one (the reflective-log questions).
  function secondObject(s) {
    var cut = -1, depth = 0, inStr = false, esc = false, i = s.indexOf('{');
    if (i < 0) return null;
    for (var j = i; j < s.length; j++) {
      var c = s[j];
      if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; }
      else if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) { cut = j + 1; break; }
    }
    return cut < 0 ? null : firstObject(s.slice(cut));
  }

  // DOMParser builds a page without running any of its scripts.
  function parse(html) { return new DOMParser().parseFromString(html, 'text/html'); }

  function readPupilPage(html) {
    var doc = parse(html);
    var lessons = {}, payments = {}, progress = [];
    doc.querySelectorAll('[onclick*="viewReport("]').forEach(function (el) {
      var on = el.getAttribute('onclick') || '';
      var o = firstObject(on);
      if (o && o.id != null && !lessons[o.id]) {
        var q = secondObject(on);
        if (q) o._questions = q;
        lessons[o.id] = o;
      }
    });
    doc.querySelectorAll('[onclick*="editPayment("],[onclick*="viewPaymentNotes("]').forEach(function (el) {
      var o = firstObject(el.getAttribute('onclick') || '');
      if (o && o.id != null && !payments[o.id]) payments[o.id] = o;
    });
    doc.querySelectorAll('select[name="progressStatus[]"]').forEach(function (sel) {
      var group = sel.closest('.form-group') || sel.parentElement;
      var label = group && group.querySelector('label');
      var opt = sel.querySelector('option[selected]');
      var level = opt ? parseInt(opt.getAttribute('value'), 10) : 0;
      if (label) progress.push({ skill: label.textContent.trim(), level: level || 0 });
    });
    var lessonList = Object.keys(lessons).map(function (k) { return lessons[k]; });
    // Lessons the page lists but whose row we couldn't read (TotalDrive changed?)
    return { lessons: lessonList, payments: Object.keys(payments).map(function (k) { return payments[k]; }), progress: progress };
  }

  function pupilListQuery(instructorId) {
    var cols = ['name', 'instructor', 'lesson', 'progress', 'theory', 'practical', 'credit', 'app', 'action'];
    var q = ['admin_user=1', 'instructor_id=' + encodeURIComponent(instructorId), 'draw=1'];
    cols.forEach(function (c, i) {
      q.push('columns%5B' + i + '%5D%5Bdata%5D=' + c, 'columns%5B' + i + '%5D%5Bname%5D=',
        'columns%5B' + i + '%5D%5Bsearchable%5D=true', 'columns%5B' + i + '%5D%5Borderable%5D=' + (c !== 'action'),
        'columns%5B' + i + '%5D%5Bsearch%5D%5Bvalue%5D=', 'columns%5B' + i + '%5D%5Bsearch%5D%5Bregex%5D=false');
    });
    q.push('order%5B0%5D%5Bcolumn%5D=0', 'order%5B0%5D%5Bdir%5D=asc', 'start=0', 'length=2000',
      'search%5Bvalue%5D=', 'search%5Bregex%5D=false', 'search_keywords=', '_=' + Date.now());
    return 'server_pupils.php?' + q.join('&');
  }

  function readPupilRow(row) {
    var holder = parse('<div>' + (row.action || '') + (row.name || '') + '</div>');
    var edit = holder.querySelector('[onclick^="editStudent("]');
    var link = holder.querySelector('a[href*="pupil.php?user_id="]');
    var rec = edit ? firstObject(edit.getAttribute('onclick')) : null;
    var m = link ? /user_id=(\d+)/.exec(link.getAttribute('href')) : null;
    return {
      userId: m ? m[1] : '',
      name: link ? link.textContent.trim() : '',
      creditHours: typeof row.credit_hours === 'number' ? row.credit_hours : parseFloat(row.credit_hours) || 0,
      percent: row.percent || 0,
      record: rec || {},
    };
  }

  function instructorFromUrl() {
    var m = /instructor_id=(\d+)/.exec(location.search) || /instructor_id=(\d+)/.exec(document.body ? document.body.innerHTML : '');
    return m ? m[1] : '';
  }

  async function run() {
    var instructor = instructorFromUrl();
    if (!instructor) throw new Error('Open your TotalDrive dashboard first (log in, then try again).');
    say('Reading your active pupils…');
    var list = JSON.parse(await get(pupilListQuery(instructor)));
    var rows = (list && list.data) || [];
    var pupils = rows.map(readPupilRow).filter(function (p) { return p.userId; });
    for (var i = 0; i < pupils.length; i++) {
      var p = pupils[i];
      say('Reading ' + (p.name || 'pupil') + ' (' + (i + 1) + ' of ' + pupils.length + ')', i + 1, pupils.length);
      try {
        var page = readPupilPage(await get('pupil.php?user_id=' + p.userId));
        p.lessons = page.lessons;
        p.payments = page.payments;
        p.progress = page.progress;
      } catch (e) {
        errors.push((p.name || p.userId) + ': ' + e.message);
        p.lessons = []; p.payments = []; p.progress = []; p.failed = true;
      }
      await wait(250); // gentle on TotalDrive's server
    }
    return { v: 1, source: 'totaldrive', readAt: new Date().toISOString(), pupils: pupils, errors: errors };
  }

  // ---------- on-page panel (bookmark use) ----------
  var ui = {
    box: null, text: null,
    open: function () {
      if (android) return;
      var b = document.createElement('div');
      b.style.cssText = 'position:fixed;z-index:2147483647;left:12px;right:12px;top:12px;max-width:460px;margin:0 auto;' +
        'background:#13294B;color:#fff;font:16px/1.4 Arial,sans-serif;padding:16px;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.35)';
      b.innerHTML = '<div style="font-weight:bold;margin-bottom:6px">XT import from TotalDrive</div>' +
        '<div data-t>Starting…</div><div data-b style="margin-top:12px"></div>' +
        '<div style="margin-top:10px;font-size:13px;opacity:.8">Read-only: nothing in TotalDrive is changed.</div>';
      document.body.appendChild(b);
      ui.box = b; ui.text = b.querySelector('[data-t]');
    },
    status: function (t) { if (ui.text) ui.text.textContent = t; },
    button: function (label, fn) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      btn.style.cssText = 'font:bold 16px Arial;padding:12px 18px;border:0;border-radius:8px;background:#fff;color:#13294B;margin:0 8px 8px 0;cursor:pointer';
      // Our own listener; stop the click reaching TotalDrive's page code.
      btn.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); fn(ev); }, true);
      ui.box.querySelector('[data-b]').appendChild(btn);
      return btn;
    },
    close: function () { if (ui.box) ui.box.remove(); window.__xtTdRunning = false; },
  };

  // Copy [text] from a tap. Safari on a Mac can refuse the clipboard quietly,
  // so: 1) copy straight away from a visible text box in the panel (works in
  // every browser inside a tap), 2) else the clipboard API, 3) else leave the
  // text selected in the box so the instructor can press Cmd+C / Ctrl+C.
  function copy(text, done, failed) {
    var box = ui.box.querySelector('textarea[data-c]');
    if (!box) {
      box = document.createElement('textarea');
      box.setAttribute('data-c', '');
      box.setAttribute('readonly', '');
      box.style.cssText = 'display:block;width:100%;height:44px;margin:4px 0 10px;font:12px monospace;color:#13294B;background:#fff;border:0;border-radius:6px;padding:6px;box-sizing:border-box';
      ui.box.querySelector('[data-b]').before(box);
    }
    box.value = text;
    box.focus();
    box.select();
    box.setSelectionRange(0, text.length);
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    if (ok) { done(); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      var settled = false;
      var t = setTimeout(function () { if (!settled) { settled = true; failed(); } }, 2500);
      navigator.clipboard.writeText(text).then(function () {
        if (settled) return; settled = true; clearTimeout(t); done();
      }, function () {
        if (settled) return; settled = true; clearTimeout(t); failed();
      });
      return;
    }
    failed();
  }

  // Hand [text] straight to XT: open it in a new tab (must be from a tap) and
  // wait for that tab to say it's ready, then pass the text across. Only ever
  // talks to XT's own address. [failed] if the tab can't be opened or XT
  // hasn't answered in 40 seconds.
  var XT = 'https://app.xtdriving.com';
  function sendToXt(text, sent, failed) {
    var w = null;
    try { w = window.open(XT + '/?td=1', 'xt_td_import'); } catch (e) { w = null; }
    if (!w) { failed(); return; }
    var over = false;
    function stop() { over = true; window.removeEventListener('message', heard); clearTimeout(timer); }
    function heard(ev) {
      if (over || ev.origin !== XT) return;
      if (ev.data === 'xt-td-ready') { try { w.postMessage(text, XT); } catch (e) { /* asked again shortly */ } }
      if (ev.data === 'xt-td-got') { stop(); sent(); }
    }
    window.addEventListener('message', heard);
    var timer = setTimeout(function () { if (!over) { stop(); failed(); } }, 40000);
  }

  // "Copy for XT" button: the paste way (and the fallback for Send to XT).
  function copyButton(text, label) {
    var b = ui.button(label, function () {
      ui.status('Copying…');
      copy(text, function () {
        b.textContent = 'Copied ✓';
        ui.status('Copied. Now go back to XT and tap Import my pupils.');
      }, function () {
        var mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
        ui.status('Your browser blocked the copy. The text in the white box is selected: press ' +
          (mac ? '⌘ Cmd + C' : 'Ctrl + C') + ' now, then go back to XT and tap Import my pupils.');
        var box = ui.box.querySelector('textarea[data-c]');
        if (box) { box.focus(); box.select(); }
      });
    });
    return b;
  }

  if (location.hostname !== HOST) {
    if (shortcut) shortcut('XTTDERR:Open TotalDrive in Safari and log in first, then tap Share → XT import again.');
    else if (!android) alert('Open TotalDrive (web.totaldrive.app) and log in first, then tap the XT import bookmark again.');
    window.__xtTdRunning = false;
    return;
  }

  ui.open();
  run().then(function (result) {
    var json = JSON.stringify(result);
    if (android) { android.done(json); return; }
    var n = result.pupils.length;
    var read = 'Read ' + n + ' active pupil' + (n === 1 ? '' : 's') + (errors.length ? ' (' + errors.length + ' could not be read)' : '');
    if (shortcut) {
      // iPhone shortcut: it copies what we hand back. The button is there in
      // case that copy didn't happen (big accounts, or the Shortcuts switch
      // for large amounts of data is off). Panel first, then hand back.
      ui.status(read + ' and copied them. Go back to XT and tap Import my pupils. If it finds nothing, come back here and tap Copy for XT.');
      copyButton('XTTD1:' + json, 'Copy for XT');
      ui.button('Close', ui.close);
      try { shortcut('XTTD1:' + json); } catch (e) { /* the shortcut gave up waiting; the button still works */ }
      return;
    }
    ui.status(read + '. Tap Send to XT.');
    // Opening XT has to come from a tap, so it's a button.
    var send = ui.button('Send to XT', function () {
      ui.status('Opening XT…');
      sendToXt('XTTD1:' + json, function () {
        send.textContent = 'Sent ✓';
        ui.status('Sent. Carry on in the XT tab that just opened: check the list and add your pupils.');
      }, function () {
        ui.status('XT didn\'t pick it up (your browser may have blocked the new tab). Tap Copy instead, then go back to XT and tap Import my pupils.');
      });
    });
    copyButton('XTTD1:' + json, 'Copy instead');
    ui.button('Close', ui.close);
  }, function (e) {
    if (android) { android.failed(String(e && e.message || e)); return; }
    if (shortcut) shortcut('XTTDERR:' + (e && e.message || e));
    ui.status('Stopped: ' + (e && e.message || e));
    ui.button('Close', ui.close);
  });
})();
