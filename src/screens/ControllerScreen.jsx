import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAppStore } from '../store';
import { saveConnectionState, loadConnectionState } from '../utils/connectionStorage';
import './ControllerScreen.css';

const CTRL_LOG_PREFIX = "[CtrlScreen]";

const CameraItem = React.memo(({ cam, selectedCameraId, onSelectCamera, onToggleExpand, onRemoveCamera, expandedCameraJson, copyToClipboard, getCameraById }) => {
  return (
    <div key={cam.id} className={`device-list-item ${selectedCameraId === cam.id ? 'selected-device' : ''}`}>
      <div className="device-header">
        <span className="device-name">{cam.name}</span>
        <span className="status-badge" data-status={cam.status}>{cam.status}</span>
      </div>
      <div className="small-id">ID: {cam.id}</div>
      <div className="button-group">
        <button
          onClick={() => onSelectCamera(cam.id)}
          disabled={selectedCameraId === cam.id || (cam.status !== 'connected_streaming' && cam.status !== 'pc_state_connected')}
          className={`button ${selectedCameraId === cam.id || (cam.status !== 'connected_streaming' && cam.status !== 'pc_state_connected') ? 'button-disabled' : ''}`}
        >
          {selectedCameraId === cam.id ? '現在のソース' :
            (cam.status === 'connected_streaming' || cam.status === 'pc_state_connected' ? 'ソースとして選択' :
              (cam.status === 'track_received_no_stream' ? 'ストリーム問題' : '未ストリーミング')
            )}
        </button>
        {(cam.answerJson || cam.status === 'error_offer_processing') && (
          <button
            onClick={() => onToggleExpand(cam.id)}
            className="button"
          >
            {expandedCameraJson === cam.id ? '応答を隠す' : '応答を表示'}
          </button>
        )}
        <button
          onClick={() => onRemoveCamera(cam.id)}
          className="button button-danger"
        >
          カメラを削除
        </button>
      </div>
      {expandedCameraJson === cam.id && (
        <div className="expanded-content">
          {cam.answerJson ? (
            <>
              <label htmlFor={`camAnswer-${cam.id}`} className="label">{cam.name}の応答:</label>
              <textarea
                id={`camAnswer-${cam.id}`}
                readOnly
                value={cam.answerJson}
                className="textarea"
              />
              <button
                onClick={() => copyToClipboard(cam.answerJson, "Camera Answer")}
                className="button"
              >
                応答をコピー
              </button>
            </>
          ) : cam.status === 'error_offer_processing' && (
            <div className="error-message">
              カメラのオファー処理に失敗しました。カメラを削除して再度追加してください。
            </div>
          )}
        </div>
      )}
    </div>
  );
});

const MonitorItem = React.memo(({
  mon,
  monitorSourceMap,
  expandedMonitorJson,
  currentMonitorIdForOffer,
  currentMonitorIdForAnswer,
  answerFromMonitorInput,
  monitorAnswerFile,
  cameras,
  onSwitchCamera,
  onPrepareOffer,
  onToggleExpand,
  onRemoveMonitor,
  onAnswerInputChange,
  onAnswerFileChange,
  onAcceptAnswer,
  copyToClipboard,
  getCameraById
}) => {
  const currentCameraId = monitorSourceMap[mon.id];
  const isConnected = mon.status === 'connected_to_controller' || mon.status.startsWith('pc_state_connected');
  const isProcessingAnswer = currentMonitorIdForAnswer === mon.id && (!!answerFromMonitorInput || !!monitorAnswerFile);

  return (
    <div key={mon.id} className="device-list-item">
      <div className="device-header">
        <span className="device-name">{mon.name}</span>
        <span className="status-badge" data-status={mon.status}>{mon.status}</span>
      </div>
      <div className="small-id">ID: {mon.id}</div>

      {isConnected && (
        <div className="expanded-content">
          <label htmlFor={`camera-select-${mon.id}`} className="label">カメラを選択:</label>
          <select
            id={`camera-select-${mon.id}`}
            value={currentCameraId || ''}
            onChange={(e) => onSwitchCamera(mon.id, e.target.value || null)}
            className="camera-source-select button"
          >
            <option value="">信号なし</option>
            {cameras
              .filter(cam => cam.status === 'connected_streaming' || cam.status === 'pc_state_connected')
              .map(cam => (
                <option key={cam.id} value={cam.id}>
                  {cam.name} {cam.status === 'connected_streaming' ? '(ストリーミング中)' : '(接続済み)'}
                </option>
              ))
            }
          </select>
        </div>
      )}

      <div className="button-group">
        <button
          onClick={() => onPrepareOffer(mon.id)}
          disabled={mon.status === 'connected_to_controller' || mon.status?.includes('error')}
          className={`button ${mon.status === 'connected_to_controller' || mon.status?.includes('error') ? 'button-disabled' : ''}`}
        >
          {mon.status === 'connected_to_controller' ? '接続済み' : 'オファーを準備'}
        </button>
        <button
          onClick={() => onToggleExpand(mon.id)}
          className="button"
        >
          {expandedMonitorJson === mon.id ? '詳細を隠す' : '詳細を表示'}
        </button>
        <button
          onClick={() => onRemoveMonitor(mon.id)}
          className="button button-danger"
        >
          モニターを削除
        </button>
      </div>

      {expandedMonitorJson === mon.id && (
        <div className="expanded-content">
          {mon.offerJsonFromController && (
            <div>
              <label htmlFor={`monOffer-${mon.id}`} className="label">
                {mon.name}へのオファー: {currentCameraId ? `(${getCameraById(currentCameraId)?.name || '選択されたカメラ'}から)` : '(信号なし)'}
              </label>
              <textarea
                id={`monOffer-${mon.id}`}
                readOnly
                value={mon.offerJsonFromController}
                className="textarea"
              />
              <button
                onClick={() => copyToClipboard(mon.offerJsonFromController, "Offer for Monitor")}
                className="button"
              >
                オファーをコピー
              </button>
            </div>
          )}
          {mon.status !== 'connected_to_controller' && mon.offerJsonFromController && (
            <div>
              <label htmlFor={`monAnswer-${mon.id}`} className="label">{mon.name}からの応答を貼り付け:</label>
              <textarea
                id={`monAnswer-${mon.id}`}
                placeholder={`${mon.name}からの応答を貼り付け`}
                value={currentMonitorIdForAnswer === mon.id ? answerFromMonitorInput : ''}
                onChange={e => onAnswerInputChange(mon.id, e.target.value)}
                className="textarea"
                disabled={currentMonitorIdForOffer !== mon.id && !mon.offerJsonFromController}
              />
              <div className="file-input-container" style={{ marginTop: '10px', marginBottom: '10px' }}>
                <label htmlFor={`monitorAnswerFileInput-${mon.id}`} className="label">または応答ファイルをアップロード:</label>
                <input
                  id={`monitorAnswerFileInput-${mon.id}`}
                  type="file"
                  accept=".json"
                  onChange={(e) => onAnswerFileChange(mon.id, e.target.files[0])}
                  className="input"
                  disabled={currentMonitorIdForOffer !== mon.id && !mon.offerJsonFromController}
                />
              </div>
              <button
                onClick={() => onAcceptAnswer(mon.id)}
                disabled={!isProcessingAnswer || (currentMonitorIdForOffer !== mon.id && !mon.offerJsonFromController)}
                className={`button ${(!isProcessingAnswer || (currentMonitorIdForOffer !== mon.id && !mon.offerJsonFromController)) ? 'button-disabled' : ''}`}
              >
                応答を処理
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

const readFileAsText = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, 'UTF-8'); // Specify UTF-8 encoding
  });
};

function ControllerScreen() {
  const {
    cameras, monitors,
    addCamera, setCameraAnswer, updateCameraStatus, getCameraById,
    removeCamera, removeMonitor,
    addMonitorPlaceholder,
    selectCamera, selectedCameraId, // Only used for preview now
    setOfferForMonitor, setMonitorAnswer, updateMonitorStatus, getMonitorById,
    initializeCameras, initializeMonitors, updateMonitorName // ストアに初期化関数があることを想定
  } = useAppStore();

  const [newCamOfferInput, setNewCamOfferInput] = useState('');
  const [expandedCameraJson, setExpandedCameraJson] = useState(null);
  const [expandedMonitorJson, setExpandedMonitorJson] = useState(null);
  const [monitorSourceMap, setMonitorSourceMap] = useState({});

  const [currentMonitorIdForOffer, setCurrentMonitorIdForOffer] = useState(null);
  const [currentMonitorIdForAnswer, setCurrentMonitorIdForAnswer] = useState(null);
  const [answerFromMonitorInput, setAnswerFromMonitorInput] = useState('');
  const [cameraOfferFile, setCameraOfferFile] = useState(null); // For file input
  const [monitorAnswerFile, setMonitorAnswerFile] = useState(null); // For file input

  const cameraPcRefs = useRef({});
  const cameraStreamRefs = useRef({});
  const monitorPcRefs = useRef({});

  const [status, setStatus] = useState('Controller Idle');
  const [error, setError] = useState('');

  const [previewTab, setPreviewTab] = useState('cameras'); // 'cameras' or 'monitors'
  const [fullscreenPreviewId, setFullscreenPreviewId] = useState(null); // For fullscreen video
  const previewVideoContainerRefs = useRef({});

  const createEmptyMediaStream = useCallback(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'white';
      ctx.font = '24px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Connected, But No Signal', canvas.width / 2, canvas.height / 2);
    }
    const videoStream = canvas.captureStream(1);
    const [videoTrack] = videoStream.getVideoTracks();

    // Create silent audio track
    const audioCtx = new AudioContext();
    const oscillator = audioCtx.createOscillator();
    const dst = oscillator.connect(audioCtx.createMediaStreamDestination());
    oscillator.start();
    const [audioTrack] = dst.stream.getAudioTracks();
    audioTrack.enabled = false; // Mute the audio track

    return new MediaStream([videoTrack, audioTrack]);
  }, []);

  const switchMonitorCamera = useCallback(async (monitorId, cameraId) => {
    console.log(CTRL_LOG_PREFIX + ` Switching monitor ${monitorId} to camera ${cameraId || 'No Signal'}`);
    const monitor = getMonitorById(monitorId);
    if (!monitor) return;

    const pc = monitorPcRefs.current[monitorId];
    if (!pc || !monitor.status.includes('connected')) {
      console.error(CTRL_LOG_PREFIX + " Cannot switch camera: Monitor not connected", monitorId);
      return;
    }

    try {
      console.log(CTRL_LOG_PREFIX + `Switching: getting stream from camera ${cameraId}`);
      const newStream = cameraId ? cameraStreamRefs.current[cameraId] : createEmptyMediaStream();
      if (!newStream) {
        console.error(CTRL_LOG_PREFIX + " Cannot switch camera: Stream not available", cameraId);
        return;
      }

      const tracks = newStream.getTracks();
      const senders = pc.getSenders();

      // Match tracks with senders by kind
      for (const track of tracks) {
        const sender = senders.find(s => s.track?.kind === track.kind);
        if (sender) {
          console.log(CTRL_LOG_PREFIX + `Switching: Replacing track of kind ${track.kind} for monitor ${monitorId}`);
          await sender.replaceTrack(track);
          if (track.kind === 'audio') {
            track.enabled = false; // Keep audio track muted
          }
        }
      }
    } catch (err) {
      console.error(CTRL_LOG_PREFIX + " Error switching camera for monitor " + monitorId, err);
      setError(`Failed to switch camera for ${monitor.name}: ${err.message}`);
    }
  }, [getCameraById, getMonitorById]);

  useEffect(() => {
    return () => {
      console.log(CTRL_LOG_PREFIX + " Unloading component, closing all peer connections.");
      Object.values(cameraPcRefs.current).forEach(pc => pc?.close());
      Object.values(monitorPcRefs.current).forEach(pc => pc?.close());
      cameraPcRefs.current = {};
      monitorPcRefs.current = {};
      cameraStreamRefs.current = {};
    };
  }, []);

  // 接続状態を保存
  useEffect(() => {
    saveConnectionState({
      cameras,
      monitors,
      monitorSourceMap,
    });
  }, [cameras, monitors, monitorSourceMap]);

  // 初期化時に接続状態を復元
  useEffect(() => {
    const state = loadConnectionState();

    // カメラとモニターの状態を復元
    if (state.cameras.length > 0) {
      initializeCameras(state.cameras);
    }
    if (state.monitors.length > 0) {
      initializeMonitors(state.monitors);
    }

    // モニターとカメラの接続マップを復元
    setMonitorSourceMap(state.monitorSourceMap);

    // 各デバイスの接続を再確立
    state.cameras.forEach(async (cam) => {
      if (cam.status === 'connected_streaming' || cam.status === 'pc_state_connected') {
        try {
          const pc = new RTCPeerConnection({});
          cameraPcRefs.current[cam.id] = pc;

          // 接続の再確立処理
          if (cam.sdp) {
            await pc.setRemoteDescription(new RTCSessionDescription(cam.sdp));
            for (const candidate of (cam.iceCandidates || [])) {
              if (candidate) {
                await pc.addIceCandidate(new RTCIceCandidate(candidate))
                  .catch(e => console.warn("Ctrl: Error adding restored cam ICE: " + e));
              }
            }
          }
        } catch (err) {
          console.error(CTRL_LOG_PREFIX + " Error restoring camera connection:", err);
          updateCameraStatus(cam.id, 'error_connection_restore');
        }
      }
    });

    state.monitors.forEach(async (mon) => {
      if (mon.status === 'connected_to_controller' || mon.status.includes('pc_state_connected')) {
        try {
          const pc = new RTCPeerConnection({});
          monitorPcRefs.current[mon.id] = pc;

          // 接続の再確立処理
          if (mon.sdp) {
            await pc.setRemoteDescription(new RTCSessionDescription(mon.sdp));
            for (const candidate of (mon.iceCandidates || [])) {
              if (candidate) {
                await pc.addIceCandidate(new RTCIceCandidate(candidate))
                  .catch(e => console.warn("Ctrl: Error adding restored mon ICE: " + e));
              }
            }
          }

          // まずNo Signal画面を設定
          await switchMonitorCamera(mon.id, null);
          setStatus(`Monitor ${mon.name} restored. No Signal screen is set.`);

          // 保存されていたカメラソースがあれば、それを後から接続
          const sourceId = state.monitorSourceMap[mon.id];
          if (sourceId && state.cameras.find(cam => cam.id === sourceId)) {
            setTimeout(async () => {
              await switchMonitorCamera(mon.id, sourceId);
              setStatus(`Monitor ${mon.name} restored with camera source.`);
            }, 1000); // 1秒後にカメラソースを接続
          }
        } catch (err) {
          console.error(CTRL_LOG_PREFIX + " Error restoring monitor connection:", err);
          updateMonitorStatus(mon.id, 'error_connection_restore');
        }
      }
    });
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setFullscreenPreviewId(null);
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = (id) => {
    const container = previewVideoContainerRefs.current[id];
    if (!container) return;

    if (!document.fullscreenElement) {
      container.requestFullscreen().catch(err => {
        setError(`Fullscreen error: ${err.message}`);
      });
      setFullscreenPreviewId(id);
    } else {
      document.exitFullscreen();
    }
  };

  // Existing handlers with updated monitor offer handling
  const handleProcessNewCameraOffer = async () => {
    let offerInputToProcess = newCamOfferInput;

    if (cameraOfferFile) {
      try {
        offerInputToProcess = await readFileAsText(cameraOfferFile);
        console.log(CTRL_LOG_PREFIX + " Read offer from file:", offerInputToProcess.substring(0, 150) + "...");
        setCameraOfferFile(null); // Reset file input
        const offerFileNameInput = document.getElementById('cameraOfferFileInput');
        if (offerFileNameInput) offerFileNameInput.value = ''; // Reset file input display
      } catch (e) {
        console.error(CTRL_LOG_PREFIX + " Error reading camera offer file:", e);
        setError("Error reading camera offer file: " + e.message);
        setStatus("Failed to read camera offer file.");
        return;
      }
    }

    if (!offerInputToProcess) {
      setError("New Camera Offer input or file is empty.");
      return;
    }

    console.log(CTRL_LOG_PREFIX + " Processing new camera offer...");
    setError('');
    let parsedRawOffer;
    try {
      parsedRawOffer = JSON.parse(offerInputToProcess);
      console.log(CTRL_LOG_PREFIX + " Parsed camera offer:", parsedRawOffer);
    } catch (e) {
      console.error(CTRL_LOG_PREFIX + " Failed to parse camera offer JSON:", e);
      setError("Invalid JSON in Camera Offer: " + e.message);
      setStatus("Failed to parse camera offer.");
      updateCameraStatus(newCamId, 'error_offer_processing');
      return;
    }

    if (!parsedRawOffer || !parsedRawOffer.sdp || parsedRawOffer.sdp.type !== 'offer') {
      setError("Invalid offer structure in Camera Offer JSON.");
      setStatus("Invalid camera offer structure.");
      updateCameraStatus(newCamId, 'error_offer_processing');
      return;
    }

    const newCamId = addCamera(newCamOfferInput, parsedRawOffer.iceCandidates || [], parsedRawOffer, parsedRawOffer.name);
    updateCameraStatus(newCamId, 'processing_offer');
    setExpandedCameraJson(newCamId);

    try {
      const pc = new RTCPeerConnection();
      console.log(CTRL_LOG_PREFIX + ` [CamID: ${newCamId}] Created new RTCPeerConnection.`);
      cameraPcRefs.current[newCamId] = pc;
      const collectedIceCandidates = [];

      pc.onicecandidate = event => {
        if (event.candidate) {
          console.log(CTRL_LOG_PREFIX + ` [CamID: ${newCamId}] ICE candidate gathered:`, event.candidate.toJSON());
          collectedIceCandidates.push(event.candidate.toJSON());
        } else {
          console.log(CTRL_LOG_PREFIX + ` [CamID: ${newCamId}] All ICE candidates have been gathered.`);
        }
      };

      pc.onicegatheringstatechange = () => {
        console.log(CTRL_LOG_PREFIX + ` [CamID: ${newCamId}] ICE gathering state changed: ${pc.iceGatheringState}`);
        if (pc.iceGatheringState === 'complete') {
          if (!pc.localDescription) {
            console.error(CTRL_LOG_PREFIX + ` [CamID: ${newCamId}] Failed to generate answer: No local description.`);
            setError("Failed to generate answer for Camera " + newCamId + ": No local description.");
            updateCameraStatus(newCamId, 'error_answering');
            return;
          }
          const answer = {
            type: 'controller_answer_to_cam',
            sdp: pc.localDescription.toJSON(),
            iceCandidates: collectedIceCandidates,
          };
          const answerJsonString = JSON.stringify(answer, null, 2);
          setCameraAnswer(newCamId, answerJsonString, collectedIceCandidates);
          console.log(CTRL_LOG_PREFIX + ` [CamID: ${newCamId}] Answer created and stored:`, answer);
          updateCameraStatus(newCamId, 'answer_ready');
          setStatus("Answer generated and downloaded for camera " + (getCameraById(newCamId)?.name || newCamId));

          // Download answer JSON file
          const blob = new Blob(['\uFEFF' + answerJsonString], { type: 'application/json;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `controller_answer_for_${getCameraById(newCamId)?.name || newCamId}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      };

      pc.ontrack = event => {
        console.log(CTRL_LOG_PREFIX + ` [CamID: ${newCamId}] Received track: kind=${event.track.kind}, id=${event.track.id}, stream_id=${event.streams[0]?.id}`);
        
        let stream = cameraStreamRefs.current[newCamId];
        if (!stream) {
            stream = new MediaStream();
            cameraStreamRefs.current[newCamId] = stream;
        }
        stream.addTrack(event.track);

        // Update status etc. when we get a video track
        if (event.track.kind === 'video') {
            updateCameraStatus(newCamId, 'connected_streaming');
            setStatus("Camera " + (getCameraById(newCamId)?.name || newCamId) + " connected and streaming.");
            // 接続成功時に接続情報を隠す
            setExpandedCameraJson(null);
        }
      };

      pc.onconnectionstatechange = () => {
        const camState = pc.connectionState;
        console.log(CTRL_LOG_PREFIX + ` [CamID: ${newCamId}] Connection state changed: ${camState}`);
        updateCameraStatus(newCamId, "pc_state_" + camState);
        if (camState === 'failed') {
          console.error(CTRL_LOG_PREFIX + ` [CamID: ${newCamId}] Connection failed.`);
          setError("Camera " + (getCameraById(newCamId)?.name || newCamId) + " connection failed.");
        } else if (camState === 'connected') {
          console.log(CTRL_LOG_PREFIX + ` [CamID: ${newCamId}] Connection successful.`);
          // 接続成功時に接続情報を隠す
          setExpandedCameraJson(null);
        }
      };

      pc.onsignalingstatechange = () => {
        console.log(CTRL_LOG_PREFIX + ` [CamID: ${newCamId}] Signaling state changed: ${pc.signalingState}`);
      };

      let sdpOffer = parsedRawOffer.sdp;
      if (typeof sdpOffer === 'string') {
        try {
          console.log(CTRL_LOG_PREFIX + ` [CamID: ${newCamId}] Offer SDP is a string, attempting to parse.`);
          sdpOffer = JSON.parse(sdpOffer);
        } catch (e) {
          console.error(CTRL_LOG_PREFIX + " Error parsing SDP string:", e);
          setError("Invalid SDP format in offer");
          updateCameraStatus(newCamId, 'error_offer_processing');
          return;
        }
      }

      console.log(CTRL_LOG_PREFIX + ` [CamID: ${newCamId}] Setting remote description with offer:`, sdpOffer);
      await pc.setRemoteDescription(new RTCSessionDescription(sdpOffer));

      if (parsedRawOffer.iceCandidates && Array.isArray(parsedRawOffer.iceCandidates)) {
        console.log(CTRL_LOG_PREFIX + ` [CamID: ${newCamId}] Adding ${parsedRawOffer.iceCandidates.length} ICE candidates.`);
        for (const candidate of (parsedRawOffer.iceCandidates || [])) {
          if (candidate) {
            console.log(CTRL_LOG_PREFIX + ` [CamID: ${newCamId}] Adding ICE candidate:`, candidate);
            await pc.addIceCandidate(new RTCIceCandidate(candidate))
              .catch(e => {
                console.warn(CTRL_LOG_PREFIX + ` [CamID: ${newCamId}] Error adding ICE candidate:`, e);
                setError("Error adding ICE candidate: " + e.message);
              });
          }
        }
      } else {
        console.log(CTRL_LOG_PREFIX + ` [CamID: ${newCamId}] No ICE candidates provided in offer.`);
      }

      console.log(CTRL_LOG_PREFIX + ` [CamID: ${newCamId}] Creating answer...`);
      const localAnswer = await pc.createAnswer();
      console.log(CTRL_LOG_PREFIX + ` [CamID: ${newCamId}] Setting local description with answer:`, localAnswer);
      await pc.setLocalDescription(localAnswer);
    } catch (err) {
      console.error(CTRL_LOG_PREFIX + " Error in camera offer processing:", err);
      setError("Error processing camera " + (getCameraById(newCamId)?.name || newCamId) + " offer: " + err.toString());
      updateCameraStatus(newCamId, 'error_offer_processing');
    }
    setNewCamOfferInput('');
  };

  const handlePrepareOfferForMonitor = useCallback(async (monitorId) => {
    const monitor = getMonitorById(monitorId);
    if (!monitor) {
      setError("Monitor not found: " + monitorId);
      updateMonitorStatus(monitorId, 'error_not_found');
      return;
    }

    console.log(CTRL_LOG_PREFIX + " Preparing offer for monitor " + monitorId);
    setStatus("Preparing offer for " + monitor.name);
    setError('');
    setCurrentMonitorIdForOffer(monitorId);
    setExpandedMonitorJson(monitorId);
    updateMonitorStatus(monitorId, 'controller_preparing_offer');

    try {
      if (monitorPcRefs.current[monitorId]) {
        console.log(CTRL_LOG_PREFIX + ` Closing existing PeerConnection for monitor ${monitorId} before creating new one.`);
        monitorPcRefs.current[monitorId].close();
      }
      const pc = new RTCPeerConnection();
      console.log(CTRL_LOG_PREFIX + ` [MonID: ${monitorId}] Created new RTCPeerConnection.`);
      monitorPcRefs.current[monitorId] = pc;
      const collectedIceCandidates = [];

      // Start with empty stream - camera can be selected later
      const emptyStream = createEmptyMediaStream();
      emptyStream.getTracks().forEach(track => {
        pc.addTrack(track, emptyStream);
        if (track.kind === 'audio') {
          track.enabled = false; // Mute the audio track
        }
      });

      pc.onicecandidate = event => {
        if (event.candidate) {
          console.log(CTRL_LOG_PREFIX + ` [MonID: ${monitorId}] ICE candidate gathered:`, event.candidate.toJSON());
          collectedIceCandidates.push(event.candidate.toJSON());
        } else {
          console.log(CTRL_LOG_PREFIX + ` [MonID: ${monitorId}] All ICE candidates have been gathered.`);
        }
      };

      pc.onicegatheringstatechange = () => {
        console.log(CTRL_LOG_PREFIX + ` [MonID: ${monitorId}] ICE gathering state changed: ${pc.iceGatheringState}`);
        if (pc.iceGatheringState === 'complete') {
          if (!pc.localDescription) {
            console.error(CTRL_LOG_PREFIX + ` [MonID: ${monitorId}] Failed to generate offer: No local description.`);
            setError("Failed to generate offer for Monitor " + monitor.name + ": No local desc.");
            updateMonitorStatus(monitorId, 'error_generating_offer');
            return;
          }
          const offerSdp = pc.localDescription.toJSON();
          const offerForMonitorJson = JSON.stringify({
            type: 'controller_offer_to_monitor',
            sdp: offerSdp,
            iceCandidates: collectedIceCandidates,
          }, null, 2);
          setOfferForMonitor(monitorId, offerForMonitorJson, collectedIceCandidates, offerSdp);
          console.log(CTRL_LOG_PREFIX + ` [MonID: ${monitorId}] Offer created and stored:`, { sdp: offerSdp, ice: collectedIceCandidates });
          updateMonitorStatus(monitorId, 'offer_ready_for_monitor');
          setStatus("Offer for " + monitor.name + " ready and downloaded.");
          
          // Download offer JSON file for monitor
          const blob = new Blob(['\uFEFF' + offerForMonitorJson], { type: 'application/json;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `controller_offer_for_${monitor.name}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      };

      pc.onconnectionstatechange = () => {
        const monState = pc.connectionState;
        console.log(CTRL_LOG_PREFIX + ` [MonID: ${monitorId}] Connection state changed: ${monState}`);
        updateMonitorStatus(monitorId, "pc_state_" + monState);
        if (monState === 'failed') {
          console.error(CTRL_LOG_PREFIX + ` [MonID: ${monitorId}] Connection failed.`);
          setError("Monitor " + monitor.name + " connection failed.");
        } else if (monState === 'connected') {
          console.log(CTRL_LOG_PREFIX + ` [MonID: ${monitorId}] Connection successful.`);
          setStatus("Monitor " + monitor.name + " connected. Use camera selector to choose source.");
        }
      };

      pc.onsignalingstatechange = () => {
        console.log(CTRL_LOG_PREFIX + ` [MonID: ${monitorId}] Signaling state changed: ${pc.signalingState}`);
      };

      const localOffer = await pc.createOffer();
      console.log(CTRL_LOG_PREFIX + ` [MonID: ${monitorId}] Created local offer, setting local description.`);
      await pc.setLocalDescription(localOffer);

    } catch (err) {
      setError("Error preparing offer for " + monitor.name + ": " + err.toString());
      updateMonitorStatus(monitorId, 'error_offer_preparation');
    }
  }, [getMonitorById, setOfferForMonitor, updateMonitorStatus]);

  const handleAcceptAnswerFromMonitor = useCallback(async (monitorId) => {
    const monitor = getMonitorById(monitorId);
    let answerInputToProcess = answerFromMonitorInput;
    console.log(CTRL_LOG_PREFIX + ` Attempting to accept answer for monitor ${monitorId}`);

    if (monitorAnswerFile && currentMonitorIdForAnswer === monitorId) {
      try {
        const fileContent = await readFileAsText(monitorAnswerFile);
        setMonitorAnswerFile(null); // Reset file input state first
        const answerFileNameInput = document.getElementById(`monitorAnswerFileInput-${monitorId}`);
        if (answerFileNameInput) answerFileNameInput.value = '';

        if (!fileContent) { // Check if file content is empty
          console.error(CTRL_LOG_PREFIX + ` Uploaded answer file for monitor ${monitorId} is empty.`);
          setError(`Uploaded answer file for ${monitor ? monitor.name : monitorId} is empty.`);
          setStatus("Failed to process empty answer file.");
          return;
        }
        answerInputToProcess = fileContent;
        console.log(CTRL_LOG_PREFIX + " Read answer from file:", answerInputToProcess.substring(0, 150) + "...");
      } catch (e) {
        console.error(CTRL_LOG_PREFIX + ` Error reading answer file for monitor ${monitorId}:`, e);
        setError("Error reading monitor answer file: " + e.message);
        setStatus("Failed to read monitor answer file.");
        setMonitorAnswerFile(null); // Clear file state on error too
        const answerFileNameInput = document.getElementById(`monitorAnswerFileInput-${monitorId}`);
        if (answerFileNameInput) answerFileNameInput.value = '';
        return;
      }
    }

    if (!monitor) {
      console.error(CTRL_LOG_PREFIX + ` Monitor with ID ${monitorId} not found when accepting answer.`);
      setError(`Monitor with ID ${monitorId} not found.`);
      setStatus("Error processing monitor answer.");
      return;
    }

    if (!answerInputToProcess) {
      console.error(CTRL_LOG_PREFIX + ` Answer input is missing for monitor ${monitor.name}.`);
      setError(`Answer input or file is missing for ${monitor.name}. Please provide the answer text or upload a valid file.`);
      setStatus("Error processing monitor answer.");
      return;
    }

    let answerPayload;
    try {
      answerPayload = JSON.parse(answerInputToProcess);
      console.log(CTRL_LOG_PREFIX + ` [MonID: ${monitorId}] Parsed answer payload:`, answerPayload);
    } catch (e) {
      console.error(CTRL_LOG_PREFIX + ` [MonID: ${monitorId}] Failed to parse answer JSON:`, e);
      setError("Invalid JSON in Monitor Answer: " + e.message);
      return;
    }

    if (answerPayload.name) {
      updateMonitorName(monitorId, answerPayload.name);
    }

    const pc = monitorPcRefs.current[monitorId];
    if (!pc) {
      setError("No active PeerConnection for monitor " + monitor.name);
      return;
    }

    setStatus("Processing answer from " + monitor.name + "...");
    setError('');
    updateMonitorStatus(monitorId, 'controller_processing_answer');

    try {
      // Re-parse to ensure we use the (potentially file-loaded) answerInputToProcess
      answerPayload = JSON.parse(answerInputToProcess);
      if (!answerPayload || !answerPayload.sdp || answerPayload.sdp.type !== 'answer') {
        console.error(CTRL_LOG_PREFIX + ` [MonID: ${monitorId}] Invalid answer structure from monitor.`);
        setError("Invalid answer structure from " + monitor.name);
        updateMonitorStatus(monitorId, 'error_invalid_answer');
        return;
      }

      let sdpAnswer = answerPayload.sdp;
      if (typeof sdpAnswer === 'string') {
        try {
          console.log(CTRL_LOG_PREFIX + ` [MonID: ${monitorId}] Answer SDP is a string, attempting to parse.`);
          sdpAnswer = JSON.parse(sdpAnswer);
        } catch (e) {
          console.error(CTRL_LOG_PREFIX + ` [MonID: ${monitorId}] Error parsing answer SDP string:`, e);
          setError("Invalid SDP format in answer");
          updateMonitorStatus(monitorId, 'error_processing_answer');
          return;
        }
      }

      console.log(CTRL_LOG_PREFIX + ` [MonID: ${monitorId}] Setting remote description with answer:`, sdpAnswer);
      await pc.setRemoteDescription(new RTCSessionDescription(sdpAnswer));

      if (answerPayload.iceCandidates && Array.isArray(answerPayload.iceCandidates)) {
        console.log(CTRL_LOG_PREFIX + ` [MonID: ${monitorId}] Adding ${answerPayload.iceCandidates.length} ICE candidates.`);
        for (const candidate of (answerPayload.iceCandidates || [])) {
          if (candidate) {
            console.log(CTRL_LOG_PREFIX + ` [MonID: ${monitorId}] Adding ICE candidate:`, candidate);
            await pc.addIceCandidate(new RTCIceCandidate(candidate))
              .catch(e => {
                console.warn(CTRL_LOG_PREFIX + ` [MonID: ${monitorId}] Error adding ICE candidate:`, e);
                setError("Error adding ICE candidate: " + e.message);
              });
          }
        }
      } else {
        console.log(CTRL_LOG_PREFIX + ` [MonID: ${monitorId}] No ICE candidates provided in answer.`);
      }

      setMonitorAnswer(monitorId, answerInputToProcess, answerPayload.iceCandidates || [], answerPayload.sdp);
      updateMonitorStatus(monitorId, 'connected_to_controller');

      // 接続が成功したら、自動的にNo Signal画面を設定
      console.log(CTRL_LOG_PREFIX + ` [MonID: ${monitorId}] Connection process complete, setting to No Signal screen.`);
      await switchMonitorCamera(monitorId, null);
      setStatus("Monitor " + monitor.name + " connected. No Signal screen is set.");

      // 接続成功時に接続情報を隠す
      setExpandedMonitorJson(null);

    } catch (err) {
      console.error(CTRL_LOG_PREFIX + " Error processing answer for monitor " + monitorId, err);
      setError(`Failed to process answer for ${monitor.name}: ${err.message}`);
      updateMonitorStatus(monitorId, 'error_processing_answer');
    }

    setAnswerFromMonitorInput('');
    setCurrentMonitorIdForAnswer(null);
  }, [answerFromMonitorInput, getMonitorById, setMonitorAnswer, updateMonitorStatus, switchMonitorCamera, monitorAnswerFile, currentMonitorIdForAnswer, setError, setStatus]);

  const handleAddNewMonitor = useCallback(() => {
    const newMonitorId = addMonitorPlaceholder();
    setStatus("New monitor placeholder added: " + (getMonitorById(newMonitorId)?.name || newMonitorId));
  }, [addMonitorPlaceholder, getMonitorById]);

  const selectedCameraStream = selectedCameraId ? cameraStreamRefs.current[selectedCameraId] : null;

  const copyToClipboardWrapper = useCallback((text, type) => {
    if (!text) {
      setError("No " + type + " text to copy.");
      return;
    }
    navigator.clipboard.writeText(text)
      .then(() => {
        setStatus(type + " copied to clipboard.");
        setTimeout(() => setStatus('Controller Idle'), 2000);
      })
      .catch(err => {
        setError("Failed to copy " + type + ": " + err.message);
      });
  }, [setError, setStatus]);

  const handleRemoveCamera = useCallback(async (cameraId) => {
    const camera = getCameraById(cameraId);
    if (!camera) return;

    // WebRTC接続を閉じる
    if (cameraPcRefs.current[cameraId]) {
      cameraPcRefs.current[cameraId].close();
      delete cameraPcRefs.current[cameraId];
    }

    // ストリームを停止
    if (cameraStreamRefs.current[cameraId]) {
      cameraStreamRefs.current[cameraId].getTracks().forEach(track => track.stop());
      delete cameraStreamRefs.current[cameraId];
    }

    // ストアから削除
    removeCamera(cameraId);
    setStatus(`Camera ${camera.name} has been removed.`);
  }, [getCameraById, removeCamera]);

  const handleRemoveMonitor = useCallback(async (monitorId) => {
    const monitor = getMonitorById(monitorId);
    if (!monitor) return;

    // WebRTC接続を閉じる
    if (monitorPcRefs.current[monitorId]) {
      monitorPcRefs.current[monitorId].close();
      delete monitorPcRefs.current[monitorId];
    }

    // モニターソースマップから削除
    setMonitorSourceMap(prev => {
      const newMap = { ...prev };
      delete newMap[monitorId];
      return newMap;
    });

    // ストアから削除
    removeMonitor(monitorId);
    setStatus(`Monitor ${monitor.name} has been removed.`);
  }, [getMonitorById, removeMonitor]);

  const onToggleExpandCamera = useCallback((id) => {
    setExpandedCameraJson(prev => (prev === id ? null : id));
  }, []);

  const onToggleExpandMonitor = useCallback((id) => {
    setExpandedMonitorJson(prev => (prev === id ? null : id));
  }, []);

  const handleMonitorAnswerInputChange = useCallback((id, value) => {
    setCurrentMonitorIdForAnswer(id);
    setAnswerFromMonitorInput(value);
    setMonitorAnswerFile(null);
  }, [setCurrentMonitorIdForAnswer, setAnswerFromMonitorInput, setMonitorAnswerFile]);

  const handleMonitorAnswerFileChange = useCallback((id, file) => {
    setCurrentMonitorIdForAnswer(id);
    setMonitorAnswerFile(file);
    setAnswerFromMonitorInput('');
  }, [setCurrentMonitorIdForAnswer, setMonitorAnswerFile, setAnswerFromMonitorInput]);

  const renderCameraItem = (cam) => (
    <CameraItem
      key={cam.id}
      cam={cam}
      selectedCameraId={selectedCameraId}
      onSelectCamera={selectCamera}
      onToggleExpand={onToggleExpandCamera}
      onRemoveCamera={handleRemoveCamera}
      expandedCameraJson={expandedCameraJson}
      copyToClipboard={copyToClipboardWrapper}
      getCameraById={getCameraById}
    />
  );

  const renderMonitorItem = (mon) => {
    const currentCameraId = monitorSourceMap[mon.id];
    const isConnected = mon.status === 'connected_to_controller' || mon.status.startsWith('pc_state_connected');
    const isProcessingAnswer = currentMonitorIdForAnswer === mon.id && (!!answerFromMonitorInput || !!monitorAnswerFile);

    return (
      <div key={mon.id} className="device-list-item">
        <div className="device-header">
          <span className="device-name">{mon.name}</span>
          <span className="status-badge" data-status={mon.status}>{mon.status}</span>
        </div>
        <div className="small-id">ID: {mon.id}</div>

        {isConnected && (
          <div className="expanded-content">
            <label htmlFor={`camera-select-${mon.id}`} className="label">カメラを選択:</label>
            <select
              id={`camera-select-${mon.id}`}
              value={currentCameraId || ''}
              onChange={(e) => switchMonitorCamera(mon.id, e.target.value || null)}
              className="camera-source-select button"
            >
              <option value="">信号なし</option>
              {cameras
                .filter(cam => cam.status === 'connected_streaming' || cam.status === 'pc_state_connected')
                .map(cam => (
                  <option key={cam.id} value={cam.id}>
                    {cam.name} {cam.status === 'connected_streaming' ? '(ストリーミング中)' : '(接続済み)'}
                  </option>
                ))
              }
            </select>
          </div>
        )}

        <div className="button-group">
          <button
            onClick={() => handlePrepareOfferForMonitor(mon.id)}
            disabled={mon.status === 'connected_to_controller' || mon.status?.includes('error')}
            className={`button ${mon.status === 'connected_to_controller' || mon.status?.includes('error') ? 'button-disabled' : ''}`}
          >
            {mon.status === 'connected_to_controller' ? '接続済み' : 'オファーを準備'}
          </button>
          <button
            onClick={() => onToggleExpandMonitor(expandedMonitorJson === mon.id ? null : mon.id)}
            className="button"
          >
            {expandedMonitorJson === mon.id ? '詳細を隠す' : '詳細を表示'}
          </button>
          <button
            onClick={() => handleRemoveMonitor(mon.id)}
            className="button button-danger"
          >
            モニターを削除
          </button>
        </div>

        {expandedMonitorJson === mon.id && (
          <div className="expanded-content">
            {mon.offerJsonFromController && (
              <div>
                <label htmlFor={`monOffer-${mon.id}`} className="label">
                  {mon.name}へのオファー: {currentCameraId ? `(${getCameraById(currentCameraId)?.name || '選択されたカメラ'}から)` : '(信号なし)'}
                </label>
                <textarea
                  id={`monOffer-${mon.id}`}
                  readOnly
                  value={mon.offerJsonFromController}
                  className="textarea"
                />
                <button
                  onClick={() => copyToClipboardWrapper(mon.offerJsonFromController, "Offer for Monitor")}
                  className="button"
                >
                  オファーをコピー
                </button>
              </div>
            )}
            {mon.status !== 'connected_to_controller' && mon.offerJsonFromController && (
              <div>
                <label htmlFor={`monAnswer-${mon.id}`} className="label">{mon.name}からの応答を貼り付け:</label>
                <textarea
                  id={`monAnswer-${mon.id}`}
                  placeholder={`${mon.name}からの応答を貼り付け`}
                  value={currentMonitorIdForAnswer === mon.id ? answerFromMonitorInput : ''}
                  onChange={e => handleMonitorAnswerInputChange(mon.id, e.target.value)}
                  className="textarea"
                  disabled={currentMonitorIdForOffer !== mon.id && !mon.offerJsonFromController}
                />
                <div className="file-input-container" style={{ marginTop: '10px', marginBottom: '10px' }}>
                  <label htmlFor={`monitorAnswerFileInput-${mon.id}`} className="label">または応答ファイルをアップロード:</label>
                  <input
                    id={`monitorAnswerFileInput-${mon.id}`}
                    type="file"
                    accept=".json"
                    onChange={(e) => handleMonitorAnswerFileChange(mon.id, e.target.files[0])}
                    className="input"
                    disabled={currentMonitorIdForOffer !== mon.id && !mon.offerJsonFromController}
                  />
                </div>
                <button
                  onClick={() => handleAcceptAnswerFromMonitor(mon.id)}
                  disabled={!isProcessingAnswer || (currentMonitorIdForOffer !== mon.id && !mon.offerJsonFromController)}
                  className={`button ${(!isProcessingAnswer || (currentMonitorIdForOffer !== mon.id && !mon.offerJsonFromController)) ? 'button-disabled' : ''}`}
                >
                  応答を処理
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="page-container">
      <header className="header">
        <h1 className="title">Synva Cast</h1>
        <span className="header-role">Controller</span>
        <p className="status">状態: {status}</p>
        {error && <p className="error">エラー: {error}</p>}
      </header>

      <div className="main-content-area">
        <section className="card">
          <div className="preview-tabs">
            <button
              className={`tab-button ${previewTab === 'cameras' ? 'active' : ''}`}
              onClick={() => setPreviewTab('cameras')}
            >
              カメラのプレビュー
            </button>
            <button
              className={`tab-button ${previewTab === 'monitors' ? 'active' : ''}`}
              onClick={() => setPreviewTab('monitors')}
            >
              モニターのプレビュー
            </button>
          </div>

          {previewTab === 'cameras' && (
            <div className="preview-grid">
              {cameras.filter(cam => cam.status === 'connected_streaming' || cam.status === 'pc_state_connected').map(cam => {
                return (
                  <div 
                    key={cam.id} 
                    className="video-container-wrapper"
                    ref={el => previewVideoContainerRefs.current[cam.id] = el}
                    onClick={() => toggleFullscreen(cam.id)}
                  >
                    <div className="video-container">
                      <video
                        ref={videoEl => {
                          if (videoEl && cameraStreamRefs.current[cam.id]) {
                            videoEl.srcObject = cameraStreamRefs.current[cam.id];
                          }
                        }}
                        autoPlay
                        playsInline
                        muted
                        className="video"
                      />
                      <div className="video-title">{cam.name}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {previewTab === 'monitors' && (
            <div className="video-grid">
              {monitors
                .filter(mon => mon.status === 'connected_to_controller' || mon.status.startsWith('pc_state_connected'))
                .map(mon => {
                  const currentCameraId = monitorSourceMap[mon.id];
                  return (
                    <div key={mon.id} className="video-container">
                      <h3 className="video-title">{mon.name}</h3>
                      <video
                        id={`monitor-preview-${mon.id}`}
                        ref={element => {
                          if (element && monitorPcRefs.current[mon.id]) {
                            const sender = monitorPcRefs.current[mon.id].getSenders().find(s => s.track?.kind === 'video');
                            if (sender && sender.track) {
                              const stream = new MediaStream([sender.track]);
                              element.srcObject = stream;
                            }
                          }
                        }}
                        autoPlay
                        playsInline
                        muted
                        className="video"
                      />
                      <div className="video-info">
                        <span className="status-badge" data-status={mon.status}>{mon.status}</span>
                        <select
                          value={currentCameraId || ''}
                          onChange={(e) => switchMonitorCamera(mon.id, e.target.value || null)}
                          className="camera-source-select-compact"
                        >
                          <option value="">信号なし</option>
                          {cameras
                            .filter(cam => cam.status === 'connected_streaming' || cam.status === 'pc_state_connected')
                            .map(cam => (
                              <option key={cam.id} value={cam.id}>
                                {cam.name} {cam.status === 'connected_streaming' ? '(ストリーミング中)' : '(接続済み)'}
                              </option>
                            ))
                          }
                        </select>
                      </div>
                    </div>
                  );
                })}
              {monitors.filter(mon => mon.status === 'connected_to_controller' || mon.status.startsWith('pc_state_connected')).length === 0 && (
                <p className="preview-message">プレビュー可能なモニターがありません。</p>
              )}
            </div>
          )}
        </section>

        <div className="device-list-container">
          <div className="device-column">
            <section className="card">
              <h2 className="title title-section">カメラ管理</h2>
              <label htmlFor="newCamOffer" className="label">新規カメラの登録 (オファーを貼り付け):</label>
              <textarea
                id="newCamOffer"
                placeholder="カメラのオファーJSONをここに貼り付け"
                value={newCamOfferInput}
                onChange={e => setNewCamOfferInput(e.target.value)}
                className="textarea"
              />
              <div className="file-input-container" style={{ marginTop: '10px', marginBottom: '10px' }}>
                <label htmlFor="cameraOfferFileInput" className="label">またはオファーファイルをアップロード:</label>
                <input
                  id="cameraOfferFileInput"
                  type="file"
                  accept=".json"
                  onChange={(e) => setCameraOfferFile(e.target.files[0])}
                  className="input"
                />
              </div>
              <button
                onClick={handleProcessNewCameraOffer}
                className={`button ${!newCamOfferInput && !cameraOfferFile ? 'button-disabled' : ''}`}
                disabled={!newCamOfferInput && !cameraOfferFile}
              >
                カメラオファーを処理
              </button>
            </section>
            <section className="card">
              <h3 className="title title-subsection">登録済みカメラ ({cameras.length})</h3>
              {cameras.length === 0 ? <p>カメラが登録されていません。</p> : cameras.map(renderCameraItem)}
            </section>
          </div>

          <div className="device-column">
            <section className="card">
              <h2 className="title title-section">モニター管理</h2>
              <button onClick={handleAddNewMonitor} className="button">
                新規モニターを追加
              </button>
            </section>
            <section className="card">
              <h3 className="title title-subsection">登録済みモニター ({monitors.length})</h3>
              {monitors.length === 0 ? <p>モニターが登録されていません。</p> : monitors.map(mon => (
                <MonitorItem
                  key={mon.id}
                  mon={mon}
                  monitorSourceMap={monitorSourceMap}
                  expandedMonitorJson={expandedMonitorJson}
                  currentMonitorIdForOffer={currentMonitorIdForOffer}
                  currentMonitorIdForAnswer={currentMonitorIdForAnswer}
                  answerFromMonitorInput={answerFromMonitorInput}
                  monitorAnswerFile={monitorAnswerFile}
                  cameras={cameras}
                  onSwitchCamera={switchMonitorCamera}
                  onPrepareOffer={handlePrepareOfferForMonitor}
                  onToggleExpand={onToggleExpandMonitor}
                  onRemoveMonitor={handleRemoveMonitor}
                  onAnswerInputChange={handleMonitorAnswerInputChange}
                  onAnswerFileChange={handleMonitorAnswerFileChange}
                  onAcceptAnswer={handleAcceptAnswerFromMonitor}
                  copyToClipboard={copyToClipboardWrapper}
                  getCameraById={getCameraById}
                />
              ))}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ControllerScreen;
