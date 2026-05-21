import { useRef, useState, useCallback, useEffect, memo, useMemo } from 'react'


function toFraction(t, start, end) {
  if (end <= start) return 0
  return Math.max(0, Math.min(1, (t - start) / (end - start)))
}

function formatTime(seconds) {
  const s = Math.abs(Math.round(seconds))
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

const SeekBar = memo(function SeekBar({
  currentTime,   
  liveEdge,      
  bufferStart,   
  bufferedEnd,   
  segments,      
  events,        
  activeCamera,  
  activeEventId, 
  selectedEventIdx,
  segmentListOpen,
  onSeek,        
  onEventJump,   
}) {
  const trackRef = useRef(null)
  const dragging = useRef(false)
  const [hoverFrac, setHoverFrac] = useState(null)

  const segs = segments ?? []
  const segsStart = segs.length > 0 ? segs[0].start : null
  const segsEnd = segs.length > 0 ? segs[segs.length - 1].end : null

  const rangeStart =
    segsStart ??
    bufferStart ??
    (liveEdge !== null ? liveEdge - 80 : 0)

  const rangeEnd =
    Math.max(
      segsEnd ?? -Infinity,
      liveEdge ?? -Infinity,
      currentTime
    )

  const getFracFromMouse = useCallback((clientX) => {
    if (!trackRef.current) return 0
    const rect = trackRef.current.getBoundingClientRect()
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  }, [])

  const seekFromEvent = useCallback((e) => {
    const frac = getFracFromMouse(e.clientX)
    const targetTime = rangeStart + frac * (rangeEnd - rangeStart)
    onSeek(targetTime)
  }, [rangeStart, rangeEnd, onSeek, getFracFromMouse])

  const onMouseDown = (e) => {
    dragging.current = true
    seekFromEvent(e)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }
  const onMouseMove = useCallback((e) => {
    if (dragging.current) seekFromEvent(e)
    if (trackRef.current) {
      setHoverFrac(getFracFromMouse(e.clientX))
    }
  }, [seekFromEvent, getFracFromMouse])
  const onMouseUp = useCallback(() => {
    dragging.current = false
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }, [onMouseMove])

  const currentShotIdx = useMemo(() => {
    let idx = selectedEventIdx !== undefined ? selectedEventIdx : -1;
    if (idx < 0 && events && events.length > 0 && currentTime != null && activeCamera) {
      for (let i = 0; i < events.length; i++) {
        const t = events[i].playback?.[activeCamera]?.time;
        if (t != null && t <= currentTime + 0.5) {
          idx = i;
        } else if (t != null && t > currentTime + 0.5) {
          break;
        }
      }
    }
    return idx;
  }, [events, currentTime, activeCamera, selectedEventIdx]);

  const jumpToEvent = useCallback((dir) => {
    if (!events || events.length === 0) return
    let baseIdx = currentShotIdx >= 0 ? currentShotIdx : (dir > 0 ? -1 : events.length);
    let nextIdx = baseIdx + dir;
    if (nextIdx < 0) nextIdx = 0;
    if (nextIdx >= events.length) nextIdx = events.length - 1;
    onEventJump(events[nextIdx]);
  }, [events, currentShotIdx, onEventJump])
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (segmentListOpen) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        jumpToEvent(-1);
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        jumpToEvent(1);
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [jumpToEvent, segmentListOpen])


  useEffect(() => {
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [onMouseMove, onMouseUp])

  const handleTrackHover = useCallback((e) => {
    if (trackRef.current) {
      setHoverFrac(getFracFromMouse(e.clientX))
    }
  }, [getFracFromMouse])

  const handleTrackLeave = useCallback(() => {
    if (!dragging.current) setHoverFrac(null)
  }, [])

  const playedFrac = toFraction(currentTime, rangeStart, rangeEnd)
  const bufferedFrac = toFraction(bufferedEnd ?? currentTime, rangeStart, rangeEnd)

  const visibleTicks = (segments || []).filter(
    s => s.start > rangeStart && s.start < rangeEnd
  )

  
  const eventMarkers = (events || [])
    .map(evt => {
      const pb = evt.playback?.[activeCamera]
      if (!pb?.time) return null
      const t = pb.time
      if (t < rangeStart || t > rangeEnd) return null
      const frac = toFraction(t, rangeStart, rangeEnd)
      return { ...evt, frac, time: t }
    })
    .filter(Boolean)

  const behind = liveEdge && currentTime
    ? Math.round(liveEdge - currentTime)
    : null

  
  const hoverTime = hoverFrac !== null
    ? rangeStart + hoverFrac * (rangeEnd - rangeStart)
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>

      {}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: '14px',
        fontFamily: 'var(--condensed)',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: 'var(--muted)',
      }}>
        <span>DVR Window · {segments.length} segments</span>
        
        {/* Event Navigation */}
        {events && events.length > 0 && (
          <div style={{
            display: 'flex', gap: '6px', alignItems: 'center',
            background: 'rgba(255,255,255,0.08)',
            borderRadius: '6px',
            padding: '2px 4px',
            border: '1px solid rgba(255,255,255,0.15)',
          }}>
            <button
              onClick={() => jumpToEvent(-1)}
              title="Previous event (←)"
              style={{
                width: '24px', height: '24px', border: 'none', background: 'rgba(255,255,255,0.1)',
                borderRadius: '4px', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <span style={{
              color: currentShotIdx >= 0 ? 'var(--amber)' : 'white',
              padding: '0 8px', minWidth: '70px', textAlign: 'center', fontWeight: 600, letterSpacing: '0.05em', fontSize: '12px'
            }}>
              {currentShotIdx >= 0
                ? `SHOT ${currentShotIdx + 1} OF ${events.length}`
                : `${events.length} EVENTS`}
            </span>
            <button
              onClick={() => jumpToEvent(1)}
              title="Next event (→)"
              style={{
                width: '24px', height: '24px', border: 'none', background: 'rgba(255,255,255,0.1)',
                borderRadius: '4px', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
          </div>
        )}

        <span style={{ fontFamily: 'var(--mono)', fontSize: '14px', color: 'var(--amber)' }}>
          {behind !== null && behind > 1 ? `−${behind}s` : 'LIVE'}
        </span>
      </div>

      {}
      <div
        ref={trackRef}
        className="seek-track"
        onMouseDown={onMouseDown}
        onMouseMove={handleTrackHover}
        onMouseLeave={handleTrackLeave}
        style={{
          position: 'relative',
          height: '28px',
          cursor: 'col-resize',
          display: 'flex',
          alignItems: 'center',
          padding: '0 2px',
          borderRadius: '4px',
        }}
      >
        {}
        {hoverFrac !== null && hoverTime !== null && (
          <div style={{
            position: 'absolute',
            bottom: '30px',
            left: `${Math.max(2, Math.min(98, hoverFrac * 100))}%`,
            transform: 'translateX(-50%)',
            background: 'rgba(10, 10, 14, 0.95)',
            border: '1px solid rgba(245, 166, 35, 0.3)',
            borderRadius: '3px',
            padding: '3px 7px',
            fontFamily: 'var(--mono)',
            fontSize: '10px',
            color: 'var(--amber)',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 15,
          }}>
            {formatTime(hoverTime)}
          </div>
        )}

        {}
        <div style={{
          position: 'absolute',
          left: '2px', right: '2px',
          height: '4px',
          background: 'rgba(255,255,255,0.06)',
          borderRadius: '2px',
          overflow: 'hidden',
        }}>
          {}
          <div style={{
            position: 'absolute',
            left: 0,
            width: `${bufferedFrac * 100}%`,
            height: '100%',
            background: 'rgba(245,166,35,0.18)',
            transition: 'width 0.1s linear',
          }} />
          {}
          <div style={{
            position: 'absolute',
            left: 0,
            width: `${playedFrac * 100}%`,
            height: '100%',
            background: 'linear-gradient(90deg, var(--amber), #ffca5f)',
            transition: 'width 0.1s linear',
          }} />
        </div>

        {}
        {visibleTicks.map((seg, i) => {
          const frac = toFraction(seg.start, rangeStart, rangeEnd)
          return (
            <div key={`t${i}`} style={{
              position: 'absolute',
              left: `${frac * 100}%`,
              width: '1px',
              height: '10px',
              background: 'rgba(255,255,255,0.12)',
              transform: 'translateX(-0.5px)',
              pointerEvents: 'none',
            }} />
          )
        })}

        {}
        {eventMarkers.map((evt) => (
          <div
            key={`e${evt.shot_id}`}
            onClick={(e) => {
              e.stopPropagation()
              onEventJump?.(evt)
            }}
            className="event-marker-wrap"
            style={{
              position: 'absolute',
              left: `${evt.frac * 100}%`,
              transform: 'translateX(-50%)',
              cursor: 'pointer',
              pointerEvents: 'auto',
              zIndex: 3,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            {}
            <div className="event-tooltip" style={{
              position: 'absolute',
              bottom: '22px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(10,10,14,0.95)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              border: `1px solid ${evt.crossed_sides ? 'rgba(255,48,48,0.3)' : 'rgba(245,166,35,0.3)'}`,
              borderRadius: '5px',
              padding: '7px 11px',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              opacity: 0,
              transition: 'opacity 0.15s ease',
              zIndex: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: '3px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{
                  fontFamily: 'var(--condensed)', fontSize: '14px',
                  color: evt.crossed_sides ? '#ff3030' : 'var(--amber)',
                  letterSpacing: '0.1em', fontWeight: 600,
                }}>
                  SHOT #{evt.shot_id}
                </span>
                {evt.crossed_sides && (
                  <span style={{
                    fontSize: '8px', fontFamily: 'var(--mono)',
                    background: 'rgba(255,48,48,0.15)', color: '#ff3030',
                    padding: '1px 4px', borderRadius: '2px',
                    border: '1px solid rgba(255,48,48,0.2)',
                  }}>NET</span>
                )}
              </div>
              <div style={{
                fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--muted)',
                display: 'flex', gap: '8px',
              }}>
                {evt.bounce_frame != null && <span>f:{evt.bounce_frame}</span>}
                <span>t:{evt.time.toFixed(1)}s</span>
                {evt.bounce_coords && (
                  <span>({evt.bounce_coords.x.toFixed(1)}, {evt.bounce_coords.y.toFixed(1)})</span>
                )}
              </div>
            </div>
            {}
            <div style={{
              width: evt.shot_id === activeEventId ? '14px' : '10px',
              height: evt.shot_id === activeEventId ? '14px' : '10px',
              background: evt.crossed_sides ? '#ff3030' : '#f5a623',
              borderRadius: '1px',
              transform: evt.shot_id === activeEventId ? 'rotate(45deg) scale(1.3)' : 'rotate(45deg)',
              boxShadow: evt.shot_id === activeEventId
                ? `0 0 8px ${evt.crossed_sides ? 'rgba(255,48,48,0.8)' : 'rgba(245,166,35,0.8)'},
                   0 0 16px ${evt.crossed_sides ? 'rgba(255,48,48,0.4)' : 'rgba(245,166,35,0.4)'}`
                : `0 0 4px ${evt.crossed_sides ? 'rgba(255,48,48,0.5)' : 'rgba(245,166,35,0.5)'}`,
              transition: 'transform 0.12s ease, box-shadow 0.15s ease',
            }} />
            {}
            <div style={{
              width: '1px',
              height: '4px',
              background: evt.crossed_sides ? '#ff3030' : '#f5a623',
              opacity: 0.5,
            }} />
          </div>
        ))}

        {}
        {hoverFrac !== null && (
          <div style={{
            position: 'absolute',
            left: `${hoverFrac * 100}%`,
            width: '1px',
            height: '100%',
            background: 'rgba(255,255,255,0.2)',
            pointerEvents: 'none',
            zIndex: 2,
          }} />
        )}

        {}
        <div style={{
          position: 'absolute',
          left: `${playedFrac * 100}%`,
          transform: 'translateX(-50%)',
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          background: 'var(--amber)',
          boxShadow: '0 0 0 3px rgba(245,166,35,0.25), 0 0 8px rgba(245,166,35,0.3)',
          pointerEvents: 'none',
          zIndex: 4,
          transition: 'box-shadow 0.15s ease',
        }} />

        {}
        <div style={{
          position: 'absolute',
          right: 0,
          width: '2px',
          height: '16px',
          background: 'var(--red)',
          borderRadius: '1px',
          opacity: 0.8,
          pointerEvents: 'none',
          boxShadow: '0 0 4px rgba(255,48,48,0.4)',
        }} />
      </div>

      {}
      <div style={{
        position: 'relative',
        height: '12px',
        fontSize: '9px',
        fontFamily: 'var(--mono)',
        color: 'var(--muted)',
      }}>
        <span style={{ position: 'absolute', left: 0 }}>
          {formatOffset(rangeStart - (liveEdge ?? rangeStart))}
        </span>
        {eventMarkers.length > 0 && (
          <span style={{
            position: 'absolute', left: '50%', transform: 'translateX(-50%)',
            color: 'var(--amber)', opacity: 0.6,
          }}>
            {eventMarkers.length} event{eventMarkers.length !== 1 ? 's' : ''}
          </span>
        )}
        <span style={{ position: 'absolute', right: 0, color: 'var(--red)', opacity: 0.7 }}>
          EDGE
        </span>
      </div>
    </div>
  )
})

export default SeekBar

function formatOffset(seconds) {
  const s = Math.round(Math.abs(seconds))
  return seconds < -1 ? `−${s}s` : '0s'
}
