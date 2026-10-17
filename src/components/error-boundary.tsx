"use client";

/* ============================================================
   oniLibrary — overlay error boundary.

   A crash inside any pushed screen (most importantly the reader)
   must NEVER take the whole app down to the dead-end "Application
   error" page. This boundary catches render/runtime errors of the
   overlay stack and shows a recoverable oniLibrary-branded card:
   the user can go back to the library or reload in place.
   ============================================================ */

import { Component, type ErrorInfo, type ReactNode } from "react";
import { OniLogo } from "@/components/oni-logo";
import { useNav } from "@/lib/store";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class OverlayErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // keep a trace in the console for WebView remote debugging
    console.error("[oniLibrary] overlay crash", error, info.componentStack);
  }

  private goBack = () => {
    this.setState({ error: null });
    useNav.getState().popToTab();
  };

  private reloadView = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 bg-background px-8 text-center">
          <OniLogo size={56} className="opacity-90" />
          <div>
            <p className="text-[16px] font-black text-foreground">
              Something went wrong here
            </p>
            <p className="mt-1.5 text-[12.5px] font-semibold leading-relaxed text-muted-foreground">
              This screen crashed, but the rest of your library is fine. Go back
              and try again — your progress is saved.
            </p>
          </div>
          <pre className="max-h-24 max-w-full overflow-auto rounded-xl border border-border bg-secondary/60 px-3 py-2 text-left text-[10px] font-semibold text-muted-foreground">
            {this.state.error?.message?.slice(0, 300) || "Unknown error"}
          </pre>
          <div className="flex w-full max-w-60 flex-col gap-2">
            <button
              type="button"
              onClick={this.goBack}
              className="h-11 rounded-full bg-coral-gradient text-[13.5px] font-extrabold text-white shadow-[0_10px_24px_-10px_rgba(248,105,76,0.8)] transition-transform active:scale-95"
            >
              Back to library
            </button>
            <button
              type="button"
              onClick={this.reloadView}
              className="h-10 rounded-full border border-border text-[12.5px] font-extrabold text-foreground transition-transform active:scale-95"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
