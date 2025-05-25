import React, { useState, useRef, useEffect } from 'react';

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
  }
};

function MonitorScreen() {
  console.log(MON_LOG_PREFIX + " Component RENDERED");
  const [controllerOfferJsonInput, setControllerOfferJsonInput] = useState('');
  const [monitorAnswerJson, setMonitorAnswerJson] = useState('');
  const [status, setStatus] = useState('Waiting for Offer from Controller');
  const [error, setError] = useState('');
  const [monitorName, setMonitorName] = useState('');
  const pcRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const videoRef = useRef(null);
  const collectedIceCandidatesRef = useRef([]);
  const answerTextareaRef = useRef(null);
  const videoContainerRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    return () => {
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
    if (!controllerOfferJsonInput) {
      setError("Monitor: Controller Offer input is empty.");
      return;
    }
    setStatus("Monitor: Processing Offer...");
    setError('');
    collectedIceCandidatesRef.current = [];
    setMonitorAnswerJson(''); // Clear previous answer

    let offerPayload;
    try {
      offerPayload = JSON.parse(controllerOfferJsonInput);
    } catch (e) {
      setError("Monitor: Invalid JSON in Controller Offer: " + e.message);
      setStatus("Monitor: Failed to parse offer.");
      return;
    }

    if (!offerPayload || typeof offerPayload.sdp !== 'object' || offerPayload.sdp.type !== 'offer') {
      setError("Monitor: Invalid Controller Offer signal structure.");
      setStatus("Monitor: Invalid offer structure.");
      return;
    }

    try {
      if (pcRef.current) pcRef.current.close();
      const pc = new RTCPeerConnection({});
      pcRef.current = pc;

      pc.onicecandidate = (event) => {
        if (event.candidate) collectedIceCandidatesRef.current.push(event.candidate.toJSON());
      };

      pc.onicegatheringstatechange = () => {
        setStatus("Monitor ICE Gathering: " + pc.iceGatheringState);
        if (pc.iceGatheringState === 'complete') {
          if (!pc.localDescription) {
            setError("Monitor: Error: Local description missing during answer creation.");
            return;
          }
          const answerPayload = {
            type: 'monitor_answer_to_controller',
            name: monitorName || 'モニター',
            sdp: pc.localDescription.toJSON(),
            iceCandidates: collectedIceCandidatesRef.current
          };
          setMonitorAnswerJson(JSON.stringify(answerPayload, null, 2));
          setStatus('Monitor: Answer created. Copy to Controller.');
        }
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        setStatus("Monitor Connection: " + state);
        if (state === 'failed') {
          setError("Monitor: Connection FAILED.");
        } else if (state === 'connected') {
          setStatus("Monitor: Connected! Stream should be playing.");
          setError('');
          // 接続が成功したら接続情報を非表示にする
          setControllerOfferJsonInput('');
          setMonitorAnswerJson('');
        }
      };

      pc.oniceconnectionstatechange = () => setStatus("Monitor ICE: " + pc.iceConnectionState);
      pc.onsignalingstatechange = () => console.log(MON_LOG_PREFIX + "Signaling state: " + pc.signalingState);

      pc.ontrack = (event) => {
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

      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });

      await pc.setRemoteDescription(new RTCSessionDescription(offerPayload.sdp));

      if (offerPayload.iceCandidates && Array.isArray(offerPayload.iceCandidates)) {
        for (const candidate of offerPayload.iceCandidates) {
          if (candidate) await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => console.warn("Error adding remote ICE: " + e));
        }
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

    } catch (err) {
      setError("Monitor: Offer/Answer Error: " + err.toString());
      setStatus('Monitor: Failed to process Controller offer.');
    }
  };

  const fallbackCopyToClipboard = (text, type, textareaRefForFallback) => {
    if (textareaRefForFallback && textareaRefForFallback.current) {
      textareaRefForFallback.current.select();
      document.execCommand('copy');
      setStatus("Copied " + type + " (fallback)! Please verify.");
      setTimeout(() => setStatus(prev => prev === ("Copied " + type + " (fallback)! Please verify.") ? ("Monitor: " + type + " ready.") : prev), 2000);
    } else {
      setError("Textarea ref not available for fallback copy for " + type);
    }
  };

  const copyToClipboard = (textToCopy, type, textareaForFallbackRef) => {
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
          setError("Failed to copy " + type + ". Please copy manually or grant clipboard permission.");
          fallbackCopyToClipboard(textToCopy, type, textareaForFallbackRef);
        });
    } else {
      fallbackCopyToClipboard(textToCopy, type, textareaForFallbackRef);
    }
  };

  return (
    <div style={commonStyles.pageContainer}>
      <header style={commonStyles.header}>
        <h1 style={commonStyles.title}>モニター設定</h1>
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
            <button
              onClick={processOfferAndCreateAnswer}
              style={{ ...commonStyles.button, ...((!controllerOfferJsonInput || (pcRef.current && pcRef.current.signalingState !== 'stable' && pcRef.current.signalingState !== 'closed')) && commonStyles.buttonDisabled) }}
              disabled={!controllerOfferJsonInput || (pcRef.current && pcRef.current.signalingState !== 'stable' && pcRef.current.signalingState !== 'closed')}
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