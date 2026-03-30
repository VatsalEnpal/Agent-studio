import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@/styles/globals.css";
import { ErrorBoundary } from "@/components/ui/error-boundary";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

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
    <html lang="en" className={inter.variable}>
      <body className="bg-console-bg text-console-text min-h-screen font-sans">
        <ErrorBoundary fallbackLabel="Agent Studio encountered an error">
          {children}
        </ErrorBoundary>
      </body>
    </html>
  );
}
