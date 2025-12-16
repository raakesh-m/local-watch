# LocalWatch - Quick Start Guide

## Setup & Clean Install

```bash
# Install dependencies
npm install

# Clean project (removes build artifacts and dependencies)
rm -rf node_modules dist out
npm install
```

## Development

```bash
# Run in development mode (auto-reload)
npm run dev

# Run without auto-reload
npm start
```

## Build Distributables

### macOS

```bash
# Create DMG installer (macOS only)
npm run make
# Output: out/make/LocalWatch.dmg

# Create ZIP (works from macOS)
npm run make
# Output: out/make/zip/darwin/
```

### Windows

```bash
# Create Windows ZIP (can build from macOS!)
npm run make
# Output: out/make/zip/win32/
```

**Note:** Electron Forge allows cross-platform builds. You can create Windows ZIP files from macOS.

## Project Maintenance

```bash
# Reduce project size (delete build artifacts)
rm -rf node_modules dist out

# Rebuild everything
npm install
npm run build
```

## Quick Reference

- `npm run dev` - Development with hot reload
- `npm run build` - Build TypeScript and webpack bundle
- `npm run make` - Create platform-specific installers (DMG/ZIP)
- `npm start` - Run the app without building
