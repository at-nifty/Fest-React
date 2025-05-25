# Fest-React ビデオストリーミング制御システム

WebRTCを使用したブラウザベースのビデオストリーミング制御システムです。カメラ映像や画面共有を通じて、P2P接続でリアルタイムな映像配信を実現します。

## システム概要

### アーキテクチャ
- クライアントサイドのみで動作（サーバー不要）
- WebRTCによるP2P接続
- React Single Page Application (SPA)
- ブラウザネイティブAPIの活用

### 主要コンポーネント
1. **映像ソース管理**
   - MediaDevices API による映像デバイスの制御
   - Screen Capture API による画面共有の実装
   - WebRTC MediaStream の管理

2. **接続管理**
   - ICE (Interactive Connectivity Establishment) による接続確立
   - STUN/TURN サーバー設定（オプション）
   - シグナリング（手動JSONコピー方式）

3. **ユーザーインターフェース**
   - React コンポーネントベースの画面構成
   - リアルタイムな状態表示
   - レスポンシブデザイン

## 機能詳細

### 映像ソース
#### カメラ映像の配信
- デバイス選択
  - 利用可能なビデオデバイスの自動検出
  - デバイスの動的切り替え
  - デバイス権限の自動要求
- プレビュー表示
  - リアルタイムプレビュー
  - ミュート制御
  - 映像サイズの自動調整

#### 画面共有
- ブラウザウィンドウ
  - 特定のタブまたはウィンドウの選択
  - 全画面キャプチャ対応
- システム音声
  - システムオーディオのキャプチャ
  - 音声ミュート制御
- 画面切り替え
  - 共有画面の動的切り替え
  - 自動再接続対応

### 接続制御
#### P2P接続（WebRTC）
- シグナリング
  ```javascript
  // オファー側のSDPフォーマット
  {
    type: 'camera_offer',
    name: 'カメラ名',
    sdp: {
      type: 'offer',
      sdp: '...'
    },
    iceCandidates: [...]
  }

  // アンサー側のSDPフォーマット
  {
    type: 'monitor_answer',
    name: 'モニター名',
    sdp: {
      type: 'answer',
      sdp: '...'
    },
    iceCandidates: [...]
  }
  ```

- ICE接続状態
  - `new`
  - `checking`
  - `connected`
  - `completed`
  - `failed`
  - `disconnected`
  - `closed`

#### エラーハンドリング
- デバイスエラー
  - 権限拒否
  - デバイス未検出
  - デバイス切断
- 接続エラー
  - ICE接続失敗
  - シグナリングエラー
  - メディアストリームエラー

### UI/UX詳細
- 日本語インターフェース
  - 直感的な操作フロー
  - エラーメッセージの日本語化
  - ツールチップによるガイド
- 接続状態表示
  - リアルタイムステータス更新
  - 接続品質インジケータ
  - エラー状態の視覚化
- レスポンシブ対応
  - モバイル対応レイアウト
  - 画面サイズに応じた表示調整
  - タッチ操作対応

## 画面構成詳細

### カメラ画面 (`CameraScreen`)
```jsx
<div className="page-container">
  <header>
    <h1>カメラ設定</h1>
    <StatusDisplay />
  </header>
  
  <main>
    <DeviceSelector />
    <VideoPreview />
    <ConnectionControls />
  </main>
</div>
```

### モニター画面 (`MonitorScreen`)
```jsx
<div className="page-container">
  <header>
    <h1>モニター設定</h1>
    <StatusDisplay />
  </header>
  
  <main>
    <VideoDisplay fullscreenEnabled />
    <ConnectionControls />
  </main>
</div>
```

### コントローラー画面 (`ControllerScreen`)
```jsx
<div className="page-container">
  <header>
    <h1>接続管理</h1>
    <StatusDisplay />
  </header>
  
  <main>
    <DeviceList />
    <ConnectionManager />
  </main>
</div>
```

## 技術仕様

### 使用技術
- **React**: ^18.2.0
  - Hooks による状態管理
  - カスタムフック実装
  - エラーバウンダリ
- **WebRTC**
  - RTCPeerConnection
  - MediaStream API
  - ICE Framework
- **Screen Capture API**
  - getDisplayMedia()
  - 画面共有制御
- **MediaDevices API**
  - getUserMedia()
  - デバイス列挙
  - メディアストリーム制御

### WebRTC実装詳細
#### ICE接続
- STUN/TURNサーバー設定
  ```javascript
  const configuration = {
    iceServers: [
      {
        urls: 'stun:stun.l.google.com:19302'
      }
    ],
    iceTransportPolicy: 'all'
  };
  ```

#### P2Pメディアストリーミング
- ビデオコーデック設定
- 帯域制御
- 品質パラメータ

#### シグナリング
- 手動JSONコピー方式
- エラー検出と再試行
- 状態遷移管理

### 画面共有API詳細
```javascript
const displayMediaOptions = {
  video: {
    displaySurface: "browser",  // ブラウザウィンドウの共有
    logicalSurface: true,      // 論理サーフェスの使用
    cursor: "always"           // カーソルを常に表示
  },
  audio: {
    suppressLocalAudioPlayback: false  // ローカルオーディオ再生を許可
  },
  selfBrowserSurface: "exclude",      // 自身のブラウザ画面を除外
  systemAudio: "include",             // システム音声を含める
  surfaceSwitching: "include",        // 画面切り替えを許可
  monitorTypeSurfaces: "include"      // モニタータイプのサーフェスを含める
};
```

## セットアップ

### 開発環境要件
- Node.js >= 16.0.0
- npm >= 8.0.0
- モダンブラウザ（Chrome推奨）

### インストール手順
1. リポジトリのクローン
```bash
git clone https://github.com/yourusername/Fest-React.git
cd Fest-React
```

2. 依存関係のインストール
```bash
npm install
```

3. 開発サーバーの起動
```bash
npm start
```

4. ビルド（本番環境用）
```bash
npm run build
```

### 環境設定
- 開発環境: `http://localhost:3000`
- 本番環境: HTTPS必須

## 使用方法

### カメラ/画面共有の開始
1. カメラ画面を開く
   - URLパス: `/camera`
   - 必要な権限を許可

2. 映像ソースの選択
   - カメラモード
     - 利用可能なカメラデバイスから選択
     - プレビューで映像を確認
   - 画面共有モード
     - 共有する画面/ウィンドウを選択
     - システム音声の共有を設定

3. 接続の開始
   - 「メディアを開始」で映像取得開始
   - 「オファーを作成」でP2P接続開始
   - 生成されたJSONをコピー

### モニターでの受信
1. モニター画面を開く
   - URLパス: `/monitor`
   - モニター名を設定（任意）

2. 接続処理
   - カメラからのJSONを貼り付け
   - 「オファーを処理」をクリック
   - 生成された応答JSONをコピー

3. 表示設定
   - フルスクリーンモードの切り替え
   - 音量調整
   - 表示サイズの調整

### 接続の確立と管理
1. P2P接続の確立
   - カメラ側で応答JSONを処理
   - ICE接続の確立を待機
   - 接続状態の確認

2. 接続の維持
   - 接続状態のモニタリング
   - エラー発生時の再接続
   - 映像ソースの動的切り替え

3. 接続の終了
   - 「接続を終了」で正常切断
   - リソースの解放確認
   - 状態のリセット

## トラブルシューティング

### よくある問題と解決方法
1. カメラにアクセスできない
   - ブラウザの権限設定を確認
   - デバイスドライバーの更新
   - 他のアプリケーションによる使用確認

2. 画面共有が開始できない
   - ブラウザの権限設定を確認
   - HTTPSまたはlocalhostであることを確認
   - 特定のウィンドウのみを共有

3. 接続が確立できない
   - JSONの正しいコピー/貼り付けを確認
   - ネットワーク接続を確認
   - ファイアウォール設定の確認

### エラーメッセージ一覧
- `NotAllowedError`: デバイスの使用権限が拒否された
- `NotFoundError`: 指定されたデバイスが見つからない
- `NotReadableError`: デバイスの使用中や異常
- `OverconstrainedError`: 要求された設定が非対応

## 注意事項

### セキュリティ
- HTTPS環境での実行推奨
- デバイス権限の適切な管理
- P2P接続のプライバシー考慮

### ブラウザ対応
- Chrome (推奨): 最新版
- Firefox: 最新版
- Safari: 最新版
- Edge: 最新版

### パフォーマンス考慮
- ネットワーク帯域の確保
- CPU/メモリ使用量の監視
- 適切な画質設定の選択

## 開発者向け情報

### コード規約
- ESLint設定に準拠
- Prettierによるフォーマット
- コンポーネント設計原則

### テスト
- Jest によるユニットテスト
- React Testing Library
- E2Eテスト（予定）

### 今後の展開
- サーバーサイドシグナリング
- 録画機能
- マルチストリーム対応
