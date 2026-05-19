import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ServerError } from './server-error';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return <ServerError error={this.state.error} onReset={this.reset} />;
    }
    return this.props.children;
  }
}
