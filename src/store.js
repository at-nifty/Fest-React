import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';

const useStore = create((set, get) => ({
  role: null,
  setRole: (role) => set({ role }),

  monitors: [], // { id: string, name: string, offerSdp: object, offerIce: [], answerSdp: object, answerIce: [], connectedCameraId: string | null, status: string }
  cameras: [],  // { id: string, name: string, offerSdp: object, offerIce: [], answerSdp: object, answerIce: [], status: string }

  // Monitor actions
  addMonitor: (monitorInfo) => set((state) => ({
    monitors: [...state.monitors, { ...monitorInfo, status: 'registered', connectedCameraId: null }]
  })),
  updateMonitor: (monitorId, updates) => set((state) => ({
    monitors: state.monitors.map(m => m.id === monitorId ? { ...m, ...updates } : m)
  })),
  getMonitorById: (monitorId) => get().monitors.find(m => m.id === monitorId),

  // Camera actions
  addCamera: (cameraInfo) => set((state) => ({
    cameras: [...state.cameras, { ...cameraInfo, status: 'registered' }]
  })),
  updateCamera: (cameraId, updates) => set((state) => ({
    cameras: state.cameras.map(c => c.id === cameraId ? { ...c, ...updates } : c)
  })),
  getCameraById: (cameraId) => get().cameras.find(c => c.id === cameraId),
  
  // Connection data for manual transfer
  // These will hold the data Controller needs to display for user to copy
  controllerGeneratedOfferForCamera: null, // { cameraId, offerSdp, offerIce }
  setControllerGeneratedOfferForCamera: (data) => set({ controllerGeneratedOfferForCamera: data }),

  controllerGeneratedAnswerForMonitor: null, // { monitorId, answerSdp, answerIce }
  setControllerGeneratedAnswerForMonitor: (data) => set({ controllerGeneratedAnswerForMonitor: data }),
}));

export const generateId = (prefix = 'id') => `${prefix}-${uuidv4()}`;

export default useStore; 