# LocalWatch

**P2P synchronized local video watching - No servers, no uploads, completely free**

Watch videos together with friends in perfect sync. Each person uses their own local video file. Playback syncs in real-time via WebRTC peer-to-peer connections using free STUN servers.

## Features

- ✅ **100% Free** - No server costs, pure P2P using Google's free STUN servers
- ✅ **No Uploads** - Everyone watches their own local file
- ✅ **Perfect Sync** - Play/pause/seek syncs instantly across all viewers
- ✅ **Cross-Platform** - Works on Windows and macOS
- ✅ **2-3 Users** - Host + up to 2 guests per room
- ✅ **Private** - Direct peer connections, no data passes through third parties

## Quick Start

### Prerequisites

- **Node.js 18+** - [Download here](https://nodejs.org/)
- **npm** (comes with Node.js)

### Build the App

```bash
# 1. Clone the repository
git clone <your-repo-url>
cd localwatch

# 2. Install dependencies (takes 2-3 minutes first time)
npm install

# 3. Build the application
npm run build

# 4. Create installers
npm run make
```

### Where Are the Installers?

After `npm run make`, find your installers in:

**macOS:**
- `out/make/LocalWatch.dmg` (~90 MB)

**Windows:**
- `out/make/squirrel.windows/x64/LocalWatch-Setup.exe`

**Note:** You can only build the macOS .dmg on a Mac, and the Windows .exe on Windows.

## Cross-Platform Building

### On macOS
You can only build the macOS DMG:
```bash
npm run make
# Creates: out/make/LocalWatch.dmg
```

### On Windows
You can only build the Windows EXE:
```bash
npm run make
# Creates: out/make/squirrel.windows/x64/LocalWatch-Setup.exe
```

### Building Both
Use CI/CD (GitHub Actions) or separate machines for each platform.

## How to Use LocalWatch

### Host (Create a Room)

1. Launch LocalWatch
2. Click **"Create Room"**
3. Select your video file
4. You'll get:
   - **Room Code** (6 characters like "ABC123")
   - **Signal Data** (long string)
5. Send **both** to your friend(s) via chat/email
6. Wait for guest's signal data
7. Paste guest's signal → Click **"Connect Guest"**
8. Click **"Start Watching"**

### Guest (Join a Room)

1. Launch LocalWatch
2. Click **"Join Room"**
3. Enter the **Room Code** from host
4. Select **the same video file** (must be identical)
5. Paste **Host's Signal Data**
6. Copy **Your Signal Data** and send it to host
7. Click **"Connect to Room"**
8. Video will start automatically once connected

### During Playback

- **Play/Pause** - Any user can control (syncs to everyone)
- **Seek** - Drag the progress bar (syncs to everyone)
- **Fullscreen** - Click fullscreen button
- **Exit** - Click "Exit Room" to leave

## Project Structure

```
localwatch/
├── src/
│   ├── main.ts              # Electron main process
│   ├── preload.ts           # IPC bridge
│   ├── p2p/
│   │   └── connection.ts    # WebRTC P2P layer
│   └── sync/
│       └── syncManager.ts   # Video sync engine
├── renderer/
│   ├── index.html           # UI
│   ├── styles.css           # Styling
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
- `npm run make` - Build installers (.dmg or .exe)
- `npm run lint` - Lint code with ESLint

## Technical Details

### Tech Stack

- **Electron 28** - Desktop application framework
- **TypeScript** - Type-safe development
- **WebRTC** - Peer-to-peer connections
- **simple-peer** - WebRTC abstraction library
- **HTML5 Video** - Native video playback

### How Sync Works

1. **Host Authority** - Room creator acts as sync authority
2. **Periodic Sync** - Host broadcasts state every 500ms
3. **Three-Tier Drift Correction:**
   - < 300ms: No correction needed
   - 300-700ms: Micro-adjust playback rate
   - \> 700ms: Hard seek to position

### P2P Connection

- Uses **WebRTC DataChannels** (not video streaming)
- Only sync commands transmitted (~1 KB/s)
- Connects via **STUN servers** (Google's free STUN)
- No **TURN servers** (keeps it 100% free)
- Works across different networks/countries

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

- Ensure both users copy the **entire signal** (it's ~500 characters)
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

## Requirements

### Runtime
- **Video files** must be identical on both computers
- **Internet connection** for initial P2P handshake
- **Supported formats:** MP4, WebM, MOV, M4V (depends on system codecs)

### Development
- Node.js 18+
- npm 9+
- macOS 10.15+ (for macOS builds)
- Windows 10+ (for Windows builds)

## Limitations

- **2-3 users max** per room (architecture limitation)
- **Manual signal exchange** (no automatic signaling server)
- **Symmetric NAT** may block connections (~5% of networks)
- **No persistence** - Rooms close when app closes
- **Files must match exactly** - Same duration, size, encoding

## Future Enhancements

- QR code signal exchange
- Automatic signaling server option
- Support for 5+ users
- LAN-only mode (no internet)
- Subtitle synchronization
- Connection retry logic

## Contributing

Contributions welcome! Areas for improvement:
- Better signaling mechanism
- UI/UX enhancements
- Additional video format support
- Bug fixes
- Documentation improvements

## License

MIT License - See LICENSE file

## Credits

Built with:
- [Electron](https://www.electronjs.org/)
- [simple-peer](https://github.com/feross/simple-peer)
- Google's free STUN servers

---

**Made for watching videos together, the P2P way 🎬**
