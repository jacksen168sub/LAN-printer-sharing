// 模板注册表(扩展点):新增模板 = 加一个 Editor/Renderer + 在此注册一行。
// 上层(EditView/PrintSheet)只依赖此表,不针对具体模板类型写分支。
import type { Component } from 'vue';
import type { Content, ContentType, FieldStyle, PrintLayout } from 'shared';
import ContactEditor from './ContactEditor.vue';
import ContactRenderer from './ContactRenderer.vue';
import TextEditor from './TextEditor.vue';
import TextRenderer from './TextRenderer.vue';

export interface TemplateDef {
  type: ContentType;
  label: string;
  defaultContent: Content;
  defaultLayout: PrintLayout;
  Editor: Component;
  Renderer: Component;
}

const DEFAULT_FONT = 18;
function field(text = '', align: FieldStyle['align'] = 'left', fontSize = DEFAULT_FONT): FieldStyle {
  return { text, align, fontSize };
}

export const TEMPLATES: Record<ContentType, TemplateDef> = {
  contact: {
    type: 'contact',
    label: '地点/电话/联系人',
    defaultContent: {
      type: 'contact',
      location: field('', 'center'),
      phone: field('', 'center'),
      contact: field('', 'center'),
    },
    defaultLayout: { paper: 'A4', orientation: 'landscape', fold: 'none' },
    Editor: ContactEditor,
    Renderer: ContactRenderer,
  },
  text: {
    type: 'text',
    label: '纯文本',
    defaultContent: { type: 'text', text: field('', 'left', 14) },
    defaultLayout: { paper: 'A4', orientation: 'portrait', fold: 'none' },
    Editor: TextEditor,
    Renderer: TextRenderer,
  },
};

export function getTemplate(type: ContentType): TemplateDef {
  return TEMPLATES[type];
}

export function defaultContent(type: ContentType): Content {
  return JSON.parse(JSON.stringify(TEMPLATES[type].defaultContent)) as Content;
}

export function defaultLayout(type: ContentType): PrintLayout {
  return { ...TEMPLATES[type].defaultLayout };
}
