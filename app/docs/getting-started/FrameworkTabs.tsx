'use client';
import { useState, useRef, useEffect } from 'react';
import { useWidgetTranslation } from '../../../hooks/useWidgetTranslation';

type TabKey = 'HTML / JS' | 'Next.js' | 'React' | 'Angular' | 'Vue';
const FALLBACK_SRC = 'https://widget.companin.tech/widget.js';

function buildSnippets(src: string, integrityAttr: string): Record<TabKey, string> {
  const integrityLine = integrityAttr ? `\n  ${integrityAttr}` : '';
  return {
    'HTML / JS': `<script\n  src="${src}"${integrityLine}\n  data-widget-key="YOUR_WIDGET_KEY"\n  data-locale="en"\n  async>\n<\/script>`,
    'Next.js': `// app/layout.tsx (or pages/_app.tsx)

'use client';

import { useEffect } from 'react';

export default function RootLayout({ children }: { children: React.ReactNode }) {

  useEffect(() => {

    const script = document.createElement('script');

    script.src = '${src}';

    script.dataset.widgetKey = 'YOUR_WIDGET_KEY';

    script.dataset.locale = 'en';

    script.async = true;

    document.head.appendChild(script);

    return () => { script.remove(); };

  }, []);

  return <html><body>{children}</body></html>;

}`,
    'React': `// src/App.tsx

import { useEffect } from 'react';

export default function App() {

  useEffect(() => {

    const script = document.createElement('script');

    script.src = '${src}';

    script.dataset.widgetKey = 'YOUR_WIDGET_KEY';

    script.dataset.locale = 'en';

    script.async = true;

    document.head.appendChild(script);

    return () => { script.remove(); };

  }, []);

  return <div>{/* your app */}</div>;

}`,
    'Angular': `// src/app/app.component.ts

import { Component, OnInit } from '@angular/core';

@Component({ selector: 'app-root', templateUrl: './app.component.html' })

export class AppComponent implements OnInit {

  ngOnInit(): void {

    const script = document.createElement('script');

    script.src = '${src}';

    script.dataset['widgetKey'] = 'YOUR_WIDGET_KEY';

    script.dataset['locale'] = 'en';

    document.head.appendChild(script);

  }

}`,
    'Vue': `<!-- src/App.vue -->

<script setup lang="ts">

import { onMounted } from 'vue';

onMounted(() => {

  const script = document.createElement('script');

  script.src = '${src}';

  script.dataset.widgetKey = 'YOUR_WIDGET_KEY';

  script.dataset.locale = 'en';

  document.head.appendChild(script);

});

<\/script>

<template>

  <div><!-- your app --></div>

</template>`,
  };
}

const LANGUAGES: Record<TabKey, string> = {
  'HTML / JS': 'html',
  'Next.js': 'tsx',
  'React': 'tsx',
  'Angular': 'typescript',
  'Vue': 'vue',
};
const TABS = Object.keys(LANGUAGES) as TabKey[];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { translations } = useWidgetTranslation();
  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      if (timerRef.current) clearTimeout(timerRef.current);
      setCopied(true);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable or permission denied
    }
  };
  return (
    <button
      onClick={handleCopy}
      aria-label={translations.copyCodeSnippet as string}
      className="px-3 py-1 text-xs font-medium rounded-md bg-zinc-700 text-zinc-200 hover:bg-zinc-600 transition-colors shrink-0"
    >
      {copied ? translations.copied as string : translations.copy as string}
    </button>
  );
}

function HighlightedCode({ code, language }: { code: string; language: string }) {
  const [html, setHtml] = useState('');
  useEffect(() => {
    let cancelled = false;
    let rafId: number;
    const highlight = async () => {
      try {
        const { codeToHtml } = await import('shiki');
        const result = await codeToHtml(code, {
          lang: language,
          themes: {
            light: 'one-dark-pro',
            dark: 'one-dark-pro',
          },
        });
        rafId = requestAnimationFrame(() => {
          if (!cancelled) setHtml(result);
        });
      } catch {
        // fallback to plain text on error
      }
    };
    rafId = requestAnimationFrame(() => { highlight(); });
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [code, language]);
  if (!html) {
    return (
      <pre className="overflow-x-auto p-5 text-sm text-zinc-100 font-mono leading-relaxed">
        <code>{code}</code>
      </pre>
    );
  }
  return (
    <div
      className="overflow-x-auto [&_.shiki]:!bg-transparent [&_pre]:!bg-transparent [&_pre]:p-5 [&_code]:font-mono [&_code]:text-sm [&_code]:leading-relaxed"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

interface FrameworkTabsProps {
  snippets?: Partial<Record<TabKey, string>>;
  widgetSrc?: string;
  integrityAttr?: string;
}

export default function FrameworkTabs({ snippets, widgetSrc, integrityAttr }: FrameworkTabsProps = {}) {
  const merged = { ...buildSnippets(widgetSrc || FALLBACK_SRC, integrityAttr || ''), ...snippets };
  const [active, setActive] = useState<TabKey>(TABS[0]);
  const snippet = merged[active];
  const language = LANGUAGES[active];
  return (
    <div className="rounded-lg bg-zinc-900 dark:bg-zinc-800 overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center justify-between border-b border-zinc-700 px-4">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActive(tab)}
              className={`px-3 py-2.5 text-xs font-medium whitespace-nowrap transition-colors ${
                active === tab
                  ? 'text-zinc-100 border-b-2 border-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <CopyButton text={snippet} />
      </div>
      {/* Code block */}
      <HighlightedCode code={snippet} language={language} />
    </div>
  );
}
