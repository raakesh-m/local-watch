# Building LocalWatch Installers

This guide explains how to build installer packages for **Windows**, **macOS**, and **Linux**.

---

## 📋 Prerequisites

### All Platforms
- **Node.js** 18 or higher ([Download here](https://nodejs.org/))
- **npm** (comes with Node.js)
- **Git** (optional, for cloning)

### Windows-Specific Requirements
- **WiX Toolset v3.11** or higher ([Download here](https://wixtoolset.org/releases/))
  - Required for creating `.msi` installers
  - Add WiX to your system PATH during installation
  - Verify installation: Open Command Prompt and run `heat.exe /?`

### macOS-Specific Requirements
- **Xcode Command Line Tools**
  ```bash
  xcode-select --install
  ```

### Linux-Specific Requirements
- **dpkg** and **fakeroot** (usually pre-installed on Debian/Ubuntu)
  ```bash
  sudo apt-get install dpkg fakeroot
  ```

---

## 🚀 Quick Start

### 1. Install Dependencies

Open terminal/command prompt in the project folder and run:

```bash
npm install
```

This installs all required packages. **You only need to do this once** (or when dependencies change).

---

### 2. Build the Application

Before creating installers, compile the TypeScript and bundle the app:

```bash
npm run build
```

This creates the compiled files in the `dist/` and `renderer/` folders.

---

### 3. Create Installers

Run the make command on your target platform:

```bash
npm run make
```

The installers will be created in the `out/make/` folder.

---

## 🖥️ Platform-Specific Instructions

### Building on **Windows** (for Windows)

#### What You'll Get:
- `LocalWatch.msi` - Windows Installer (recommended)
- `LocalWatch-Setup.exe` - Squirrel installer (alternative)

#### Steps:

1. **Install WiX Toolset** (if not already installed)
   - Download from: https://wixtoolset.org/releases/
   - Install and make sure to add to PATH
   - Restart your terminal/Command Prompt after installation

2. **Open Command Prompt or PowerShell** in the project folder

3. **Install dependencies:**
   ```bash
   npm install
   ```

4. **Build the app:**
   ```bash
   npm run build
   ```

5. **Create installers:**
   ```bash
   npm run make
   ```

6. **Find your installers:**
   - **WiX (MSI):** `out/make/wix/x64/LocalWatch.msi`
   - **Squirrel (EXE):** `out/make/squirrel.windows/x64/LocalWatch-Setup.exe`

#### Distributing:
- **MSI file**: Users double-click to install. All DLLs and dependencies are bundled.
- **Setup.exe**: Self-contained installer with everything included.

---

### Building on **macOS** (for macOS)

#### What You'll Get:
- `LocalWatch.dmg` - macOS disk image installer
- `LocalWatch.zip` - Portable app bundle (optional)

#### Steps:

1. **Install Xcode Command Line Tools** (if not already installed):
   ```bash
   xcode-select --install
   ```

2. **Open Terminal** in the project folder

3. **Install dependencies:**
   ```bash
   npm install
   ```

4. **Build the app:**
   ```bash
   npm run build
   ```

5. **Create installers:**
   ```bash
   npm run make
   ```

6. **Find your installers:**
   - **DMG:** `out/make/LocalWatch.dmg`
   - **ZIP:** `out/make/zip/darwin/x64/LocalWatch-darwin-x64-1.0.0.zip`

#### Distributing:
- **DMG file**: Users drag LocalWatch to Applications folder.
- Your friends can mount the DMG and install the app normally.

---

### Building on **Linux** (for Linux)

#### What You'll Get:
- `localwatch_1.0.0_amd64.deb` - Debian/Ubuntu package

#### Steps:

1. **Install required tools:**
   ```bash
   sudo apt-get update
   sudo apt-get install dpkg fakeroot
   ```

2. **Open Terminal** in the project folder

3. **Install dependencies:**
   ```bash
   npm install
   ```

4. **Build the app:**
   ```bash
   npm run build
   ```

5. **Create installer:**
   ```bash
   npm run make
   ```

6. **Find your installer:**
   - **DEB:** `out/make/deb/x64/localwatch_1.0.0_amd64.deb`

#### Distributing:
- Users install with: `sudo dpkg -i localwatch_1.0.0_amd64.deb`
- Or double-click in Ubuntu to open Software Center

---

## 📦 Output Files Summary

| Platform | File Type | Location | Size (approx) |
|----------|-----------|----------|---------------|
| **Windows** | `.msi` | `out/make/wix/x64/` | ~150-200 MB |
| **Windows** | `.exe` (Setup) | `out/make/squirrel.windows/x64/` | ~150-200 MB |
| **macOS** | `.dmg` | `out/make/` | ~150-200 MB |
| **macOS** | `.zip` | `out/make/zip/darwin/x64/` | ~140-180 MB |
| **Linux** | `.deb` | `out/make/deb/x64/` | ~150-200 MB |

---

## ⚠️ Important Notes

### Cross-Platform Building Limitations

**❌ You CANNOT build Windows installers on macOS/Linux**
- WebTorrent uses native modules (`node-datachannel`, `utp-native`) that require Windows DLLs
- You must build Windows installers **on a Windows machine**

**❌ You CANNOT build macOS installers on Windows/Linux**
- macOS apps require code signing and specific tooling only available on macOS
- You must build macOS installers **on a Mac**

**✅ You CAN build Linux installers on any Linux distribution**

### Platform-Specific Build Recommendations:

| Your OS | Can Build For |
|---------|---------------|
| **Windows** | ✅ Windows only |
| **macOS** | ✅ macOS only |
| **Linux** | ✅ Linux only |

### Solution: Build on Each Platform Separately
1. **For Windows:** Build on a Windows PC
2. **For macOS:** Build on a Mac
3. **For Linux:** Build on a Linux machine

Or use GitHub Actions to automate cross-platform builds (see GITHUB_ACTIONS.md if needed).

---

## 🐛 Troubleshooting

### Windows: "heat.exe is not recognized"
**Problem:** WiX Toolset not installed or not in PATH

**Solution:**
1. Install WiX Toolset from https://wixtoolset.org/releases/
2. During installation, check "Add to PATH"
3. Restart your terminal/Command Prompt
4. Verify: Run `heat.exe /?` - should show help text

---

### Windows: Missing DLL errors when running the .exe
**Problem:** Built on macOS/Linux instead of Windows

**Solution:**
- Always build Windows installers **on a Windows machine**
- The WiX (.msi) and Squirrel (.exe) makers will bundle all required DLLs automatically

---

### macOS: "Code signing required"
**Problem:** macOS Gatekeeper blocks unsigned apps

**Solution (for testing):**
- Right-click the app → "Open" → "Open Anyway"
- Or disable Gatekeeper temporarily (not recommended):
  ```bash
  sudo spctl --master-disable
  ```

**Solution (for distribution):**
- Get an Apple Developer account ($99/year)
- Sign and notarize the app (advanced topic)

---

### Linux: "dpkg-deb: error"
**Problem:** Missing dpkg or fakeroot

**Solution:**
```bash
sudo apt-get install dpkg fakeroot
```

---

### Build fails with "Out of memory"
**Problem:** Large app size or insufficient RAM

**Solution:**
- Close other applications
- Increase Node.js memory:
  ```bash
  export NODE_OPTIONS="--max-old-space-size=4096"
  npm run make
  ```

---

### "Module not found" errors during build
**Problem:** Dependencies not installed

**Solution:**
```bash
# Delete node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
npm run build
npm run make
```

---

## 🔧 Advanced: Building for Specific Platforms Only

If you want to build for a specific maker only:

### Windows (MSI only):
```bash
npm run build
npx electron-forge make --platform=win32 --targets=@electron-forge/maker-wix
```

### macOS (DMG only):
```bash
npm run build
npx electron-forge make --platform=darwin --targets=@electron-forge/maker-dmg
```

### Linux (DEB only):
```bash
npm run build
npx electron-forge make --platform=linux --targets=@electron-forge/maker-deb
```

---

## 📝 Testing Your Installer

### Before Distributing:

1. **Install the package** on a clean machine (or VM)
2. **Test all features:**
   - Create a room
   - Join a room
   - Load local video files
   - Load torrent/magnet links
   - Video synchronization
   - Chat functionality
3. **Verify no DLL/dependency errors** on fresh Windows install

---

## 🎉 Distribution Checklist

- [ ] Built on the correct platform (Windows for .exe/.msi, macOS for .dmg, Linux for .deb)
- [ ] Tested installer on a clean machine
- [ ] All features work (WebRTC connections, video sync, torrents, chat)
- [ ] No missing DLL errors (Windows)
- [ ] File size is reasonable (~150-200 MB)
- [ ] Version number updated in `package.json` if needed

---

## 📚 Additional Resources

- **Electron Forge Documentation:** https://www.electronforge.io/
- **WiX Toolset:** https://wixtoolset.org/
- **Electron Packager:** https://electron.github.io/electron-packager/

---

## ❓ Need Help?

If you encounter issues not covered here:
1. Check the `npm run make` output for specific error messages
2. Ensure all prerequisites are installed for your platform
3. Verify you're building on the correct OS for your target platform
4. Try deleting `node_modules` and `out/` folders and rebuilding

---

**Happy Building! 🚀**
