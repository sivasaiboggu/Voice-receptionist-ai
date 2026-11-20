import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { ThemeProvider } from './components/ThemeProvider'
import Overview from './pages/Overview'
import Calls from './pages/Calls'
import Appointments from './pages/Appointments'
import LiveCall from './pages/LiveCall'
import { Card, CardContent } from './components/ui/card'

function NotFound() {
  return (
    <Card>
      <CardContent className="p-6">
        <h1 className="text-xl font-bold">Page not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">That page does not exist. <Link to="/" className="font-medium text-primary underline underline-offset-2">Back to Overview</Link></p>
      </CardContent>
    </Card>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Overview />} />
            <Route path="/calls" element={<Calls />} />
            <Route path="/appointments" element={<Appointments />} />
            <Route path="/live" element={<LiveCall />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  )
}
