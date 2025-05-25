import Cookies from 'js-cookie';

const COOKIE_KEYS = {
  CAMERAS: 'fest_cameras',
  MONITORS: 'fest_monitors',
  MONITOR_SOURCE_MAP: 'fest_monitor_source_map',
};

// Cookie有効期限（7日）
const COOKIE_EXPIRES = 7;

export const saveConnectionState = ({
  cameras,
  monitors,
  monitorSourceMap,
}) => {
  try {
    // カメラ情報を保存
    Cookies.set(COOKIE_KEYS.CAMERAS, JSON.stringify(cameras), { expires: COOKIE_EXPIRES });
    
    // モニター情報を保存
    Cookies.set(COOKIE_KEYS.MONITORS, JSON.stringify(monitors), { expires: COOKIE_EXPIRES });
    
    // モニターとカメラの接続マップを保存
    Cookies.set(COOKIE_KEYS.MONITOR_SOURCE_MAP, JSON.stringify(monitorSourceMap), { expires: COOKIE_EXPIRES });
  } catch (error) {
    console.error('[ConnectionStorage] Failed to save state:', error);
  }
};

export const loadConnectionState = () => {
  try {
    // 各Cookieから情報を読み込む
    const cameras = JSON.parse(Cookies.get(COOKIE_KEYS.CAMERAS) || '[]');
    const monitors = JSON.parse(Cookies.get(COOKIE_KEYS.MONITORS) || '[]');
    const monitorSourceMap = JSON.parse(Cookies.get(COOKIE_KEYS.MONITOR_SOURCE_MAP) || '{}');

    return {
      cameras,
      monitors,
      monitorSourceMap,
    };
  } catch (error) {
    console.error('[ConnectionStorage] Failed to load state:', error);
    return {
      cameras: [],
      monitors: [],
      monitorSourceMap: {},
    };
  }
};

export const clearConnectionState = () => {
  try {
    Object.values(COOKIE_KEYS).forEach(key => {
      Cookies.remove(key);
    });
  } catch (error) {
    console.error('[ConnectionStorage] Failed to clear state:', error);
  }
}; 