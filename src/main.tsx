import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import './workbench.css'
import './projects/projects.css'
import './tools/resistor-tool.css'

createRoot(document.getElementById('root')!).render(<App />)
