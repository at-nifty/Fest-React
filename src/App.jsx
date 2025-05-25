import React, { useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom';
import { useAppStore } from './store';

function App() {
  const { role, setRole } = useAppStore();

  useEffect(() => {
    const handleBeforeUnload = (event) => {
      const confirmationMessage = "ページをリロードしようとしています。すべての接続が解除されます。本当に宜しいですか？";
      event.returnValue = confirmationMessage; // 一部のブラウザでは必要
      return confirmationMessage; // 古いブラウザ用
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  return (
    <div className="App">
      <main>
        <Outlet />
      </main>
    </div>
  );
}

export default App;
