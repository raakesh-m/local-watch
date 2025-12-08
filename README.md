# LocalWatch 2.0

**Watch videos together, perfectly synced. No servers. No uploads. Just pure P2P magic.**

LocalWatch is a desktop application that enables friends to watch local video files together in perfect synchronization, using peer-to-peer technology without any server infrastructure.

## Features

### Core Features
- **Mesh Network P2P** - Up to 8 users can watch together
- **Perfect Sync** - Sub-second synchronization with adaptive drift correction
- **No Servers Required** - 100% peer-to-peer using WebRTC
- **30-Second Reconnection** - Automatic recovery if someone's internet drops
- **Leader Election** - If the host leaves, someone else takes over automatically

### Modern UI
- **Dark Minimalist Theme** - Clean, professional, distraction-free design
- **Smooth Animations** - Polished transitions and micro-interactions
- **Toast Notifications** - Non-intrusive feedback for all actions
- **Responsive Controls** - Auto-hiding video controls

### Video Player
- **Full Keyboard Shortcuts**
  - `Space` - Play/Pause
  - `←/→` - Seek 10 seconds
  - `↑/↓` - Volume control
  - `F` - Toggle fullscreen
  - `M` - Mute/Unmute
  - `P` - Picture-in-Picture
- **Playback Speed Control** - 0.5x to 2x
- **Volume Control** - With visual slider
- **Progress Bar** - With seek preview tooltip
- **Buffering Coordination** - Pauses for everyone when someone buffers

### Chat
- **Real-time P2P Chat** - Send messages while watching
- **No Server Needed** - Chat uses the same WebRTC connection
- **Unread Badges** - See when you have new messages
- **Collapsible Panel** - Toggle to focus on video

### Quality of Life
- **Random Nicknames** - Fun auto-generated names
- **Compressed Signals** - Shorter copy-paste strings
- **File Validation** - Ensures everyone has the same file
- **Participant List** - See who's watching

## How It Works

### Creating a Room (Host)

1. Click **Create Room**
2. Enter your nickname (or use the random one)
3. Select your video file
4. Share the **Room Code** and **Signal** with friends
5. When a friend sends back their signal, paste it to connect
6. Click **Start Watching** when everyone's ready

### Joining a Room (Guest)

1. Click **Join Room**
2. Enter your nickname
3. Enter the **Room Code**
4. Select the **same video file** as the host
5. Paste the host's **Signal**
6. Copy **Your Signal** and send it back to the host
7. Wait for connection, then enjoy!

## Quick Start

### Prerequisites

- **Node.js 18+** - [Download here](https://nodejs.org/)
- **npm** (comes with Node.js)

### Build from Source

```bash
# Clone the repository
git clone <your-repo-url>
cd localwatch

# Install dependencies
npm install

# Build the application
npm run build

# Create installers
npm run make
```

### Where Are the Installers?

After `npm run make`, find your installers in:

- **macOS:** `out/make/LocalWatch.dmg`
- **Windows:** `out/make/zip/win32-x64/LocalWatch-win32-x64.zip`

## Requirements

- All participants must have the **exact same video file**
  - Same encoding, same file size
  - The app validates this before syncing
- Stable internet connection
- Modern desktop OS (Windows, macOS, or Linux)

## Technical Details

### Architecture
- **Electron** - Cross-platform desktop framework
- **WebRTC** - Real-time P2P data channels via simple-peer
- **TypeScript** - Type-safe development
- **Mesh Topology** - Every user connects to every other user

### Sync Algorithm
1. One user is elected as the "sync leader" (typically the room creator)
2. Leader broadcasts their video state every 250-500ms
3. Other users adjust to match:
   - Small drift (<300ms): No correction
   - Medium drift (300-700ms): Adjust playback rate
   - Large drift (>2s): Hard seek
4. Network latency is compensated automatically

### P2P Connection
- Uses **WebRTC DataChannels** (not video streaming)
- Only sync commands transmitted (~1 KB/s)
- Connects via **STUN servers** (Google's free STUN)
- No **TURN servers** (keeps it 100% free)
- Works across different networks/countries

### Privacy
- No data leaves your local network except P2P signaling
- Video files are never uploaded
- No analytics, no tracking, no accounts

## Project Structure

```
localwatch/
├── src/
│   ├── main.ts              # Electron main process
│   ├── preload.ts           # IPC bridge
│   ├── p2p/
│   │   └── meshNetwork.ts   # WebRTC mesh P2P layer
│   ├── sync/
│   │   └── syncManager.ts   # Video sync engine
│   └── utils/
│       ├── compression.ts   # Signal compression
│       └── names.ts         # Random nickname generator
├── renderer/
│   ├── index.html           # UI
│   ├── styles.css           # Dark minimalist theme
│   └── app.ts               # Frontend logic
├── dist/                    # Compiled TypeScript (generated)
├── out/                     # Built installers (generated)
├── package.json             # Dependencies & scripts
├── tsconfig.json            # TypeScript config
└── webpack.config.js        # Webpack bundler config
```

## Development

### Run in Development Mode

```bash
npm run dev
```

This starts the app with hot-reload. Changes to TypeScript files trigger automatic recompilation.

### Scripts

- `npm install` - Install dependencies
- `npm run build` - Compile TypeScript + bundle renderer
- `npm start` - Run the app (production mode)
- `npm run dev` - Run with hot-reload (development mode)
- `npm run make` - Build installers (.dmg or .exe/.zip)
- `npm run lint` - Lint code with ESLint

## Troubleshooting

### "npm install" fails

**Windows:**
```bash
npm install --global windows-build-tools
```

**macOS:**
```bash
xcode-select --install
```

### Build Errors

```bash
# Clean and rebuild
rm -rf node_modules dist out renderer/app.js
npm install
npm run build
```

### App Won't Connect

- Ensure both users copy the **entire signal**
- Both need internet connection
- Try disabling VPN temporarily
- ~5% of networks have symmetric NAT that blocks P2P

### Videos Out of Sync

- Files must be **identical** (same size, duration, encoding)
- Wait 5 seconds for automatic drift correction
- Check both files have same duration

### Mac Says "Damaged" or "Unidentified Developer"

The app is unsigned. To open:
- **Right-click** → Open → Open anyway
- Or run: `xattr -cr /Applications/LocalWatch.app`

## Limitations

- Maximum 8 simultaneous users (mesh network constraint)
- ~5% of networks may be blocked by symmetric NAT
- All participants must have identical video files
- Manual signal exchange required (no signaling server)

## License

MIT License - Free for personal and commercial use.

## Credits

Built with:
- [Electron](https://www.electronjs.org/)
- [simple-peer](https://github.com/feross/simple-peer)
- [pako](https://github.com/nodeca/pako) (compression)
- [unique-names-generator](https://github.com/andreasonny83/unique-names-generator)
- Google's free STUN servers

---

**LocalWatch 2.0** - Watch together, anywhere, privately.
