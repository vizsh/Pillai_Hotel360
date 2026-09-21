"use client";

import { Component, type ReactNode } from "react";

export class Boundary extends Component<{ children: ReactNode; name: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: Error, info: { componentStack?: string | null }) {
    console.log(`[twin:${this.props.name}]`, err.message, info.componentStack);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
