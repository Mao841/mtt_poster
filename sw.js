// 滚动屏离线缓存 Service Worker
//
// 目标：设备第一次成功加载后，即使之后完全断网（甚至断电重启再打开浏览器），
//       也能继续正常滚动，不会白屏。
//
// 策略：
//   - install 阶段把 index.html / posters.json / 所有图片全部预缓存下来。
//   - 图片：cache-first（本地优先）—— 断网时直接用本地副本，永远不会卡住。
//   - HTML / posters.json：network-first + 3 秒超时，超时或失败就用本地副本。
//     这样「联网时」换了图或改了顺序能立刻生效，「断网时」仍然照常显示。
//   - activate 阶段清掉旧版本缓存，避免占满电视有限的存储。
//
// ⚠️ 改了同名图片（比如覆盖 2.jpg）后如果没生效，把下面的 CACHE_VERSION 改个数字再部署。

const CACHE_VERSION = 'v5';
const CACHE_NAME = 'milk-tea-poster-' + CACHE_VERSION;

// 首次安装时必须拿到的核心文件；任何一个失败就整体重试
const CORE = ['./', './index.html', './posters.json'];

// 给请求加个 ?v= 参数，确保首次预缓存拿到的是服务器的当前版本而不是浏览器旧缓存
function fresh(url) {
  return url + (url.indexOf('?') === -1 ? '?' : '&') + 'sw=' + CACHE_VERSION;
}

// install 时读 posters.json，把所有图片一并预缓存（加图后自动生效，无需改这里）
async function precache() {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(CORE.map(fresh));

  let files = [];
  try {
    const res = await fetch(fresh('./posters.json'), { cache: 'no-store' });
    const data = await res.json();
    files = Array.isArray(data) ? data : (data && data.files) || [];
  } catch (e) {
    files = ['poster.jpg']; // 兜底
  }

  // 图片体积大，逐个下载；个别失败不影响整体安装
  await Promise.all(
    files.map(async (f) => {
      const url = './' + String(f).replace(/^\.?\//, '');
      try {
        await cache.add(fresh(url));
      } catch (e) {
        /* 单张失败就跳过，运行时再兜底 */
      }
    })
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    precache()
      .catch((e) => console.warn('[sw] 预缓存失败，将在联网时重试', e))
      .then(() => self.skipWaiting()) // 新版本立刻接管，不用等旧页面关闭
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((n) => n.startsWith('milk-tea-poster-') && n !== CACHE_NAME)
            .map((n) => caches.delete(n))
        )
      )
      .then(() => self.clients.claim()) // 立刻接管当前页面
  );
});

function isImage(url) {
  return /\.(jpe?g|png|webp|gif|avif|svg|bmp)$/i.test(url.pathname);
}

function isManifest(url) {
  return url.pathname.endsWith('/posters.json');
}

function isDoc(url) {
  return url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch (e) {
    return;
  }
  if (url.origin !== self.location.origin) return; // 只管自家资源

  // 图片：本地优先，断网也绝不卡住
  if (isImage(url)) {
    event.respondWith(
      caches.match(req, { ignoreSearch: true }).then(
        (hit) =>
          hit ||
          fetch(req)
            .then((res) => {
              if (res && res.ok) {
                const copy = res.clone();
                caches.open(CACHE_NAME).then((c) => c.put(req, copy));
              }
              return res;
            })
            .catch(() => hit || Response.error())
      )
    );
    return;
  }

  // 页面与清单：网络优先 + 超时兜底，保证「联网换图立刻生效、断网照常运行」
  if (isDoc(url) || isManifest(url)) {
    event.respondWith(
      new Promise((resolve) => {
        let settled = false;
        const fallback = () =>
          caches
            .match(req, { ignoreSearch: true })
            .then((hit) => hit || caches.match('./index.html'))
            .then((hit) => hit || Response.error());

        const timer = setTimeout(() => {
          if (!settled) {
            settled = true;
            fallback().then(resolve);
          }
        }, 3000);

        fetch(req)
          .then((res) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (res && res.ok) {
              const copy = res.clone();
              caches.open(CACHE_NAME).then((c) => c.put(req, copy));
            }
            resolve(res);
          })
          .catch(() => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            fallback().then(resolve);
          });
      })
    );
  }
});
