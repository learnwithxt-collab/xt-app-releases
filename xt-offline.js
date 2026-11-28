// XT Driver Training: asks the browser to keep the app itself on this device
// (see xt-sw.js) and shows "A new version is ready" when a newer build has
// been fetched. Plain page script, loaded by index.html before the app, so
// it still works if the app itself fails to start.
(function () {
  'use strict';
  if (!('serviceWorker' in navigator) || !window.caches) return;

  // true = every device keeps a copy (28 Nov 2026; it was on trial with
  // admins from 19 Nov). Anyone can still add ?offline=0 to the address
  // once to switch it off on a device and drop the copy, or ?offline=1 to
  // switch it back on. false = only devices that have been switched on.
  var EVERYONE = true;
  var KEY = 'xt_offline';
  var NAVY = '#0B1931';

  function choice() {
    try {
      return localStorage.getItem(KEY);
    } catch (e) {
      return null;
    }
  }
  function choose(v) {
    try {
      localStorage.setItem(KEY, v);
    } catch (e) {}
  }
  try {
    var q = new URLSearchParams(location.search).get('offline');
    if (q === '1' || q === '0') choose(q);
  } catch (e) {}

  function wanted() {
    var c = choice();
    return c === null ? EVERYONE : c === '1';
  }

  function isOurs(reg) {
    var w = reg.active || reg.waiting || reg.installing;
    return !!w && /\/xt-sw\.js$/.test(new URL(w.scriptURL).pathname);
  }

  // Drop the copy: back to fetching the site each time.
  function remove() {
    navigator.serviceWorker.getRegistrations().then(function (regs) {
      regs.forEach(function (r) {
        if (isOurs(r)) r.unregister();
      });
    });
    caches.keys().then(function (names) {
      names.forEach(function (n) {
        if (/^xt-(app|engine|outside)-/.test(n)) caches.delete(n);
      });
    });
  }

  var bar = null;
  var asked = false;
  var dismissed = false;

  // The message. `go` is what a tap on Update does.
  function show(go) {
    if (bar || dismissed) return;
    bar = document.createElement('div');
    bar.setAttribute('role', 'status');
    bar.style.cssText =
      'position:fixed;left:50%;transform:translateX(-50%);z-index:2147483647;' +
      'top:calc(env(safe-area-inset-top, 0px) + 10px);max-width:calc(100vw - 24px);box-sizing:border-box;' +
      'display:flex;align-items:center;gap:10px;padding:8px 8px 8px 16px;border-radius:999px;' +
      'background:#fff;color:' + NAVY + ';border:1px solid rgba(11,25,49,.18);' +
      'box-shadow:0 4px 16px rgba(0,0,0,.28);font:500 14px/1.2 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;' +
      'white-space:nowrap;';
    var text = document.createElement('span');
    text.textContent = 'A new version is ready';
    text.style.cssText = 'overflow:hidden;text-overflow:ellipsis;';
    var update = document.createElement('button');
    update.type = 'button';
    update.textContent = 'Update';
    update.style.cssText =
      'border:0;border-radius:999px;padding:8px 16px;background:' + NAVY + ';color:#fff;' +
      'font:600 14px/1 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;cursor:pointer;';
    update.onclick = function () {
      update.disabled = true;
      update.textContent = 'Updating…';
      go();
    };
    var later = document.createElement('button');
    later.type = 'button';
    later.setAttribute('aria-label', 'Not now');
    later.textContent = '×';
    later.style.cssText =
      'border:0;background:transparent;color:' + NAVY + ';font:400 22px/1 system-ui,sans-serif;' +
      'width:32px;height:32px;border-radius:50%;cursor:pointer;opacity:.7;';
    later.onclick = function () {
      dismissed = true;
      hide();
    };
    bar.appendChild(text);
    bar.appendChild(update);
    bar.appendChild(later);
    (document.body || document.documentElement).appendChild(bar);
  }
  function hide() {
    if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
    bar = null;
  }

  var started = false;
  function start() {
    if (started) return;
    started = true;
    var hadController = !!navigator.serviceWorker.controller;

    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!hadController) {
        // The first copy has just taken charge of this page: nothing changed.
        hadController = true;
        return;
      }
      // A newer build is now in charge. If this page asked for it, start
      // again on it; if another tab did, offer rather than interrupt.
      if (asked) location.reload();
      else {
        dismissed = false;
        hide();
        show(function () {
          location.reload();
        });
      }
    });

    navigator.serviceWorker
      .register('xt-sw.js', { updateViaCache: 'none' })
      .then(function (reg) {
        function offer() {
          var w = reg.waiting;
          if (!w || !navigator.serviceWorker.controller) return;
          show(function () {
            asked = true;
            w.postMessage('xt-update-now');
            // If nothing has happened after a while, a plain reload gets there.
            setTimeout(function () {
              location.reload();
            }, 8000);
          });
        }
        offer();
        reg.addEventListener('updatefound', function () {
          var w = reg.installing;
          if (!w) return;
          w.addEventListener('statechange', function () {
            if (w.state === 'installed') offer();
          });
        });

        // Look for a newer build when the app comes back to the front, and
        // now and then while it stays open (one small request to XT's site).
        var looked = Date.now();
        function look() {
          if (Date.now() - looked < 10 * 60 * 1000) return;
          looked = Date.now();
          reg.update().catch(function () {});
        }
        document.addEventListener('visibilitychange', function () {
          if (document.visibilityState === 'visible') look();
        });
        setInterval(look, 60 * 60 * 1000);

        // Tell the copy which engine and Firebase files this page loaded, in
        // case it loaded them before the copy was in charge.
        function keep() {
          navigator.serviceWorker.ready.then(function (r) {
            if (!r.active || !window.performance || !performance.getEntriesByType) return;
            var urls = performance.getEntriesByType('resource').map(function (e) {
              return e.name;
            });
            r.active.postMessage({ type: 'xt-keep', urls: urls });
          });
        }
        setTimeout(keep, 10000);
        setTimeout(keep, 45000);
      })
      .catch(function (e) {
        if (window.console) console.log('XT offline copy: not registered', e);
      });
  }

  window.xtOffline = {
    // Called by the app for people trying it before everyone gets it.
    trial: function () {
      if (choice() === null) choose('1');
      if (wanted()) start();
    },
    on: wanted,
  };

  if (wanted()) start();
  else if (choice() === '0') remove();
})();
