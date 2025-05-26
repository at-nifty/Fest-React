import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import App from './App.jsx';
import RoleSelectionScreen from './screens/RoleSelectionScreen.jsx';
import ControllerScreen from './screens/ControllerScreen.jsx';
import MonitorScreen from './screens/MonitorScreen.jsx';
import CameraScreen from './screens/CameraScreen.jsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <RoleSelectionScreen /> },
      { path: "controller", element: <ControllerScreen /> },
      { path: "monitor", element: <MonitorScreen /> },
      { path: "camera", element: <CameraScreen /> },
    ]
  }
]);

// PWAの自動更新を設定
const updateSW = registerSW({
  onNeedRefresh() {
    if (confirm('新しいバージョンが利用可能です。更新しますか？')) {
      updateSW()
    }
  },
  onOfflineReady() {
    console.log('アプリケーションはオフラインで実行する準備ができています')
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
