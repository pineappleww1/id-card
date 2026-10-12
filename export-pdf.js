// 把卡套里的某一页导出成单独的 PDF（一页一个文件）。
// 做法：按打印精度把这一页画成一张高清图，再包成只有一页的 PDF。不靠第三方库。

import { drawPage, PAGE_KINDS, PAGE_LABELS } from './card-texture.js';
import { fullName, loadImage } from './store.js';

// 打印出来的实际尺寸（毫米），长宽比跟卡片上每页一样（1.49 : 2.2）
export const PRINT_MM = [59, 87.1];
// 按大约 600 DPI 画，打印出来字也清楚
const PRINT_PX = [1394, 2058];

export async function exportPagePdf(store, kind) {
  const page = store.state.pages[kind];
  const image = await loadImage(page.image);
  const canvas = document.createElement('canvas');
  [canvas.width, canvas.height] = PRINT_PX;
  drawPage(canvas, kind, store.content, page, image);

  const jpegBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  const jpeg = new Uint8Array(await jpegBlob.arrayBuffer());
  const name = fullName(store.state.line1, store.state.line2) || 'id-card';
  const pdf = jpegToPdf(jpeg, PRINT_PX, PRINT_MM, `${name} · ${PAGE_LABELS[kind]}`);
  download(pdf, `${safeFileName(name)}-${PAGE_LABELS[kind]}.pdf`);
}

// 三页各导出一个 PDF。连着下载时中间停一下，不然有的浏览器会漏掉
export async function exportAllPdfs(store) {
  for (const kind of PAGE_KINDS) {
    await exportPagePdf(store, kind);
    await new Promise((r) => setTimeout(r, 400));
  }
}

// ---------- 把一张 JPEG 包成一页 PDF ----------
// PDF 内部就是几段文字描述 + 图片原始数据，最后附一张"每段从第几个字节开始"的目录（xref）
export function jpegToPdf(jpeg, [pxW, pxH], [mmW, mmH], title) {
  const pt = (mm) => ((mm * 72) / 25.4).toFixed(2); // PDF 的长度单位是"点"，1 英寸 = 72 点
  const W = pt(mmW);
  const H = pt(mmH);
  const encoder = new TextEncoder();
  const parts = [];
  const offsets = [];
  let length = 0;
  const push = (chunk) => {
    const bytes = typeof chunk === 'string' ? encoder.encode(chunk) : chunk;
    parts.push(bytes);
    length += bytes.length;
  };
  const object = (n, ...chunks) => {
    offsets[n] = length;
    push(`${n} 0 obj\n`);
    chunks.forEach(push);
    push('\nendobj\n');
  };

  const draw = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`; // 把图片铺满整页
  push('%PDF-1.4\n%âãÏÓ\n');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  object(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
  );
  object(
    4,
    `<< /Type /XObject /Subtype /Image /Width ${pxW} /Height ${pxH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
    jpeg,
    '\nendstream',
  );
  object(5, `<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`);
  object(6, `<< /Title ${pdfText(title)} /Producer (Lin-creat) >>`);

  const xref = length;
  const rows = offsets.slice(1).map((o) => `${String(o).padStart(10, '0')} 00000 n \n`);
  push(`xref\n0 7\n0000000000 65535 f \n${rows.join('')}`);
  push(`trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: 'application/pdf' });
}

// PDF 里放中文标题要转成 UTF-16 的十六进制
function pdfText(text) {
  let hex = 'FEFF';
  for (let i = 0; i < text.length; i++) hex += text.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase();
  return `<${hex}>`;
}

function safeFileName(name) {
  return name.replace(/[\\/:*?"<>|]+/g, '').trim() || 'id-card';
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
