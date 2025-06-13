import React, { useState, useRef, useEffect, useCallback } from 'react';

const CAM_LOG_PREFIX = "[CamScreen]";

// Consolidate styles for better reusability and cleaner component structure
const commonStyles = {
  pageContainer: {
    width: '100vw',
    minHeight: '100vh',
    padding: '0',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#f0f2f5', // Light grey background for the page
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
    flex: 1,
    alignItems: 'center',
  },
  title: {
    margin: '0',
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
    maxWidth: '720px', // Max width for very large screens
    height: 'auto',
    borderRadius: '6px',
    border: '1px solid #ddd',
    backgroundColor: '#000',
    display: 'block', // To remove extra space below video
    margin: '0 auto 20px auto' // Center video
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
  buttonGroup: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap'
  },
  label: {
    display: 'block',
    marginBottom: '8px',
    fontWeight: 'bold',
    color: '#555'
  },
  input: {
    width: '100%',
    padding: '10px',
    border: '1px solid #ccc',
    borderRadius: '4px',
    boxSizing: 'border-box'
  }
};

const readFileAsText = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, 'UTF-8');
  });
};

function CameraScreen() {
  console.log(CAM_LOG_PREFIX + " Component RENDERED");
  const [localStream, setLocalStream] = useState(null);
  const [offerSignal, setOfferSignal] = useState('');
  const [answerSignalInput, setAnswerSignalInput] = useState('');
  const [status, setStatus] = useState('Not connected');
  const [error, setError] = useState('');
  const [cameraName, setCameraName] = useState('');
  const [sourceType, setSourceType] = useState('camera'); // 'camera' or 'screen'
  const [controllerAnswerFile, setControllerAnswerFile] = useState(null); // For file input

  const [availableVideoDevices, setAvailableVideoDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');

  const pcRef = useRef(null);
  const collectedIceCandidatesRef = useRef([]);
  const offerSignalTextareaRef = useRef(null);

  useEffect(() => {
    const getDevices = async () => {
      try {
        // Ensure permissions are granted first, often by an initial getUserMedia call
        // For simplicity, we'll assume permissions might be granted or enumerate will work.
        // A more robust approach might tie this to after a successful startLocalMedia.
        await navigator.mediaDevices.getUserMedia({ video: true, audio: true }); // Request permission
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        setAvailableVideoDevices(videoDevices);
        if (videoDevices.length > 0 && !selectedDeviceId) {
          setSelectedDeviceId(videoDevices[0].deviceId);
        }
      } catch (err) {
        console.warn(CAM_LOG_PREFIX + " Error enumerating devices: " + err.message);
        // setError("Could not list camera devices: " + err.message); // Avoid immediate error, let user try to start
      }
    };
    getDevices();
  }, []); // Run once on mount

  useEffect(() => {
    return () => {
      console.log(CAM_LOG_PREFIX + " Unloading component, stopping media stream and closing peer connection.");
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
    };
  }, [localStream]);

  const startLocalMedia = async (deviceId) => {
    console.log(CAM_LOG_PREFIX + ` Starting local media. Source: ${sourceType}, DeviceID: ${deviceId || 'any'}`);
    setStatus('メディアを起動中...');
    setError('');

    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }

    try {
      let stream;
      if (sourceType === 'screen') {
        const displayMediaOptions = {
          video: {
            displaySurface: "browser",
          },
          audio: {
            suppressLocalAudioPlayback: false
          },
          selfBrowserSurface: "exclude",
          systemAudio: "include",
          surfaceSwitching: "include"
        };

        stream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);
        
        // 画面共有が停止された時のイベントハンドラを設定
        stream.getVideoTracks()[0].addEventListener('ended', () => {
          setStatus('画面共有が停止されました');
          setLocalStream(null);
          setSourceType('camera');
        });
      } else {
    const videoConstraints = deviceId ? { deviceId: { exact: deviceId } } : true;
        stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      setAvailableVideoDevices(videoDevices);
        if (deviceId && !videoDevices.find(d => d.deviceId === deviceId)) {
          setSelectedDeviceId('');
        }
      }

      setLocalStream(stream);
      if (sourceType === 'camera') {
        setSelectedDeviceId(deviceId || (stream.getVideoTracks()[0]?.getSettings().deviceId || ''));
      }

      // 既存のPeerConnectionがある場合は、新しいストリームを追加
      if (pcRef.current && pcRef.current.connectionState === 'connected') {
        console.log(CAM_LOG_PREFIX + " PeerConnection already connected. Replacing tracks.");
        const senders = pcRef.current.getSenders();
        const videoTrack = stream.getVideoTracks()[0];
        const audioTrack = stream.getAudioTracks()[0];
        
        if (videoTrack) {
          const videoSender = senders.find(sender => sender.track?.kind === 'video');
          if (videoSender) {
            console.log(CAM_LOG_PREFIX + " Replacing video track.");
            await videoSender.replaceTrack(videoTrack);
          }
        }
        
        if (audioTrack) {
          const audioSender = senders.find(sender => sender.track?.kind === 'audio');
          if (audioSender) {
            console.log(CAM_LOG_PREFIX + " Replacing audio track.");
            await audioSender.replaceTrack(audioTrack);
          }
        }
      }

      setStatus(sourceType === 'screen' ? '画面共有の準備完了' : 'カメラの起動が完了しました。');

    } catch (err) {
      console.error(CAM_LOG_PREFIX + " Error starting local media:", err);
      if (err.name === 'NotAllowedError') {
        setError("画面共有が拒否されました");
      } else {
        setError("メディアの起動に失敗しました: " + err.message);
      }
      setStatus('メディアの起動中にエラーが発生しました。');
      if (sourceType === 'camera') {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      setAvailableVideoDevices(videoDevices);
      if (deviceId && !videoDevices.find(d => d.deviceId === deviceId)) {
          setSelectedDeviceId('');
        }
      }
    }
  };

  const initializePcAndCreateOffer = async () => {
    if (!localStream) {
      setError("ローカルメディアが開始されていません。先にカメラを開始してください。");
      return;
    }
    console.log(CAM_LOG_PREFIX + " Initializing PeerConnection and creating offer.");
    setStatus("カメラ: PeerConnectionを初期化中...");
    setError('');
    collectedIceCandidatesRef.current = [];
    if(pcRef.current) {
      console.log(CAM_LOG_PREFIX + " Closing existing PeerConnection before creating new one.");
      pcRef.current.close();
    }

    const pc = new RTCPeerConnection({ iceTransportPolicy: 'all' });
    console.log(CAM_LOG_PREFIX + " Created new RTCPeerConnection.");
    pcRef.current = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(CAM_LOG_PREFIX + " ICE candidate gathered:", event.candidate.toJSON());
        collectedIceCandidatesRef.current.push(event.candidate.toJSON());
      } else {
        console.log(CAM_LOG_PREFIX + " All ICE candidates have been gathered.");
      }
    };

    pc.onicegatheringstatechange = () => {
      console.log(CAM_LOG_PREFIX + " ICE gathering state changed: " + pc.iceGatheringState);
      if (pc.iceGatheringState === 'complete') {
        if (!pc.localDescription) {
          console.error(CAM_LOG_PREFIX + " Error: Local description missing during offer creation.");
          setError("カメラ: エラー: オファー作成中にローカル記述が見つかりません。");
          return;
        }
        const offerSignalPayload = {
          type: 'camera_offer',
          name: cameraName || 'カメラ',
          sdp: pc.localDescription.toJSON(),
          iceCandidates: collectedIceCandidatesRef.current
        };
        const offerJsonString = JSON.stringify(offerSignalPayload, null, 2);
        setOfferSignal(offerJsonString);
        console.log(CAM_LOG_PREFIX + " Offer created and stored:", offerSignalPayload);
        setStatus('カメラ: オファーが作成され、ファイルとしてダウンロードされました。');

        // Download offer JSON file
        const blob = new Blob(['\uFEFF' + offerJsonString], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `camera_offer_${cameraName || 'default'}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log(CAM_LOG_PREFIX + " Connection state changed: " + state);
      setStatus("カメラ-コントローラー接続状態: " + state);
      if (state === 'failed') {
        console.error(CAM_LOG_PREFIX + " Connection FAILED.");
        setError("カメラ: コントローラーへの接続が失敗しました。");
      } else if (state === "connected") {
        console.log(CAM_LOG_PREFIX + " Connection successful!");
        setStatus("カメラ: コントローラーに正常に接続されました！");
        setError('');
        // 接続が成功したら接続情報を非表示にする
        setOfferSignal('');
        setAnswerSignalInput('');
      }
    };
    
    pc.oniceconnectionstatechange = () => {
      console.log(CAM_LOG_PREFIX + " ICE connection state changed: " + pc.iceConnectionState);
      setStatus("カメラ-コントローラー ICE状態: " + pc.iceConnectionState);
    }
    pc.onsignalingstatechange = () => console.log(CAM_LOG_PREFIX + " Signaling state changed: " + pc.signalingState);

    console.log(CAM_LOG_PREFIX + " Adding local stream tracks to PeerConnection.");
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    try {
      console.log(CAM_LOG_PREFIX + " Creating offer...");
      const offer = await pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false });
      console.log(CAM_LOG_PREFIX + " Setting local description with offer:", offer);
      await pc.setLocalDescription(offer);
    } catch (err) {
      console.error(CAM_LOG_PREFIX + " Error creating offer:", err);
      setError("カメラ: オファーエラー: " + err.toString());
      setStatus('カメラ: オファーの作成に失敗しました。');
    }
  };

  const processAnswerFromController = async () => {
    const pc = pcRef.current;
    if (!pc) {
      setError("カメラ: PeerConnectionが初期化されていません。先にオファーを作成してください。");
      return;
    }

    let answerInputToProcess = answerSignalInput;

    if (controllerAnswerFile) {
      try {
        answerInputToProcess = await readFileAsText(controllerAnswerFile);
        console.log(CAM_LOG_PREFIX + " Read answer from file:", answerInputToProcess.substring(0, 150) + "...");
        setControllerAnswerFile(null); // Reset file input
        const answerFileNameInput = document.getElementById('controllerAnswerFileInput');
        if (answerFileNameInput) answerFileNameInput.value = ''; // Reset file input display
      } catch (e) {
        console.error(CAM_LOG_PREFIX + " Error reading controller answer file:", e);
        setError("Error reading controller answer file: " + e.message);
        setStatus("Failed to read controller answer file.");
        return;
      }
    }

    if (!answerInputToProcess) {
      setError("カメラ: コントローラーからの応答が空です。");
      return;
    }
    console.log(CAM_LOG_PREFIX + " Processing answer from controller.");
    setStatus("カメラ: コントローラーからの応答を処理中...");
    setError('');
    try {
      const answerPayload = JSON.parse(answerInputToProcess);
      console.log(CAM_LOG_PREFIX + " Parsed answer payload:", answerPayload);
      if (!answerPayload || typeof answerPayload.sdp !== 'object' || answerPayload.sdp.type !== 'answer') {
        console.error(CAM_LOG_PREFIX + " Invalid answer signal received.");
        setError("カメラ: 無効な応答信号を受信しました。");
        return;
      }
      console.log(CAM_LOG_PREFIX + " Setting remote description with answer:", answerPayload.sdp);
      await pc.setRemoteDescription(new RTCSessionDescription(answerPayload.sdp));
      if (answerPayload.iceCandidates && Array.isArray(answerPayload.iceCandidates)) {
        console.log(CAM_LOG_PREFIX + ` Adding ${answerPayload.iceCandidates.length} ICE candidates.`);
        for (const candidate of answerPayload.iceCandidates) {
          if (candidate) {
            console.log(CAM_LOG_PREFIX + " Adding ICE candidate:", candidate);
            await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => console.warn("ICE候補の追加エラー: "+e));
          }
        }
      } else {
        console.log(CAM_LOG_PREFIX + " No ICE candidates provided in answer.");
      }
      setStatus("カメラ: 応答を処理しました。接続中...");
    } catch (err) {
      console.error(CAM_LOG_PREFIX + " Error processing answer:", err);
      setError("カメラ: 応答処理エラー: " + err.toString());
      setStatus('カメラ: 応答の処理に失敗しました。');
    }
  };

  // 接続状態の変更を監視するハンドラーを追加
  useEffect(() => {
    if (pcRef.current) {
      pcRef.current.onconnectionstatechange = () => {
        const state = pcRef.current.connectionState;
        if (state === 'connected') {
          // 接続が成功したら接続情報を非表示にする
          setOfferSignal('');
          setAnswerSignalInput('');
          setStatus('カメラが正常に接続されました');
    }
  };
    }
  }, [pcRef.current]);

  const fallbackCopyToClipboard = useCallback((text, type) => {
    if (offerSignalTextareaRef.current) {
      offerSignalTextareaRef.current.select();
      document.execCommand('copy');
      setStatus(type + "をコピーしました（フォールバック）！確認してください。");
      setTimeout(() => setStatus(prev => prev === (type + "をコピーしました（フォールバック）！確認してください。") ? ('カメラ: ' + type + ' 準備完了。') : prev), 2000);
    } else {
      setError("フォールバックコピーのためのテキストエリアが利用できません。");
    }
  }, [offerSignalTextareaRef, setStatus, setError]);

  const copyToClipboard = useCallback((textToCopy, type) => {
    if (!textToCopy) {
      setError("コピーする" + type + "がありません。");
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textToCopy)
        .then(() => {
          setStatus(type + 'をクリップボードにコピーしました！');
          setTimeout(() => setStatus(prev => prev === (type + 'をクリップボードにコピーしました！') ? ('カメラ: ' + type + ' 準備完了。') : prev), 2000);
        })
        .catch(err => {
          setError(type + 'のコピーに失敗しました。手動でコピーしてください。 ' + err.message);
          fallbackCopyToClipboard(textToCopy, type);
        })
    } else {
      fallbackCopyToClipboard(textToCopy, type);
    }
  }, [fallbackCopyToClipboard, setError, setStatus]);

  return (
    <div style={commonStyles.pageContainer}>
      <header style={commonStyles.header}>
        <h1 style={commonStyles.title}>Synva Cast</h1>
        <span style={commonStyles.headerRole}>Camera</span>
        <p style={commonStyles.status}>カメラの状態: {status}</p>
        {error && <p style={commonStyles.error}>エラー: {error}</p>}
      </header>

      <div style={commonStyles.mainContentArea}>
        <section className="card">
          <h2 className="title title-section">カメラの設定</h2>
          <div className="device-selection">
            <label htmlFor="cameraName" className="label">カメラの名前:</label>
            <input
              id="cameraName"
              type="text"
              value={cameraName}
              onChange={e => setCameraName(e.target.value)}
              placeholder="カメラの名前を入力"
              className="input"
            />
            </div>

          <div className="source-selection" style={{ marginBottom: '20px' }}>
            <label className="label">映像ソースの選択:</label>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px' }}>
              <button
                onClick={() => {
                  setSourceType('camera');
                  setLocalStream(null);
                }}
                className={`button ${sourceType === 'camera' ? 'button-primary' : 'button-secondary'}`}
              >
                カメラを使用
              </button>
            <button 
                onClick={() => {
                  setSourceType('screen');
                  setLocalStream(null);
                }}
                className={`button ${sourceType === 'screen' ? 'button-primary' : 'button-secondary'}`}
              >
                画面を共有
            </button>
            </div>
          </div>

          {sourceType === 'camera' && (
            <div className="device-selection">
              <label htmlFor="videoDevices" className="label">カメラを選択:</label>
              <select 
                id="videoDevices"
                value={selectedDeviceId} 
                onChange={e => {
                  const newDeviceId = e.target.value;
                  setSelectedDeviceId(newDeviceId);
                  if (localStream) {
                    startLocalMedia(newDeviceId);
                  }
                }}
                className="select"
              >
                <option value="">カメラを選択してください</option>
                {availableVideoDevices.map(device => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `カメラ ${device.deviceId}`}
                  </option>
                ))}
              </select>
            </div>
            )}

          <div className="video-preview">
            <h3 className="title title-subsection">プレビュー</h3>
            <video
              ref={videoEl => {
                if (videoEl) videoEl.srcObject = localStream;
              }}
              autoPlay
              playsInline
              muted
              className="video"
            />
            <div className="button-group">
              <button
                onClick={() => startLocalMedia(selectedDeviceId)}
                disabled={(!localStream && availableVideoDevices.length === 0 && sourceType === 'camera')}
                className={`button ${(!localStream && availableVideoDevices.length === 0 && sourceType === 'camera') ? 'button-disabled' : ''}`}
              >
                {localStream ? 'メディアを再起動' : 'メディアを開始'}
              </button>
            </div>
          </div>
        </section>

        <section className="card">
          <h2 className="title title-section">コントローラー接続</h2>
          <div className="connection-status">
            <p>接続状態: {status}</p>
            {error && <p className="error">接続エラー: {error}</p>}
          </div>
          
          <div className="connection-controls">
            <button 
              onClick={initializePcAndCreateOffer} 
              disabled={!localStream || !!offerSignal}
              className={`button ${!localStream || !!offerSignal ? 'button-disabled' : ''}`}
            >
              {offerSignal ? 'オファー準備完了' : 'オファーを作成'}
            </button>

          {offerSignal && (
              <div className="json-display">
                <label htmlFor="offerJson" className="label">コントローラーに送信するオファー:</label>
              <textarea 
                  id="offerJson"
                ref={offerSignalTextareaRef}
                value={offerSignal} 
                readOnly 
                  className="textarea"
              />
                <div className="button-group">
                  <button
                    onClick={() => copyToClipboard(offerSignal, "オファー")}
                    className="button"
                  >
                    オファーをコピー
                  </button>
              </div>
            </div>
          )}

            <div className="answer-section">
              <label htmlFor="answerInput" className="label">コントローラーからの応答を貼り付け:</label>
            <textarea 
                id="answerInput"
              value={answerSignalInput} 
              onChange={e => setAnswerSignalInput(e.target.value)} 
                placeholder="コントローラーの応答JSONをここに貼り付け"
                className="textarea"
                disabled={!offerSignal || (pcRef.current && pcRef.current.connectionState === 'connected')}
              />
              <div className="file-input-container">
                <label htmlFor="controllerAnswerFileInput">または応答ファイルをアップロード:</label>
                <input 
                  id="controllerAnswerFileInput"
                  type="file" 
                  accept=".json"
                  onChange={(e) => setControllerAnswerFile(e.target.files[0])} 
                  disabled={!offerSignal || (pcRef.current && pcRef.current.connectionState === 'connected')}
                />
              </div>
            <button 
              onClick={processAnswerFromController} 
              disabled={!answerSignalInput && !controllerAnswerFile || !offerSignal || (pcRef.current && pcRef.current.connectionState === 'connected')}
                className={`button ${!answerSignalInput && !controllerAnswerFile || !offerSignal || (pcRef.current && pcRef.current.connectionState === 'connected') ? 'button-disabled' : ''}`}
            >
                {pcRef.current && pcRef.current.connectionState === 'connected' ? '接続済み' : '応答を処理'}
            </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default CameraScreen; 
