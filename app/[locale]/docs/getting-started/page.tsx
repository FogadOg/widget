import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import FrameworkTabs from './FrameworkTabs';
import LanguageSwitcher from '../../../components/LanguageSwitcher';
import { getTranslations } from '../../../../lib/i18n';
import { getEmbedSrc } from '../../../../lib/embedManifest';

export default async function GettingStartedPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = getTranslations(locale) as Record<string, string>;
  const { src: widgetSrc, integrityAttr } = getEmbedSrc('widget');
  const { src: docsWidgetSrc, integrityAttr: docsIntegrityAttr } = getEmbedSrc('docs-widget');
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted font-sans">
      <main className="flex min-h-screen w-full max-w-3xl flex-col gap-10 py-16 px-8 bg-background sm:px-16">
        <div className="flex items-center justify-between">
          <Link
            href={`/${locale}`}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={14} />
            {t.gettingStartedBack}
          </Link>
          <LanguageSwitcher ariaLabel={t.switchLanguage} locale={locale} />
        </div>
        {/* Header */}
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            {t.gettingStartedTitle}
          </h1>
          <p className="text-lg text-muted-foreground">
            {t.gettingStartedSubtitle}
          </p>
        </div>
        {/* Prerequisites */}
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold text-foreground">{t.gettingStartedPrerequisitesTitle}</h2>
          <p className="text-muted-foreground">
            {t.gettingStartedPrerequisitesDesc}
          </p>
          <ul className="flex flex-col gap-2 pl-5 list-disc text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">{t.gettingStartedCredentialClientId}</span>
              {' '}{t.gettingStartedCredentialClientIdDesc}
            </li>
            <li>
              <span className="font-medium text-foreground">{t.gettingStartedCredentialAgentId}</span>
              {' '}{t.gettingStartedCredentialAgentIdDesc}
            </li>
            <li>
              <span className="font-medium text-foreground">{t.gettingStartedCredentialConfigId}</span>
              {' '}{t.gettingStartedCredentialConfigIdDesc}
            </li>
          </ul>
        </section>
        {/* Step 1 */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              1
            </span>
            <h2 className="text-xl font-semibold text-foreground">{t.gettingStartedStep1Title}</h2>
          </div>
          <p className="text-muted-foreground pl-10">
            In the dashboard, go to <strong className="text-foreground">{t.gettingStartedStep1Customize}</strong>,
            select your widget config, and copy the Config ID. Find your Client ID and Agent ID
            under <strong className="text-foreground">{t.gettingStartedStep1Datasources}</strong>.
          </p>
        </section>
        {/* Step 2 */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              2
            </span>
            <h2 className="text-xl font-semibold text-foreground">{t.gettingStartedStep2Title}</h2>
          </div>
          <p className="text-muted-foreground pl-10">
            {t.gettingStartedStep2Desc.split('{configId}')[0]}
            <code className="font-mono text-sm bg-muted px-1.5 py-0.5 rounded">YOUR_CONFIG_ID</code>
            {t.gettingStartedStep2Desc.split('{configId}')[1]}
          </p>
          <FrameworkTabs widgetSrc={widgetSrc} integrityAttr={integrityAttr} />
        </section>
        {/* Step 3 */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              3
            </span>
            <h2 className="text-xl font-semibold text-foreground">{t.gettingStartedStep3Title}</h2>
          </div>
          <p className="text-muted-foreground pl-10">
            {t.gettingStartedStep3Desc}
          </p>
        </section>
        {/* Step 4 */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              4
            </span>
            <h2 className="text-xl font-semibold text-foreground">{t.gettingStartedStep4Title}</h2>
          </div>
          <p className="text-muted-foreground pl-10">
            {t.gettingStartedStep4Desc.split('{openCall}')[0]}
            <code className="font-mono text-sm bg-muted px-1.5 py-0.5 rounded">
              window.CompaninDocsWidget.open()
            </code>
            {t.gettingStartedStep4Desc.split('{openCall}')[1]}
          </p>
          {/* Code snippets — same tabs as the main widget example */}
          <FrameworkTabs snippets={{
            'HTML / JS':
`<script\n  src="${docsWidgetSrc}"${docsIntegrityAttr ? `\n  ${docsIntegrityAttr}` : ''}\n  data-client-id="YOUR_CLIENT_ID"\n  data-agent-id="YOUR_AGENT_ID"\n  data-config-id="YOUR_CONFIG_ID"\n  data-instance-id="docs-help"\n  data-locale="en"\n  async>\n</script>

<button onclick="window.CompaninDocsWidget.open()">

  Ask the agent

</button>`,
            'Next.js':
`// app/layout.tsx

'use client';

import { useEffect } from 'react';

export default function RootLayout({ children }: { children: React.ReactNode }) {

  useEffect(() => {

    const script = document.createElement('script');

    script.src = '${docsWidgetSrc}';

    script.dataset.clientId = 'YOUR_CLIENT_ID';

    script.dataset.agentId = 'YOUR_AGENT_ID';

    script.dataset.configId = 'YOUR_CONFIG_ID';

    script.dataset.instanceId = 'docs-help';

    script.dataset.locale = 'en';

    document.head.appendChild(script);

    return () => { script.remove(); };

  }, []);

  return <html><body>{children}</body></html>;

}`,
            'React':
`// src/App.tsx

import { useEffect } from 'react';

export default function App() {

  useEffect(() => {

    const script = document.createElement('script');

    script.src = '${docsWidgetSrc}';

    script.dataset.clientId = 'YOUR_CLIENT_ID';

    script.dataset.agentId = 'YOUR_AGENT_ID';

    script.dataset.configId = 'YOUR_CONFIG_ID';

    script.dataset.instanceId = 'docs-help';

    script.dataset.locale = 'en';

    document.head.appendChild(script);

    return () => { script.remove(); };

  }, []);

  return (

    <div>

      <button onClick={() => window.CompaninDocsWidget?.open()}>

        Ask the agent

      </button>

    </div>

  );

}`,
            'Angular':
`// src/app/app.component.ts

import { Component, OnInit } from '@angular/core';

@Component({ selector: 'app-root', templateUrl: './app.component.html' })

export class AppComponent implements OnInit {

  ngOnInit(): void {

    const script = document.createElement('script');

    script.src = '${docsWidgetSrc}';

    script.dataset['clientId'] = 'YOUR_CLIENT_ID';

    script.dataset['agentId'] = 'YOUR_AGENT_ID';

    script.dataset['configId'] = 'YOUR_CONFIG_ID';

    script.dataset['instanceId'] = 'docs-help';

    script.dataset['locale'] = 'en';

    document.head.appendChild(script);

  }

  openAgent(): void {

    (window as any).CompaninDocsWidget?.open();

  }

}`,
            'Vue':
`<!-- src/App.vue -->

<script setup lang="ts">

import { onMounted } from 'vue';

onMounted(() => {

  const script = document.createElement('script');

  script.src = '${docsWidgetSrc}';

  script.dataset.clientId = 'YOUR_CLIENT_ID';

  script.dataset.agentId = 'YOUR_AGENT_ID';

  script.dataset.configId = 'YOUR_CONFIG_ID';

  script.dataset.instanceId = 'docs-help';

  script.dataset.locale = 'en';

  document.head.appendChild(script);

});

const open = () => (window as any).CompaninDocsWidget?.open();

</script>

<template>

  <button @click="open">Ask the agent</button>

</template>`,
          }} />
        </section>
      </main>
    </div>
  );
}
