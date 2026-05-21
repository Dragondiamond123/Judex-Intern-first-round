import { useState, useCallback, useRef, useEffect, memo } from 'react'
import SeekBar from './SeekBar.jsx'
import LiveBadge from './LiveBadge.jsx'
import SegmentList from './SegmentList.jsx'

const Player = memo(function Player({
  activeCamera,
  videoRef,
  mode,
  status,
  currentTime,
  isPaused,
  isLive,
  liveEdge,
  bufferStart,
  bufferedEnd,
  segments,
  reviewSegs,
  events,
  memoryMB,
  activeCount,
  bufferSize,
  errorMsg,
  onSeek,
  onGoLive,
  onEnterReview,
  onEventJump,
  onCameraSwitch,
  inReview,
}) {
  const [showControls, setShowControls] = useState(true)
  const [showSegList, setShowSegList] = useState(false)
  const hoverTimer = useRef(null)
  const segEndRef = useRef(null)

  const openSegList = useCallback(() => {
    if (mode === 'live') {
      const ok = onEnterReview()
      if (!ok) {
        
      }
    }
    setShowSegList(true)
  }, [mode, onEnterReview])

  const closeSegList = useCallback(() => {
    setShowSegList(false)
  }, [])

  const handlePlaySegment = useCallback((seg) => {
    const video = videoRef.current?.[activeCamera]
    if (!video) return
    segEndRef.current = seg.end
    video.currentTime = seg.start
    video.play().catch(() => { })
  }, [videoRef, activeCamera])

  const handleGoLive = useCallback(() => {
    setShowSegList(false)
    onGoLive()
  }, [onGoLive])

  
  useEffect(() => {
    if (segEndRef.current && currentTime >= segEndRef.current) {
      const video = videoRef.current?.[activeCamera]
      if (video) {
        video.pause()
        segEndRef.current = null
      }
    }
  }, [currentTime, activeCamera, videoRef])

  
  const onMouseEnter = () => { clearTimeout(hoverTimer.current); setShowControls(true) }
  const onMouseLeave = () => { hoverTimer.current = setTimeout(() => setShowControls(false), 2000) }
  const onMouseMove = () => {
    clearTimeout(hoverTimer.current)
    setShowControls(true)
    hoverTimer.current = setTimeout(() => setShowControls(false), 2500)
  }

  
  const [currentEventIdx, setCurrentEventIdx] = useState(-1)

  const jumpToEvent = useCallback((dir) => {
    if (!events || events.length === 0) return
    let nextIdx = currentEventIdx + dir
    if (nextIdx < 0) nextIdx = 0
    if (nextIdx >= events.length) nextIdx = events.length - 1
    setCurrentEventIdx(nextIdx)
    onEventJump(events[nextIdx])
  }, [events, currentEventIdx, onEventJump])

  
  const togglePlayPause = useCallback(() => {
    const video = videoRef.current?.[activeCamera]
    if (video) {
      if (video.paused) video.play().catch(() => { })
      else video.pause()
    }
  }, [videoRef, activeCamera])

  
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      jumpToEvent(-1)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      jumpToEvent(1)
    } else if (e.key === ' ') {
      e.preventDefault()
      togglePlayPause()
    } else if (e.key === '1') {
      e.preventDefault()
      onCameraSwitch?.('source')
    } else if (e.key === '2') {
      e.preventDefault()
      onCameraSwitch?.('sink')
    } else if (e.key === '3') {
      e.preventDefault()
      onCameraSwitch?.('hq')
    }
  }, [jumpToEvent, togglePlayPause, onCameraSwitch])

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onMouseMove={onMouseMove}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 10,
        outline: 'none',
      }}
    >
      {}
      {status === 'connecting' && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: '16px',
          background: 'rgba(8,8,8,0.92)',
          zIndex: 20,
          animation: 'fadeIn 0.3s ease',
        }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                width: '6px', height: '6px', borderRadius: '50%',
                background: 'var(--amber)',
                animation: `blink 1.2s ${i * 0.2}s ease-in-out infinite`,
                opacity: 0.3,
              }} />
            ))}
          </div>
          <span style={{
            fontFamily: 'var(--condensed)', letterSpacing: '0.2em',
            fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase',
          }}>
            Connecting to streams
          </span>
        </div>
      )}

      {}
      {status === 'error' && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: '12px',
          background: 'rgba(8,8,8,0.95)', zIndex: 20,
        }}>
          <span style={{ fontSize: '24px', color: 'var(--red)', opacity: 0.7 }}>✕</span>
          <span style={{
            fontFamily: 'var(--condensed)', fontSize: '13px',
            letterSpacing: '0.15em', color: 'var(--red)', textTransform: 'uppercase',
          }}>Stream Error</span>
          <span style={{
            fontFamily: 'var(--mono)', fontSize: '11px',
            color: 'var(--muted)', maxWidth: '360px', textAlign: 'center',
          }}>
            {errorMsg ?? 'Could not connect. Is the stream server running?'}
          </span>
        </div>
      )}

      {}
      {inReview && (
        <div className="mode-badge" style={{
          position: 'absolute', top: '16px', left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          border: '1px solid rgba(245,166,35,0.3)',
          borderRadius: '6px',
          padding: '6px 16px',
          fontFamily: 'var(--condensed)',
          fontSize: '11px',
          letterSpacing: '0.2em',
          color: 'var(--amber)',
          textTransform: 'uppercase',
          pointerEvents: 'none',
          zIndex: 15,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <span style={{
            width: '6px', height: '6px', borderRadius: '50%',
            background: 'var(--amber)',
            animation: 'pulse 1.4s ease-in-out infinite',
          }} />
          Replay · {reviewSegs.length} segments pinned
        </div>
      )}

      {}
      {status === 'playing' && isPaused && showControls && (
        <div
          onClick={togglePlayPause}
          style={{
            position: 'absolute',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '64px', height: '64px',
            borderRadius: '50%',
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            border: '1px solid rgba(255,255,255,0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 12,
            animation: 'fadeIn 0.15s ease',
            transition: 'all 0.15s ease',
          }}
        >
          <svg width="24" height="28" viewBox="0 0 24 28" fill="white">
            <path d="M4 2 L22 14 L4 26 Z" />
          </svg>
        </div>
      )}

      {}
      {showSegList && status === 'playing' && (
        <SegmentList
          segments={segments}
          currentTime={currentTime}
          liveEdge={liveEdge}
          onPlaySegment={handlePlaySegment}
          onGoLive={handleGoLive}
          onClose={closeSegList}
        />
      )}

      {}
      <div className="controls-gradient" style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        padding: '40px 20px 18px',
        opacity: showControls ? 1 : 0,
        transition: 'opacity 0.3s ease',
        pointerEvents: showControls ? 'auto' : 'none',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', marginBottom: '10px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {}
            <button
              id="btn-play-pause"
              className="ctrl-btn"
              onClick={togglePlayPause}
              title={isPaused ? 'Play (Space)' : 'Pause (Space)'}
              style={{
                width: '40px', height: '40px',
                padding: 0,
              }}
            >
              {isPaused ? (
                <svg width="16" height="18" viewBox="0 0 12 14" fill="white">
                  <path d="M1 1 L11 7 L1 13 Z" />
                </svg>
              ) : (
                <svg width="14" height="16" viewBox="0 0 10 12" fill="white">
                  <rect x="1" y="1" width="3" height="10" rx="0.5" />
                  <rect x="6" y="1" width="3" height="10" rx="0.5" />
                </svg>
              )}
            </button>

            <LiveBadge isLive={isLive && !isPaused} onClick={handleGoLive} />

            {}
            {events.length > 0 && (
              <div style={{
                display: 'flex', gap: '6px', alignItems: 'center',
                background: 'rgba(255,255,255,0.08)',
                borderRadius: '6px',
                padding: '4px',
                border: '1px solid rgba(255,255,255,0.15)',
              }}>
                <button
                  id="btn-prev-event"
                  className="ctrl-btn"
                  onClick={() => jumpToEvent(-1)}
                  title="Previous event (←)"
                  style={{
                    width: '32px', height: '32px',
                    border: 'none',
                    background: 'rgba(255,255,255,0.1)',
                    borderRadius: '4px',
                    color: 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                </button>
                <span style={{
                  fontFamily: 'var(--condensed)',
                  fontSize: '15px',
                  color: currentEventIdx >= 0 ? 'var(--amber)' : 'white',
                  padding: '0 12px',
                  minWidth: '70px',
                  textAlign: 'center',
                  fontWeight: 600,
                  letterSpacing: '0.05em'
                }}>
                  {currentEventIdx >= 0
                    ? `EVENT ${events[currentEventIdx]?.shot_id ?? '?'}`
                    : `${events.length} EVENTS`}
                </span>
                <button
                  id="btn-next-event"
                  className="ctrl-btn"
                  onClick={() => jumpToEvent(1)}
                  title="Next event (→)"
                  style={{
                    width: '32px', height: '32px',
                    border: 'none',
                    background: 'rgba(255,255,255,0.1)',
                    borderRadius: '4px',
                    color: 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </button>
              </div>
            )}
          </div>

          <div style={{
            display: 'flex', gap: '20px', alignItems: 'center',
            fontFamily: 'var(--mono)', fontSize: '13px', color: 'var(--muted)',
            marginRight: '60px'
          }}>
            <span style={{
              display: 'flex', alignItems: 'center', gap: '6px',
            }}>
              <svg width="14" height="14" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
                <rect x="1" y="2" width="8" height="6" rx="1" />
                <line x1="3" y1="4" x2="3" y2="6" />
                <line x1="5" y1="3" x2="5" y2="7" />
                <line x1="7" y1="4.5" x2="7" y2="5.5" />
              </svg>
              <span style={{ color: 'var(--amber)', fontWeight: 600 }}>
                {activeCount}/{bufferSize} SEG
              </span>
            </span>
            <span style={{
              display: 'flex', alignItems: 'center', gap: '6px',
            }}>
              <svg width="14" height="14" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
                <rect x="2" y="1" width="6" height="8" rx="1" />
                <line x1="4" y1="3" x2="6" y2="3" />
                <line x1="4" y1="5" x2="6" y2="5" />
              </svg>
              <span style={{ color: 'var(--amber)', fontWeight: 600 }}>{memoryMB} MB</span>
            </span>
          </div>
        </div>

        {status === 'playing' && (
          <SeekBar
            currentTime={currentTime}
            liveEdge={liveEdge}
            bufferStart={bufferStart}
            bufferedEnd={bufferedEnd}
            segments={segments}
            events={events}
            activeCamera={activeCamera}
            activeEventId={currentEventIdx >= 0 ? events[currentEventIdx]?.shot_id : null}
            onSeek={onSeek}
            onEventJump={onEventJump}
          />
        )}
      </div>

      {}
      {status === 'playing' && (
        <button
          id="btn-segment-list"
          className="ctrl-btn"
          onClick={showSegList ? closeSegList : openSegList}
          title={showSegList ? 'Close segment list' : 'Review last segments'}
          style={{
            position: 'absolute', bottom: '84px', right: '24px',
            width: '48px', height: '48px', borderRadius: '8px',
            background: showSegList ? 'var(--amber)' : 'rgba(255,255,255,0.12)',
            border: `1px solid ${showSegList ? 'var(--amber)' : 'rgba(255,255,255,0.25)'}`,
            zIndex: 30,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={showSegList ? '#000' : 'white'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>
      )}
    </div>
  )
})

export default Player
