// 黄金分割自适应字号:取所有字段中最长的一行,计算使其渲染宽度 = 纸张宽度 / φ 的字号。
// 其他字段沿用同一字号。切换纸张方向/对折时由 EditorView 重新调用计算。
import type { Content, PrintLayout } from 'shared';

/** 黄金比 φ ≈ 1.618;目标文本宽度 = 纸宽 / φ ≈ 61.8% 纸宽。 */
const GOLDEN = 1.618033988749895;

/** A4 纸张宽度(mm)。对折只影响高度,不影响宽度,故仅看方向。 */
function sheetWidthMm(layout: PrintLayout): number {
  return layout.orientation === 'landscape' ? 297 : 210;
}

/** 收集所有字段文本,按 \n 拆分,返回字符数最多的一行。 */
function longestLine(content: Content): string {
  const lines: string[] = [];
  if (content.type === 'contact') {
    lines.push(...content.location.text.split('\n'));
    lines.push(...content.phone.text.split('\n'));
    lines.push(...content.contact.text.split('\n'));
  } else {
    lines.push(...content.text.text.split('\n'));
  }
  let best = '';
  for (const l of lines) if (l.length > best.length) best = l;
  return best;
}

let canvas: HTMLCanvasElement | null = null;

/**
 * 计算黄金分割自适应字号(pt)。
 *
 * 原理:Canvas measureText 在参考字号下量得文本宽度,字号与文本宽度成线性关系,
 * 故目标字号 = 参考字号 × 目标宽度 / 参考宽度。
 *
 * @returns 字号(pt);无文本或无法测量时返回 null。
 */
export function computeGoldenFontSize(content: Content, layout: PrintLayout): number | null {
  const line = longestLine(content);
  if (!line.trim()) return null;
  if (typeof document === 'undefined') return null;
  if (!canvas) canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const targetMm = sheetWidthMm(layout) / GOLDEN; // 目标文本宽度(mm)
  const refPt = 72; // 参考字号:72pt = 1 inch,便于换算
  // canvas 字号用 px:1pt = 96/72 px
  ctx.font = `${(refPt * 96) / 72}px sans-serif`;
  const refPx = ctx.measureText(line).width;
  if (refPx <= 0) return null;
  // 参考宽度 px → mm:1px = 25.4/96 mm
  const refMm = (refPx * 25.4) / 96;
  // 线性缩放:width(fs) = refMm × fs / refPt → fs = targetMm × refPt / refMm
  return (targetMm * refPt) / refMm;
}
