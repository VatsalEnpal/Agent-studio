import type { Metadata } from "next";
import "@/styles/globals.css";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { ThemeScript } from "@/components/ui/theme-script";

export const metadata: Metadata = {
  title: "Agent Studio",
  description: "Your agents, one place.",
  icons: {
    icon: "/icon.svg",
    apple: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
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
