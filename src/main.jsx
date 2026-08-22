import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/appleFoundations.css'
import App from './App.jsx'
import { bindAppViewport } from './utils/browserCompat.js'

bindAppViewport()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
