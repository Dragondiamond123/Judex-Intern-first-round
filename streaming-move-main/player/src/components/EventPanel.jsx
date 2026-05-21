import { useState, useRef, useEffect, memo } from 'react'
import { API_BASE } from '../config.js'

const CAM_COLORS = {
  source: '#4ade80',
  sink: '#60a5fa',
  hq: '#f5a623',
}

const CAM_LABELS = {
  source: 'SOURCE',
  sink: 'SINK',
  hq: 'HQ',
}

function EventPanel({ event, onClose, eventIndex, totalEvents }) {
  const videoRefs = useRef({})
  const [playing, setPlaying] = useState(false)

  
  useEffect(() => {
    setPlaying(false)
  }, [event])

  
  useEffect(() => {
    if (!playing) return
    const syncInterval = setInterval(() => {
      const activeCameras = ['source', 'sink', 'hq'].filter(c => videoRefs.current[c])
      if (activeCameras.length === 0) return

      const master = videoRefs.current[activeCameras[0]]
      activeCameras.forEach(cam => {
        if (cam === activeCameras[0]) return
        const video = videoRefs.current[cam]
        if (video && video.readyState >= 2) {
          if (Math.abs(video.currentTime - master.currentTime) > 0.1) {
            video.currentTime += (master.currentTime - video.currentTime) * 0.1
          }
        }
      })
    }, 1000)
    return () => clearInterval(syncInterval)
  }, [playing])

  const handleTogglePlay = () => {
    const newPlaying = !playing
    setPlaying(newPlaying)
    Object.values(videoRefs.current).forEach(v => {
      if (v) {
        if (newPlaying) v.play().catch(() => { })
        else v.pause()
      }
    })
  }

  const handleRestart = () => {
    Object.values(videoRefs.current).forEach(v => {
      if (v) {
        v.currentTime = 0
        if (playing) v.play().catch(() => { })
      }
    })
  }

  if (!event) return null

  const hasClips = event.clips && Object.keys(event.clips).length > 0
  const clipCount = hasClips ? Object.keys(event.clips).length : 0

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      background: 'rgba(8,8,8,0.97)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      borderTop: '1px solid var(--border)',
      zIndex: 100,
      animation: 'slideUp 0.25s ease-out',
      maxHeight: '50vh',
      overflow: 'auto',
    }}>
      {}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '1px',
        background: 'linear-gradient(90deg, transparent 0%, rgba(245,166,35,0.3) 50%, transparent 100%)',
      }} />

      {}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 20px',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{
            fontFamily: 'var(--condensed)',
            fontSize: '15px',
            letterSpacing: '0.15em',
            color: 'var(--amber)',
            textTransform: 'uppercase',
            fontWeight: 600,
          }}>
            Shot #{event.shot_id}
          </span>

          {}
          {totalEvents > 0 && eventIndex >= 0 && (
            <span style={{
              fontFamily: 'var(--mono)',
              fontSize: '9px',
              color: 'var(--muted)',
              background: 'rgba(255,255,255,0.04)',
              padding: '2px 7px',
              borderRadius: '3px',
              border: '1px solid rgba(255,255,255,0.06)',
            }}>
              {eventIndex + 1} of {totalEvents}
            </span>
          )}

          {event.crossed_sides && (
            <span style={{
              fontFamily: 'var(--mono)',
              fontSize: '9px',
              color: '#ff3030',
              background: 'rgba(255,48,48,0.12)',
              padding: '2px 7px',
              borderRadius: '3px',
              border: '1px solid rgba(255,48,48,0.2)',
              fontWeight: 500,
            }}>NET CROSS</span>
          )}

          {event.bounce_coords && (
            <span style={{
              fontFamily: 'var(--mono)',
              fontSize: '9px',
              color: 'var(--muted)',
            }}>
              bounce ({event.bounce_coords.x.toFixed(1)}, {event.bounce_coords.y.toFixed(1)})
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {}
          {hasClips && (
            <>
              <button
                className="ctrl-btn"
                onClick={handleRestart}
                title="Restart clips"
                style={{ padding: '4px 8px', fontSize: '12px' }}
              >⟲</button>
              <button
                className="ctrl-btn"
                onClick={handleTogglePlay}
                title={playing ? 'Pause all' : 'Play all'}
                style={{
                  padding: '4px 12px',
                  fontFamily: 'var(--condensed)',
                  fontSize: '11px',
                  letterSpacing: '0.1em',
                  gap: '5px',
                }}
              >
                {playing ? '⏸' : '▶'} {playing ? 'PAUSE' : 'PLAY'}
              </button>
            </>
          )}
          <button
            className="ctrl-btn"
            onClick={onClose}
            title="Close panel (Esc)"
            style={{
              padding: '4px 12px',
              fontFamily: 'var(--mono)',
              fontSize: '11px',
            }}
          >✕ Close</button>
        </div>
      </div>

      {}
      {hasClips ? (
        <div style={{
          display: 'flex',
          gap: '12px',
          padding: '16px 20px',
          justifyContent: 'center',
        }}>
          {['source', 'sink', 'hq'].map(cam => {
            const clipName = event.clips?.[cam]
            return (
              <ClipPlayer
                key={cam}
                camera={cam}
                clipName={clipName}
                color={CAM_COLORS[cam]}
                label={CAM_LABELS[cam]}
                playing={playing}
                onTogglePlay={handleTogglePlay}
                videoRef={el => { videoRefs.current[cam] = el }}
              />
            )
          })}
        </div>
      ) : (
        <div style={{
          padding: '40px 20px',
          textAlign: 'center',
          fontFamily: 'var(--mono)',
          fontSize: '12px',
          color: 'var(--muted)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
        }}>
          <span style={{ fontSize: '24px', opacity: 0.3 }}>📹</span>
          No bounce clips available for this event
        </div>
      )}

      {}
      {hasClips && (
        <div style={{
          padding: '6px 20px 10px',
          display: 'flex',
          justifyContent: 'center',
          gap: '16px',
          fontFamily: 'var(--mono)',
          fontSize: '9px',
          color: 'var(--muted)',
          borderTop: '1px solid rgba(255,255,255,0.04)',
        }}>
          <span>{clipCount}/3 camera clips available</span>
          <span>·</span>
          <span>flight: {event.flight_id}</span>
          {event.bounce_frame && <><span>·</span><span>frame: {event.bounce_frame}</span></>}
        </div>
      )}
    </div>
  )
}

function ClipPlayer({ camera, clipName, color, label, playing, onTogglePlay, videoRef }) {
  const clipUrl = clipName ? `${API_BASE}/clips/${camera}/${clipName}` : null

  return (
    <div className="clip-container" style={{
      flex: 1,
      maxWidth: '360px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      borderRadius: '6px',
      padding: '8px',
      background: 'rgba(255,255,255,0.02)',
    }}>
      {}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
      }}>
        <span style={{
          width: '6px', height: '6px', borderRadius: '50%',
          background: color,
          boxShadow: `0 0 4px ${color}60`,
        }} />
        <span style={{
          fontFamily: 'var(--condensed)',
          fontSize: '12px',
          letterSpacing: '0.18em',
          color: color,
          textTransform: 'uppercase',
          fontWeight: 600,
        }}>
          {label}
        </span>
      </div>

      {}
      {clipUrl ? (
        <div style={{
          position: 'relative',
          background: '#000',
          borderRadius: '4px',
          overflow: 'hidden',
          border: `1px solid ${color}22`,
          aspectRatio: '16/9',
        }}>
          <video
            ref={videoRef}
            src={clipUrl}
            muted
            playsInline
            loop
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              display: 'block',
            }}
          />
          <button
            onClick={onTogglePlay}
            style={{
              position: 'absolute',
              inset: 0,
              background: playing ? 'transparent' : 'rgba(0,0,0,0.4)',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s',
            }}
          >
            {!playing && (
              <span style={{
                fontSize: '28px', color: 'white', opacity: 0.9,
                textShadow: '0 2px 8px rgba(0,0,0,0.5)',
              }}>▶</span>
            )}
          </button>
        </div>
      ) : (
        <div style={{
          background: 'rgba(255,255,255,0.02)',
          borderRadius: '4px',
          border: '1px dashed rgba(255,255,255,0.08)',
          aspectRatio: '16/9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: '6px',
          fontFamily: 'var(--mono)',
          fontSize: '10px',
          color: 'var(--muted)',
        }}>
          <span style={{ fontSize: '16px', opacity: 0.3 }}>📹</span>
          No clip
        </div>
      )}
    </div>
  )
}

export default memo(EventPanel)
