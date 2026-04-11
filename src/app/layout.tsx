import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import "@/styles/globals.css";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { ThemeScript } from "@/components/ui/theme-script";

const geistMono = GeistMono;

export const metadata: Metadata = {
  title: "Agent Studio",
  description: "Your agents, one place.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${geistMono.variable} dark`} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="bg-console-bg text-console-text min-h-screen font-mono">
        <ErrorBoundary fallbackLabel="Agent Studio encountered an error">
          {children}
        </ErrorBoundary>
      </body>
    </html>
  );
}
