import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "@/styles/globals.css";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { ThemeScript } from "@/components/ui/theme-script";

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
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} dark`} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="bg-canvas text-text-primary min-h-screen font-sans antialiased">
        <ErrorBoundary fallbackLabel="Agent Studio encountered an error">
          {children}
        </ErrorBoundary>
      </body>
    </html>
  );
}
