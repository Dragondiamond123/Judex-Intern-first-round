# Judex-Intern-first-round

# Triple-Camera Live Review System

## Overview

A synchronized multi-camera HLS review system built for:
- low-latency camera switching
- synchronized replay review
- event-based navigation
- multi-camera playback inspection

The system streams 3 synchronized camera feeds:
- SOURCE
- SINK
- HQ

Main features:
- instant camera switching
- rolling DVR replay
- synchronized replay mode
- event timeline navigation
- multi-camera bounce review

The implementation focuses on:
- smooth playback
- synchronization correctness
- low-latency interaction
- practical streaming architecture

---

# Features

- 3 simultaneous HLS streams
- Continuous background buffering
- Near-instant camera switching
- Rolling DVR replay system
- Blob-based replay playlists
- Event timeline markers
- Synchronized multi-camera review
- Replay without additional downloads
- Soft synchronization correction
- Automatic playback recovery

---

# Architecture Notes

## Live Streaming

All 3 HLS streams remain continuously active.

Instead of reconnecting streams during camera switching, hidden video players continue buffering in the background.

This enables:
- near-instant switching
- reduced black screens
- stable synchronization
- smoother playback

---

## Camera Switching

Camera switching uses:
- opacity/visibility swaps
- persistent hidden decoders

The previous camera is never destroyed during switching.

This avoids:
- decoder reloads
- reconnect delays
- playback resets

---

## Replay Mode

Replay mode uses:
- rolling TS segment buffers
- dynamically generated blob playlists
- isolated replay HLS instances

Replay playback works using already-buffered segments without additional downloads.

---

## Synchronization

Synchronization uses:
- frame-index mapping
- synchronized segment metadata
- soft drift correction

Streams gradually converge instead of using aggressive hard seeks.

---

# Project Structure

```text
Assignment/
├── bounce_clips_share/
│   ├── hq/
│   ├── sink/
│   ├── source/
│   └── bounce_clips_cursor.json
│
├── streaming-move-main/
│   ├── player/
│   │   ├── dist/
│   │   ├── node_modules/
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── CameraSelector.jsx
│   │   │   │   ├── EventPanel.jsx
│   │   │   │   ├── LiveBadge.jsx
│   │   │   │   ├── Player.jsx
│   │   │   │   ├── SeekBar.jsx
│   │   │   │   └── SegmentList.jsx
│   │   │   ├── App.jsx
│   │   │   ├── config.js
│   │   │   ├── index.css
│   │   │   └── main.jsx
│   │   ├── index.html
│   │   ├── package.json
│   │   ├── package-lock.json
│   │   └── vite.config.js
│   │
│   ├── .gitignore
│   ├── main.py
│   ├── package-lock.json
│   └── tri_stream_server.py
│
├── sync_reports/
│
├── test_work/
│
└── readme.md
```

---

# Dependencies

## Backend
- Python 3.10+
- Flask
- Flask-CORS

## Frontend
- Node.js 18+
- React
- Vite
- hls.js

---

# Setup Instructions

## Requirements

Install:
- Python 3.10+
- Node.js 18+
- npm

Recommended browsers:
- Brave
- Chrome

---

# Backend Setup

## Step 1 — Open terminal

Navigate to backend directory:

```bash
cd streaming-move-main
```

---

## Step 2 — Install backend dependencies

```bash
pip install flask flask-cors
```

---

## Step 3 — Start backend server

```bash
python3 tri_stream_server.py --speed 2 --window 20
```

Backend runs on:

```text
http://localhost:8081
```

---

# Frontend Setup

## Step 1 — Open a new terminal

Navigate to frontend directory:

```bash
cd streaming-move-main/player
```

---

## Step 2 — Install frontend dependencies

```bash
npm install
```

---

## Step 3 — Start frontend server

```bash
npm run dev
```

Frontend runs on:

```text
http://localhost:3000
```

(or the Vite localhost port shown in terminal)

---

# Assumptions Made

- HLS segments are approximately 4 seconds.
- Streams are pre-generated locally.
- Browser supports MediaSource Extensions (MSE).
- Chromium-based browsers provide best playback performance.
- Replay buffers are memory-based.

---

# Known Limitations

- Minor playback hitching may occasionally occur near HLS loop boundaries.
- Playback smoothness depends on hardware decoding performance.
- Some event clips may be unavailable if preprocessing metadata is incomplete.

---

# Notes

- UI/UX improvements were added while keeping the implementation practical.
- The implementation focuses on smooth playback and synchronization correctness.
- Low-latency camera switching was prioritized throughout the architecture.
- The system avoids unnecessary abstractions and keeps the implementation production-oriented.
