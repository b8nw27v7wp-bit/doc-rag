'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

export type Locale = 'zh' | 'en';

/** 英文翻译表（键为中文源文案，未收录时回退中文） */
const EN: Record<string, string> = {
  文档库: 'Library',
  问答: 'Chat',
  深色: 'Dark',
  浅色: 'Light',
  新对话: 'New chat',
  '搜索会话…': 'Search chats…',
  暂无历史会话: 'No conversations yet',
  直接提问会自动新建: 'Ask a question to start one',
  无匹配会话: 'No matching chats',
  文档范围: 'Doc scope',
  全部文档: 'All docs',
  '还没有文档，先到首页上传': 'No docs yet — upload first',
  置顶: 'Pin',
  取消置顶: 'Unpin',
  重命名: 'Rename',
  重命名会话: 'Rename chat',
  删除会话: 'Delete chat',
  '拖入文件到此处，或点击选择': 'Drop files here, or click to choose',
  '解析与嵌入中，首次运行需加载模型（约 30 秒）…': 'Parsing & embedding… first run downloads the model (~30s)',
  '支持 txt / md / pdf / docx / html / csv / tsv，可多选。解析与向量化全部在本机完成。':
    'Supports txt / md / pdf / docx / html / csv / tsv, multiple files. All processing stays on this machine.',
  已入库: 'Ingested',
  失败: 'Failed',
  已跳过: 'Skipped',
  '上传失败，请重试': 'Upload failed, please retry',
  '全文搜索文档内容（命中段落）': 'Search document content',
  搜索: 'Search',
  '搜索中…': 'Searching…',
  '命中 {n} 处': 'Hits: {n}',
  '（无结果）': '(no results)',
  清除: 'Clear',
  查看: 'View',
  全选: 'Select all',
  '删除选中的 {n} 份文档': 'Delete {n} selected docs',
  勾选文档可批量删除: 'Select docs to batch delete',
  '暂无文档，拖入文件开始。': 'No documents yet — drop files to begin.',
  '加载原文…': 'Loading…',
  '加载中…': 'Loading…',
  关闭: 'Close',
  摘要: 'Summary',
  重述: 'Re-summarize',
  '生成中…': 'Generating…',
  '生成摘要失败': 'Failed to generate summary',
  模型设置: 'Model settings',
  导出: 'Export',
  停止: 'Stop',
  发送: 'Send',
  '输入问题，Enter 发送': 'Ask a question, Enter to send',
  向你的文档提问: 'Ask your documents',
  '新对话 · 提问将自动保存': 'New chat · questions auto-save',
  '加载文档库…': 'Loading library…',
  '文档库为空，先到首页上传文档': 'Library is empty — upload documents first',
  未配置: 'unset',
  已配置: 'set',
  保存: 'Save',
  '查询增强（多查询检索）': 'Query expansion (multi-query)',
  '开启后先把问题改写成多个检索查询再合并召回，复杂/模糊问题命中率更高；会额外发起一次模型调用、稍慢。':
    'Rewrite the question into multiple queries before retrieval for better recall on complex questions; adds latency.',
  温度: 'Temperature',
  服务商: 'Provider',
  模型: 'Model',
  'API Key': 'API Key',
  来源: 'Source',
  相似度: 'similarity',
  关键词: 'keyword',
  访问密码: 'Password',
  '验证中…': 'Verifying…',
  进入: 'Enter',
  密码错误: 'Wrong password',
  '网络错误，请重试': 'Network error, please retry',
  验证失败: 'Verification failed',
  '此应用启用了访问密码，请输入后继续': 'Password required to continue',
  思考过程: 'Reasoning',
  '模型可能引用了超出资料范围的编号（已隐藏）': 'Some citations were out of range and hidden',
  '确定要恢复备份吗？当前数据将被覆盖': 'Restore will overwrite current data. Continue?',
};

interface LocaleCtx {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (zh: string, vars?: Record<string, string | number>) => string;
}

const Ctx = createContext<LocaleCtx>({ locale: 'zh', setLocale: () => {}, t: (s) => s });

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof window === 'undefined') return 'zh';
    try {
      return localStorage.getItem('docrag.locale') === 'en' ? 'en' : 'zh';
    } catch {
      return 'zh';
    }
  });

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem('docrag.locale', l);
    } catch {
      // 隐私模式下忽略
    }
  };

  const t = (zh: string, vars?: Record<string, string | number>) => {
    let out = locale === 'en' ? EN[zh] ?? zh : zh;
    if (vars) for (const [k, v] of Object.entries(vars)) out = out.replace(`{${k}}`, String(v));
    return out;
  };

  return <Ctx.Provider value={{ locale, setLocale, t }}>{children}</Ctx.Provider>;
}

export function useT() {
  return useContext(Ctx).t;
}

export function useLocale(): [Locale, (l: Locale) => void] {
  const { locale, setLocale } = useContext(Ctx);
  return [locale, setLocale];
}