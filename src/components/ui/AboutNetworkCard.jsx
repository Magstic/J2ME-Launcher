import React, { useEffect, useMemo, useRef, useState } from 'react';

/**
 * AboutNetworkCard
 * A rounded profile card with a sci-fi style network visualization.
 * - Center avatar: developer
 * - Orbiting avatars: testers (linked to center)
 * - Hover avatar to show an interactive tooltip with nickname and link
 *
 * Props:
 * - developer: { id, name, link?, avatarUrl? }
 * - testers: Array<{ id, name, link?, avatarUrl? }>
 */
export default function AboutNetworkCard({ developer, testers = [], paused = false }) {
  const wrapperRef = useRef(null);
  const BASE_HEIGHT = 200; // fixed visual height to avoid feedback loops
  const [size, setSize] = useState({ w: 560, h: BASE_HEIGHT });
  const [hover, setHover] = useState(null); // { x, y, person }
  const [hoverVisible, setHoverVisible] = useState(false); // for smooth show animation
  const hadHoverRef = useRef(false);
  // floating animation
  const motionParamsRef = useRef({}); // id -> params
  const offsetsRef = useRef({}); // id -> target { dx, dy }
  const smoothOffsetsRef = useRef({}); // id -> smoothed { dx, dy }
  const nodesRef = useRef(null); // latest nodes
  const nodeElemRef = useRef({}); // id -> <g>
  const lineElemRef = useRef([]); // index -> <line>
  const rafIdRef = useRef(null);
  const runningRef = useRef(false);
  const pausedRef = useRef(false);
  const loopRef = useRef(null);

  // Resize observer to keep SVG responsive
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cr = entry.contentRect;
        // Only react to width; keep a fixed base height to prevent infinite growth
        setSize(prev => {
          const newW = Math.max(320, cr.width);
          return (prev.w !== newW || prev.h !== BASE_HEIGHT) ? { w: newW, h: BASE_HEIGHT } : prev;
        });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const nodes = useMemo(() => {
    // Layout: center developer, testers on a ring with slight jitter
    const cx = size.w / 2;
    const cy = BASE_HEIGHT / 2;
    const devNode = { id: developer.id || 'dev', kind: 'dev', x: cx, y: cy, r: 28, data: developer };
    const n = Math.max(1, testers.length);
    // Base ring radius with safeguards against small heights
    const baseR = Math.max(40, Math.min(size.w, BASE_HEIGHT) / 2 - 28);
    // For small groups, expand the ring a bit so nodes are further apart
    const expandFactor = n <= 3 ? 1.25 : n <= 5 ? 1.1 : 1.0;
    const R = baseR * expandFactor;

    const testerNodes = testers.map((t, i) => {
      const angle = (i / n) * Math.PI * 2 + (Math.PI / 12);
      // Increase jitter amplitude for small counts to avoid clustering
      const jitterAmp = n <= 3 ? 14 : 6;
      const jitter = ((i * 137) % 23) - 11; // deterministic base
      const radialJitter = (jitter % jitterAmp);
      const x = cx + (R + radialJitter) * Math.cos(angle);
      const y = cy + (R + radialJitter) * Math.sin(angle);
      return { id: t.id || `t-${i}`, kind: 'tester', x, y, r: 18, data: t };
    });

    const links = testerNodes.map(n => ({ source: devNode, target: n }));
    return { devNode, testerNodes, links };
  }, [size.w, developer, testers]);

  // keep latest nodes in ref for RAF loop
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  // initialize motion params whenever node set changes
  useEffect(() => {
    const ids = [nodes.devNode.id, ...nodes.testerNodes.map(t => t.id)];
    const mp = { ...motionParamsRef.current };
    ids.forEach((id, i) => {
      if (!mp[id]) {
        // independent time and phases per node
        const rand = (min, max) => min + Math.random() * (max - min);
        mp[id] = {
          t: rand(0, Math.PI * 2),
          speed: rand(0.008, 0.012), // slightly slower for smoother motion
          phase1: rand(0, Math.PI * 2),
          phase2: rand(0, Math.PI * 2),
          phase3: rand(0, Math.PI * 2),
          ampMain: 7.5,
          ampSub: 2,
          ampY1: 4.5,
          ampY2: 1.5,
          freqY1: 0.9,
          freqY2: 1.3,
          freqSub: 1.5,
        };
      }
    });
    // cleanup removed nodes
    Object.keys(mp).forEach(id => { if (!ids.includes(id)) delete mp[id]; });
    motionParamsRef.current = mp;
  }, [nodes]);

  // RAF loop to update offsets and apply transforms imperatively (no React re-render)
  useEffect(() => {
    loopRef.current = () => {
      if (pausedRef.current) {
        runningRef.current = false;
        return; // stop scheduling when paused
      }
      const mp = motionParamsRef.current;
      const offs = {};
      Object.entries(mp).forEach(([id, p]) => {
        p.t += p.speed; // natural time progression
        // multi-layer sine/cosine composition
        const dxMain = Math.sin(p.t) * p.ampMain;
        const dxSub = Math.sin(p.t * p.freqSub + p.phase2) * p.ampSub;
        const dyMain = Math.cos(p.t * p.freqY1 + p.phase3) * p.ampY1;
        const dySub = Math.cos(p.t * p.freqY2 + p.phase1) * p.ampY2;
        // deterministic micro wobble to avoid harsh regularity
        const wobbleX = Math.sin(p.t * 2.7 + p.phase1) * 0.2;
        const wobbleY = Math.cos(p.t * 2.2 + p.phase2) * 0.2;
        offs[id] = { dx: dxMain + dxSub + wobbleX, dy: dyMain + dySub + wobbleY };
      });
      offsetsRef.current = offs;

      // exponential smoothing towards target offsets
      const alpha = 0.14; // smoothing factor (lower = smoother)
      const smoothed = { ...smoothOffsetsRef.current };
      Object.keys(offs).forEach(id => {
        const prev = smoothed[id] || { dx: 0, dy: 0 };
        const next = offs[id];
        smoothed[id] = {
          dx: prev.dx + (next.dx - prev.dx) * alpha,
          dy: prev.dy + (next.dy - prev.dy) * alpha,
        };
      });
      // cleanup any removed ids
      Object.keys(smoothed).forEach(id => { if (!offs[id]) delete smoothed[id]; });
      smoothOffsetsRef.current = smoothed;

      // apply to node groups
      const currentNodes = nodesRef.current;
      if (currentNodes) {
        const snap = (v) => Math.round(v * 2) / 2; // half-pixel snapping
        const apply = (node) => {
          const off = smoothed[node.id] || { dx: 0, dy: 0 };
          const g = nodeElemRef.current[node.id];
          if (g) g.setAttribute('transform', `translate(${snap(node.x + off.dx)}, ${snap(node.y + off.dy)})`);
        };
        apply(currentNodes.devNode);
        currentNodes.testerNodes.forEach(apply);
        // apply to lines
        lineElemRef.current.forEach((el, i) => {
          const link = currentNodes.links[i];
          if (!el || !link) return;
          const so = smoothed[link.source.id] || { dx: 0, dy: 0 };
          const to = smoothed[link.target.id] || { dx: 0, dy: 0 };
          el.setAttribute('x1', String(snap(link.source.x + so.dx)));
          el.setAttribute('y1', String(snap(link.source.y + so.dy)));
          el.setAttribute('x2', String(snap(link.target.x + to.dx)));
          el.setAttribute('y2', String(snap(link.target.y + to.dy)));
        });
      }
      rafIdRef.current = requestAnimationFrame(loopRef.current);
    };
    // start immediately if not paused
    if (!pausedRef.current && !runningRef.current) {
      runningRef.current = true;
      rafIdRef.current = requestAnimationFrame(loopRef.current);
    }
    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      runningRef.current = false;
    };
  }, []);

  // React to paused prop changes (no document visibility coupling)
  useEffect(() => {
    pausedRef.current = !!paused;
    if (!pausedRef.current && !runningRef.current) {
      // restart loop using stored loop function
      runningRef.current = true;
      rafIdRef.current = requestAnimationFrame(loopRef.current);
    } else if (pausedRef.current && runningRef.current) {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      runningRef.current = false;
    }
  }, [paused]);

  const handleLeave = () => setHover(null);

  // Smooth show/hide for hover tooltip, animates only on first show
  useEffect(() => {
    if (hover) {
      if (!hadHoverRef.current) {
        // first time showing: start hidden then animate to visible
        setHoverVisible(false);
        const id = requestAnimationFrame(() => setHoverVisible(true));
        hadHoverRef.current = true;
        return () => cancelAnimationFrame(id);
      } else {
        // moving between nodes: keep visible, just reposition
        setHoverVisible(true);
      }
    } else {
      setHoverVisible(false);
      hadHoverRef.current = false;
    }
  }, [hover]);

  return (
    <div
      ref={wrapperRef}
      className="about-network-card"
      style={{
        borderRadius: 16,
        border: '1px solid var(--overlay-on-light-12)',
        background: 'var(--brand-cyan-gradient-vertical)',
        boxShadow: '0 8px 24px var(--scrim-25), inset 0 0 0 1px var(--brand-cyan-18a)',
        padding: 16,
        position: 'relative',
        overflow: 'hidden',
        // ensure a stable block height
        minHeight: BASE_HEIGHT,
      }}
      onMouseLeave={handleLeave}
    >
      <svg width="100%" height={BASE_HEIGHT} viewBox={`0 0 ${size.w} ${BASE_HEIGHT}`} style={{ display: 'block' }}>
        {/* grid glow backdrop */}
        <defs>
          <radialGradient id="netGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(79,195,247,0.35)" />
            <stop offset="60%" stopColor="rgba(79,195,247,0.12)" />
            <stop offset="100%" stopColor="rgba(79,195,247,0.02)" />
          </radialGradient>
          <filter id="softShadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="rgba(0,0,0,0.35)" />
          </filter>
        </defs>
        <rect x="0" y="0" width={size.w} height={BASE_HEIGHT} fill="url(#netGlow)" />

        {/* links */}
        <g stroke="#4fc3f7" strokeOpacity="0.35" shapeRendering="geometricPrecision" strokeLinecap="round" style={{ pointerEvents: 'none' }}>
          {nodes.links.map((l, idx) => (
            <line
              key={`l-${idx}`}
              ref={el => (lineElemRef.current[idx] = el)}
              vectorEffect="non-scaling-stroke"
              x1={l.source.x}
              y1={l.source.y}
              x2={l.target.x}
              y2={l.target.y}
            />
          ))}
        </g>

        {/* nodes */}
        <AvatarNode
          node={nodes.devNode}
          onHover={setHover}
          registerRef={(id, el) => (nodeElemRef.current[id] = el)}
        />
        {nodes.testerNodes.map(n => (
          <AvatarNode key={n.id} node={n} onHover={setHover} registerRef={(id, el) => (nodeElemRef.current[id] = el)} />
        ))}
      </svg>

      {/* hover tooltip */}
      {hover && (
        <div
          className="hover-card"
          style={{
            position: 'absolute',
            top: Math.max(8, Math.min(BASE_HEIGHT - 84, hover.y - 52)),
            left: Math.max(8, Math.min(size.w - 220, hover.x + 12)),
            width: 200,
            padding: 12,
            borderRadius: 12,
            background: 'var(--background-secondary)',
            border: '1px solid var(--overlay-on-light-12)',
            boxShadow: '0 15px 35px var(--scrim-60), inset 0 1px 0 var(--overlay-on-light-20)',
            pointerEvents: 'none',
            backdropFilter: 'blur(8px)',
            zIndex: 40,
            opacity: hoverVisible ? 1 : 0,
            transform: hoverVisible ? 'translateY(0)' : 'translateY(10px)',
            transition: 'opacity 300ms ease, transform 300ms ease',
            willChange: 'opacity, transform',
          }}
        >
          <div style={{ fontSize: 14, marginBottom: 6, color: 'var(--text-accent)' }}>{hover.person.name}</div>
          {/* Link field */}
          <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 4, display: 'flex', gap: 6 }}>
            <span style={{ color: 'var(--overlay-on-light-60)' }}>Link:</span>
            {hover.person.link ? (
              <a href={hover.person.link} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-accent)', textDecoration: 'none' }}>
                {hover.person.link.replace(/^https?:\/\//, '')}
              </a>
            ) : (
              <span style={{ color: 'var(--overlay-on-light-45)' }}>—</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AvatarNode({ node, onHover, registerRef }) {
  const { x, y, r, data, kind } = node;
  const handleMouseEnter = (e) => {
    const svg = e.currentTarget.ownerSVGElement;
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    const p = ctm ? pt.matrixTransform(ctm.inverse()) : { x, y };
    onHover({ x: p.x, y: p.y, person: data });
  };
  const handleMouseLeave = () => onHover(null);

  return (
    <g
      ref={el => registerRef && registerRef(node.id, el)}
      transform={`translate(${x}, ${y})`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={() => {
        if (data.link) {
          try {
            if (window?.electronAPI?.openExternal) {
              window.electronAPI.openExternal(data.link);
            } else {
              window.open(data.link, '_blank', 'noopener,noreferrer');
            }
          } catch (_) {}
        }
      }}
      style={{ cursor: data.link ? 'pointer' : 'default' }}
    >
      {/* outer glow */}
      <circle r={r + 8} fill="var(--brand-cyan-12a)" />
      <circle r={r + 2} fill="var(--brand-cyan-18a)" />
      {/* avatar core */}
      <foreignObject x={-r} y={-r} width={r * 2} height={r * 2} filter="url(#softShadow)">
        <div style={{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: kind === 'dev' ? 'linear-gradient(135deg,#4fc3f7,#00bcd4)' : 'linear-gradient(135deg,#9e9e9e,#757575)' }}>
          <AvatarVisual name={data.name} avatarUrl={data.avatarUrl} size={r * 2 - 2} />
        </div>
      </foreignObject>
      {/* removed name label under avatar */}
    </g>
  );
}

function AvatarVisual({ name, avatarUrl, size = 36 }) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        width={size}
        height={size}
        style={{ borderRadius: '50%', display: 'block' }}
        draggable={false}
      />
    );
  }
  const initials = (name || '?')
    .split(/\s|-/)
    .filter(Boolean)
    .map(s => s[0]?.toUpperCase())
    .slice(0, 2)
    .join('');
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-primary)',
        fontWeight: 800,
        fontSize: Math.max(10, Math.floor(size * 0.42)),
        background: 'linear-gradient(135deg,#fff,#b2ebf2)'
      }}
    >
      {initials}
    </div>
  );
}
