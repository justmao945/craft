import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from '../App'
import { installFakes } from './fakes'

installFakes(new URLSearchParams(location.search).has('reset'))
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
