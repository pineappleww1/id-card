// 卡套里三页（正面、明信片、背面）的画法，以及卡套表面、挂绳的纹理。
// 每一页都是先用 canvas 画成图片，再贴到 3D 卡片上；工具栏里的模板缩略图也用同一套画法。

const SERIF = `'Newsreader', 'Songti SC', 'STSong', 'SimSun', serif`;
const SANS = `-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', sans-serif`;

export const PAGE_KINDS = ['front', 'postcard', 'back'];
export const PAGE_LABELS = { front: '正面', postcard: '明信片', back: '背面' };

// 每一页可以选的预设模板。usesImage = 这个模板会用到上传的图片
export const TEMPLATES = {
  front: [
    { id: 'classic', label: '经典' },
    { id: 'bigname', label: '大字' },
    { id: 'photo', label: '照片', usesImage: true },
    { id: 'full', label: '全图', usesImage: true },
  ],
  postcard: [
    { id: 'postcard', label: '明信片' },
    { id: 'snapshot', label: '照片明信片', usesImage: true },
    { id: 'letter', label: '信纸' },
    { id: 'full', label: '全图', usesImage: true },
  ],
  back: [
    { id: 'message', label: '一句话' },
    { id: 'monogram', label: '印章' },
    { id: 'full', label: '全图', usesImage: true },
  ],
};

export function findTemplate(kind, id) {
  return TEMPLATES[kind].find((t) => t.id === id) ?? TEMPLATES[kind][0];
}

// 画一页。canvas 多大都行（贴到 3D 上的大图、工具栏里的小缩略图都走这里）
// content：名字、标签等文字；page：{ template, bg }；image：已经加载好的图片，没有就传 null
export function drawPage(canvas, kind, content, page, image) {
  const g = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  g.save();
  g.clearRect(0, 0, W, H);
  const theme = themeFor(page.bg, content.accent);
  paintPaper(g, W, H, theme);
  DRAW[kind][findTemplate(kind, page.template).id](g, W, H, content, theme, image);
  g.restore();
}

// ============================================================
//  各个模板
// ============================================================

const DRAW = {
  front: {
    classic(g, W, H, c, th) {
      const pad = W * 0.085;
      const maxW = W - pad * 2;
      const size = fitSize(g, [c.line1, c.line2], 500, maxW, W * 0.27, W * 0.08);
      const cjk = isCJK(c.line1 + c.line2);
      const first = pad * 0.9 + size * (cjk ? 0.9 : 0.78);
      const gap = size * (cjk ? 1.05 : 0.78);
      printedName(g, W, H, c, th, pad, first, gap, size);
      details(g, W, H, c, th, pad);
    },

    bigname(g, W, H, c, th) {
      const pad = W * 0.085;
      const maxW = W - pad * 2;
      const labelSize = W * 0.042;
      label(g, c.currentlyLabel, pad, pad + labelSize, labelSize, th.ink);
      bodyText(g, c.currently, pad, pad + labelSize * 2.5, W * 0.04, th.sub, maxW);
      pills(g, c.tags, pad, pad + labelSize * 3.6, maxW, W * 0.036, th);

      const size = fitSize(g, [c.line1, c.line2], 500, maxW, W * 0.46, W * 0.1);
      const cjk = isCJK(c.line1 + c.line2);
      const gap = size * (cjk ? 1.04 : 0.8);
      const second = H - pad * 1.15 - (cjk ? 0 : size * 0.12);
      printedName(g, W, H, c, th, pad, second - gap, gap, size);
    },

    photo(g, W, H, c, th, image) {
      const pad = W * 0.07;
      const maxW = W - pad * 2;
      const imgH = H * 0.56;
      imageArea(g, image, pad, pad, maxW, imgH, W * 0.018, th, W);

      const size = fitSize(g, [c.line1, c.line2], 500, maxW, W * 0.14, W * 0.06);
      const cjk = isCJK(c.line1 + c.line2);
      const first = pad + imgH + pad * 0.7 + size * (cjk ? 0.9 : 0.78);
      printedName(g, W, H, c, th, pad, first, size * (cjk ? 1.05 : 0.82), size);
      const pillSize = W * 0.036;
      const rows = layoutPills(g, c.tags, pillSize, maxW);
      pills(g, c.tags, pad, H - pad - rows.length * pillSize * 2.21 + pillSize * 0.51, maxW, pillSize, th);
    },

    full(g, W, H, c, th, image) {
      imageArea(g, image, 0, 0, W, H, 0, th, W);
    },
  },

  postcard: {
    postcard(g, W, H, c, th) {
      const pad = W * 0.08;
      g.fillStyle = th.ink;
      g.font = `600 ${W * 0.04}px ${SERIF}`;
      tracked(g, 'POSTCARD', pad, pad + W * 0.045, W * 0.014);

      const sw = W * 0.22;
      const sh = W * 0.27;
      const sx = W - pad - sw;
      const sy = pad * 0.75;
      stamp(g, sx, sy, sw, sh, c, th);
      postmark(g, sx - W * 0.015, sy + sh * 0.78, W * 0.1, W, th);

      const msgSize = W * 0.075;
      g.font = `italic 400 ${msgSize}px ${SERIF}`;
      g.fillStyle = th.ink;
      const lines = wrap(g, c.postcard, W - pad * 2);
      let y = H * 0.32;
      for (const line of lines.slice(0, 4)) {
        g.fillText(line, pad, y);
        y += msgSize * 1.15;
      }
      g.font = `italic 500 ${W * 0.05}px ${SERIF}`;
      g.fillStyle = th.accent;
      g.fillText(`— ${fullName(c)}`, pad, y + W * 0.02, W - pad * 2);

      const divider = H * 0.6;
      rule(g, pad, W - pad, divider, W * 0.0025, th.faint);
      g.font = `italic 500 ${W * 0.042}px ${SERIF}`;
      g.fillStyle = th.sub;
      g.fillText('To', pad, divider + W * 0.11);
      for (let i = 0; i < 4; i++) {
        const ly = divider + W * 0.15 + i * W * 0.1;
        rule(g, pad + (i === 0 ? W * 0.08 : 0), W - pad, ly, W * 0.002, th.faint);
      }
    },

    snapshot(g, W, H, c, th, image) {
      const pad = W * 0.07;
      const imgH = H * 0.66;
      imageArea(g, image, pad, pad, W - pad * 2, imgH, 0, th, W);
      g.font = `italic 400 ${W * 0.05}px ${SERIF}`;
      g.fillStyle = th.sub;
      g.fillText('Greetings from', pad, pad + imgH + W * 0.12);
      const size = fitSize(g, [fullName(c)], 500, W - pad * 2, W * 0.11, W * 0.05);
      g.font = `500 ${size}px ${SERIF}`;
      g.fillStyle = th.accent;
      g.fillText(fullName(c), pad, pad + imgH + W * 0.12 + size * 1.05);
    },

    letter(g, W, H, c, th) {
      const pad = W * 0.08;
      const step = W * 0.078;
      const top = H * 0.17;
      for (let y = top; y < H - pad * 0.4; y += step) rule(g, 0, W, y, W * 0.002, th.faint);
      g.strokeStyle = withAlpha(th.accent, 0.55);
      g.lineWidth = W * 0.003;
      g.beginPath();
      g.moveTo(pad + W * 0.05, 0);
      g.lineTo(pad + W * 0.05, H);
      g.stroke();

      g.font = `600 ${W * 0.034}px ${SERIF}`;
      g.fillStyle = th.sub;
      tracked(g, 'NO. 01', W - pad - W * 0.2, pad + W * 0.02, W * 0.008);

      const x = pad + W * 0.1;
      const size = W * 0.056;
      g.font = `italic 400 ${size}px ${SERIF}`;
      const lines = ['Dear friend,', ...wrap(g, c.postcard, W - x - pad)];
      lines.slice(0, 8).forEach((line, i) => {
        g.fillStyle = th.ink;
        g.fillText(line, x, top + step * (i + 1) - W * 0.016);
      });
      g.fillStyle = th.accent;
      g.fillText(`— ${fullName(c)}`, x, top + step * (Math.min(lines.length, 8) + 2) - W * 0.016, W - x - pad);
    },

    full(g, W, H, c, th, image) {
      imageArea(g, image, 0, 0, W, H, 0, th, W);
    },
  },

  back: {
    message(g, W, H, c, th) {
      let size = W * 0.2;
      g.font = `italic 500 ${size}px ${SERIF}`;
      while (size > W * 0.06 && g.measureText(c.back).width > W * 0.8) {
        size -= W * 0.004;
        g.font = `italic 500 ${size}px ${SERIF}`;
      }
      g.fillStyle = th.accent;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(c.back, W / 2, H / 2);
      g.textAlign = 'left';
      g.textBaseline = 'alphabetic';
    },

    monogram(g, W, H, c, th) {
      const step = W * 0.06;
      g.fillStyle = th.faint;
      for (let y = step / 2; y < H; y += step) {
        for (let x = step / 2; x < W; x += step) {
          g.beginPath();
          g.arc(x, y, W * 0.0045, 0, Math.PI * 2);
          g.fill();
        }
      }
      const R = W * 0.25;
      const cx = W / 2;
      const cy = H * 0.44;
      g.fillStyle = th.bg;
      g.beginPath();
      g.arc(cx, cy, R * 1.08, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = th.accent;
      g.lineWidth = W * 0.008;
      g.beginPath();
      g.arc(cx, cy, R, 0, Math.PI * 2);
      g.stroke();
      g.lineWidth = W * 0.003;
      g.beginPath();
      g.arc(cx, cy, R * 0.86, 0, Math.PI * 2);
      g.stroke();

      g.fillStyle = th.accent;
      g.font = `italic 500 ${R * 0.78}px ${SERIF}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(initials(c), cx, cy + R * 0.04);
      g.textBaseline = 'alphabetic';
      g.textAlign = 'left';

      g.fillStyle = th.ink;
      g.font = `600 ${W * 0.038}px ${SERIF}`;
      const name = fullName(c).toUpperCase();
      const tw = trackedWidth(g, name, W * 0.012);
      tracked(g, name, cx - tw / 2, cy + R + W * 0.16, W * 0.012);
    },

    full(g, W, H, c, th, image) {
      imageArea(g, image, 0, 0, W, H, 0, th, W);
    },
  },
};

// ============================================================
//  卡套表面、挂绳纹理（跟三页无关）
// ============================================================

// 透明卡套表面的细节：外框、两个圆孔、中间的长孔、封口的两条线
export function drawHolderFace(width, height, spec) {
  const canvas = makeCanvas(width, height);
  const g = canvas.getContext('2d');
  const s = width / spec.w; // 世界单位 → 像素
  const line = (alpha, w = 2) => {
    g.strokeStyle = `rgba(150, 156, 163, ${alpha})`;
    g.lineWidth = w;
  };

  // 外框（两圈，模拟塑料边缘的厚度）
  line(0.55, 3);
  g.beginPath();
  g.roundRect(3, 3, width - 6, height - 6, spec.radius * s);
  g.stroke();
  line(0.3, 2);
  g.beginPath();
  g.roundRect(14, 14, width - 28, height - 28, spec.radius * s * 0.7);
  g.stroke();

  // 圆孔
  line(0.6, 3);
  for (const side of [-1, 1]) {
    g.beginPath();
    g.arc(width / 2 + side * spec.holeX * s, spec.holeY * s, spec.holeR * s, 0, Math.PI * 2);
    g.stroke();
  }
  // 中间长孔
  g.beginPath();
  g.roundRect(
    width / 2 - (spec.slotW / 2) * s,
    spec.slotY * s - (spec.slotH / 2) * s,
    spec.slotW * s,
    spec.slotH * s,
    (spec.slotH / 2) * s,
  );
  g.stroke();

  // 封口：两条横线 + 中间一点磨砂感
  const y1 = spec.sealY * s;
  const y2 = (spec.sealY + spec.sealH) * s;
  g.fillStyle = 'rgba(205, 210, 215, 0.22)';
  g.fillRect(14, y1, width - 28, y2 - y1);
  line(0.45, 2);
  for (const y of [y1, y2]) {
    g.beginPath();
    g.moveTo(14, y);
    g.lineTo(width - 14, y);
    g.stroke();
  }
  return canvas;
}

// 挂绳的织带纹理（很淡的横纹）
export function drawStrapWeave() {
  const canvas = makeCanvas(32, 64);
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, 32, 64);
  for (let y = 0; y < 64; y += 4) {
    g.fillStyle = `rgba(0,0,0,${0.08 + Math.random() * 0.05})`;
    g.fillRect(0, y, 32, 1.5);
  }
  g.fillStyle = 'rgba(0,0,0,0.12)';
  g.fillRect(0, 0, 2, 64);
  g.fillRect(30, 0, 2, 64);
  return canvas;
}

// ============================================================
//  小工具
// ============================================================

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// 底色深的时候，字自动换成浅色
function themeFor(bg, accent) {
  const dark = luminance(bg) < 0.45;
  return dark
    ? { bg, accent, dark, ink: '#f3f3f0', sub: 'rgba(243,243,240,0.72)', faint: 'rgba(243,243,240,0.2)' }
    : { bg, accent, dark, ink: '#141414', sub: '#3a3a3a', faint: 'rgba(20,20,20,0.14)' };
}

function luminance(hex) {
  let h = String(hex).replace('#', '');
  if (h.length === 3) h = [...h].map((ch) => ch + ch).join('');
  const n = parseInt(h.slice(0, 6), 16) || 0;
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}

function withAlpha(hex, a) {
  let h = String(hex).replace('#', '');
  if (h.length === 3) h = [...h].map((ch) => ch + ch).join('');
  const n = parseInt(h.slice(0, 6), 16) || 0;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// 纸张底色 + 一点点颗粒，免得太"电子"
function paintPaper(g, w, h, th) {
  g.fillStyle = th.bg;
  g.fillRect(0, 0, w, h);
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(255,255,255,0.06)');
  grad.addColorStop(1, 'rgba(0,0,0,0.035)');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  const dot = Math.max(1, w / 680);
  for (let i = 0, n = Math.round((w * h) / 170); i < n; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.035)' : 'rgba(255,255,255,0.3)';
    g.fillRect(Math.random() * w, Math.random() * h, dot, dot);
  }
}

const isCJK = (s) => /[　-鿿＀-￯]/.test(s || '');
const fullName = (c) => (isCJK(c.line1 + c.line2) ? `${c.line1}${c.line2}` : `${c.line1} ${c.line2}`).trim();
const initials = (c) => `${[...(c.line1 || ' ')][0]}${[...(c.line2 || '')][0] || ''}`.trim();

// 找一个字号，让几行字里最宽的那行刚好放得下
function fitSize(g, lines, weight, maxWidth, maxSize, minSize) {
  let size = maxSize;
  const widest = () => {
    g.font = `${weight} ${size}px ${SERIF}`;
    return Math.max(...lines.map((l) => g.measureText(l || '').width));
  };
  while (size > minSize && widest() > maxWidth) size -= maxSize * 0.02;
  return size;
}

// 两行名字，带印刷的粗糙感
function printedName(g, W, H, c, th, x, firstBaseline, gap, size) {
  const ink = offscreen(W, H);
  const o = ink.getContext('2d');
  o.clearRect(0, 0, W, H);
  o.font = `500 ${size}px ${SERIF}`;
  o.fillStyle = th.ink;
  o.fillText(c.line1, x, firstBaseline);
  o.fillStyle = th.accent;
  o.fillText(c.line2, x, firstBaseline + gap);
  speckle(o, W, firstBaseline - size, firstBaseline + gap + size * 0.4);
  g.drawImage(ink, 0, 0);
}

const offscreens = new Map();
function offscreen(w, h) {
  const key = `${w}x${h}`;
  if (!offscreens.has(key)) offscreens.set(key, makeCanvas(w, h));
  return offscreens.get(key);
}

// 在字上抠掉一些小白点，像印刷/丝网印出来的粗糙感
function speckle(g, w, top, bottom) {
  const k = w / 1024;
  g.save();
  g.globalCompositeOperation = 'destination-out';
  const n = Math.round((5.4 * w * Math.max(0, bottom - top)) / 1024);
  for (let i = 0; i < n; i++) {
    g.globalAlpha = 0.35 + Math.random() * 0.65;
    g.beginPath();
    g.arc(Math.random() * w, top + Math.random() * (bottom - top), (Math.random() * 1.6 + 0.4) * k, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

// 经典模板下半部分：Currently / Previously / 标签，从底往上排
function details(g, W, H, c, th, pad) {
  const maxW = W - pad * 2;
  const labelSize = W * 0.042;
  const bodySize = W * 0.04;
  const pillSize = W * 0.036;
  const pillH = pillSize * 1.7;
  const rows = layoutPills(g, c.tags, pillSize, maxW);
  const pillsTop = H - pad * 0.95 - rows.length * pillH * 1.3 + pillH * 0.3;
  pills(g, c.tags, pad, pillsTop, maxW, pillSize, th);

  const prevY = pillsTop - pillH * 0.45;
  label(g, c.previouslyLabel, pad, prevY, labelSize, th.ink);
  const currentY = prevY - labelSize * 1.9;
  bodyText(g, c.currently, pad, currentY, bodySize, th.sub, maxW);
  label(g, c.currentlyLabel, pad, currentY - bodySize * 1.55, labelSize, th.ink);
}

function label(g, text, x, y, size, color) {
  g.fillStyle = color;
  g.font = `italic 600 ${size}px ${SERIF}`;
  g.fillText(text || '', x, y);
}

function bodyText(g, text, x, y, size, color, maxW) {
  g.fillStyle = color;
  g.font = `400 ${size}px ${SERIF}`;
  g.fillText(text || '', x, y, maxW);
}

// 彩色小标签，放不下自动换行
function pills(g, tags, x0, y0, maxW, size, th) {
  const pillH = size * 1.7;
  layoutPills(g, tags, size, maxW).forEach((row, r) => {
    const y = y0 + r * pillH * 1.3;
    row.forEach(({ x, w, tag }) => {
      g.fillStyle = tag.color;
      g.beginPath();
      g.roundRect(x0 + x, y, w, pillH, pillH / 2);
      g.fill();
      if (th.dark) {
        g.strokeStyle = 'rgba(255,255,255,0.25)';
        g.lineWidth = Math.max(1, size * 0.04);
        g.stroke();
      }
      g.fillStyle = '#fff';
      g.font = `500 ${size}px ${SERIF}`;
      g.textBaseline = 'middle';
      g.fillText(tag.text, x0 + x + pillH * 0.42, y + pillH * 0.54);
      g.textBaseline = 'alphabetic';
    });
  });
}

function layoutPills(g, tags = [], size, maxWidth) {
  const pillH = size * 1.7;
  g.font = `500 ${size}px ${SERIF}`;
  const gap = pillH * 0.28;
  const rows = [[]];
  let x = 0;
  for (const tag of tags) {
    const w = g.measureText(tag.text).width + pillH * 0.84;
    if (x > 0 && x + w > maxWidth) {
      rows.push([]);
      x = 0;
    }
    rows[rows.length - 1].push({ x, w, tag });
    x += w + gap;
  }
  return rows.filter((r) => r.length);
}

// 按宽度把一段话折成几行（中文按字折，英文按词折）
function wrap(g, text = '', maxW) {
  const tokens = isCJK(text) ? [...text] : text.split(' ');
  const glue = isCJK(text) ? '' : ' ';
  const lines = [];
  let line = '';
  for (const t of tokens) {
    const next = line ? line + glue + t : t;
    if (line && g.measureText(next).width > maxW) {
      lines.push(line);
      line = t;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function tracked(g, text, x, y, spacing) {
  for (const ch of text) {
    g.fillText(ch, x, y);
    x += g.measureText(ch).width + spacing;
  }
}

function trackedWidth(g, text, spacing) {
  let w = 0;
  for (const ch of text) w += g.measureText(ch).width + spacing;
  return w - spacing;
}

function rule(g, x1, x2, y, width, color) {
  g.strokeStyle = color;
  g.lineWidth = width;
  g.beginPath();
  g.moveTo(x1, y);
  g.lineTo(x2, y);
  g.stroke();
}

// 邮票：白色齿孔边 + 强调色的票面 + 名字缩写
function stamp(g, x, y, w, h, c, th) {
  g.fillStyle = th.dark ? '#2b2b2b' : '#ffffff';
  g.fillRect(x, y, w, h);
  const r = w * 0.04;
  g.fillStyle = th.bg;
  const punch = (px, py) => {
    g.beginPath();
    g.arc(px, py, r, 0, Math.PI * 2);
    g.fill();
  };
  for (let i = 0; i <= 8; i++) {
    punch(x + (w * i) / 8, y);
    punch(x + (w * i) / 8, y + h);
  }
  for (let i = 0; i <= 10; i++) {
    punch(x, y + (h * i) / 10);
    punch(x + w, y + (h * i) / 10);
  }
  const inset = w * 0.13;
  g.fillStyle = th.accent;
  g.fillRect(x + inset, y + inset, w - inset * 2, h - inset * 2);
  g.fillStyle = '#fff';
  g.font = `italic 500 ${w * 0.36}px ${SERIF}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(initials(c), x + w / 2, y + h / 2);
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
}

// 邮戳：两个圈 + 几道波浪线
function postmark(g, cx, cy, R, W, th) {
  g.strokeStyle = th.dark ? 'rgba(243,243,240,0.4)' : 'rgba(20,20,20,0.32)';
  g.lineWidth = W * 0.004;
  for (const r of [R, R * 0.72]) {
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.stroke();
  }
  for (let i = -1; i <= 1; i++) {
    g.beginPath();
    for (let t = 0; t <= 1.0001; t += 0.02) {
      const px = cx + R * 1.2 + t * W * 0.26;
      const py = cy + i * R * 0.4 + Math.sin(t * Math.PI * 4) * R * 0.08;
      if (t === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.stroke();
  }
}

// 放图片的区域：有图就铺满裁切，没图就画一个"等你上传"的占位
function imageArea(g, image, x, y, w, h, radius, th, W) {
  g.save();
  g.beginPath();
  g.roundRect(x, y, w, h, radius);
  g.clip();
  if (image) {
    const iw = image.naturalWidth || image.width;
    const ih = image.naturalHeight || image.height;
    const s = Math.max(w / iw, h / ih);
    g.drawImage(image, x + (w - iw * s) / 2, y + (h - ih * s) / 2, iw * s, ih * s);
  } else {
    g.fillStyle = th.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.045)';
    g.fillRect(x, y, w, h);
    g.strokeStyle = th.faint;
    g.lineWidth = W * 0.003;
    for (let d = -h; d < w; d += W * 0.05) {
      g.beginPath();
      g.moveTo(x + d, y + h);
      g.lineTo(x + d + h, y);
      g.stroke();
    }
    const cx = x + w / 2;
    const cy = y + h / 2 - W * 0.03;
    const s = W * 0.09;
    g.fillStyle = th.bg;
    g.beginPath();
    g.roundRect(cx - s * 1.4, cy - s, s * 2.8, s * 2.6, s * 0.3);
    g.fill();
    g.strokeStyle = th.sub;
    g.lineWidth = W * 0.006;
    g.lineJoin = 'round';
    g.beginPath();
    g.roundRect(cx - s, cy - s * 0.7, s * 2, s * 1.5, s * 0.2);
    g.stroke();
    g.beginPath();
    g.moveTo(cx - s, cy + s * 0.6);
    g.lineTo(cx - s * 0.3, cy);
    g.lineTo(cx + s * 0.2, cy + s * 0.45);
    g.lineTo(cx + s * 0.5, cy + s * 0.2);
    g.lineTo(cx + s, cy + s * 0.65);
    g.stroke();
    g.beginPath();
    g.arc(cx + s * 0.45, cy - s * 0.25, s * 0.16, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = th.sub;
    g.font = `500 ${W * 0.042}px ${SANS}`;
    g.textAlign = 'center';
    g.fillText('上传图片', cx, cy + s * 1.35);
    g.textAlign = 'left';
  }
  g.restore();
}
