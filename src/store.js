import create from 'zustand';

const useStore = create((set) => ({
  role: null,
  setRole: (role) => set({ role }),
}));

export default useStore; 