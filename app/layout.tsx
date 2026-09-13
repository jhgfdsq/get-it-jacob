// Modified for Get It Jacob: French personal edition.
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import CodexHealthBanner from "@/components/CodexHealthBanner";
import ThemeProvider from "@/components/ThemeProvider";
import { loadSettings } from "@/lib/settings-store";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Get It Jacob",
  description:
    "Lisez votre PDF et discutez de la page affichée. Une préparation initiale, puis des actions à la demande.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const theme = loadSettings().theme;

  return (
    <html
      lang="fr"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased${theme === "dark" ? " dark" : ""}`}
    >
      <body className="h-full flex flex-col overflow-hidden bg-[var(--surface-canvas)] text-[var(--ink-900)]">
        <script
          dangerouslySetInnerHTML={{
            __html: `
try {
  var t = ${JSON.stringify(theme ?? "light")};
  if (t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
} catch(e) {}
`,
          }}
        />
        <CodexHealthBanner />
        <ThemeProvider initialTheme={theme}>{children}</ThemeProvider>
      </body>
    </html>
  );
}
