// 工具栏里改过的内容：名字、绳子颜色、三页的模板/底色/图片。
// 存在浏览器的 localStorage 里（只对这台电脑的这个浏览器有效），刷新后还在。
// config.js 里写的是默认值；「恢复默认」就是把这里存的那份扔掉、回到默认值。

const VERSION = 1;

export function createStore(person, feel) {
  const key = `lin-creat:v${VERSION}:${person.id}`;

  const defaults = () => ({
    line1: person.line1,
    line2: person.line2,
    accent: person.accent,
    strapColor: feel.strapColor,
    pages: {
      front: { ...person.pages.front, image: null },
      postcard: { ...person.pages.postcard, image: null },
      back: { ...person.pages.back, image: null },
    },
  });

  let state = defaults();
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (saved) state = merge(state, saved);
  } catch {
    // 读不到（比如隐私模式）就用默认值
  }

  const listeners = new Set();

  // 返回 false 表示没存进去（一般是图片太大，浏览器空间不够）
  function commit(what, kind) {
    let saved = true;
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      saved = false;
    }
    listeners.forEach((fn) => fn(what, kind));
    return saved;
  }

  return {
    get state() {
      return state;
    },
    // 卡面上要用到的全部文字：config 里的 + 改过的名字
    get content() {
      return { ...person, line1: state.line1, line2: state.line2, accent: state.accent };
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    setName(patch) {
      Object.assign(state, pick(patch, ['line1', 'line2', 'accent']));
      return commit('name');
    },
    setStrap(color) {
      state.strapColor = color;
      return commit('strap');
    },
    setPage(kind, patch) {
      Object.assign(state.pages[kind], pick(patch, ['template', 'bg', 'image']));
      return commit('page', kind);
    },
    // section：'name' | 'strap' | 'page'（page 要带上是哪一页）
    reset(section, kind) {
      const d = defaults();
      if (section === 'name') Object.assign(state, pick(d, ['line1', 'line2', 'accent']));
      if (section === 'strap') state.strapColor = d.strapColor;
      if (section === 'page') state.pages[kind] = d.pages[kind];
      return commit(section, kind);
    },
    isDefault(section, kind) {
      const d = defaults();
      if (section === 'name') return ['line1', 'line2', 'accent'].every((k) => state[k] === d[k]);
      if (section === 'strap') return state.strapColor === d.strapColor;
      const p = state.pages[kind];
      const q = d.pages[kind];
      return p.template === q.template && p.bg === q.bg && !p.image;
    },
  };
}

// 名字两行拼成底部大字：中文直接连起来，英文中间加空格
export function fullName(line1, line2) {
  const cjk = /[　-鿿＀-￯]/.test(line1 + line2);
  return (cjk ? `${line1}${line2}` : `${line1} ${line2}`).trim();
}

// 上传的图片先缩小、转成 JPEG 再存，不然几张手机照片就把浏览器的存储空间占满了
export async function compressImage(file, maxSide = 1200) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, w, h);
  g.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return canvas.toDataURL('image/jpeg', 0.85);
}

// 把存着的图片（一长串文字）变回能画的图片，同一张只解码一次
const images = new Map();
export function loadImage(src) {
  if (!src) return Promise.resolve(null);
  if (!images.has(src)) {
    images.set(
      src,
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
      }),
    );
  }
  return images.get(src);
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (k in obj) out[k] = obj[k];
  return out;
}

function merge(base, saved) {
  const out = structuredClone(base);
  for (const k of ['line1', 'line2', 'accent', 'strapColor']) {
    if (typeof saved[k] === 'string') out[k] = saved[k];
  }
  for (const kind of Object.keys(out.pages)) {
    const p = saved.pages?.[kind];
    if (!p) continue;
    if (typeof p.template === 'string') out.pages[kind].template = p.template;
    if (typeof p.bg === 'string') out.pages[kind].bg = p.bg;
    if (typeof p.image === 'string') out.pages[kind].image = p.image;
  }
  return out;
}
