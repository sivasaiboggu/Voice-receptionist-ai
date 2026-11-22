import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import Layout from './components/Layout'
import { ActionLink, PageHeading } from './components/Desk'
import { ThemeProvider } from './components/ThemeProvider'
import Overview from './pages/Overview'
import Calls from './pages/Calls'
import Appointments from './pages/Appointments'
import LiveCall from './pages/LiveCall'
import Settings from './pages/Settings'

const pageTitles: Record<string, string> = {
  '/': 'Front desk', '/calls': 'Calls', '/appointments': 'Appointments', '/live': 'Live call', '/settings': 'Settings',
}

function DocumentTitle() {
  const { pathname } = useLocation()
  useEffect(() => { document.title = `${pageTitles[pathname] ?? 'Page not found'} | Voice Receptionist` }, [pathname])
  return null
}

function NotFound() {
  return <PageHeading title="Page not found" description="Check the address or go back to the front desk."><ActionLink to="/">Back to Overview</ActionLink></PageHeading>
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <DocumentTitle />
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Overview />} />
            <Route path="/calls" element={<Calls />} />
            <Route path="/appointments" element={<Appointments />} />
            <Route path="/live" element={<LiveCall />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  )
}
