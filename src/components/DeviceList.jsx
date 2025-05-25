const DeviceList = ({ devices, onSelect, selectedDeviceId }) => {
  if (!devices || devices.length === 0) {
    return <div className="no-devices">利用可能なデバイスがありません</div>;
  }

  return (
    <div className="device-list">
      <h3>利用可能なデバイス</h3>
      <ul>
        {devices.map(device => (
          <li
            key={device.deviceId}
            className={`device-item ${device.deviceId === selectedDeviceId ? 'selected' : ''}`}
            onClick={() => onSelect(device.deviceId)}
          >
            <span className="device-name">{device.label || `デバイス ${device.deviceId}`}</span>
            {device.deviceId === selectedDeviceId && <span className="selected-indicator">選択中</span>}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default DeviceList; 