/*
 * XT – read a TotalDrive account for "Import from TotalDrive".
 *
 * Runs on web.totaldrive.app after the instructor has logged in there
 * themselves: inside the XT Android app's login screen, or from the
 * "XT import" bookmark in Safari/Chrome (iPhone and computers).
 *
 * READ-ONLY, ALWAYS. This script:
 *  - only sends GET requests (fetch with method 'GET'; nothing else exists here)
 *  - only to the addresses in ALLOWED below (active pupil list, pupil pages)
 *  - never clicks anything and never runs TotalDrive's own page code; it
 *    reads the text that comes back with DOMParser (which runs no scripts)
 * Nothing in TotalDrive can be changed or deleted by it.
 *
 * Result: {v, source, readAt, pupils:[…], errors:[…]} handed to XT.
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
      b.style.cssText = 'position:fixed;z-index:2147483647;left:12px;right:12px;bottom:12px;max-width:460px;margin:0 auto;' +
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
      btn.textContent = label;
      btn.style.cssText = 'font:bold 16px Arial;padding:12px 18px;border:0;border-radius:8px;background:#fff;color:#13294B;margin-right:8px';
      btn.onclick = fn;
      ui.box.querySelector('[data-b]').appendChild(btn);
      return btn;
    },
    close: function () { if (ui.box) ui.box.remove(); window.__xtTdRunning = false; },
  };

  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () { return fallbackCopy(text); });
    }
    return Promise.resolve(fallbackCopy(text));
  }
  function fallbackCopy(text) {
    var t = document.createElement('textarea');
    t.value = text; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(t); t.select(); t.setSelectionRange(0, text.length);
    var ok = document.execCommand('copy'); t.remove();
    if (!ok) throw new Error('copy');
  }

  if (location.hostname !== HOST) {
    if (!android) alert('Open TotalDrive (web.totaldrive.app) and log in first, then tap the XT import bookmark again.');
    window.__xtTdRunning = false;
    return;
  }

  ui.open();
  run().then(function (result) {
    var json = JSON.stringify(result);
    if (android) { android.done(json); return; }
    var n = result.pupils.length;
    ui.status('Read ' + n + ' active pupil' + (n === 1 ? '' : 's') + (errors.length ? ' (' + errors.length + ' could not be read)' : '') +
      '. Tap Copy, then go back to the XT app and tap Paste.');
    // Copying has to come from a tap, so it's a button.
    var b = ui.button('Copy for XT', function () {
      copy('XTTD1:' + json).then(function () {
        b.textContent = 'Copied ✓';
        ui.status('Copied. Now open the XT app → Import from TotalDrive → Paste.');
      }, function () { ui.status('Couldn\'t copy on this browser. Try Chrome or a computer.'); });
    });
    ui.button('Close', ui.close);
  }, function (e) {
    if (android) { android.failed(String(e && e.message || e)); return; }
    ui.status('Stopped: ' + (e && e.message || e));
    ui.button('Close', ui.close);
  });
})();
