import { memo } from 'react'

const CAMERAS = [
  { id: 'source', label: 'SOURCE', color: '#4ade80', shortcut: '1' },
  { id: 'sink',   label: 'SINK',   color: '#60a5fa', shortcut: '2' },
  { id: 'hq',     label: 'HQ',     color: '#f5a623', shortcut: '3' },
]

function CameraSelector({ activeCamera, onSwitch, bufferCounts }) {
  return (
    <div style={{
      display: 'flex',
      gap: '0',
      padding: '0 20px',
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      position: 'relative',
    }}>
      {}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '1px',
        background: 'linear-gradient(90deg, transparent 0%, rgba(245,166,35,0.15) 50%, transparent 100%)',
      }} />

      {CAMERAS.map(cam => {
        const active = activeCamera === cam.id
        const count = bufferCounts?.[cam.id] ?? 0
        return (
          <button
            id={`cam-${cam.id}`}
            key={cam.id}
            className="cam-tab"
            data-active={active}
            onClick={() => onSwitch(cam.id)}
            title={`Switch to ${cam.label} camera (${cam.shortcut})`}
            style={{
              flex: 1,
              padding: '12px 16px',
              border: 'none',
              borderBottom: active
                ? `3px solid ${cam.color}`
                : '3px solid transparent',
              background: active
                ? `linear-gradient(to bottom, ${cam.color}08, transparent)`
                : 'transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              transition: 'all 0.2s ease',
              position: 'relative',
            }}
          >
            {}
            {active && (
              <div style={{
                position: 'absolute',
                bottom: 0,
                left: '10%',
                right: '10%',
                height: '12px',
                background: `radial-gradient(ellipse at bottom, ${cam.color}20, transparent)`,
                pointerEvents: 'none',
              }} />
            )}

            {}
            <span style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: count > 0 ? cam.color : 'var(--muted)',
              opacity: count > 0 ? 1 : 0.3,
              transition: 'all 0.3s ease',
              boxShadow: active && count > 0
                ? `0 0 6px ${cam.color}60`
                : 'none',
            }} />

            <span style={{
              fontFamily: 'var(--condensed)',
              fontSize: '18px',
              letterSpacing: '0.18em',
              color: active ? cam.color : 'var(--muted)',
              fontWeight: active ? 600 : 400,
              transition: 'color 0.2s ease',
              textTransform: 'uppercase',
            }}>
              {cam.label}
            </span>

            {}
            <span style={{
              fontFamily: 'var(--mono)',
              fontSize: '12px',
              color: active ? cam.color : 'var(--muted)',
              opacity: active ? 0.7 : 0.4,
              background: active
                ? `${cam.color}12`
                : 'rgba(255,255,255,0.03)',
              padding: '1px 5px',
              borderRadius: '3px',
              border: `1px solid ${active ? `${cam.color}20` : 'transparent'}`,
              transition: 'all 0.2s ease',
            }}>
              {count}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export default memo(CameraSelector)
