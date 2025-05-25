const ConnectionStatus = ({ status, error }) => {
  const getStatusText = (status) => {
    switch (status) {
      case 'disconnected':
        return '未接続';
      case 'connecting':
        return '接続中...';
      case 'connected':
        return '接続済み';
      case 'error':
        return 'エラー';
      default:
        return '状態不明';
    }
  };

  return (
    <div className="connection-status">
      <div className={`status-badge status-${status}`}>
        {getStatusText(status)}
      </div>
      {error && <div className="error-message">エラー: {error}</div>}
    </div>
  );
};

export default ConnectionStatus; 