import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import App from './App.jsx';
import RoleSelectionScreen from './screens/RoleSelectionScreen.jsx';
import ControllerScreen from './screens/ControllerScreen.jsx';
import MonitorScreen from './screens/MonitorScreen.jsx';
import CameraScreen from './screens/CameraScreen.jsx';
import './index.css';

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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
