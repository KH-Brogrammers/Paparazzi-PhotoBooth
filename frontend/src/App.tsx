import "./App.css";
import { BrowserRouter, Routes, Route } from "react-router";
import { useEffect } from "react";
import CameraPage from "./pages/CameraPage";
import ScreensPage from "./pages/ScreensPage";
import AdminPage from "./pages/AdminPage";
import { screenApi } from "./services/backend-api.service";
import { getCurrentScreenInfo } from "./utils/screenDetection";

function App() {
  // Auto-register every new tab as a screen
  useEffect(() => {
    const registerScreen = async () => {
      try {
        const screenInfo = getCurrentScreenInfo();
        await screenApi.register({
          screenId: screenInfo.screenId,
          label: screenInfo.label,
          position: screenInfo.position,
          resolution: screenInfo.resolution,
          isPrimary: screenInfo.isPrimary,
        });
        console.log("✅ Tab registered as screen:", screenInfo.label);
      } catch (error) {
        console.error("❌ Failed to register screen:", error);
      }
    };

    registerScreen();
  }, []);

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
