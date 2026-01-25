import './App.css'
import { BrowserRouter, Routes, Route } from 'react-router'
import CameraPage from './pages/CameraPage'
import ScreensPage from './pages/ScreensPage'
import AdminPage from './pages/AdminPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<CameraPage />} />
        <Route path="/screens" element={<ScreensPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
