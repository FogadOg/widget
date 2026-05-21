import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import en from "../locales/en.json";

// preload: false — Next emits <link rel="preload" as="font"> for every weight
// of these fonts on every route. The embed iframe's first paint often does
// not render text in these fonts before the load event, which makes Chrome
// log "preloaded using link preload but not used within a few seconds." The
// fonts still load lazily via the CSS variable (`var(--font-geist-sans)`)
// when something actually uses them.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  preload: false,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  preload: false,
});

export const metadata: Metadata = {
  title: en.appTitle,
  description: en.appDescription,
  icons: {
    icon: '/favicon.png',
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read the nonce injected by middleware.ts so it can be forwarded to any
  // inline scripts that must run at hydration time.
  const headersList = await headers();
  const nonce = headersList.get("x-nonce") ?? undefined;

  return (
    <html lang="en" style={{ background: 'transparent' }}>
      <head>
        {/* Expose nonce to client scripts via a meta tag.
            Only the nonce value is placed here — no executable code. */}
        {nonce && <meta name="csp-nonce" content={nonce} />}
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        style={{ background: 'transparent' }}
      >
        {children}
      </body>
    </html>
  );
}
