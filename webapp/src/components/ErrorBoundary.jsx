import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { err: null } }
  static getDerivedStateFromError(err) { return { err } }
  componentDidCatch(err) { console.error('Halaman error:', err) }
  render() {
    if (!this.state.err) return this.props.children
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, textAlign: 'center', color: '#fff' }}>
        <b style={{ fontSize: 17 }}>Halaman ini mengalami error</b>
        <span style={{ opacity: .7, fontSize: 13, maxWidth: 280, wordBreak: 'break-word' }}>{String(this.state.err?.message || this.state.err)}</span>
        <div style={{ display: 'flex', gap: 10 }}>
          <button style={{ padding: '10px 18px', borderRadius: 12, border: 0, background: '#ffffff22', color: '#fff' }} onClick={() => this.setState({ err: null })}>Coba lagi</button>
          {this.props.onBack && <button style={{ padding: '10px 18px', borderRadius: 12, border: 0, background: '#ffffff22', color: '#fff' }} onClick={this.props.onBack}>Kembali</button>}
        </div>
      </div>
    )
  }
}
