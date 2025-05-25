import React from 'react'
import { NavLink, Outlet } from 'react-router-dom';
import { useAppStore } from './store';

function App() {
  const { role, setRole } = useAppStore();

  return (
    <div className="App">
      <header className="App-header">
        <nav>
          <NavLink to="/" className={({ isActive }) => isActive ? "active" : ""}>Home</NavLink>
          <button onClick={() => setRole(null)} className="role-change-button">Change Role</button>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}

export default App;
