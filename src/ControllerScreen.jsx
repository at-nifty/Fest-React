import { Navigate } from 'react-router-dom';

// This file exists for backward compatibility - redirects to the correct location
export default function ControllerScreen() {
  return <Navigate to="/controller" replace />;
}
