import { Component, type ErrorInfo, type ReactNode } from "react";
import { logDiagnostic } from "../lib/preferences";
import { clearAllLocalData } from "../lib/privateData";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  clearing: boolean;
  clearError: string | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, clearing: false, clearError: null };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logDiagnostic(`Render error: ${error.message} ${info.componentStack ?? ""}`);
  }

  private handleClear = async () => {
    this.setState({ clearing: true, clearError: null });
    try {
      await clearAllLocalData();
      window.location.reload();
    } catch (error) {
      this.setState({
        clearing: false,
        clearError: error instanceof Error ? error.message : "Could not clear local data.",
      });
    }
  };

  render(): ReactNode {
    if (this.state.error) {
      return (
        <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-6 py-16">
          <p className="text-xs font-semibold tracking-[0.3em] text-rose-300 uppercase">
            Something went wrong
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">The stage stopped.</h1>
          <p className="mt-4 text-stage-300">
            Reload to try again. If the problem repeats, clear the local browser data from this
            screen.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-accent-400 px-6 font-semibold text-emerald-950 transition hover:bg-accent-300"
            >
              Reload
            </button>
            <button
              type="button"
              onClick={() => void this.handleClear()}
              disabled={this.state.clearing}
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-rose-400/30 bg-rose-500/10 px-6 font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-50"
            >
              {this.state.clearing ? "Clearing…" : "Clear local data & reload"}
            </button>
          </div>
          {this.state.clearError && (
            <p className="mt-4 text-sm text-rose-200" role="alert">
              {this.state.clearError}
            </p>
          )}
          <p className="mt-6 text-xs text-slate-400">
            No audio was uploaded. Diagnostics are kept for this tab only.
          </p>
        </main>
      );
    }
    return this.props.children;
  }
}
