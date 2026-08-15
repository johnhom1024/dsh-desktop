import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HostApp } from './HostApp'
import './styles.css'

const root = document.querySelector('#root')
if (!root) {
  throw new Error('root missing')
}

const api = window.dshShell
if (!api) {
  root.textContent = '宿主接口未就绪，请重启应用。'
  throw new Error('dshShell missing')
}

createRoot(root).render(
  <StrictMode>
    <HostApp api={api} />
  </StrictMode>,
)
