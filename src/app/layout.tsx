import type { Metadata } from "next";
import "@/styles/globals.css";
import { ErrorBoundary } from "@/components/ui/error-boundary";

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
    <html lang="en">
      <body className="bg-console-bg text-console-text min-h-screen">
        <ErrorBoundary fallbackLabel="Agent Studio encountered an error">
          {children}
        </ErrorBoundary>
      </body>
    </html>
  );
}
