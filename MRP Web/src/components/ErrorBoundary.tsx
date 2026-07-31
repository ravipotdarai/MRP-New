"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  onReset?: () => void;
};

type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("UI error boundary", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="panel" role="alert" style={{ margin: "1.5rem" }}>
          <h2 className="page-title" style={{ fontSize: "1.25rem" }}>
            Something went wrong
          </h2>
          <p className="muted" style={{ marginTop: "0.5rem" }}>
            {this.state.error.message || "Unexpected UI error"}
          </p>
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                this.setState({ error: null });
                this.props.onReset?.();
              }}
            >
              Retry
            </button>
            <button type="button" className="btn" onClick={() => window.location.assign("/dashboard")}>
              Dashboard
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
