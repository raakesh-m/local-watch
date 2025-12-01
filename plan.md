Cross-platform P2P synchronized local video watching without servers.

1. Overview

LocalWatch is a cross-platform desktop application (Windows + macOS) that allows 2–3 people in different locations to watch their own local video files in perfect sync — without uploading anything or running a backend server.

Each user loads the same video file locally.

Sync messages travel directly between users using P2P networking.

The user who creates the room becomes the host, acting as the authority for synchronization.

Multiple guests can join (2–3 users total).

If any user presses Play, Pause, Seek → all users instantly update.

No cloud servers, no hosting costs, no backend deployment.

2. Design Goals

Zero server cost

Peer-to-peer communication only

Simple, reliable sync

Cross-platform (macOS + Windows)

Supports 2–3 users in the same room

Real-time shared playback controls

Developer free to choose any tech stack

3. How the System Works
   3.1 Host

Creates a room

Selects a local video file

Generates an invite code or link

Acts as the authoritative timekeeper

Forwards sync messages to all guests

3.2 Guests

Join using room code/link

Select their local copy of the same video

Connect to the host via P2P (WebRTC or direct TCP/UDP)

Receive real-time sync commands

3.3 Group Sync Behavior

If any user (host or guest) presses:

Play

Pause

Seek

Jump

Skip

The action is broadcast to everyone and every player updates in real time.

You get Netflix-party style sync, but for local files and peer-to-peer.

4. P2P Connection Model
   Preferred Approach — WebRTC DataChannels (Recommended)

No server needed except for a free STUN server

STUN only helps discover public IP/port

All data exchange (sync messages) is fully P2P

Works across countries, NATs, routers, firewalls

100% free

Alternative — Direct TCP/UDP P2P

Host opens a listening port

Guests connect using host’s public IP

Developer handles NAT traversal manually

Works but less reliable than WebRTC

Important

No TURN server should be used (TURN relays data and costs money).
Only STUN is allowed.

5. Playback Synchronization Requirements
   5.1 Shared Control

Every user must be able to control playback.
If any user does something:

Host receives the event

Host updates authoritative timeline

Host broadcasts new state to all users

All clients update instantly

This ensures all users stay synchronized.

5.2 Drift Correction

Every 500–1000 ms, host sends a sync packet:

{
"type": "sync",
"isPlaying": true,
"position": 125.42,
"timestamp": 1710000000
}

Guests:

Compare expected vs actual time

If drift < 300ms → micro-adjust

If drift > 700ms → hard seek

6. Features (Version 1)
   ✔ Local file import (no uploads)
   ✔ Multi-user rooms (host + 2 guests max)
   ✔ Real-time shared playback controls
   ✔ P2P communication (WebRTC or direct sockets)
   ✔ File validation (duration check)
   ✔ Drift correction and auto-resync
   ✔ Simple UI
   ✔ Error handling and connection status
7. User Flow
   7.1 Host

Open app

Click Create Room

Choose local video file

App generates room code / link

Host waits for guests to connect

When ready, host or any guest presses Play → everyone plays

7.2 Guest

Open app

Click Join Room

Enter code or click link

Choose local video file

App checks duration match

Joins sync session

8. Developer Freedom

The developer can choose any tech stack they prefer as long as:

It runs on macOS + Windows

Supports P2P connections

Can control a video player (LibVLC/mpv/embedded player/etc.)

Examples (NOT required, just possibilities):
Electron, Tauri, Qt, Flutter, .NET MAUI, Python with bindings — any stack they’re comfortable with.

No restrictions. Developer decides.

9. Minimum Deliverables

Windows installer (.exe or .msi)

macOS .dmg with the .app

P2P connection logic

Group playback sync

Simple UI (create/join room, playback screen)

Full source code + build guide

10. Optional Future Upgrades

Playlist

Subtitle delay sync

Auto-hash matching

Voice chat

File comparison tools

5+ user rooms

LAN mode (no internet required at all)

11. Project Summary (Human Version)

LocalWatch is a desktop app for watching local videos with friends through the internet using peer-to-peer connections. The host acts as the server, guests connect directly, and every play/pause/seek action updates instantly for everyone. Works for 2 or 3 users, requires no online server, and the developer can use any tech stack they want.
