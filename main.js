import '@fontsource/newsreader/400.css';
import '@fontsource/newsreader/400-italic.css';
import '@fontsource/newsreader/500.css';
import '@fontsource/newsreader/500-italic.css';
import '@fontsource/newsreader/600.css';
import '@fontsource/newsreader/600-italic.css';
import './style.css';
import './toolbar.css';
import { people, feel } from './config.js';
import { createBadge } from './badge.js';
import { createStore, fullName, loadImage } from './store.js';
import { createToolbar } from './toolbar.js';
import { PAGE_KINDS } from './card-texture.js';

// 网址里的 ?p=xxx 决定显示谁；没写或写错就显示第一个人
const id = new URLSearchParams(location.search).get('p');
const person = people.find((p) => p.id === id) ?? people[0];
const store = createStore(person, feel);

document.getElementById('top-left').textContent = person.topLeft;
document.getElementById('top-right').textContent = person.topRight;
const more = document.getElementById('more');
if (person.moreLink) more.href = person.moreLink;
else more.remove();

const marquee = createMarquee(feel.marqueeSecondsPerName);
const showName = () => {
  marquee.setName(store.state.line1, store.state.line2);
  document.title = fullName(store.state.line1, store.state.line2) || 'Lin-creat';
};
showName();
start();

async function start() {
  // 卡面是用 canvas 画的，要等字体真的加载好再画，不然会先用系统字体画上去
  const fonts = [
    '400 40px Newsreader',
    'italic 400 40px Newsreader',
    '500 120px Newsreader',
    'italic 500 120px Newsreader',
    '600 40px Newsreader',
    'italic 600 40px Newsreader',
  ];
  await Promise.all(fonts.map((f) => document.fonts.load(f).catch(() => null)));
  // 存过的图片也先解码好，第一帧就能画出来
  const images = await Promise.all(PAGE_KINDS.map((k) => loadImage(store.state.pages[k].image)));

  const badge = await createBadge(document.getElementById('stage'), { ...feel, strapColor: store.state.strapColor });
  if (!badge) return;
  PAGE_KINDS.forEach((k, i) => badge.setPage(k, store.content, store.state.pages[k], images[i]));

  // 改了什么就重画什么；连续改（比如拖颜色）时一帧只画一次
  const pending = new Set();
  const redraw = (kinds) => {
    if (!pending.size) requestAnimationFrame(flush);
    kinds.forEach((k) => pending.add(k));
  };
  async function flush() {
    const kinds = [...pending];
    pending.clear();
    for (const k of kinds) {
      const page = store.state.pages[k];
      badge.setPage(k, store.content, page, await loadImage(page.image));
    }
  }

  store.subscribe((what, kind) => {
    if (what === 'name') {
      showName();
      redraw(PAGE_KINDS);
    }
    if (what === 'strap') badge.setStrapColor(store.state.strapColor);
    if (what === 'page') redraw([kind]);
  });

  createToolbar({ store, badge });
}

// 底部大字。
// 固定模式：名字只放一遍，字号自动调到刚好铺满屏幕宽。
//   手机竖屏上屏幕太窄，一行放不大，就把两行名字上下叠起来，每行都尽量铺满。
// 滚动模式：把名字重复到够铺满两屏宽，整条往左移一半再从头来，看起来就是无缝循环。
function createMarquee(secondsPerName) {
  const STACK_LINE_HEIGHT = 0.88; // 跟 style.css 里 .marquee.stacked 的行高一致
  const track = document.getElementById('marquee-track');
  const box = track.parentElement;
  const phonePortrait = window.matchMedia('(max-width: 640px) and (orientation: portrait)');
  let lines = ['', ''];
  let text = '';

  const render = () => {
    if (!(secondsPerName > 0)) {
      const stacked = phonePortrait.matches && lines.filter(Boolean).length === 2;
      box.classList.toggle('stacked', stacked);
      const spans = (stacked ? lines : [text || ' ']).map((t) => {
        const span = document.createElement('span');
        span.textContent = t;
        span.style.paddingRight = '0';
        return span;
      });
      track.replaceChildren(...spans);
      track.style.animation = 'none';
      box.style.fontSize = '';
      const style = getComputedStyle(box);
      const base = parseFloat(style.fontSize);
      const widest = Math.max(1, ...spans.map((s) => s.getBoundingClientRect().width));
      let size = (base * window.innerWidth) / widest;
      if (stacked) {
        // 大名字最高只到屏幕高度的 58% 处，免得被卡片整个盖住
        const room = window.innerHeight * 0.42 - parseFloat(style.bottom);
        size = Math.min(size, room / (2 * STACK_LINE_HEIGHT));
      } else size = Math.min(size, window.innerHeight * 0.45);
      box.style.fontSize = `${size}px`;
      return;
    }

    track.replaceChildren();
    const probe = document.createElement('span');
    probe.textContent = text;
    track.append(probe);
    const oneWidth = probe.getBoundingClientRect().width || 1;
    const perHalf = Math.ceil(window.innerWidth / oneWidth) + 1;

    track.replaceChildren();
    for (let i = 0; i < perHalf * 2; i++) {
      const span = document.createElement('span');
      span.textContent = text;
      track.append(span);
    }
    track.style.setProperty('--marquee-duration', `${secondsPerName * perHalf}s`);
  };

  document.fonts.ready.then(render);
  phonePortrait.addEventListener('change', render);
  let timer;
  window.addEventListener('resize', () => {
    clearTimeout(timer);
    timer = setTimeout(render, 150);
  });

  return {
    setName(line1, line2) {
      lines = [line1.trim(), line2.trim()];
      text = fullName(line1, line2);
      render();
    },
  };
}
