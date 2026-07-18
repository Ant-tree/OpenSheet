import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { useStore } from './store/useStore'
import './styles.css'

// Dev-only handle for debugging / automated verification in the browser console.
if (import.meta.env.DEV) {
  ;(window as unknown as { store: typeof useStore }).store = useStore
  Promise.all([import('./lib/fileIO'), import('xlsx')]).then(([io, xlsx]) => {
    Object.assign(window as object, { fileIO: io, XLSX: xlsx })
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
