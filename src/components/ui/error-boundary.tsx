"use client";

import { Component, type ReactNode } from "react";
import { Warning, ArrowCounterClockwise } from "@phosphor-icons/react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackLabel?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, errorMessage: error.message };
  }

  handleRetry = () => {
    this.setState({ hasError: false, errorMessage: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3 p-4">
          <Warning className="w-6 h-6 text-console-error" />
          <p className="text-xs text-console-muted text-center">
            {this.props.fallbackLabel ?? "Something went wrong"}
          </p>
          {this.state.errorMessage && (
            <p className="text-[10px] text-console-dim text-center max-w-xs truncate">
              {this.state.errorMessage}
            </p>
          )}
          <button
            onClick={this.handleRetry}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-console-faint text-console-text hover:bg-console-faint/70 active:scale-95 transition-all"
          >
            <ArrowCounterClockwise className="w-3 h-3" />
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
