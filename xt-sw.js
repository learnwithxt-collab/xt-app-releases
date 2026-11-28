'use strict';
// XT Driver Training: keeps the app itself on this device.
//
// The website version used to be fetched from XT's site every time it was
// opened, so with no signal it couldn't open at all, even though that
// person's lessons and pupils were saved on the phone. This file (a service
// worker; tool/web_offline.py fills in the lists below after each build)
// keeps a copy of the build on the device and answers from it.
//
// - Each build's files are kept under that build's number. A file only
//   counts if it is byte for byte the one the build made (SHA-256), so a
//   half-updated site or a stale copy on the way can never be kept.
// - A new build is fetched behind the running app and waits. The page shows
//   "A new version is ready"; a tap (or the next time the app is opened from
//   closed) switches to it. The app is never swapped under someone mid-task.
// - Only the app's own files, Firebase's scripts and fallback fonts are
//   touched. Firestore, sign-in, the XT worker and maps go straight to the
//   network as before; nothing personal is kept here.
// - Off switch: build with `tool/web_offline.py --off` and every device
//   drops its copy and goes back to fetching the site each time.

const BUILD = "196";
// Changes only when the drawing engine's files do, so an ordinary app
// update doesn't fetch the engine again.
const ENGINE = "11c32490d916";
// path -> SHA-256. CORE is fetched when a build is installed; LAZY (the
// drawing engine, which has a version per kind of browser) the first time
// this device asks for it.
const CORE = {
 "Roboto-LICENSE.txt": "cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30",
 "apple-touch-icon.png": "0320942dabe559401436e2cf3ee7db0fa5389127373dd1e1615ae7b81eb87531",
 "assets/AssetManifest.bin": "cb564fcc80879f546ea6cc11219052149a8e2d4f5e473e1e82254625a937bfd9",
 "assets/AssetManifest.bin.json": "213e52dd6b578c991121a4733615ddb83c1268d36809e29c8c9cee30d36d59b2",
 "assets/FontManifest.json": "1b7ae9f2540dae41ea2b314a7d957eb74982f474c8e7fc6c901739933db3d73e",
 "assets/assets/data/test_centres.json": "6e46c5163bd041d767fefa84a0b00c5bd125cc00825b922539e0f229d4ce609b",
 "assets/assets/forms/adi21at_p1.png": "2b603ea31b7f39d2d8230e7f26f38aeb5a8cd74077b3968058015fc9431cac86",
 "assets/assets/forms/adi21at_p2.png": "242999c91987d2a6f073346f9f5aabb28e9c8401a0e87f4d2e6af83b9d65265c",
 "assets/assets/forms/adi21t_p1.png": "0cd1ae589425237b6a071dcf362cdb2fa1d905974b7b1a8f83d95867b9edce39",
 "assets/assets/forms/adi21t_p2.png": "c66ed3b7fe326661c429f595a30793c6f7e816b8fcc3df7eeae5c6d8d1abde32",
 "assets/assets/images/xt-icon.png": "f3a90a4f81155a596dff4ff6e155f7b3040a28530f67d5c21e1d895ac1f85041",
 "assets/assets/images/xt-logo-colour.png": "58f0d4e34776bd395ed6ca21c1fd86f264d4d64c634032a324e249b7bee256ce",
 "assets/assets/images/xt-logo-white.png": "d8c3d82462593e6f9af16f3cbf17ed71e92ca5058201b6f77360713094dee193",
 "assets/assets/totaldrive/td_extract.js": "1c6393562c6048265eb92c1694c82492c7767db1f4626e2838d457460832a322",
 "assets/fonts/MaterialIcons-Regular.otf": "729bed3a3e6cfad17cce415344e7407e06c93a116caf43eba437b85809e72ace",
 "assets/packages/flutter_map/lib/assets/flutter_map_logo.png": "6051ae42fb505931a833e58f9209a9f96669a4d0e4b3f06f6d82cde12a0e0401",
 "assets/shaders/ink_sparkle.frag": "2dca5ab93d4ec29e963f996f3916320ba60825e9537dfb149a68008c7a16b026",
 "assets/shaders/stretch_effect.frag": "ab412f07a5b9b50b67a885b24dbe16929738ae28630407d6490c924caf0a3220",
 "assets/webassets/fonts/Roboto-Regular.ttf": "79e851404657dac2106b3d22ad256d47824a9a5765458edb72c9102a45816d95",
 "favicon.png": "b184339dd221391f2ff810bb0bdf4796eec8031ecc192b0d841d3886f8e3944f",
 "flutter.js": "d2e7708f08b4a5b2a1bcd9671d2ff96f07daa0fd58e847d073d4e4ebff96f98f",
 "flutter_bootstrap.js": "7f4dc77cd324b635adb143c8e71ca7100f2daa24a15dd33510446e0ec9646296",
 "icons/Icon-192.png": "2addb3d1f97c02c7310ebfa0cbf82a38cad65f8af56fefef29d671d11e79bb02",
 "icons/Icon-512.png": "003585502587105958050f370f89510ffe42d9143187309ae6b4110a6115c135",
 "icons/Icon-maskable-192.png": "06c4ac9f48fcd0583cf32402935383bac86ce8a62874d1dcd4459e91a3b17f25",
 "icons/Icon-maskable-512.png": "a6232d20a2cc803f2ee5b6eaf07de1cbad3e0801d12448b17275974cad4bdd70",
 "index.html": "13344114e1fdd79f681694203b5a4e07b0d683e0af0df09c6b1ca4f97adfd1aa",
 "main.dart.js": "6867e1a7ebd661ab2099bfd9ba3be1d7b1e848ec0e1dddea30c3ab787f69e497",
 "manifest.json": "51b356821aed9e522a2a2c9693e31035e7e9e2f9d98d6c5a1001b95505c3cb0c",
 "version.json": "f8d6a6d0fb76c170face50f5eaa209fa5c161797d91288c287164ba3f74e25cb",
 "xt-offline.js": "fd81d8ffaa740c998e588c3a58cca41a411cabc070afe3d7b4a96383e783c3f6"
};
const LAZY = {
 "assets/NOTICES": "7704f86a077ea2e750b45de1ca9530344e29ba6f742431a4c15bd0bf7b1460b1",
 "canvaskit/canvaskit.js": "4719b51c8e2a4e2371c3b35286db039efdf76dcf7459fb810bf5fccaa22ee36c",
 "canvaskit/canvaskit.wasm": "f3c2ff164f324217ebe1d84900110e425c0195fc63f34e8b58de842a047e0c1c",
 "canvaskit/chromium/canvaskit.js": "b836e30a284ba783ffc91cc6adbedaa54efe95d1816e42781bb7234a7f0d3160",
 "canvaskit/chromium/canvaskit.wasm": "e269e717aad848981ed07db8573b4f7923ccd557d2e696f2944f541f4ff3df9f",
 "canvaskit/skwasm.js": "373ad56a7aa8ffad5fcc82646664b985d6d816457fba1899d4da68452bee34f8",
 "canvaskit/skwasm.wasm": "8cc8a3a92f5b3b82d3981b068f883cb76fc97b2fe50c0eb12b43515200460841",
 "canvaskit/skwasm_heavy.js": "0c22eeaceda0dd350307a61142c95d7dcd8c0aa741651b8468a752a2b9797a83",
 "canvaskit/skwasm_heavy.wasm": "0827476759917a5c67cb54fdb7c625bba341fccfe7508258dfdce78f18ea905e",
 "canvaskit/webparagraph/canvaskit.js": "6a95972eb213d410941a4b092715cab960b2572e46ca9459af6ead7dd5cac073",
 "canvaskit/webparagraph/canvaskit.wasm": "01f0337c620a2afe20b92578ab5ec8db8e5bb6eccdef751d30bac9d1d683988e",
 "canvaskit/wimp.js": "e4bc298de8c4a40fd4caadb47b6532bbc2390a5b5484bc0ccff4e5f837ce2290",
 "canvaskit/wimp.wasm": "f2850c8522fd07ea4406f698f85488aa6b0541cbf9a25e853a241e78ab8c8d1e"
};
const OFF = false;

const APP = 'xt-app-' + BUILD;
const ENG = 'xt-engine-' + ENGINE;
const OUT = 'xt-outside-1';
const OURS = /^xt-(app|engine|outside)-/;
// Other people's files the app can't start without (Firebase's scripts) or
// may ask for (fallback fonts, e.g. for an emoji). Their addresses carry a
// version and never change, so a kept copy stays right.
const OUTSIDE = ['https://www.gstatic.com/firebasejs/', 'https://fonts.gstatic.com/s/'];
const SCOPE = self.registration.scope;
const SCOPE_PATH = new URL(SCOPE).pathname;
// A record in each build's store of which files (and sums) it holds.
const LIST = SCOPE + '__xt-files';

const at = (path) => SCOPE + (path === 'index.html' ? '' : encodeURI(path));
const storeFor = (path) => (path.startsWith('canvaskit/') ? ENG : APP);

async function sha256(buf) {
  const d = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}

// One of the app's own files, fresh from XT's site, and only if it is
// exactly the file this build made.
async function fetchChecked(path, sum) {
  const res = await fetch(SCOPE + encodeURI(path) + '?xt=' + sum.slice(0, 16), {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  if (!res.ok) throw new Error(path + ': ' + res.status);
  const body = await res.arrayBuffer();
  if ((await sha256(body)) !== sum) throw new Error(path + ': not the file build ' + BUILD + ' made');
  const headers = new Headers();
  const type = res.headers.get('content-type');
  if (type) headers.set('content-type', type);
  return new Response(body, { status: 200, headers });
}

async function install() {
  if (OFF) return self.skipWaiting();
  const store = await caches.open(APP);
  // Files that haven't changed since a build already on this device are
  // copied across rather than downloaded again.
  const had = new Map();
  for (const name of await caches.keys()) {
    if (!name.startsWith('xt-app-') || name === APP) continue;
    const old = await caches.open(name);
    const rec = await old.match(LIST);
    if (!rec) continue; // never finished installing
    let list = {};
    try {
      list = await rec.json();
    } catch (_) {}
    for (const [path, sum] of Object.entries(list)) had.set(path + '\n' + sum, old);
  }
  const todo = Object.entries(CORE);
  let next = 0;
  const one = async () => {
    while (next < todo.length) {
      const [path, sum] = todo[next++];
      const old = had.get(path + '\n' + sum);
      const res = (old && (await old.match(at(path)))) || (await fetchChecked(path, sum));
      await store.put(at(path), res);
    }
  };
  // Any failure fails the install: the build already on the device carries
  // on, and the browser tries again next time the app is opened.
  await Promise.all([one(), one(), one(), one()]);
  await store.put(LIST, new Response(JSON.stringify(CORE), { headers: { 'content-type': 'application/json' } }));
}

async function activate() {
  for (const name of await caches.keys()) {
    if (!OURS.test(name)) continue;
    const stale = (name.startsWith('xt-app-') && name !== APP) || (name.startsWith('xt-engine-') && name !== ENG);
    if (OFF || stale) await caches.delete(name);
  }
  if (OFF) {
    await self.registration.unregister();
    for (const c of await self.clients.matchAll({ type: 'window' })) {
      try {
        c.navigate(c.url);
      } catch (_) {}
    }
    return;
  }
  await self.clients.claim();
}

async function page(req) {
  const hit = await (await caches.open(APP)).match(at('index.html'));
  return hit || fetch(req);
}

async function core(path, req) {
  const hit = await (await caches.open(APP)).match(at(path));
  return hit || fetch(req);
}

async function lazy(path, req) {
  const store = await caches.open(storeFor(path));
  const hit = await store.match(at(path));
  if (hit) return hit;
  let res;
  try {
    res = await fetchChecked(path, LAZY[path]);
  } catch (_) {
    // Not the expected file (the site is mid-update) or no signal: let the
    // browser deal with it as it would have, and keep nothing.
    return fetch(req);
  }
  try {
    await store.put(at(path), res.clone());
  } catch (_) {}
  return res;
}

async function outside(req) {
  const store = await caches.open(OUT);
  const hit = await store.match(req.url);
  if (hit) return hit;
  let res;
  try {
    // Asked for in a way that lets the answer be checked before it's kept.
    res = await fetch(req.url, { mode: 'cors', credentials: 'omit' });
  } catch (_) {
    return fetch(req);
  }
  if (res.ok) {
    try {
      await store.put(req.url, res.clone());
    } catch (_) {}
  }
  return res;
}

const isOutside = (url) => OUTSIDE.some((start) => url.startsWith(start));

// The app's own path for a request, or null if it isn't one of ours.
function ownPath(url) {
  if (url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE_PATH)) return null;
  try {
    return decodeURIComponent(url.pathname.slice(SCOPE_PATH.length));
  } catch (_) {
    return null;
  }
}

self.addEventListener('install', (e) => e.waitUntil(install()));
self.addEventListener('activate', (e) => e.waitUntil(activate()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (OFF || req.method !== 'GET') return;
  const url = new URL(req.url);
  const path = ownPath(url);
  if (path !== null) {
    if (req.mode === 'navigate') {
      if (path === '' || path === 'index.html') e.respondWith(page(req));
    } else if (Object.prototype.hasOwnProperty.call(CORE, path)) {
      e.respondWith(core(path, req));
    } else if (Object.prototype.hasOwnProperty.call(LAZY, path)) {
      e.respondWith(lazy(path, req));
    }
    return; // anything else of ours goes to the network as before
  }
  if (isOutside(req.url)) e.respondWith(outside(req));
});

self.addEventListener('message', (e) => {
  const d = e.data;
  // The person tapped Update.
  if (d === 'xt-update-now') {
    self.skipWaiting();
    return;
  }
  // Files the page loaded before this worker was in charge of it (the first
  // visit after the offline copy arrives): keep them too, so the next open
  // works with no signal.
  if (d && d.type === 'xt-keep' && Array.isArray(d.urls) && !OFF) {
    e.waitUntil(
      (async () => {
        for (const u of d.urls.slice(0, 60)) {
          try {
            const url = new URL(u);
            const path = ownPath(url);
            if (path !== null && Object.prototype.hasOwnProperty.call(LAZY, path)) await lazy(path, new Request(u));
            else if (path === null && isOutside(u)) await outside(new Request(u));
          } catch (_) {}
        }
      })(),
    );
  }
});
