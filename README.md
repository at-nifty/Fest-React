# Synva Cast

A localized, browser-based live production tool inspired by the core concepts of the Blackmagic ATEM Mini ecosystem. This project provides a simple way to switch between multiple camera sources (from other browser tabs/devices) and broadcast them to monitor outputs (also other browser tabs/devices), all coordinated through a central controller interface.

## Core Features

- **Controller**: Manages all connections. Adds cameras and monitors, and routes camera feeds to monitors.
- **Camera**: Captures media (webcam, screen share) and sends it to the Controller.
- **Monitor**: Receives a media stream from the Controller.

## How It Works

The system uses WebRTC for peer-to-peer media streaming. The connection process is facilitated by manual copy-pasting of Session Description Protocol (SDP) "offers" and "answers" between the components.

1.  A **Camera** instance generates an "offer" signal.
2.  This offer is pasted into the **Controller**.
3.  The Controller processes it and generates an "answer".
4.  The answer is pasted back into the Camera, establishing the Camera-Controller connection.
5.  The **Controller** can then generate an "offer" for a **Monitor**.
6.  This offer is pasted into the Monitor.
7.  The Monitor generates an "answer", which is pasted back into the Controller, establishing the Controller-Monitor connection.
8.  The Controller can now route any connected Camera's stream to any connected Monitor.

## Project Structure

- `src/screens/`: Contains the main React components for each role (Controller, Monitor, Camera, RoleSelection).
- `src/store.js`: Zustand-based global state management for cameras, monitors, and connections.
- `src/utils/`: Utility functions, including `connectionStorage.js` for saving/loading state to/from localStorage.
- `public/`: Static assets.

## Getting Started

### Prerequisites

- Node.js (v18.x recommended)
- npm (usually comes with Node.js)

### Installation & Running

1.  Clone the repository.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Run the development server:
    ```bash
    npm run dev
    ```
4.  Open your browser and navigate to `http://localhost:5173`.
    - You will see the role selection screen. Open at least three tabs: one for a Controller, one for a Camera, and one for a Monitor to test the full workflow.

## Detailed Workflow

### 1. Start the Controller

- Open a new tab and select the **Controller** role. This will be your main control panel.

### 2. Connect a Camera

1.  Open another tab/device and select the **Camera** role.
2.  Give the camera a name (e.g., "Main Cam").
3.  Click "Start Camera" to get your video feed.
4.  Click "Create Offer". An "offer" JSON will be generated in the textarea and automatically downloaded as a `.json` file.
5.  In the **Controller** tab, upload the `camera_offer_...json` file or paste the JSON text into the "New Camera Offer" area.
6.  Click "Process Camera Offer". The Controller will generate an "answer" JSON and automatically download it as a `.json` file.
7.  Go back to the **Camera** tab. Upload the `controller_answer_...json` file or paste the answer into the "Answer from Controller" area.
8.  Click "Process Answer". The connection state should change to "Connected". The camera feed is now being sent to the Controller.

### 3. Connect a Monitor

1.  Open a third tab/device and select the **Monitor** role.
2.  Give the monitor a name (e.g., "Main Output").
3.  In the **Controller** tab, under the "Monitors" section, click "Add New Monitor Placeholder".
4.  Click "Prepare Offer" for the new monitor. An "offer" JSON for the monitor will be generated and automatically downloaded.
5.  In the **Monitor** tab, upload the `controller_offer_...json` file or paste the offer into the "Offer from Controller" area.
6.  Click "Process Offer". The Monitor will generate an "answer" JSON and download it.
7.  Go back to the **Controller** tab. Find the corresponding monitor, upload the `monitor_answer_...json` file, and click "Process Answer".
8.  The monitor is now connected to the Controller.

### 4. Switching Sources

- In the **Controller** interface, for each connected monitor, you will see a dropdown menu.
- This dropdown lists all connected and streaming cameras.
- Select a camera from the dropdown to instantly switch the video feed being sent to that monitor.
- You can select "No Signal" to send a black screen.

## State Persistence

The application state (list of cameras, monitors, and their connections) is automatically saved to your browser's `localStorage`. When you reload the Controller page, it will attempt to restore the previous setup. However, the actual WebRTC peer connections will need to be re-established manually following the same offer/answer process.

## Known Issues & Limitations

- **Manual Signaling**: The core limitation is the manual copy-paste of SDP signals. A future version could implement a signaling server (e.g., using WebSockets) to automate this.
- **No Connection Re-establishment**: Reloading a Camera or Monitor page breaks the connection, requiring it to be removed from the Controller and re-added.
- **Scalability**: Performance may degrade with a very large number of simultaneous connections, depending on the client machine's resources.
- **Network Dependency**: All peers (tabs/devices) must be on the same local network for the ICE candidates to resolve correctly without a TURN server.

## Future Development Ideas

- **Signaling Server**: Implement a WebSocket-based signaling server to automate the offer/answer exchange.
- **UI/UX Enhancements**: Improve the user interface with better visual feedback, drag-and-drop layouts, and more intuitive controls.
- **Multi-view Previews**: Show small, real-time previews of all camera sources directly in the Controller UI.
- **Transitions**: Add simple video transitions (e.g., cuts, fades) when switching between camera sources.
- **TURN Server Integration**: Add configuration for a TURN server to allow connections between peers on different networks.
- **Recording**: Add functionality to record the output stream of a monitor.
- **Audio Mixing**: Basic audio mixing capabilities.

This project, Synva Cast, serves as a foundation for a powerful, flexible, and open-source live production tool.
