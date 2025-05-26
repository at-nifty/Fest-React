import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';

const STORE_LOG_PREFIX = "[ZustandStore]";

// Helper function to create a default name
const generateDefaultName = (base, count) => base + " " + count;

export const useAppStore = create((set, get) => ({
  // ---- State ----
  role: null, // 'controller', 'monitor', 'camera'
  cameras: [], // { id, name, offerJson, answerJson, status, iceCandidatesFromCamera, iceCandidatesForControllerAnswer, rawOffer }
  monitors: [], // { id, name, offerJsonFromController, answerJsonFromMonitor, status, iceCandidatesFromMonitor, iceCandidatesForControllerOffer, rawOfferFromController, rawAnswerFromMonitor }
  
  selectedCameraId: null,
  selectedMonitorIds: [], // Array of monitor IDs

  // ---- Actions ----
  // == Initialization ==
  initializeCameras: (cameras) => {
    console.log(STORE_LOG_PREFIX + " Initializing cameras from saved state: ", cameras);
    set({ cameras });
  },

  initializeMonitors: (monitors) => {
    console.log(STORE_LOG_PREFIX + " Initializing monitors from saved state: ", monitors);
    set({ monitors });
  },

  setRole: (role) => {
    console.log(STORE_LOG_PREFIX + " Setting role to: " + role);
    set({ role });
  },

  // == Camera Management ==
  addCamera: (offerJson, iceCandidatesFromCamera, rawOffer, name) => {
    const newCameraId = uuidv4();
    const newCamera = {
      id: newCameraId,
      name: name || generateDefaultName("Camera", get().cameras.length + 1),
      offerJson,
      rawOffer,
      iceCandidatesFromCamera,
      answerJson: null, 
      iceCandidatesForControllerAnswer: [], 
      status: 'offer_received', 
    };
    console.log(STORE_LOG_PREFIX + " Adding new camera: ", newCamera);
    set((state) => ({ cameras: [...state.cameras, newCamera] }));
    return newCameraId;
  },

  removeCamera: (cameraId) => {
    console.log(STORE_LOG_PREFIX + " Removing camera: " + cameraId);
    set((state) => ({
      cameras: state.cameras.filter(cam => cam.id !== cameraId),
      // カメラが削除された場合、関連するモニターの接続も解除
      monitors: state.monitors.map(mon => {
        if (mon.status === 'connected_to_controller' && state.monitorSourceMap?.[mon.id] === cameraId) {
          return { ...mon, status: 'connection_source_removed' };
        }
        return mon;
      }),
    }));
  },

  setCameraAnswer: (cameraId, answerJson, iceCandidatesForControllerAnswer) => {
    console.log(STORE_LOG_PREFIX + " Setting answer for camera " + cameraId + ": ", { answerJson: answerJson.substring(0,50) + "...", iceCandidatesForControllerAnswer });
    set((state) => ({
      cameras: state.cameras.map((cam) =>
        cam.id === cameraId
          ? { ...cam, answerJson, iceCandidatesForControllerAnswer, status: 'answer_ready' }
          : cam
      ),
    }));
  },

  updateCameraStatus: (cameraId, status) => {
    console.log(STORE_LOG_PREFIX + " Updating status for camera " + cameraId + " to: " + status);
    set((state) => ({
      cameras: state.cameras.map((cam) =>
        cam.id === cameraId ? { ...cam, status } : cam
      ),
    }));
  },
  
  getCameraById: (cameraId) => {
    return get().cameras.find(cam => cam.id === cameraId);
  },

  updateCameraName: (cameraId, name) => {
    console.log(STORE_LOG_PREFIX + " Updating camera name: " + cameraId + " to: " + name);
    set((state) => ({
      cameras: state.cameras.map((cam) =>
        cam.id === cameraId ? { ...cam, name } : cam
      ),
    }));
  },

  // == Monitor Management ==
  addMonitorPlaceholder: () => {
    const newMonitorId = uuidv4();
    const newMonitor = {
      id: newMonitorId,
      name: generateDefaultName("Monitor", get().monitors.length + 1),
      offerJsonFromController: null,
      iceCandidatesForControllerOffer: [],
      rawOfferFromController: null,      
      answerJsonFromMonitor: null,
      iceCandidatesFromMonitor: [],
      rawAnswerFromMonitor: null,
      status: 'ready_for_offer',
    };
    console.log(STORE_LOG_PREFIX + " Adding new monitor placeholder: ", newMonitor);
    set((state) => ({ monitors: [...state.monitors, newMonitor] }));
    return newMonitorId;
  },
  
  removeMonitor: (monitorId) => {
    console.log(STORE_LOG_PREFIX + " Removing monitor: " + monitorId);
    set((state) => ({
      monitors: state.monitors.filter(mon => mon.id !== monitorId),
    }));
  },
  
  setOfferForMonitor: (monitorId, offerJsonFromController, iceCandidatesForControllerOffer, rawOfferFromController) => {
    console.log(STORE_LOG_PREFIX + " Setting offer for monitor " + monitorId + ": ", { offerJsonFromController: offerJsonFromController.substring(0,50) + "...", iceCandidatesForControllerOffer });
    set((state) => ({
      monitors: state.monitors.map((mon) =>
        mon.id === monitorId
          ? { ...mon, offerJsonFromController, iceCandidatesForControllerOffer, rawOfferFromController, status: 'offer_sent_to_monitor' }
          : mon
      ),
    }));
  },

  setMonitorAnswer: (monitorId, answerJsonFromMonitor, iceCandidatesFromMonitor, rawAnswerFromMonitor) => {
    console.log(STORE_LOG_PREFIX + " Setting answer from monitor " + monitorId + ": ", { answerJsonFromMonitor: answerJsonFromMonitor.substring(0,50) + "...", iceCandidatesFromMonitor });
    set((state) => ({
      monitors: state.monitors.map((mon) =>
        mon.id === monitorId
          ? { ...mon, answerJsonFromMonitor, iceCandidatesFromMonitor, rawAnswerFromMonitor, status: 'answer_received_from_monitor' }
          : mon
      ),
    }));
  },

  updateMonitorStatus: (monitorId, status) => {
    console.log(STORE_LOG_PREFIX + " Updating status for monitor " + monitorId + " to: " + status);
    set((state) => ({
      monitors: state.monitors.map((mon) =>
        mon.id === monitorId ? { ...mon, status } : mon
      ),
    }));
  },

  getMonitorById: (monitorId) => {
    return get().monitors.find(mon => mon.id === monitorId);
  },

  updateMonitorName: (monitorId, name) => {
    console.log(STORE_LOG_PREFIX + " Updating monitor name: " + monitorId + " to: " + name);
    set((state) => ({
      monitors: state.monitors.map((mon) =>
        mon.id === monitorId ? { ...mon, name } : mon
      ),
    }));
  },

  // == Connection Selection / Routing ==
  selectCamera: (cameraId) => {
    console.log(STORE_LOG_PREFIX + " Selecting camera: " + cameraId);
    set({ selectedCameraId: cameraId });
  },

  toggleMonitorSelection: (monitorId) => {
    const currentSelection = get().selectedMonitorIds;
    const isSelected = currentSelection.includes(monitorId);
    const newSelection = isSelected
      ? currentSelection.filter(id => id !== monitorId)
      : [...currentSelection, monitorId];
    console.log(STORE_LOG_PREFIX + " Toggling monitor selection for " + monitorId + ". New selection: ", newSelection);
    set({ selectedMonitorIds: newSelection });
  },
  
  clearSelections: () => {
    console.log(STORE_LOG_PREFIX + " Clearing camera and monitor selections.");
    set({ selectedCameraId: null, selectedMonitorIds: [] });
  }

}));

// Utility for components to generate default names if needed, though store handles it for new devices.
export const generateNewDeviceName = (base, existingList) => {
  return base + " " + (existingList.length + 1);
};

// Utility function to generate unique IDs with optional prefix
export const generateId = (prefix = '') => {
  return `${prefix}${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};
