import React, { useState, useRef, useEffect, useCallback } from 'react';

const MON_LOG_PREFIX = "[MonitorScreen]";

// Using commonStyles similar to CameraScreen for consistency
const commonStyles = {
  pageContainer: {
    width: '100vw',
    minHeight: '100vh',
    padding: '0',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#f0f2f5', 
    gap: '0'
  },
  header: {
    padding: '15px 20px',
    backgroundColor: '#ffffff',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    width: '100vw',
    boxSizing: 'border-box',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mainContentArea: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    padding: '20px',
    flex: 1
  },
  title: {
    margin: '0 0 10px 0',
    color: '#333',
    fontSize: '1.8em'
  },
  headerRole: {
    fontSize: '1.2em',
    fontWeight: 'bold',
    color: '#555'
  },
  status: {
    marginBottom: '5px',
    fontWeight: 'bold',
    fontSize: '1.1em'
  },
  error: {
    color: '#d9534f',
    fontWeight: 'bold',
    marginBottom: '10px'
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    padding: '20px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    display: 'flex',
    flexDirection: 'column',
    gap: '15px'
  },
  video: {
    width: '100%',
    maxWidth: '100%',
    height: 'auto',
    borderRadius: '6px',
    border: '1px solid #ddd',
    backgroundColor: '#000',
    display: 'block',
    margin: '0 auto'
  },
  videoContainer: {
    position: 'relative',
    width: '100%',
    backgroundColor: '#000',
    borderRadius: '6px',
    overflow: 'hidden'
  },
  fullscreenButton: {
    position: 'absolute',
    bottom: '20px',
    right: '20px',
    padding: '10px 15px',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    zIndex: 1000,
    transition: 'background-color 0.2s ease',
    display: 'flex',
    alignItems: 'center',
    gap: '5px'
  },
  fullscreenIcon: {
    width: '16px',
    height: '16px',
    fill: 'currentColor'
  },
  textarea: {
    width: '100%',
    minHeight: '120px',
    padding: '10px',
    border: '1px solid #ccc',
    borderRadius: '4px',
    fontFamily: 'monospace',
    fontSize: '0.9em',
    boxSizing: 'border-box'
  },
  button: {
    padding: '12px 20px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    backgroundColor: '#007bff',
    color: 'white',
    fontSize: '1em',
    transition: 'background-color 0.2s ease'
  },
  buttonDisabled: {
    backgroundColor: '#6c757d',
    cursor: 'not-allowed'
  },
  label: {
    display: 'block',
    marginBottom: '8px',
    fontWeight: 'bold',
    color: '#555'
  },
  input: {
    // Assuming you have a style for input or reuse one
  }
};

function MonitorScreen() {
  console.log(MON_LOG_PREFIX + " Component RENDERED");
  const [controllerOfferJsonInput, setControllerOfferJsonInput] = useState('');
  const [monitorAnswerJson, setMonitorAnswerJson] = useState('');
  const [status, setStatus] = useState('Waiting for Offer from Controller');
  const [error, setError] = useState('');
  const [monitorName, setMonitorName] = useState('');
  const [controllerOfferFile, setControllerOfferFile] = useState(null); // For file input
  const pcRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const videoRef = useRef(null);
  const collectedIceCandidatesRef = useRef([]);
  const answerTextareaRef = useRef(null);
  const videoContainerRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    return () => {
      console.log(MON_LOG_PREFIX + " Unloading component, closing peer connection.");
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
      if (remoteStreamRef.current) {
        remoteStreamRef.current.getTracks().forEach(track => track.stop());
        remoteStreamRef.current = null;
      }
    };
  }, []);

  // フルスクリーン状態の変更を監視
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === videoContainerRef.current);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // フルスクリーンの切り替え
  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await videoContainerRef.current.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      setError("Fullscreen error: " + err.message);
    }
  };

  const processOfferAndCreateAnswer = async () => {
    let offerInputToProcess = controllerOfferJsonInput;

    if (controllerOfferFile) {
      try {
        offerInputToProcess = await controllerOfferFile.text();
        console.log(MON_LOG_PREFIX + " Read offer from file:", offerInputToProcess.substring(0, 150) + "...");
        setControllerOfferFile(null); // Reset file input
        const offerFileNameInput = document.getElementById('controllerOfferFileInput');
        if (offerFileNameInput) offerFileNameInput.value = ''; // Reset file input display
      } catch (e) {
        console.error(MON_LOG_PREFIX + " Error reading controller offer file:", e);
        setError("Monitor: Error reading controller offer file: " + e.message);
        setStatus("Monitor: Failed to read offer file.");
        return;
      }
    }

    if (!offerInputToProcess) {
      setError("Monitor: Controller Offer input or file is empty.");
      return;
    }
    console.log(MON_LOG_PREFIX + " Processing offer from controller.");
    setStatus("Monitor: Processing Offer...");
    setError('');
    collectedIceCandidatesRef.current = [];
    setMonitorAnswerJson(''); // Clear previous answer

    let offerPayload;
    try {
      offerPayload = JSON.parse(offerInputToProcess);
      console.log(MON_LOG_PREFIX + " Parsed offer payload:", offerPayload);
    } catch (e) {
      console.error(MON_LOG_PREFIX + " Failed to parse offer JSON:", e);
      setError("Monitor: Invalid JSON in Controller Offer: " + e.message);
      setStatus("Monitor: Failed to parse offer.");
      return;
    }

    if (!offerPayload || typeof offerPayload.sdp !== 'object' || offerPayload.sdp.type !== 'offer') {
      console.error(MON_LOG_PREFIX + " Invalid offer signal structure.");
      setError("Monitor: Invalid Controller Offer signal structure.");
      setStatus("Monitor: Invalid offer structure.");
      return;
    }

    try {
      if (pcRef.current) {
        console.log(MON_LOG_PREFIX + " Closing existing PeerConnection before creating new one.");
        pcRef.current.close();
      }
      const pc = new RTCPeerConnection({}); 
      console.log(MON_LOG_PREFIX + " Created new RTCPeerConnection.");
      pcRef.current = pc;

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log(MON_LOG_PREFIX + " ICE candidate gathered:", event.candidate.toJSON());
          collectedIceCandidatesRef.current.push(event.candidate.toJSON());
        } else {
          console.log(MON_LOG_PREFIX + " All ICE candidates have been gathered.");
        }
      };

      pc.onicegatheringstatechange = () => {
        console.log(MON_LOG_PREFIX + " ICE gathering state changed: " + pc.iceGatheringState);
        setStatus("Monitor ICE Gathering: " + pc.iceGatheringState);
        if (pc.iceGatheringState === 'complete') {
          if (!pc.localDescription) {
            console.error(MON_LOG_PREFIX + " Error: Local description missing during answer creation.");
            setError("Monitor: Error: Local description missing during answer creation.");
            return;
          }
          const answerPayload = {
            type: 'monitor_answer_to_controller',
            name: monitorName || 'モニター',
            sdp: pc.localDescription.toJSON(),
            iceCandidates: collectedIceCandidatesRef.current
          };
          const answerJsonString = JSON.stringify(answerPayload, null, 2);
          setMonitorAnswerJson(answerJsonString);
          console.log(MON_LOG_PREFIX + " Answer created and stored:", answerPayload);
          setStatus('Monitor: Answer created and downloaded.');

          // Download answer JSON file
          const blob = new Blob([answerJsonString], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `monitor_answer_${monitorName || 'default'}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        console.log(MON_LOG_PREFIX + " Connection state changed: " + state);
        setStatus("Monitor Connection: " + state);
        if (state === 'failed') {
          console.error(MON_LOG_PREFIX + " Connection FAILED.");
          setError("Monitor: Connection FAILED.");
        } else if (state === 'connected') {
          console.log(MON_LOG_PREFIX + " Connection successful!");
          setStatus("Monitor: Connected! Stream should be playing.");
          setError('');
          // 接続が成功したら接続情報を非表示にする
          setControllerOfferJsonInput('');
          setMonitorAnswerJson('');
        }
      };
      
      pc.oniceconnectionstatechange = () => {
        console.log(MON_LOG_PREFIX + " ICE connection state changed: " + pc.iceConnectionState);
        setStatus("Monitor ICE: " + pc.iceConnectionState);
      }
      pc.onsignalingstatechange = () => console.log(MON_LOG_PREFIX + " Signaling state changed: " + pc.signalingState);

      pc.ontrack = (event) => {
        console.log(MON_LOG_PREFIX + ` Received track: kind=${event.track.kind}, id=${event.track.id}, stream_id=${event.streams[0]?.id}`);
        if (event.streams && event.streams[0]) {
          remoteStreamRef.current = event.streams[0];
          if (videoRef.current) videoRef.current.srcObject = event.streams[0];
        } else {
          const newStream = new MediaStream([event.track]);
          remoteStreamRef.current = newStream;
          if (videoRef.current) videoRef.current.srcObject = newStream;
        }
        setStatus("Monitor: Stream received.");
      };

      console.log(MON_LOG_PREFIX + " Adding transceivers for video and audio.");
      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });

      console.log(MON_LOG_PREFIX + " Setting remote description with offer:", offerPayload.sdp);
      await pc.setRemoteDescription(new RTCSessionDescription(offerPayload.sdp));
      
      if (offerPayload.iceCandidates && Array.isArray(offerPayload.iceCandidates)) {
        console.log(MON_LOG_PREFIX + ` Adding ${offerPayload.iceCandidates.length} ICE candidates.`);
        for (const candidate of offerPayload.iceCandidates) {
          if (candidate) {
            console.log(MON_LOG_PREFIX + " Adding ICE candidate:", candidate);
            await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => console.warn("Error adding remote ICE: " + e));
          }
        }
      } else {
        console.log(MON_LOG_PREFIX + " No ICE candidates provided in offer.");
      }

      console.log(MON_LOG_PREFIX + " Creating answer...");
      const answer = await pc.createAnswer();
      console.log(MON_LOG_PREFIX + " Setting local description with answer:", answer);
      await pc.setLocalDescription(answer);

    } catch (err) {
      console.error(MON_LOG_PREFIX + " Error in offer/answer process:", err);
      setError("Monitor: Offer/Answer Error: " + err.toString());
      setStatus('Monitor: Failed to process Controller offer.');
    }
  };

  const fallbackCopyToClipboard = useCallback((text, type, textareaRefForFallback) => {
    if (textareaRefForFallback && textareaRefForFallback.current) {
      textareaRefForFallback.current.select();
      document.execCommand('copy');
      setStatus("Copied " + type + " (fallback)! Please verify.");
      setTimeout(() => setStatus(prev => prev === ("Copied " + type + " (fallback)! Please verify.") ? ("Monitor: " + type + " ready.") : prev), 2000);
    } else {
      setError("Textarea ref not available for fallback copy for " + type);
    }
  }, [setStatus, setError]);

  const copyToClipboard = useCallback((textToCopy, type, textareaForFallbackRef) => {
    if (!textToCopy) {
      setError("Monitor: No " + type + " text to copy.");
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textToCopy)
        .then(() => {
          setStatus("Copied " + type + " to clipboard!");
          setTimeout(() => setStatus(prev => prev === ("Copied " + type + " to clipboard!") ? ("Monitor: " + type + " ready.") : prev), 2000);
        })
        .catch(err => {
          setError("Failed to copy " + type + ". Please copy manually or grant clipboard permission. " + err.message);
          fallbackCopyToClipboard(textToCopy, type, textareaForFallbackRef);
        });
    } else {
      fallbackCopyToClipboard(textToCopy, type, textareaForFallbackRef);
    }
  }, [fallbackCopyToClipboard, setError, setStatus]);

  return (
    <div style={commonStyles.pageContainer}>
      <header style={commonStyles.header}>
        <h1 style={commonStyles.title}>Synva Cast</h1>
        <span style={commonStyles.headerRole}>Monitor</span>
        <p style={commonStyles.status}>モニターの状態: {status}</p>
        {error && <p style={commonStyles.error}>エラー: {error}</p>}
      </header>

      <div style={commonStyles.mainContentArea}>
        <section style={commonStyles.card}>
          <h2 style={{ ...commonStyles.title, fontSize: '1.4em' }}>モニター設定</h2>
          <div style={{ marginBottom: '20px' }}>
            <label htmlFor="monitorName" style={commonStyles.label}>モニターの名前:</label>
            <input
              id="monitorName"
              type="text"
              value={monitorName}
              onChange={e => setMonitorName(e.target.value)}
              placeholder="モニターの名前を入力"
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                marginBottom: '10px',
                boxSizing: 'border-box'
              }}
            />
          </div>
        </section>

        <section style={commonStyles.card}>
          <h2 style={{ ...commonStyles.title, fontSize: '1.4em' }}>モニタープレビュー</h2>
          <div ref={videoContainerRef} style={commonStyles.videoContainer}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              style={commonStyles.video}
            />
            {remoteStreamRef.current && !isFullscreen && (
              <button
                onClick={toggleFullscreen}
                style={commonStyles.fullscreenButton}
                title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              >
                {isFullscreen ? (
                  <svg style={commonStyles.fullscreenIcon} viewBox="0 0 24 24">
                    <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
                  </svg>
                ) : (
                  <svg style={commonStyles.fullscreenIcon} viewBox="0 0 24 24">
                    <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
                  </svg>
                )}
                {isFullscreen ? "" : "全画面表示"}
              </button>
            )}
            {!remoteStreamRef.current && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#333',
                color: 'white',
                minHeight: '200px'
              }}>
                <p>Waiting for video stream from Controller...</p>
              </div>
            )}
          </div>
        </section>

        <section style={commonStyles.card}>
          <h2 style={{ ...commonStyles.title, fontSize: '1.4em' }}>コントローラー接続</h2>
          <div className="connection-status">
            <p>接続状態: {status}</p>
            {error && <p className="error">接続エラー: {error}</p>}
          </div>

          <div className="offer-section">
            <label htmlFor="controllerOffer" style={commonStyles.label}>コントローラーからのオファーを貼り付けてください:</label>
            <textarea 
                id="controllerOffer"
              placeholder="コントローラーのオファーJSONをここに貼り付け"
                value={controllerOfferJsonInput} 
                onChange={e => setControllerOfferJsonInput(e.target.value)} 
                style={commonStyles.textarea}
                disabled={pcRef.current && pcRef.current.signalingState !== 'stable' && pcRef.current.signalingState !== 'closed'}
            />
            <div className="file-input-container" style={{ marginTop: '10px', marginBottom: '10px' }}>
              <label htmlFor="controllerOfferFileInput" style={commonStyles.label}>またはオファーファイルをアップロード:</label>
              <input 
                id="controllerOfferFileInput"
                type="file" 
                accept=".json"
                onChange={(e) => {
                  setControllerOfferFile(e.target.files[0]);
                  setControllerOfferJsonInput(''); // Clear textarea if file is chosen
                }} 
                style={commonStyles.input} // Assuming you have a style for input or reuse one
                disabled={pcRef.current && pcRef.current.signalingState !== 'stable' && pcRef.current.signalingState !== 'closed'}
              />
            </div>
          <button 
            onClick={processOfferAndCreateAnswer} 
              style={{ ...commonStyles.button, ...((!controllerOfferJsonInput && !controllerOfferFile || (pcRef.current && pcRef.current.signalingState !== 'stable' && pcRef.current.signalingState !== 'closed')) && commonStyles.buttonDisabled) }}
            disabled={!controllerOfferJsonInput && !controllerOfferFile || (pcRef.current && pcRef.current.signalingState !== 'stable' && pcRef.current.signalingState !== 'closed')}
          >
              {pcRef.current && pcRef.current.signalingState !== 'stable' && pcRef.current.signalingState !== 'closed' ? 'オファー処理中...' : 'オファーを処理'}
          </button>
          </div>
          
          {monitorAnswerJson && (
            <div className="json-display">
              <label htmlFor="monitorAnswer" style={commonStyles.label}>生成された応答:</label>
              <textarea 
                id="monitorAnswer"
                ref={answerTextareaRef} 
                value={monitorAnswerJson} 
                readOnly 
                style={commonStyles.textarea}
              />
              <button 
                  onClick={() => copyToClipboard(monitorAnswerJson, 'Answer', answerTextareaRef)} 
                style={{ ...commonStyles.button, marginTop: '10px' }}
              >
                応答をコピー
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default MonitorScreen; 