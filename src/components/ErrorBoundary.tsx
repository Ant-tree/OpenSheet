import { Component, type ErrorInfo, type ReactNode } from 'react'
import { t, useLangStore } from '../i18n'
import { useStore } from '../store/useStore'
import { buildLabel } from '../lib/build'

let renderCrashed = false

/** True once a render error has replaced the app with the error screen. */
export function hasRenderCrashed(): boolean {
  return renderCrashed
}

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
  componentStack: string
}

/**
 * Shows the render error instead of unmounting the whole app into a blank
 * window. Release desktop builds have no dev tools, so the error text on screen
 * is the only way to see what went wrong. Errors before React renders (a bundle
 * that fails to load or evaluate) are handled by public/boot-guard.js.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: '' }

  static getDerivedStateFromError(error: Error): Partial<State> {
    renderCrashed = true
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('OpenSheet render error', error, info.componentStack)
    this.setState({ componentStack: info.componentStack ?? '' })
  }

  private startBlank = () => {
    // Forget the last file so the desktop app does not reopen it on reload.
    useStore.getState().setFilePath(null)
    location.reload()
  }

  render() {
    const { error, componentStack } = this.state
    if (!error) return this.props.children

    const lang = useLangStore.getState().lang
    const details = [
      error.stack || `${error.name}: ${error.message}`,
      componentStack.trim(),
      `${buildLabel()} · ${navigator.userAgent}`,
    ]
      .filter(Boolean)
      .join('\n\n')

    return (
      <div className="crash-screen" role="alert">
        <h1>{t('crashTitle', lang)}</h1>
        <p>{t('crashBody', lang)}</p>
        <pre className="crash-details">{details}</pre>
        <div className="crash-actions">
          <button className="crash-primary" data-action="start-blank" onClick={this.startBlank}>
            {t('crashStartBlank', lang)}
          </button>
          <button data-action="reload" onClick={() => location.reload()}>
            {t('crashReload', lang)}
          </button>
        </div>
      </div>
    )
  }
}
