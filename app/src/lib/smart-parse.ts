// 规则启发式智能识别:把一段粘贴文本拆分到 地点/电话/联系人 三框。
// 基线方案,零下载、即时。后续可叠加 Transformers.js NER 懒加载增强(见 plan §6)。

export interface ParsedFields {
  location: string;
  phone: string;
  contact: string;
}

// 中国手机(可带 +86/0086 前缀)、座机、400/800、国际号码。
const PHONE_RE =
  /(?:\+86[-\s]?|0086[-\s]?)?1[3-9]\d{9}|0\d{2,3}[-\s]?\d{7,8}|[48]00[-\s]?\d{3}[-\s]?\d{4}|\+\d[\d\s-]{5,}\d/g;

// 地址关键词。命中其一即倾向判为地址。
const ADDR_RE =
  /省|市|区|县|镇|乡|村|街道|路|大道|大街|街|号|室|栋|幢|层|楼|大厦|广场|开发区|工业区|小区|弄|巷|单元/;

// 一行内的强分隔(多个空格 / 斜杠 / 中文顿号 / 中文逗号),用于拆"一行混排"。
const SEG_RE = /\s{2,}|\s*\/\s*|\s*、\s*|\s*，\s*|\s*,\s*/;

/**
 * 解析粘贴文本。流程:
 * 1. 全局抽出所有电话号码 → phone 框(从原文移除,避免误判为地址)。
 * 2. 剩余按行 + 强分隔切分成段,逐段归类:
 *    - 命中地址关键词 → location
 *    - 无数字且较短(≤6 字) → contact(姓名启发式)
 *    - 其余含数字(门牌等)或较长 → location
 */
export function smartParse(raw: string): ParsedFields {
  const phones: string[] = [];
  const locations: string[] = [];
  const contacts: string[] = [];

  // 1. 抽电话(电话位移除,留空格作分隔)
  const text = raw.replace(PHONE_RE, (m) => {
    phones.push(m.trim());
    return '  ';
  });

  // 2. 逐行 → 分段 → 归类
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const segs = trimmed.split(SEG_RE).map((s) => s.trim()).filter(Boolean);
    for (const seg of segs) {
      const compact = seg.replace(/\s+/g, '');
      if (!compact) continue;
      const hasDigit = /\d/.test(seg);
      const isAddr = ADDR_RE.test(seg);
      const isShort = compact.length <= 6;
      if (isAddr) {
        locations.push(seg);
      } else if (!hasDigit && isShort) {
        contacts.push(seg);
      } else {
        // 含数字(非电话,如门牌)或较长无数字串 → 归地址/备注
        locations.push(seg);
      }
    }
  }

  return {
    location: locations.join('\n'),
    phone: phones.join('\n'),
    contact: contacts.join('\n'),
  };
}
