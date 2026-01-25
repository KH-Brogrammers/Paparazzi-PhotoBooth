import "./App.css";
import { BrowserRouter, Routes, Route } from "react-router";
import CameraPage from "./pages/CameraPage";
import ScreensPage from "./pages/ScreensPage";
import AdminPage from "./pages/AdminPage";

function App() {
  return (
    <BrowserRouter>
      <div className="w-screen h-screen flex">
        <Routes>
          <Route path="/" element={<CameraPage />} />
          <Route path="/screens" element={<ScreensPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
