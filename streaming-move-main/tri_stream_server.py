
"""
tri_stream_server.py — Triple-camera HLS live stream server.

Serves 3 synchronized camera streams (Source, Sink, HQ) from a single process:
  /source/live.m3u8   /sink/live.m3u8   /hq/live.m3u8

REST APIs:
  /cameras   — stream URLs
  /sync      — segment-level cross-camera mapping
  /events    — shot/bounce events with playback positions
  /status    — current streaming state per camera

Also serves bounce clips:
  /clips/{camera}/bounce_{frame}_{id}.mp4

Usage:
    python3 tri_stream_server.py [--port 8081] [--speed 4.0] [--window 30]
"""

import os
import sys
import csv
import json
import time
import threading
import argparse
import bisect
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
from urllib.parse import urlparse, parse_qs



class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True





SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ASSIGNMENT_DIR = os.path.dirname(SCRIPT_DIR)

CAMERA_SEGMENT_DIRS = {
    'source': os.path.join(ASSIGNMENT_DIR, 'sync_reports', 'ts_segments_source', '1645'),
    'sink':   os.path.join(ASSIGNMENT_DIR, 'sync_reports', 'ts_segments_sink', '1645'),
    'hq':     os.path.join(ASSIGNMENT_DIR, 'sync_reports', 'ts_segments_hq', '1645'),
}

FRAME_INDEX_CSVS = {
    'source': os.path.join(ASSIGNMENT_DIR, 'test_work', 'cv_output', 'reader', 'source', 'hls_segment_frame_index.csv'),
    'sink':   os.path.join(ASSIGNMENT_DIR, 'test_work', 'cv_output', 'reader', 'sink', 'hls_segment_frame_index.csv'),
    'hq':     os.path.join(ASSIGNMENT_DIR, 'test_work', 'cv_output', 'reader', 'hq', 'hls_segment_frame_index.csv'),
}

SYNC_CSV_PATH    = os.path.join(ASSIGNMENT_DIR, 'sync_reports', 'segments_1645', 'sync', 'hls_sync_1645_triple.csv')
EVENTS_CSV_PATH  = os.path.join(ASSIGNMENT_DIR, 'test_work', 'cv_output', 'correlation', 'flight_shots.csv')
CLIPS_BASE_DIR   = os.path.join(ASSIGNMENT_DIR, 'bounce_clips_share')






camera_playlists = {}


camera_frame_indices = {}


camera_playback_times = {}


camera_total_durations = {}



segment_sync_map = {}


events_list = []


camera_streams = {}

global_sync_rows = []






def parse_m3u8(path):
    """Parse an m3u8 playlist. Returns [(duration_float, segment_filename), ...]"""
    segments = []
    with open(path) as f:
        lines = f.read().splitlines()
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if line.startswith('#EXTINF:'):
            duration = float(line.split(':')[1].rstrip(','))
            seg = lines[i + 1].strip()
            segments.append((duration, seg))
            i += 2
        else:
            i += 1
    return segments


def load_frame_index(csv_path):
    """Load hls_segment_frame_index.csv. Returns list of dicts."""
    entries = []
    with open(csv_path, newline='') as f:
        reader = csv.DictReader(f)
        for row in reader:
            entries.append({
                'segment_index': int(row['segment_index']),
                'seg_basename':  row['seg_basename'].strip(),
                'cumulative_start_frame': int(row['cumulative_start_frame']),
                'frame_count': int(row['frame_count']),
            })
    return entries


def build_playback_times(playlist):
    """From playlist [(dur, name), ...], build cumulative start times."""
    times = []
    t = 0.0
    for dur, _ in playlist:
        times.append(t)
        t += dur
    return times


def frame_to_segment(frame_index_entries, frame_num):
    """Given a frame number, return (segment_index, offset_within_segment)."""
    
    starts = [e['cumulative_start_frame'] for e in frame_index_entries]
    idx = bisect.bisect_right(starts, frame_num) - 1
    if idx < 0:
        idx = 0
    entry = frame_index_entries[idx]
    offset = frame_num - entry['cumulative_start_frame']
    return entry['segment_index'], offset


def frame_to_playback_time(cam, frame_num):
    """Convert a frame number to playback time (seconds) for a camera."""
    entries = camera_frame_indices.get(cam, [])
    playlist = camera_playlists.get(cam, [])
    times = camera_playback_times.get(cam, [])
    if not entries or not playlist or not times:
        return 0.0

    seg_idx, offset = frame_to_segment(entries, frame_num)
    if seg_idx >= len(playlist) or seg_idx >= len(times):
        
        return times[-1] if times else 0.0

    seg_dur = playlist[seg_idx][0]
    frame_count = entries[seg_idx]['frame_count'] if seg_idx < len(entries) else 120
    time_within_seg = (offset / max(frame_count, 1)) * seg_dur
    return times[seg_idx] + time_within_seg


def load_sync_table():
    """
    Load hls_sync_1645_triple.csv and build segment-level sync maps.
    For each camera pair, maps segment_index -> segment_index.
    """
    print("  Loading triple sync CSV...")

    
    source_frames = []
    sink_frames = []
    hq_frames = []

    with open(SYNC_CSV_PATH, newline='') as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                sf = int(row['Source_Index'].strip())
                kf = int(row['Sink_Index'].strip())
                hf = int(row['HQ_Index'].strip())
            except (ValueError, KeyError):
                continue  
            source_frames.append(sf)
            sink_frames.append(kf)
            hq_frames.append(hf)

    print(f"    {len(source_frames)} sync rows loaded")

    global global_sync_rows
    sync_rows = list(zip(source_frames, sink_frames, hq_frames))
    global_sync_rows = sync_rows

    
    cameras = ['source', 'sink', 'hq']
    cam_frame_col = {'source': 0, 'sink': 1, 'hq': 2}

    for from_cam in cameras:
        from_entries = camera_frame_indices.get(from_cam, [])
        if not from_entries:
            continue

        for from_seg_entry in from_entries:
            from_seg = from_seg_entry['segment_index']
            
            mid_frame = from_seg_entry['cumulative_start_frame'] + from_seg_entry['frame_count'] // 2
            from_col = cam_frame_col[from_cam]

            
            
            frame_list = [r[from_col] for r in sync_rows]
            row_idx = bisect.bisect_left(frame_list, mid_frame)
            if row_idx >= len(sync_rows):
                row_idx = len(sync_rows) - 1
            if row_idx > 0:
                if abs(frame_list[row_idx - 1] - mid_frame) < abs(frame_list[row_idx] - mid_frame):
                    row_idx -= 1

            sync_row = sync_rows[row_idx]

            
            mappings = {}
            for to_cam in cameras:
                if to_cam == from_cam:
                    continue
                to_col = cam_frame_col[to_cam]
                to_frame = sync_row[to_col]
                to_entries = camera_frame_indices.get(to_cam, [])
                if not to_entries:
                    continue
                to_seg, to_offset = frame_to_segment(to_entries, to_frame)
                to_time = frame_to_playback_time(to_cam, to_frame)
                mappings[to_cam] = {'segment': to_seg, 'time': round(to_time, 3)}

            
            from_time = frame_to_playback_time(from_cam, mid_frame)
            mappings[from_cam] = {'segment': from_seg, 'time': round(from_time, 3)}

            segment_sync_map[(from_cam, from_seg)] = mappings


def load_events():
    """Load flight_shots.csv and build events with playback positions."""
    print("  Loading events CSV...")
    events = []

    with open(EVENTS_CSV_PATH, newline='') as f:
        reader = csv.DictReader(f)
        for row in reader:
            counts_as_shot = row.get('counts_as_shot', '0').strip()
            if counts_as_shot != '1':
                continue

            shot_id_raw = row.get('shot_id', '').strip()
            if not shot_id_raw:
                continue

            shot_id = int(shot_id_raw)
            flight_id = int(row.get('flight_id', 0))

            
            bounce_frame_raw = row.get('bounce_frame', '').strip()
            bounce_frame = int(bounce_frame_raw) if bounce_frame_raw else None

            
            bounce_hq_raw = row.get('bounce_hq_frame', '').strip()
            bounce_hq_frame = int(bounce_hq_raw) if bounce_hq_raw else None

            start_frame = int(row.get('start_frame', 0))
            end_frame = int(row.get('end_frame', 0))

            crossed_sides = row.get('crossed_sides', '0').strip() == '1'

            
            bx = row.get('bounce_x', '').strip()
            by = row.get('bounce_y', '').strip()
            bz = row.get('bounce_z', '').strip()
            bounce_coords = None
            if bx and by:
                try:
                    bounce_coords = {
                        'x': round(float(bx), 3),
                        'y': round(float(by), 3),
                        'z': round(float(bz), 3) if bz else 0,
                    }
                except ValueError:
                    pass

            
            playback = {}

            
            if bounce_frame is not None:
                playback['source'] = {
                    'time': round(frame_to_playback_time('source', bounce_frame), 3),
                    'frame': bounce_frame,
                }
                
                src_entries = camera_frame_indices.get('source', [])
                if src_entries:
                    src_seg, _ = frame_to_segment(src_entries, bounce_frame)
                    sync_data = segment_sync_map.get(('source', src_seg), {})
                    if 'sink' in sync_data:
                        playback['sink'] = {
                            'time': sync_data['sink']['time'],
                            'frame': bounce_frame,  
                        }

            
            if bounce_hq_frame is not None:
                playback['hq'] = {
                    'time': round(frame_to_playback_time('hq', bounce_hq_frame), 3),
                    'frame': bounce_hq_frame,
                }
            elif bounce_frame is not None:
                src_entries = camera_frame_indices.get('source', [])
                if src_entries:
                    src_seg, _ = frame_to_segment(src_entries, bounce_frame)
                    sync_data = segment_sync_map.get(('source', src_seg), {})
                    if 'hq' in sync_data:
                        playback['hq'] = {
                            'time': sync_data['hq']['time'],
                            'frame': bounce_frame,
                        }

            
            
            clips = {}
            if bounce_frame is not None:
                clip_name = f"bounce_{bounce_frame}_{flight_id:05d}.mp4"
                for cam in ['source', 'sink', 'hq']:
                    clip_path = os.path.join(CLIPS_BASE_DIR, cam, clip_name)
                    if os.path.isfile(clip_path):
                        clips[cam] = clip_name

            event = {
                'shot_id': shot_id,
                'flight_id': flight_id,
                'start_frame': start_frame,
                'end_frame': end_frame,
                'bounce_frame': bounce_frame,
                'crossed_sides': crossed_sides,
                'bounce_coords': bounce_coords,
                'playback': playback,
                'clips': clips,
            }
            events.append(event)

    print(f"    {len(events)} shot events loaded")
    return events






class CameraStream:
    """Manages progressive segment release for one camera."""

    def __init__(self, camera_name):
        self.camera = camera_name
        self.segments = camera_playlists.get(camera_name, [])
        self.total = len(self.segments)
        self.released_count = 0
        self.lock = threading.Lock()

    def get_playlist(self, window_size):
        """Generate live.m3u8 content for the current state."""
        with self.lock:
            if self.released_count == 0:
                
                return '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:6\n#EXT-X-MEDIA-SEQUENCE:0\n'

            end_abs = self.released_count
            start_abs = max(0, end_abs - window_size)

            lines = [
                '#EXTM3U',
                '#EXT-X-VERSION:3',
                '#EXT-X-TARGETDURATION:6',
                f'#EXT-X-MEDIA-SEQUENCE:{start_abs}',
            ]
            
            for i in range(start_abs, end_abs):
                seg_idx = i % self.total
                
                if seg_idx == 0 and i != 0:
                    lines.append('#EXT-X-DISCONTINUITY')
                    
                duration, name = self.segments[seg_idx]
                lines.append(f'#EXTINF:{duration:.6f},')
                lines.append(name)

            return '\n'.join(lines) + '\n'

    def advance(self):
        """Release next segment. Returns (duration, is_loop_restart) or (None, False)."""
        with self.lock:
            if self.total == 0:
                return None, False
                
            is_loop = (self.released_count > 0 and self.released_count % self.total == 0)
            
            seg_idx = self.released_count % self.total
            dur = self.segments[seg_idx][0]
            self.released_count += 1
            
            return dur, is_loop

    def get_status(self):
        with self.lock:
            return {
                'current_segment': max(0, (self.released_count - 1) % self.total) if self.total else 0,
                'released': self.released_count % self.total,
                'total_segments': self.total,
                'media_sequence': max(0, self.released_count - WINDOW_SIZE),
            }


def stream_loop(camera_name, speed, window_size):
    """Background thread: progressively release segments at (near) real-time pace."""
    stream = camera_streams[camera_name]
    total = stream.total
    iteration = 0

    while True:
        iteration += 1
        for i in range(total):
            dur, looped = stream.advance()
            if dur is None:
                break

            label = f"[{camera_name:>6}] [{i+1:>4}/{total}]"
            seg_name = stream.segments[i][1]
            print(f"  {label} released {seg_name}  ({dur:.2f}s)")

            time.sleep(dur / speed)

        print(f"  [{camera_name:>6}] Loop {iteration} complete — restarting")






WINDOW_SIZE = 30  
SERVER_PORT = 8081

class TriStreamHandler(BaseHTTPRequestHandler):

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def log_message(self, fmt, *args):
        
        msg = fmt % args
        if '.ts' not in msg:
            print(f"  [http] {msg}")

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip('/')
        params = parse_qs(parsed.query)

        
        for cam in ['source', 'sink', 'hq']:
            if path == f'/{cam}/live.m3u8':
                return self.serve_playlist(cam)
            if path.startswith(f'/{cam}/') and path.endswith('.ts'):
                seg_name = path.split('/')[-1]
                return self.serve_segment(cam, seg_name)

        
        if path == '/cameras':
            return self.api_cameras()
        if path == '/sync':
            return self.api_sync(params)
        if path == '/events':
            return self.api_events()
        if path == '/status':
            return self.api_status()

        
        if path.startswith('/clips/'):
            parts = path.split('/')
            if len(parts) >= 4:
                cam = parts[2]
                filename = parts[3]
                return self.serve_clip(cam, filename)

        self.send_error(404, f'Not found: {path}')

    

    def serve_playlist(self, camera):
        stream = camera_streams.get(camera)
        if not stream:
            self.send_error(404, f'Unknown camera: {camera}')
            return

        content = stream.get_playlist(WINDOW_SIZE)
        data = content.encode('utf-8')

        self.send_response(200)
        self.send_header('Content-Type', 'application/vnd.apple.mpegurl')
        self.send_header('Content-Length', len(data))
        self.send_header('Cache-Control', 'no-cache, no-store')
        self.end_headers()
        self.wfile.write(data)

    def serve_segment(self, camera, seg_name):
        seg_dir = CAMERA_SEGMENT_DIRS.get(camera)
        if not seg_dir:
            self.send_error(404)
            return

        seg_path = os.path.join(seg_dir, seg_name)
        if not os.path.isfile(seg_path):
            self.send_error(404, f'Segment not found: {seg_name}')
            return

        with open(seg_path, 'rb') as f:
            data = f.read()

        self.send_response(200)
        self.send_header('Content-Type', 'video/mp2t')
        self.send_header('Content-Length', len(data))
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        self.wfile.write(data)

    def serve_clip(self, camera, filename):
        clip_path = os.path.join(CLIPS_BASE_DIR, camera, filename)
        if not os.path.isfile(clip_path):
            self.send_error(404, f'Clip not found: {camera}/{filename}')
            return

        with open(clip_path, 'rb') as f:
            data = f.read()

        self.send_response(200)
        self.send_header('Content-Type', 'video/mp4')
        self.send_header('Content-Length', len(data))
        self.end_headers()
        self.wfile.write(data)

    

    def api_cameras(self):
        port = SERVER_PORT
        result = {
            'source': f'http://localhost:{port}/source/live.m3u8',
            'sink': f'http://localhost:{port}/sink/live.m3u8',
            'hq': f'http://localhost:{port}/hq/live.m3u8',
        }
        self.send_json(result)

    def api_sync(self, params):
        from_camera = params.get('from_camera', [None])[0]
        from_seg_raw = params.get('from_seg', [None])[0]
        from_time_raw = params.get('from_time', [None])[0]

        if not from_camera:
            self.send_json({'error': 'Missing from_camera'}, 400)
            return
            
        if from_time_raw is not None:
            try:
                from_time = float(from_time_raw)
            except ValueError:
                self.send_json({'error': 'from_time must be float'}, 400)
                return

            times = camera_playback_times.get(from_camera, [])
            playlist = camera_playlists.get(from_camera, [])
            entries = camera_frame_indices.get(from_camera, [])

            if not times or not playlist or not entries or not global_sync_rows:
                self.send_json({'error': 'Data not ready'}, 500)
                return

            seg_idx = bisect.bisect_right(times, from_time) - 1
            if seg_idx < 0: seg_idx = 0
            
            if seg_idx < len(entries):
                entry = entries[seg_idx]
                time_within_seg = from_time - times[seg_idx]
                seg_dur = playlist[seg_idx][0]
                frame_offset = int((time_within_seg / max(seg_dur, 0.001)) * entry['frame_count'])
                target_frame = entry['cumulative_start_frame'] + frame_offset
            else:
                target_frame = entries[-1]['cumulative_start_frame'] + entries[-1]['frame_count']

            cam_frame_col = {'source': 0, 'sink': 1, 'hq': 2}
            from_col = cam_frame_col[from_camera]
            frame_list = [r[from_col] for r in global_sync_rows]
            
            row_idx = bisect.bisect_left(frame_list, target_frame)
            if row_idx >= len(global_sync_rows):
                row_idx = len(global_sync_rows) - 1
            if row_idx > 0:
                if abs(frame_list[row_idx - 1] - target_frame) < abs(frame_list[row_idx] - target_frame):
                    row_idx -= 1
                    
            sync_row = global_sync_rows[row_idx]
            mapping = {}
            for to_cam in ['source', 'sink', 'hq']:
                to_col = cam_frame_col[to_cam]
                to_frame = sync_row[to_col]
                to_entries = camera_frame_indices.get(to_cam, [])
                if not to_entries: continue
                to_seg, _ = frame_to_segment(to_entries, to_frame)
                to_time = frame_to_playback_time(to_cam, to_frame)
                mapping[to_cam] = {'segment': to_seg, 'time': round(to_time, 3)}

            self.send_json(mapping)
            return

        if from_seg_raw is None:
            self.send_json({'error': 'Missing from_seg'}, 400)
            return

        try:
            from_seg = int(from_seg_raw)
        except ValueError:
            self.send_json({'error': 'from_seg must be integer'}, 400)
            return

        key = (from_camera, from_seg)
        mapping = segment_sync_map.get(key)

        if mapping is None:
            
            mapping = {}
            for cam in ['source', 'sink', 'hq']:
                times = camera_playback_times.get(cam, [])
                if from_seg < len(times):
                    mapping[cam] = {'segment': from_seg, 'time': round(times[from_seg], 3)}
                elif times:
                    mapping[cam] = {'segment': len(times) - 1, 'time': round(times[-1], 3)}

        self.send_json(mapping)

    def api_events(self):
        self.send_json(events_list)

    def api_status(self):
        result = {}
        for cam in ['source', 'sink', 'hq']:
            stream = camera_streams.get(cam)
            if stream:
                result[cam] = stream.get_status()
        self.send_json(result)

    

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', len(body))
        self.end_headers()
        self.wfile.write(body)






def main():
    global WINDOW_SIZE, SERVER_PORT, events_list

    parser = argparse.ArgumentParser(description='Triple-camera HLS stream server')
    parser.add_argument('--port',   type=int,   default=8081, help='HTTP port')
    parser.add_argument('--speed',  type=float, default=4.0,  help='Playback speed multiplier')
    parser.add_argument('--window', type=int,   default=30,   help='Sliding window size')
    args = parser.parse_args()

    SERVER_PORT = args.port
    WINDOW_SIZE = args.window

    print("=" * 60)
    print("  TRIPLE-CAMERA HLS STREAM SERVER")
    print("=" * 60)

    
    print("\n[1/5] Loading playlists...")
    for cam, seg_dir in CAMERA_SEGMENT_DIRS.items():
        playlist_path = os.path.join(seg_dir, 'playlist.m3u8')
        if os.path.isfile(playlist_path):
            camera_playlists[cam] = parse_m3u8(playlist_path)
            print(f"  {cam}: {len(camera_playlists[cam])} segments")
        else:
            print(f"  {cam}: WARNING — playlist not found at {playlist_path}")
            camera_playlists[cam] = []

    
    print("\n[2/5] Loading frame indices...")
    for cam, csv_path in FRAME_INDEX_CSVS.items():
        if os.path.isfile(csv_path):
            camera_frame_indices[cam] = load_frame_index(csv_path)
            total_frames = sum(e['frame_count'] for e in camera_frame_indices[cam])
            print(f"  {cam}: {len(camera_frame_indices[cam])} segments, {total_frames} total frames")
        else:
            print(f"  {cam}: WARNING — frame index not found")
            camera_frame_indices[cam] = []

    
    print("\n[3/5] Building playback time maps...")
    for cam in ['source', 'sink', 'hq']:
        camera_playback_times[cam] = build_playback_times(camera_playlists[cam])
        total_dur = sum(d for d, _ in camera_playlists[cam])
        camera_total_durations[cam] = total_dur
        print(f"  {cam}: {total_dur:.1f}s total duration")

    
    print("\n[4/5] Building sync maps...")
    load_sync_table()
    print(f"    {len(segment_sync_map)} segment sync entries")

    
    print("\n[5/5] Loading events...")
    events_list = load_events()

    
    for cam in ['source', 'sink', 'hq']:
        camera_streams[cam] = CameraStream(cam)

    
    print(f"\nStarting stream loops (speed={args.speed}x, window={args.window})...")
    for cam in ['source', 'sink', 'hq']:
        t = threading.Thread(
            target=stream_loop,
            args=(cam, args.speed, args.window),
            daemon=True,
        )
        t.start()

    
    server = ThreadedHTTPServer(('', args.port), TriStreamHandler)
    print(f"\n{'=' * 60}")
    print(f"  Server running on port {args.port}")
    print(f"")
    print(f"  Streams:")
    print(f"    Source → http://localhost:{args.port}/source/live.m3u8")
    print(f"    Sink   → http://localhost:{args.port}/sink/live.m3u8")
    print(f"    HQ     → http://localhost:{args.port}/hq/live.m3u8")
    print(f"")
    print(f"  APIs:")
    print(f"    GET /cameras")
    print(f"    GET /sync?from_camera=hq&from_seg=45")
    print(f"    GET /events")
    print(f"    GET /status")
    print(f"")
    print(f"  Clips:")
    print(f"    GET /clips/{{camera}}/bounce_{{frame}}_{{id}}.mp4")
    print(f"{'=' * 60}")
    print()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")


if __name__ == '__main__':
    main()
