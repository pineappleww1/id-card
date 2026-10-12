// 右侧工具栏（仿苹果风格）：名字 / 卡套 / 绳子 三个按钮，点开是一个浮层面板。
// 面板里改的东西会马上画到卡片上，并存进浏览器（见 store.js）。

import { PAGE_KINDS, PAGE_LABELS, TEMPLATES, drawPage, findTemplate } from './card-texture.js';
import { compressImage, loadImage } from './store.js';

const SVG = (paths) => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
const ICONS = {
  // 一个 T 加一个文字光标
  name: SVG('<path d="M4 7V5h11v2"/><path d="M9.5 5v14"/><path d="M7.5 19h4"/><path d="M18 9v10"/><path d="M16.5 9h3"/><path d="M16.5 19h3"/>'),
  // 三张错开叠着的卡（拆开的样子）
  cover: SVG(
    '<path d="M7 15H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1"/><path d="M10 18H9a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1"/><rect x="10" y="8" width="10" height="13" rx="2"/>',
  ),
  // V 字挂绳 + 卡
  strap: SVG('<path d="M5 2.5 12 11l7-8.5"/><path d="M12 11v2.5"/><rect x="7.5" y="13.5" width="9" height="8" rx="1.6"/><path d="M10.5 16.5h3"/>'),
};

const TOOLS = [
  { id: 'name', label: '名字', title: '编辑名字' },
  { id: 'cover', label: '卡套', title: '卡套封面' },
  { id: 'strap', label: '绳子', title: '绳子颜色' },
];

// 色板：[颜色, 名字]
const NAME_COLORS = [
  ['#1f2bff', '蓝'],
  ['#d5141e', '红'],
  ['#1f7a4d', '绿'],
  ['#f26b1d', '橙'],
  ['#7a3cf0', '紫'],
  ['#141414', '黑'],
];
const PAPER_COLORS = [
  ['#f5f5f3', '白'],
  ['#efe8d8', '米'],
  ['#e4e4e0', '灰'],
  ['#f4d9de', '粉'],
  ['#dbe8d4', '绿'],
  ['#d8e2f3', '蓝'],
  ['#f4df86', '黄'],
  ['#171717', '黑'],
];
const STRAP_COLORS = [
  ['#1c1c1c', '黑'],
  ['#f1f1ee', '白'],
  ['#d5141e', '红'],
  ['#1f2bff', '蓝'],
  ['#1f7a4d', '绿'],
  ['#f26b1d', '橙'],
  ['#f2a7c3', '粉'],
  ['#f5c518', '黄'],
];

const THUMB = [180, 266]; // 模板缩略图的像素尺寸（跟卡片每页的长宽比一样）

export function createToolbar({ store, badge }) {
  const root = h('div', { class: 'ui', 'data-ui': '' });
  const bar = h('nav', { class: 'toolbar glass', 'aria-label': '工具栏' });
  const buttons = {};
  for (const t of TOOLS) {
    const b = h('button', { type: 'button', class: 'tool', title: t.title, 'aria-pressed': 'false', 'aria-label': t.title });
    b.innerHTML = `${ICONS[t.id]}<span>${t.label}</span>`;
    b.addEventListener('click', () => (open === t.id ? close() : show(t.id)));
    buttons[t.id] = b;
    bar.append(b);
  }
  const pop = h('section', { class: 'popover glass', role: 'dialog', hidden: '' });
  const arrow = h('div', { class: 'popover-arrow', 'aria-hidden': 'true' });
  const body = h('div', { class: 'popover-body' });
  pop.append(arrow, body);
  const toastEl = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
  root.append(bar, pop, toastEl);
  document.body.append(root);

  let open = null;
  let coverKind = 'front';
  let cleanup = null;
  const narrow = window.matchMedia('(max-width: 640px)');

  // ---------- 打开 / 关闭面板 ----------
  function show(id) {
    cleanup?.();
    open = id;
    for (const [k, b] of Object.entries(buttons)) b.setAttribute('aria-pressed', String(k === id));
    pop.setAttribute('aria-label', TOOLS.find((t) => t.id === id).title);
    body.replaceChildren();
    body.scrollTop = 0;
    cleanup = PANELS[id]();
    pop.hidden = false;
    pop.classList.remove('is-in');
    void pop.offsetWidth; // 让弹出动画每次都重新播
    pop.classList.add('is-in');
    if (id === 'cover') {
      badge.setExplode(true);
      badge.select(coverKind);
    } else badge.setExplode(false);
    position();
  }

  function close() {
    if (!open) return;
    cleanup?.();
    cleanup = null;
    open = null;
    for (const b of Object.values(buttons)) b.setAttribute('aria-pressed', 'false');
    pop.hidden = true;
    badge.setExplode(false);
    badge.setViewInset({});
  }

  // 面板对准按钮；同时告诉 3D 场景哪块屏幕被挡住了，好把卡片挪到没被挡住的地方
  function position() {
    if (!open) return;
    if (narrow.matches) {
      badge.setViewInset({ bottom: window.innerHeight - pop.getBoundingClientRect().top });
      return;
    }
    const b = buttons[open].getBoundingClientRect();
    const center = b.top + b.height / 2;
    const ph = pop.offsetHeight;
    const top = Math.min(Math.max(16, center - ph / 2), window.innerHeight - ph - 16);
    pop.style.top = `${top}px`;
    arrow.style.top = `${center - top}px`;
    badge.setViewInset({ right: window.innerWidth - pop.getBoundingClientRect().left });
  }
  new ResizeObserver(position).observe(pop);
  window.addEventListener('resize', position);

  // 点面板外面就关掉（点到卡片不算，方便边改边看、拆开时点选某一页）
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (!open || e.target.closest?.('[data-ui]')) return;
      if (badge.hits(e.clientX, e.clientY)) return;
      close();
    },
    true,
  );
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  // 在 3D 里点了某一页
  badge.onPick((kind) => {
    coverKind = kind;
    badge.select(kind);
    if (open === 'cover') panelHooks.cover?.(kind);
  });

  let toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2800);
  }

  // ============================================================
  //  三个面板。每个返回一个"关掉时要做的清理"
  // ============================================================
  const panelHooks = {};

  const PANELS = {
    name() {
      const head = header('名字', () => store.reset('name'), () => store.isDefault('name'));
      const group = h('div', { class: 'group' });
      const field = (label, key, placeholder) => {
        const id = `lc-${key}`;
        const row = h('div', { class: 'row' });
        const input = h('input', { id, type: 'text', maxlength: '24', autocomplete: 'off', spellcheck: 'false', placeholder });
        input.addEventListener('input', () => store.setName({ [key]: input.value }));
        row.append(h('label', { for: id, text: label }), input);
        group.append(row);
        return input;
      };
      const line1 = field('第一行', 'line1', '比如 Your');
      const line2 = field('第二行', 'line2', '比如 Name');
      const colors = swatchRow(NAME_COLORS, () => store.state.accent, (c) => store.setName({ accent: c }), '第二行颜色');
      body.append(
        head.el,
        group,
        sectionLabel('第二行颜色'),
        colors.el,
        note('卡片上的名字和页面底部的大字会一起变。'),
      );

      const fill = () => {
        if (line1.value !== store.state.line1) line1.value = store.state.line1;
        if (line2.value !== store.state.line2) line2.value = store.state.line2;
        colors.update();
        head.update();
      };
      fill();
      if (!narrow.matches) requestAnimationFrame(() => line1.focus());
      return store.subscribe((what) => what === 'name' && fill());
    },

    cover() {
      const head = header('卡套', () => store.reset('page', coverKind), () => store.isDefault('page', coverKind));
      const seg = segmented(
        PAGE_KINDS.map((k) => [k, PAGE_LABELS[k]]),
        () => coverKind,
        (k) => {
          coverKind = k;
          badge.select(k);
          render();
        },
      );
      const content = h('div');
      const done = h('button', { type: 'button', class: 'btn-primary', text: '完成' });
      done.addEventListener('click', close);
      body.append(head.el, seg.el, content, done);

      let thumbs = [];
      let colors;
      let imageRow;

      function render() {
        seg.update();
        content.replaceChildren();

        const grid = h('div', { class: 'templates', role: 'radiogroup', 'aria-label': '模板' });
        thumbs = TEMPLATES[coverKind].map((t) => {
          const b = h('button', { type: 'button', class: 'tpl', role: 'radio', 'aria-label': t.label });
          const c = h('canvas', { width: THUMB[0], height: THUMB[1] });
          b.append(c, h('span', { text: t.label }));
          b.addEventListener('click', () => store.setPage(coverKind, { template: t.id }));
          grid.append(b);
          return { t, b, c };
        });
        colors = swatchRow(
          PAPER_COLORS,
          () => store.state.pages[coverKind].bg,
          (c) => store.setPage(coverKind, { bg: c }),
          '底色',
        );
        imageRow = h('div', { class: 'image-row' });
        content.append(
          sectionLabel('模板'),
          grid,
          sectionLabel('底色'),
          colors.el,
          sectionLabel('图片'),
          imageRow,
          note('带「照片」「全图」的模板会用上这张图。也可以直接点卡片上的某一页来切换。'),
        );
        refresh();
      }

      let version = 0;
      async function refresh() {
        const mine = ++version;
        const page = store.state.pages[coverKind];
        const img = await loadImage(page.image);
        if (mine !== version) return; // 等图片的时候又改了别的，以新的为准
        head.update();
        colors.update();
        const current = findTemplate(coverKind, page.template).id;
        for (const { t, b, c } of thumbs) {
          b.setAttribute('aria-checked', String(current === t.id));
          drawPage(c, coverKind, store.content, { ...page, template: t.id }, img);
        }
        renderImageRow(page);
      }

      function renderImageRow(page) {
        imageRow.replaceChildren();
        const file = h('input', { type: 'file', accept: 'image/*', hidden: '' });
        const upload = h('button', { type: 'button', class: 'btn', text: page.image ? '换一张…' : '上传图片…' });
        upload.addEventListener('click', () => file.click());
        file.addEventListener('change', async () => {
          const f = file.files?.[0];
          if (!f) return;
          const kind = coverKind;
          upload.disabled = true;
          upload.textContent = '处理中…';
          try {
            const image = await compressImage(f);
            // 当前模板用不到图片的话，自动换成「全图」，不然上传了看不到
            const usesImage = findTemplate(kind, store.state.pages[kind].template).usesImage;
            const ok = store.setPage(kind, usesImage ? { image } : { image, template: 'full' });
            if (!ok) toast('图片太大，浏览器存不下，刷新后会丢失');
          } catch {
            toast('这张图片打不开，换一张试试');
            upload.disabled = false;
            upload.textContent = '上传图片…';
          }
        });
        imageRow.append(file);
        if (page.image) imageRow.append(h('img', { class: 'image-thumb', src: page.image, alt: '' }));
        imageRow.append(upload);
        if (page.image) {
          const remove = h('button', { type: 'button', class: 'btn danger', text: '移除' });
          remove.addEventListener('click', () => {
            const kind = coverKind;
            // 正在用的模板需要图片的话，换回一个不需要图片的
            const usesImage = findTemplate(kind, store.state.pages[kind].template).usesImage;
            const plain = TEMPLATES[kind].find((t) => !t.usesImage).id;
            store.setPage(kind, usesImage ? { image: null, template: plain } : { image: null });
          });
          imageRow.append(remove);
        }
      }

      panelHooks.cover = () => render();
      render();
      const off = store.subscribe((what, kind) => {
        if ((what === 'page' && kind === coverKind) || what === 'name') refresh();
      });
      return () => {
        off();
        panelHooks.cover = null;
      };
    },

    strap() {
      const head = header('绳子颜色', () => store.reset('strap'), () => store.isDefault('strap'));
      const colors = swatchRow(STRAP_COLORS, () => store.state.strapColor, (c) => store.setStrap(c), '绳子颜色');
      colors.el.classList.add('large');
      body.append(head.el, colors.el, note('挂绳和金属扣上折回来的那一小截会一起变色。'));
      return store.subscribe((what) => {
        if (what !== 'strap') return;
        colors.update();
        head.update();
      });
    },
  };

  return { show, close };
}

// ============================================================
//  小组件
// ============================================================

function h(tag, attrs = {}) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v);
  }
  return el;
}

function sectionLabel(text) {
  return h('div', { class: 'section-label', text });
}

function note(text) {
  return h('p', { class: 'note', text });
}

// 面板标题 + 右边的「恢复默认」（已经是默认值时变灰）
function header(title, onReset, isDefault) {
  const el = h('header', { class: 'pop-head' });
  const reset = h('button', { type: 'button', class: 'link-btn', text: '恢复默认' });
  reset.addEventListener('click', onReset);
  el.append(h('h2', { text: title }), reset);
  const update = () => {
    reset.disabled = isDefault();
  };
  update();
  return { el, update };
}

// 分段控件：正面 | 明信片 | 背面
function segmented(options, get, set) {
  const el = h('div', { class: 'segmented', role: 'tablist' });
  el.style.setProperty('--n', options.length);
  const thumb = h('span', { class: 'seg-thumb', 'aria-hidden': 'true' });
  el.append(thumb);
  const items = options.map(([value, label], i) => {
    const b = h('button', { type: 'button', role: 'tab', text: label });
    b.addEventListener('click', () => set(value));
    el.append(b);
    return { value, b, i };
  });
  const update = () => {
    for (const { value, b, i } of items) {
      const on = value === get();
      b.setAttribute('aria-selected', String(on));
      if (on) thumb.style.transform = `translateX(${i * 100}%)`;
    }
  };
  update();
  return { el, update };
}

// 一排圆形色块 + 最后一个自定义颜色
function swatchRow(options, get, set, name) {
  const el = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': name });
  const items = options.map(([color, label]) => {
    const b = h('button', { type: 'button', class: 'swatch', role: 'radio', title: label, 'aria-label': label });
    b.style.setProperty('--c', color);
    b.addEventListener('click', () => set(color));
    el.append(b);
    return { color, b };
  });
  const well = h('label', { class: 'swatch well', title: '自定义颜色' });
  const input = h('input', { type: 'color', 'aria-label': '自定义颜色' });
  input.addEventListener('input', () => set(input.value));
  well.append(input);
  el.append(well);

  const update = () => {
    const current = String(get() || '').toLowerCase();
    let matched = false;
    for (const { color, b } of items) {
      const on = color.toLowerCase() === current;
      b.setAttribute('aria-checked', String(on));
      matched ||= on;
    }
    well.setAttribute('aria-checked', String(!matched));
    well.style.setProperty('--c', matched ? '#fff' : current);
    if (/^#[0-9a-f]{6}$/.test(current)) input.value = current;
  };
  update();
  return { el, update };
}
