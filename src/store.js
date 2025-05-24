import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';

const useStore = create((set) => ({
  role: null,
  setRole: (role) => set({ role }),

  // Removed monitors, cameras, and their actions as Controller is removed
  // controllerGeneratedOfferForCamera: null, // No longer needed
  // setControllerGeneratedOfferForCamera: (data) => set({ controllerGeneratedOfferForCamera: data }),
  // controllerGeneratedAnswerForMonitor: null, // No longer needed
  // setControllerGeneratedAnswerForMonitor: (data) => set({ controllerGeneratedAnswerForMonitor: data }),
}));

export const generateId = (prefix = 'id') => `${prefix}-${uuidv4()}`;

export default useStore; 