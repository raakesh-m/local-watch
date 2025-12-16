# LocalWatch 🎬

> **Watch together, perfectly synced** - A peer-to-peer video synchronization app with WebTorrent streaming

LocalWatch is a desktop application built with Electron that allows multiple users to watch videos together in perfect synchronization over a peer-to-peer mesh network. No servers needed, 100% private, supports both local files and torrent streaming.

---

## ✨ Features

### 🎥 Synchronized Video Playback
- **Perfect Sync**: Play, pause, seek, and playback rate changes are synchronized across all viewers
- **Sub-second Precision**: Advanced drift correction algorithm keeps everyone within 300ms
- **Buffering Coordination**: Automatic pause when anyone is buffering, with real-time status display
- **Leader Election**: Automatic leader selection for sync coordination with failover

### 🌐 Peer-to-Peer Architecture
- **No Servers Required**: Direct WebRTC connections between users
- **Mesh Network**: Up to 8 simultaneous viewers in a room
- **Zero Configuration**: Automatic NAT traversal using STUN servers
- **Resilient**: Automatic reconnection handling with 30-second grace period

### 🎞️ Dual Media Support

#### **Local Files** 📁
- Support for common video formats (MP4, MKV, AVI, MOV, WMV, FLV, WebM, M4V)
- File coordination system ensures everyone has the same video
- Verification by filename and file size
- Real-time status tracking showing who's ready

#### **Torrent Streaming** 🌊
- WebTorrent integration for magnet links and .torrent files
- Instant sharing - one person loads, everyone streams
- Sequential download optimized for video playback
- Multi-file torrent support with file picker
- Download progress indicator with peer/speed stats
- Seeders + room peers = faster downloads

### 🗳️ Democratic Voting System
- Media change requests when video is already playing
- Real-time vote counting with visual progress bars
- 30-second timeout with automatic rejection
- Majority rule: >50% required to approve changes
- Tied votes are rejected (keeps current media)

### 💬 Built-in Chat
- Real-time chat synchronized across all peers
- User avatars with initials and color coding
- Participant list showing connection status
- Unread message badges

### 🎨 Modern UI
- Dark theme optimized for video watching
- Fullscreen support with auto-hiding controls
- Picture-in-Picture mode
- Custom video player with progress bar, volume, playback speed
- Keyboard shortcuts (Space, Arrow keys, F, M, etc.)

---

## 🎯 How It Works

### Local File Coordination System

When using **local video files**, LocalWatch ensures everyone has the exact same file before starting:

#### **Rules:**
1. **First Upload**: When the first person selects a local file, it triggers the coordination system
2. **File Verification**: All peers must upload a file with:
   - ✅ Identical filename
   - ✅ Identical file size (in bytes)
3. **Waiting Modal**: A modal displays showing each user's status:
   ```
   Waiting for Everyone

   Required File: movie.mp4 (2.5 GB)

   ✅ Alice - Ready
   ⏳ Bob - Waiting
   ✅ Charlie - Ready
   ⏳ David - Waiting
   ```
4. **Auto-Start**: When **all** users have uploaded their file, the modal closes and playback starts automatically
5. **No Partial Starts**: The video will NOT start until everyone is ready

#### **Why This System?**
- Each user streams their own local copy (no uploading entire file over P2P)
- Ensures perfect synchronization (same file = same frames)
- Prevents mismatches that would cause sync issues

---

### Torrent Streaming System

When using **torrents or magnet links**, the process is much simpler:

#### **Rules:**
1. **Single Load**: Only ONE person needs to paste the magnet link or select the .torrent file
2. **Automatic Broadcast**: The torrent info is instantly shared with all peers in the mesh network
3. **Peer Swarm**: All users' WebTorrent clients join the same torrent swarm
4. **Download Sources**:
   - Internet seeders
   - Other room members (peer-to-peer within the room)
5. **No Waiting**: Video starts as soon as enough data is buffered for playback
6. **Progressive Download**: Uses sequential downloading optimized for streaming

#### **Multi-File Torrents:**
- If torrent contains only 1 video file → Auto-selects it
- If torrent contains multiple video files → Shows a picker modal:
  ```
  Select Video File

  ○ Episode.01.1080p.mkv (1.2 GB)
  ○ Episode.02.1080p.mkv (1.3 GB)
  ○ Episode.03.1080p.mkv (1.1 GB)
  ```

#### **Quality:**
- Original file quality preserved (no transcoding)
- Supports 1080p, 4K, and all formats that WebTorrent can handle
- Playback can start before download completes

---

### Voting System

When a video is **already playing** and someone tries to load new media, the voting system activates:

#### **Rules:**

1. **Vote Trigger**: Automatic when:
   - Current media is playing/loaded
   - A user tries to load different media (local file or torrent)

2. **Voting Modal**: All users see:
   ```
   Video Change Request

   Bob wants to change the video to:
   NewMovie.mkv
   1.5 GB
   [Torrent Badge]

   ━━━━━━━━━━━━━━━━━━━━━━━━
   ✓ 3    ✗ 1

   Time remaining: 27s

   [Reject]  [Accept]
   ```

3. **Voting Period**: 30 seconds to vote

4. **Decision Rules**:
   | Scenario | Votes | Outcome |
   |----------|-------|---------|
   | Clear Majority | 4 Yes, 2 No (6 total) | ✅ **ACCEPT** - Switches to new media |
   | Tie | 3 Yes, 3 No (6 total) | ❌ **REJECT** - Keeps current media |
   | Majority No | 2 Yes, 4 No (6 total) | ❌ **REJECT** - Keeps current media |
   | Timeout | Some didn't vote | Only counts active votes |
   | 50-50 Exact | 3 Yes, 3 No | ❌ **REJECT** (tie-breaker rule) |

5. **Majority Calculation**:
   - **Accept**: Requires `yesVotes > noVotes` (strictly greater than)
   - **Reject**: Any tie or `noVotes ≥ yesVotes`

6. **Non-Voters**:
   - If someone doesn't vote within 30 seconds, their vote doesn't count
   - Only active voters are included in the total

7. **After Vote**:
   - ✅ **Accepted**: Current media stops, new media loads (with coordination if local file)
   - ❌ **Rejected**: Current media continues playing, requester sees "Media change rejected"

#### **Examples:**

**Example 1: Successful Change**
```
Room: 6 people watching Movie A
Bob loads Movie B (torrent)

Votes:
- Alice: Accept ✓
- Bob: Accept ✓ (auto-vote)
- Charlie: Accept ✓
- David: Accept ✓
- Eve: Reject ✗
- Frank: (no vote - ignored)

Result: 4 > 1 = ACCEPTED
→ Everyone switches to Movie B
```

**Example 2: Tied Vote**
```
Room: 4 people watching Series S01E01
Charlie tries to load S01E02

Votes:
- Alice: Accept ✓
- Bob: Reject ✗
- Charlie: Accept ✓ (auto-vote)
- David: Reject ✗

Result: 2 = 2 = TIE = REJECTED
→ Keep watching S01E01
```

**Example 3: Timeout**
```
Room: 5 people
2 vote Accept, 1 votes Reject, 2 don't vote

Result: Only 3 active votes counted
2 > 1 = ACCEPTED (because 2 Yes > 1 No among active voters)
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ and npm
- Windows, macOS, or Linux

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/local-watch.git
   cd local-watch
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Run in development mode**
   ```bash
   npm run dev
   ```

4. **Build for production**
   ```bash
   npm run build
   npm run make
   ```

   Packaged apps will be in the `out/` directory.

---

## 📖 Usage Guide

### Creating a Room

1. **Launch LocalWatch** and click **"Create Room"**
2. **Enter your display name** (2-20 characters, alphanumeric + spaces)
3. **Select media source**:
   - **Local File Tab**: Click "Select Video File" to choose from your computer
   - **Torrent Tab**: Paste magnet link or click "Select .torrent File"
4. **Share connection info** with friends:
   - **Room Code**: 6-character code (e.g., ABC123)
   - **Signal Data**: Copy and send via any messaging app
5. **Wait for guests** to connect (they'll appear in the Participants list)
6. **Click "Start Watching"** when everyone's ready

### Joining a Room

1. Click **"Join Room"**
2. **Enter display name**
3. **Select the same media**:
   - **If host used local file**: Upload the same file (must match filename + size)
   - **If host used torrent**: You'll receive it automatically (no action needed)
4. **Enter Room Code** from host
5. **Paste Host Signal** (the long text string from host)
6. **Copy Your Signal** and send it back to host
7. **Wait for host** to paste your signal and click "Connect"
8. Room starts automatically when all ready

### During Playback

#### **Controls**
- **Play/Pause**: Space bar or click the button
- **Seek**: Click progress bar or use ← → arrow keys
- **Volume**: M to mute, volume slider
- **Fullscreen**: F key or fullscreen button
- **Picture-in-Picture**: PiP button
- **Playback Speed**: Click speed indicator (0.5x to 2x)

#### **Synchronized Actions**
All these actions are synced across all viewers:
- ▶️ Play/Pause
- ⏩ Seeking (jumping to different time)
- 🎚️ Playback rate changes
- 🔄 Buffering pauses

#### **Chat**
- Click chat icon to open panel
- Type message and press Enter or click Send
- Unread badge shows when chat is closed

#### **Changing Media**
- Click "Select Video" or "Load Torrent" to load new media
- If video is playing, voting modal appears for everyone
- Vote within 30 seconds
- Media changes only if majority votes Yes

#### **Buffering Status**
- When anyone is buffering, an overlay shows: **"Waiting for [Name]"**
- Video automatically pauses for everyone
- Resumes when buffering user is ready

#### **Connection Status**
- Green badge = Connected
- Yellow badge = Reconnecting
- Red badge = Disconnected

---

## ⚙️ Technical Details

### Technology Stack

- **Framework**: Electron 32.0
- **Language**: TypeScript 5.6
- **Bundler**: Webpack 5
- **P2P**: SimplePeer (WebRTC wrapper)
- **Torrent**: WebTorrent (browser WebTorrent implementation)
- **Build**: Electron Forge with Zip maker

### Architecture

```
┌─────────────────────────────────────────┐
│          Electron Main Process          │
│  - IPC Handlers (file selection)       │
│  - Window Management                     │
└─────────────────────────────────────────┘
                    │
┌─────────────────────────────────────────┐
│        Electron Renderer Process        │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │          LocalWatchApp             │ │
│  │     (Main Application Class)       │ │
│  └────────────────────────────────────┘ │
│         │         │          │           │
│    ┌────┴────┐  ┌┴──────┐  ┌┴────────┐  │
│    │  Mesh   │  │ Sync  │  │ Torrent │  │
│    │ Network │  │Manager│  │ Manager │  │
│    └────┬────┘  └┬──────┘  └┬────────┘  │
│         │        │           │           │
│    ┌────┴────────┴───────────┴────────┐  │
│    │      MediaController             │  │
│    │   (Coordination & Voting)        │  │
│    └──────────────────────────────────┘  │
└─────────────────────────────────────────┘
          │                │
    ┌─────┴─────┐    ┌────┴─────┐
    │  WebRTC   │    │WebTorrent│
    │   Peers   │    │  Swarm   │
    └───────────┘    └──────────┘
```

### Key Components

#### **MeshNetwork** (`src/p2p/meshNetwork.ts`)
- Manages WebRTC peer connections
- Implements mesh topology (everyone connects to everyone)
- Handles signaling, reconnection, leader election
- Message broadcasting and routing
- Supports 4 new message types for coordination:
  - `media_loaded`: Broadcast when media is first loaded
  - `file_uploaded`: Confirm local file upload complete
  - `media_change_request`: Initiate voting for media change
  - `vote_response`: Cast a vote in ongoing poll

#### **SyncManager** (`src/sync/syncManager.ts`)
- Synchronizes video playback state
- Drift correction algorithm (3-tier: none, rate adjustment, hard seek)
- Buffering coordination with user identification
- Adaptive sync intervals (faster when playing, slower when paused)
- Latency estimation and compensation

#### **MediaController** (`src/sync/mediaController.ts`)
- Manages media state across the network
- Local file coordination system
- Voting system for media changes
- File verification (filename + size matching)
- Callbacks for UI updates

#### **TorrentManager** (`src/torrent/torrentManager.ts`)
- WebTorrent client wrapper
- Magnet link and .torrent file support
- Multi-file torrent handling with picker
- Progress tracking (downloaded, speed, peers)
- Sequential download strategy for streaming
- Public WebSocket trackers for peer discovery

### Message Protocol

All P2P messages follow this structure:

```typescript
interface SyncMessage {
  type: 'sync' | 'play' | 'pause' | 'seek' | 'join' | 'ready' |
        'chat' | 'buffering' | 'media_loaded' | 'file_uploaded' |
        'media_change_request' | 'vote_response' | ...

  // Sender info
  senderId?: string
  senderNickname?: string

  // Playback state
  isPlaying?: boolean
  position?: number
  timestamp?: number

  // Media info
  mediaType?: 'local' | 'torrent'
  filename?: string
  fileSize?: number
  magnetUri?: string

  // Voting
  requestId?: string
  vote?: boolean

  // ... additional fields
}
```

### Network Flow

1. **Room Creation**:
   - Host creates WebRTC offer
   - Signal data compressed and displayed
   - Guest creates WebRTC answer from host signal
   - Bidirectional connection established

2. **Additional Peers**:
   - New peer requests signal from existing peers
   - Each existing peer generates offer for new peer
   - Full mesh topology maintained

3. **Media Synchronization**:
   - Leader sends sync messages every 500ms (when playing) or 2s (when paused)
   - Followers apply drift correction
   - All actions (play/pause/seek) broadcast immediately

4. **Torrent Sharing**:
   - Host loads torrent, broadcasts `media_source` message
   - All peers receive magnet URI and file index
   - Each peer's WebTorrent client joins the swarm
   - Peers download from each other + internet

5. **File Coordination**:
   - Host loads local file, broadcasts `media_loaded`
   - Peers upload their copy, send `file_uploaded` confirmation
   - System tracks status, waits for all confirmations
   - Playback starts when complete

6. **Voting**:
   - Requester broadcasts `media_change_request` with unique ID
   - Each peer sends `vote_response` with their choice
   - After 30s or all votes collected, votes tallied
   - Result broadcast, media changes if approved

---

## 🎨 UI Components

### Modals

1. **Name Setup Modal**: First-time username entry with validation
2. **Waiting for Files Modal**: Shows real-time file upload status
3. **Voting Modal**: Interactive vote interface with live count
4. **Torrent File Picker**: Select from multi-file torrents
5. **Generic Modal**: Alerts and confirmations

### Panels

- **Chat Panel**: Slide-in right panel with messages and participant list
- **Video Overlay**: Auto-hiding controls on hover
- **Connection Panel**: Room code, participants, signal exchange (create room)

### Indicators

- **Buffering Overlay**: Semi-transparent with user name
- **Torrent Progress**: Hoverable indicator with detailed stats
- **Connection Badge**: Live connection status
- **Sync Status**: Sync state indicator

---

## 🔒 Security & Privacy

- **No Central Server**: All data stays between peers
- **No Data Stored**: Messages and video data are not persisted
- **Private Rooms**: Room codes + signal exchange prevents unauthorized access
- **Local Processing**: Video processing happens on your device
- **No Telemetry**: Zero tracking or analytics

---

## 🎛️ Configuration

### Sync Settings (in `SyncManager`)

```typescript
driftThreshold = 0.3          // 300ms - no correction
softCorrectionThreshold = 0.7  // 700ms - rate adjustment
hardSeekThreshold = 2.0        // 2s - hard seek
baseSyncIntervalMs = 500       // Sync frequency when playing
```

### Torrent Settings (in `TorrentManager`)

```typescript
TRACKERS = [
  'wss://tracker.btorrent.xyz',
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.webtorrent.dev'
]
MIN_VIDEO_SIZE = 10 * 1024 * 1024  // 10MB minimum
maxConns = 55                        // Max connections per torrent
```

### Network Settings (in `MeshNetwork`)

```typescript
RECONNECT_WINDOW_MS = 30000   // 30s grace period
PING_INTERVAL_MS = 5000       // Heartbeat every 5s
```

---

## 🐛 Troubleshooting

### Connection Issues

**Problem**: Peers can't connect
**Solutions**:
- Ensure both users have pasted each other's signals correctly
- Check firewall settings (allow WebRTC traffic)
- Try refreshing and reconnecting
- Make sure you're using the latest version

**Problem**: Frequent disconnections
**Solutions**:
- Check network stability
- Reduce number of peers (max 8 works best)
- Close bandwidth-heavy applications

### Sync Issues

**Problem**: Video is out of sync
**Solutions**:
- Check if all users have the same file (for local files)
- Ensure stable network connection
- Try seeking to resync
- Check if anyone is buffering

**Problem**: Constant buffering
**Solutions**:
- Use lower quality video if available
- Ensure sufficient internet speed for torrents
- Check if local file can be read properly
- Wait for more torrent seeders/peers

### Torrent Issues

**Problem**: Torrent not loading
**Solutions**:
- Verify magnet link is correct and complete
- Check if torrent has active seeders
- Try a different torrent tracker
- Ensure WebTorrent isn't blocked by firewall

**Problem**: Slow download speed
**Solutions**:
- Wait for more peers to join the room
- Check your internet speed
- Try a torrent with more seeders
- Enable port forwarding if possible

### File Coordination Issues

**Problem**: Waiting modal stuck
**Solutions**:
- Ensure all users uploaded the EXACT same file (check filename and size)
- Check that no one is disconnected
- Try having stuck users re-upload
- Restart the room if needed

---

## 🗺️ Roadmap

Future enhancements being considered:

- [ ] Subtitle support with sync
- [ ] Playlist/queue system
- [ ] Screen sharing mode
- [ ] Audio-only rooms (music sync)
- [ ] Mobile app version
- [ ] Recording/replay of watch sessions
- [ ] End-to-end encryption
- [ ] Custom TURN server support
- [ ] Emoji reactions overlay
- [ ] Watch history

---

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

---

## 🙏 Acknowledgments

- **WebRTC**: Enabling peer-to-peer connections
- **WebTorrent**: Bringing torrents to the browser
- **SimplePeer**: Simplifying WebRTC implementation
- **Electron**: Making desktop apps with web technologies possible

---

## 📞 Support

For issues, questions, or feature requests:
- Open an issue on GitHub
- Check existing issues for solutions
- Read the troubleshooting section above

---

## ⚡ Quick Reference

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play/Pause |
| `←` | Seek backward 10s |
| `→` | Seek forward 10s |
| `F` | Toggle fullscreen |
| `M` | Toggle mute |
| `Esc` | Exit fullscreen |

### File Size Limits

- **Local Files**: Limited by available RAM (recommended < 10GB)
- **Torrents**: No practical limit (streaming)

### Browser Compatibility

LocalWatch runs as an Electron app (not browser-based), ensuring consistent behavior across platforms.

---

**Built with ❤️ using TypeScript, Electron, and WebRTC**

*Watch together, anywhere, anytime - 100% free, 100% private*
