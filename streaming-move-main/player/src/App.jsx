import { useEffect, useRef, useState, useCallback } from 'react'
import Hls from 'hls.js'
import CameraSelector from './components/CameraSelector.jsx'
import Player from './components/Player.jsx'
import EventPanel from './components/EventPanel.jsx'
import { API_BASE, CAMERAS } from './config.js'

const REVIEW_BUFFER_SIZE = 20




const LIVE_CONFIG = {
  enableWorker: true,
  lowLatencyMode: false,
  
  backBufferLength: 12,
  maxBufferLength: 26,
  maxMaxBufferLength: 36,
  
  liveSyncDurationCount: 5,
  liveMaxLatencyDurationCount: 10,
  liveDurationInfinity: true,
  
  startFragPrefetch: true,
  testBandwidth: false,
  
  fragLoadingMaxRetry: 6,
  fragLoadingRetryDelay: 500,
  fragLoadingMaxRetryTimeout: 16000,
  manifestLoadingMaxRetry: 4,
  manifestLoadingRetryDelay: 500,
  levelLoadingMaxRetry: 4,
  levelLoadingRetryDelay: 500,
}


const REVIEW_CONFIG = {
  enableWorker: true,
  maxBufferLength: 120,
  maxMaxBufferLength: 180,
  backBufferLength: 120,
}

function buildReviewPlaylist(segments, blobUrls) {
  const lines = [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    '#EXT-X-TARGETDURATION:6',
    '#EXT-X-MEDIA-SEQUENCE:0',
    '#EXT-X-PLAYLIST-TYPE:VOD',
  ]
  for (let i = 0; i < segments.length; i++) {
    lines.push(`#EXTINF:${segments[i].duration.toFixed(6)},`)
    lines.push(blobUrls[i])
  }
  lines.push('#EXT-X-ENDLIST')
  return lines.join('\n')
}

export default function App() {
  const videoRefs = useRef({ source: null, sink: null, hq: null })
  const hlsRefs = useRef({ source: null, sink: null, hq: null })
  const rollingBuffers = useRef({ source: [], sink: [], hq: [] })
  const blobUrlRefs = useRef({ source: [], sink: [], hq: [] })

  const [activeCamera, setActiveCamera] = useState('hq')
  const [mode, setMode] = useState('live')
  const modeRef = useRef('live')
  const [status, setStatus] = useState('connecting')
  const [events, setEvents] = useState([])
  const [bufferCounts, setBufferCounts] = useState({ source: 0, sink: 0, hq: 0 })

  const [currentTime, setCurrentTime] = useState(0)
  const [liveEdge, setLiveEdge] = useState(null)
  const [bufferStart, setBufferStart] = useState(null)
  const [bufferedEnd, setBufferedEnd] = useState(null)
  const [isPaused, setIsPaused] = useState(false)
  const [liveSegments, setLiveSegments] = useState([])
  const [reviewSegs, setReviewSegs] = useState([])
  const [errorMsg, setErrorMsg] = useState(null)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [selectedEventIdx, setSelectedEventIdx] = useState(-1)

  const activeCamRef = useRef('hq')
  const switchIdRef = useRef(0)  

  const setModeBoth = useCallback((m) => {
    modeRef.current = m
    setMode(m)
  }, [])

  
  useEffect(() => {
    fetch(`${API_BASE}/events`)
      .then(r => r.json())
      .then(data => {
        setEvents(data)
        console.log(`[init] Loaded ${data.length} events`)
      })
      .catch(e => console.warn('[init] Failed to load events:', e))
  }, [])

  
  const initAllLive = useCallback(() => {
    if (!Hls.isSupported()) {
      setStatus('error')
      setErrorMsg('hls.js not supported in this browser')
      return
    }

    console.log('[init] Starting all 3 HLS streams...')

    CAMERAS.forEach(cam => {
      const video = videoRefs.current[cam]
      if (!video) return

      hlsRefs.current[cam]?.destroy()

      const hls = new Hls(LIVE_CONFIG)
      hlsRefs.current[cam] = hls
      hls.loadSource(`${API_BASE}/${cam}/live.m3u8`)

      
      video.muted = true
      video.playsInline = true

      hls.attachMedia(video)

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log(`[${cam}] Manifest parsed — starting playback`)
        if (cam === activeCamRef.current) {
          setStatus('playing')
        }
        
        video.play().catch(() => { })
      })

      
      hls.on(Hls.Events.FRAG_LOADED, (_, data) => {
        if (modeRef.current !== 'live') return  

        const payload = data.payload
        if (!payload || !payload.byteLength) return

        const entry = {
          sn: data.frag.sn,
          originalStart: data.frag.start,
          duration: data.frag.duration,
          bytes: payload.slice(0),  
        }

        const buf = [...rollingBuffers.current[cam], entry].slice(-REVIEW_BUFFER_SIZE)
        rollingBuffers.current[cam] = buf

        setBufferCounts(prev => ({ ...prev, [cam]: buf.length }))

        if (cam === activeCamRef.current) {
          setLiveSegments(buf.map(s => ({
            sn: s.sn,
            start: s.originalStart,
            end: s.originalStart + s.duration,
          })))
        }
      })

      
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return  

        console.error(`[${cam}] Fatal HLS error:`, data.type, data.details)

        switch (data.type) {
          case Hls.ErrorTypes.MEDIA_ERROR:
            
            console.log(`[${cam}] Attempting media error recovery...`)
            hls.recoverMediaError()
            break

          case Hls.ErrorTypes.NETWORK_ERROR:
            
            console.log(`[${cam}] Network error — retrying in 1s...`)
            setTimeout(() => {
              if (hlsRefs.current[cam] === hls) {
                hls.startLoad()
              }
            }, 1000)
            break

          default:
            
            if (cam === activeCamRef.current) {
              setStatus('error')
              setErrorMsg(`Fatal: ${data.type} — ${data.details}`)
            }
            break
        }
      })
    })

    setModeBoth('live')
  }, [setModeBoth])

  
  
  useEffect(() => {
    const keepAlive = setInterval(() => {
      if (modeRef.current !== 'live') return

      CAMERAS.forEach(cam => {
        const video = videoRefs.current[cam]
        const hls = hlsRefs.current[cam]
        if (video && hls && video.paused && video.readyState >= 3) {
          console.log(`[keepAlive] Restarting paused ${cam}`)
          video.play().catch(() => { })
        }
      })
    }, 1000)

    return () => clearInterval(keepAlive)
  }, [])

  
  
  
  useEffect(() => {
    const syncInterval = setInterval(() => {
      if (modeRef.current !== 'live') return

      const master = videoRefs.current[activeCamRef.current]
      if (!master || master.readyState < 2) return

      CAMERAS.forEach(cam => {
        if (cam === activeCamRef.current) return

        const video = videoRefs.current[cam]
        if (!video || video.readyState < 2) return

        const drift = master.currentTime - video.currentTime

        if (Math.abs(drift) > 0.75) {
          video.currentTime += drift * 0.1
        }
      })
    }, 2000)

    return () => clearInterval(syncInterval)
  }, [])


  
  const rafRef = useRef(null)
  const lastTickRef = useRef(0)

  const tick = useCallback(() => {
    const now = performance.now()

    
    if (now - lastTickRef.current > 50) {
      lastTickRef.current = now

      const cam = activeCamRef.current
      const video = videoRefs.current[cam]
      const hls = hlsRefs.current[cam]

      if (video) {
        setCurrentTime(video.currentTime)
        setIsPaused(video.paused)

        if (modeRef.current === 'live' && hls) {
          const syncPos = hls.liveSyncPosition
          if (syncPos != null && Number.isFinite(syncPos)) setLiveEdge(syncPos)
        }
        if (video.buffered.length > 0) {
          setBufferStart(video.buffered.start(0))
          setBufferedEnd(video.buffered.end(video.buffered.length - 1))
        }
      }
    }

    rafRef.current = requestAnimationFrame(tick)
  }, [])

  
  useEffect(() => {
    initAllLive()
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(rafRef.current)
      CAMERAS.forEach(cam => {
        hlsRefs.current[cam]?.destroy()
        blobUrlRefs.current[cam].forEach(url => URL.revokeObjectURL(url))
      })
    }
  }, [initAllLive, tick])

  
  
  
  
  
  
  
  
  const handleCameraSwitch = useCallback(async (targetCam) => {
    if (targetCam === activeCamRef.current) return

    const fromCam = activeCamRef.current
    const fromVideo = videoRefs.current[fromCam]
    const toVideo = videoRefs.current[targetCam]
    if (!fromVideo || !toVideo) return

    
    const thisSwitchId = ++switchIdRef.current

    console.log(`[switch] ${fromCam} → ${targetCam}`)

    
    activeCamRef.current = targetCam
    setActiveCamera(targetCam)
    setStatus('playing')

    
    if (toVideo.paused) {
      toVideo.play().catch(() => { })
    }

    
    const buf = rollingBuffers.current[targetCam]
    setLiveSegments(buf.map(s => ({
      sn: s.sn,
      start: s.originalStart,
      end: s.originalStart + s.duration,
    })))

    
    
    

    
    if (modeRef.current === 'live') {
      try {
        
        const fromHls = hlsRefs.current[fromCam]
        let fromSeg = 0
        if (fromHls) {
          const details = fromHls.levels?.[fromHls.currentLevel]?.details
          if (details?.fragments) {
            const ct = fromVideo.currentTime
            for (const frag of details.fragments) {
              if (ct >= frag.start && ct < frag.start + frag.duration) {
                fromSeg = frag.sn
                break
              }
            }
          }
        }

        const res = await fetch(`${API_BASE}/sync?from_camera=${fromCam}&from_seg=${fromSeg}`)
        const syncData = await res.json()

        
        if (switchIdRef.current === thisSwitchId && syncData[targetCam]?.time != null && syncData[fromCam]?.time != null) {
          const fromTimeMid = syncData[fromCam].time
          const toTimeMid = syncData[targetCam].time

          
          const offset = fromVideo.currentTime - fromTimeMid
          const exactTargetTime = toTimeMid + offset

          const diff = exactTargetTime - toVideo.currentTime
          const absDiff = Math.abs(diff)
          
          
          if (absDiff > 1.0) {
            
            toVideo.currentTime += diff * 0.25
            console.log(`[switch] Soft sync: ${absDiff.toFixed(1)}s drift → nudging ${targetCam}`)
          }
        }
      } catch (e) {
        
        console.warn(`[switch] Sync API failed (non-critical):`, e.message)
      }
    } else {
      
      toVideo.currentTime = fromVideo.currentTime
      
      if (fromVideo.paused) {
        toVideo.pause()
      } else {
        toVideo.play().catch(() => { })
      }
    }
  }, [])

  
  const enterReview = useCallback(() => {
    let anyValid = false

    CAMERAS.forEach(cam => {
      const video = videoRefs.current[cam]
      const snapshot = rollingBuffers.current[cam].slice()
      if (!video || snapshot.length === 0) return

      anyValid = true

      
      const fragUrls = snapshot.map(s =>
        URL.createObjectURL(new Blob([s.bytes], { type: 'video/mp2t' }))
      )
      const m3u8 = buildReviewPlaylist(snapshot, fragUrls)
      const m3u8Url = URL.createObjectURL(
        new Blob([m3u8], { type: 'application/vnd.apple.mpegurl' })
      )
      blobUrlRefs.current[cam] = [...fragUrls, m3u8Url]

      
      hlsRefs.current[cam]?.stopLoad()
      hlsRefs.current[cam]?.destroy()
      hlsRefs.current[cam] = null

      
      const hls = new Hls(REVIEW_CONFIG)
      hlsRefs.current[cam] = hls
      hls.loadSource(m3u8Url)
      hls.attachMedia(video)

      hls.once(Hls.Events.MANIFEST_PARSED, () => {
        video.currentTime = 0
      })

      video.pause()

      if (cam === activeCamRef.current) {
        let t = 0
        const localSegs = snapshot.map(s => {
          const seg = {
            sn: s.sn,
            start: t,
            end: t + s.duration,
            duration: s.duration,
            originalStart: s.originalStart,
          }
          t += s.duration
          return seg
        })
        setReviewSegs(localSegs)
      }
    })

    if (!anyValid) return false

    console.log('[review] Entered review mode — all network downloads stopped')
    console.log('[review] Blob-based VOD playlists active for all 3 cameras')

    setModeBoth('review')
    setLiveEdge(null)
    setBufferStart(null)
    setBufferedEnd(null)
    return true
  }, [setModeBoth])

  
  const exitReview = useCallback(() => {
    console.log('[review] Exiting review mode — restoring live streams')

    CAMERAS.forEach(cam => {
      hlsRefs.current[cam]?.destroy()
      hlsRefs.current[cam] = null

      
      blobUrlRefs.current[cam].forEach(url => URL.revokeObjectURL(url))
      blobUrlRefs.current[cam] = []

      rollingBuffers.current[cam] = []
    })

    setLiveSegments([])
    setReviewSegs([])
    setBufferCounts({ source: 0, sink: 0, hq: 0 })

    initAllLive()
  }, [initAllLive])

  
  const handleSeek = useCallback((time) => {
    
    CAMERAS.forEach(cam => {
      const video = videoRefs.current[cam]
      if (video) video.currentTime = time
    })
  }, [])

  
  const handleGoLive = useCallback(() => {
    if (modeRef.current === 'review') {
      exitReview()
      return
    }

    
    CAMERAS.forEach(cam => {
      const video = videoRefs.current[cam]
      const hls = hlsRefs.current[cam]
      if (!video || !hls) return

      const details = hls.levels?.[hls.currentLevel]?.details
      const lastFrag = details?.fragments?.[details.fragments.length - 1]

      if (lastFrag) {
        video.currentTime = lastFrag.start
      } else if (Number.isFinite(hls.liveSyncPosition)) {
        video.currentTime = hls.liveSyncPosition
      }
      video.play().catch(() => { })
    })
  }, [exitReview])

  
  const handleEventJump = useCallback((event) => {
    
    
    CAMERAS.forEach(cam => {
      const playback = event.playback?.[cam]
      const video = videoRefs.current[cam]
      if (playback?.time != null && video) {
        video.currentTime = playback.time
        video.play().catch(() => { })
      }
    })
    const idx = events.findIndex(e => e.shot_id === event.shot_id)
    setSelectedEvent(event)
    setSelectedEventIdx(idx)
  }, [events])

  
  const inReview = mode === 'review'
  const reviewStart = inReview && reviewSegs.length > 0 ? reviewSegs[0].start : null
  const reviewEnd = inReview && reviewSegs.length > 0 ? reviewSegs[reviewSegs.length - 1].end : null

  const displaySegments = inReview ? reviewSegs : liveSegments
  const displayLiveEdge = inReview ? reviewEnd : liveEdge
  const displayBufferStart = inReview ? reviewStart : bufferStart
  const displayBufferedEnd = inReview ? reviewEnd : bufferedEnd

  const LIVE_THRESHOLD = 2
  const isLive = mode === 'live' && liveEdge !== null && currentTime >= liveEdge - LIVE_THRESHOLD

  const memoryMB = inReview
    
    ? CAMERAS.reduce((acc, cam) => acc + blobUrlRefs.current[cam].length * 6, 0)
    : Math.round(CAMERAS.reduce((acc, cam) =>
      acc + rollingBuffers.current[cam].reduce((a, s) => a + s.bytes.byteLength, 0), 0
    ) / (1024 * 1024))

  const activeCount = inReview
    ? reviewSegs.length
    : bufferCounts[activeCamera] || 0

  
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: 'var(--bg)',
    }}>
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 20px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        background: 'linear-gradient(180deg, rgba(14,14,18,0.95) 0%, var(--surface) 100%)',
        position: 'relative',
      }}>
        {}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: '1px',
          background: inReview
            ? 'linear-gradient(90deg, transparent 0%, rgba(245,166,35,0.2) 50%, transparent 100%)'
            : 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%)',
          transition: 'background 0.4s ease',
        }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <span style={{
            fontFamily: 'var(--condensed)',
            fontSize: '15px',
            letterSpacing: '0.2em',
            color: 'var(--white)',
            textTransform: 'uppercase',
            fontWeight: 600,
          }}>
            Triple-Cam Review
          </span>
          <span style={{ color: 'var(--border)', fontSize: '14px', opacity: 0.5 }}>／</span>
          <span style={{
            fontFamily: 'var(--mono)',
            fontSize: '11px',
            color: inReview ? 'var(--amber)' : 'var(--green)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'color 0.3s ease',
          }}>
            <span style={{
              width: '6px', height: '6px', borderRadius: '50%',
              background: inReview ? 'var(--amber)' : 'var(--green)',
              animation: inReview ? 'none' : 'pulse 1.4s ease-in-out infinite',
            }} />
            {inReview ? 'REVIEW MODE' : 'LIVE'}
          </span>
        </div>

        {}
        <div style={{
          display: 'flex', gap: '12px',
          fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--muted)',
        }}>
          {CAMERAS.map(cam => (
            <span key={cam} style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              opacity: bufferCounts[cam] > 0 ? 0.7 : 0.3,
              transition: 'opacity 0.3s ease',
            }}>
              <span style={{
                width: '4px', height: '4px', borderRadius: '50%',
                background: cam === 'source' ? 'var(--green)' : cam === 'sink' ? 'var(--blue)' : 'var(--amber)',
              }} />
              {cam.charAt(0).toUpperCase()}: {bufferCounts[cam]}
            </span>
          ))}
        </div>
      </header>

      <CameraSelector
        activeCamera={activeCamera}
        onSwitch={handleCameraSwitch}
        bufferCounts={bufferCounts}
      />

      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {CAMERAS.map(cam => (
          <video
            key={cam}
            ref={el => { videoRefs.current[cam] = el }}
            muted
            playsInline
            style={{
              position: 'absolute',
              top: 0, left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              
              opacity: cam === activeCamera ? 1 : 0,
              pointerEvents: cam === activeCamera ? 'auto' : 'none',

              
              transition: 'none',

              zIndex: cam === activeCamera ? 1 : 0,
            }}
          />
        ))}

        <Player
          activeCamera={activeCamera}
          videoRef={videoRefs}
          mode={mode}
          status={status}
          currentTime={currentTime}
          isPaused={isPaused}
          isLive={isLive}
          liveEdge={displayLiveEdge}
          bufferStart={displayBufferStart}
          bufferedEnd={displayBufferedEnd}
          segments={displaySegments}
          reviewSegs={reviewSegs}
          events={events}
          memoryMB={memoryMB}
          activeCount={activeCount}
          bufferSize={REVIEW_BUFFER_SIZE}
          errorMsg={errorMsg}
          onSeek={handleSeek}
          onGoLive={handleGoLive}
          onEnterReview={enterReview}
          onEventJump={handleEventJump}
          onCameraSwitch={handleCameraSwitch}
          inReview={inReview}
        />
      </div>

      <EventPanel
        event={selectedEvent}
        onClose={() => { setSelectedEvent(null); setSelectedEventIdx(-1) }}
        eventIndex={selectedEventIdx}
        totalEvents={events.length}
      />
    </div>
  )
}
