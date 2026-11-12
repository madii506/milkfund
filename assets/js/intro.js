// the intro: a pixel milk drop falls, splashes into a ring of real company logos, pulls them back in,
// and floods the screen blue, which is where the site begins. ~3.4 s, no text, skippable.
const DROP = ['.......##.......', '......####......', '......####......', '.....######.....', '.....######.....', '....########....', '...##########...', '...##########...', '..############..', '..##WW########..', '.###WW#########.', '.###W##########.', '.##############.', '.##############.', '.##############.', '..############..', '..############..', '...##########...', '.....######.....'];
const CELLS = []; DROP.forEach((r, y) => [...r].forEach((c, x) => { if (c !== '.') CELLS.push([x, y, c]); }));
const BLUE = '#2357ff', INK = '#0b0e1c';
const ease = { out: t => 1 - Math.pow(1 - t, 3), in: t => t * t * t, io: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2, back: t => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); } };
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const seg = (t, a, b) => clamp((t - a) / (b - a));

export function playIntro({ canvas, logos = [], onDone, quick = false }) {
  const g = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  const size = () => { dpr = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; canvas.width = W * dpr; canvas.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.imageSmoothingEnabled = true; };
  size(); addEventListener('resize', size);
  // logos load in the background; the ones that arrive in time join the ring (frozen once it has popped out)
  const imgs = logos.slice(0, 14).map(src => { const im = new Image(); im.decoding = 'async'; im.src = src; return im; });
  let RING = [];
  const splash = Array.from({ length: 22 }, (_, i) => ({ a: i / 22 * Math.PI * 2 + Math.random() * .2, v: 2.2 + Math.random() * 3.2, s: 4 + (Math.random() * 4 | 0) }));
  const T = quick ? 1.6 : 3.5, t0 = performance.now();
  let done = false, raf = 0, forced = null;
  const fx = /[?&]introAt=([\d.]+)/.exec(location.search); if (fx) { forced = +fx[1]; window.__introSeek = v => { forced = v; }; }   // frozen frames, for checks
  const finish = () => { if (done) return; done = true; cancelAnimationFrame(raf); removeEventListener('resize', size); onDone && onDone(); };
  function drop(cx, cy, px, alpha = 1, white = '#fff', hi = '#cfe0ff') {
    g.globalAlpha = alpha;
    for (const [x, y, c] of CELLS) { g.fillStyle = c === 'W' ? hi : white; g.fillRect(Math.round(cx + (x - 8) * px), Math.round(cy + (y - 9.5) * px), Math.ceil(px), Math.ceil(px)); }
    g.globalAlpha = 1;
  }
  function frame(now) {
    if (done) return;
    raf = requestAnimationFrame(frame);
    const t = forced != null ? forced : (now - t0) / 1000 * (quick ? 3.5 / T : 1);
    const cx = W / 2, cy = H * .5, base = Math.min(W, H) / 104;   // one drop pixel
    g.fillStyle = INK; g.fillRect(0, 0, W, H);
    // a faint dot grid, like the site's
    g.fillStyle = 'rgba(255,255,255,.05)';
    for (let y = 11; y < H; y += 22) for (let x = 11; x < W; x += 22) g.fillRect(x, y, 1.6, 1.6);
    // 1. the drop falls (0 → .85 s) and squashes on landing
    const fall = ease.in(seg(t, 0, .85));
    const land = seg(t, .85, 1.05), squash = land > 0 && land < 1 ? Math.sin(land * Math.PI) * .22 : 0;
    const dy = -H * .5 * (1 - fall);
    // 3. the ring pulls back in (2.15 → 2.65 s); 4. the drop floods the screen (2.7 → 3.5 s)
    const pull = ease.io(seg(t, 2.15, 2.62)), flood = ease.in(seg(t, 2.7, 3.45));
    if (t < 2.7) {
      if (t < .85) for (let k = 1; k <= 4; k++) drop(cx, cy + dy - k * base * 9 * (1 - fall * .6), base * (1 - k * .12), .1 * (5 - k) * fall);   // trail
      const sx = 1 + squash * .7, sy = 1 - squash;
      g.save(); g.translate(cx, cy + dy + 9.5 * base * (1 - sy)); g.scale(sx, sy); drop(0, 0, base * (1 + pull * .25)); g.restore();
    }
    // 2. splash: pixel droplets and a ring wave (.85 → 1.6 s)
    const sp = seg(t, .85, 1.6);
    if (sp > 0 && sp < 1) {
      g.fillStyle = '#fff';
      for (const p of splash) { const r = p.v * base * 9 * ease.out(sp), x = cx + Math.cos(p.a) * r, y = cy + 8 * base + Math.sin(p.a) * r * .45 - Math.sin(sp * Math.PI) * base * 10; g.globalAlpha = 1 - sp; g.fillRect(x, y, p.s * base * .35, p.s * base * .35); }
      g.globalAlpha = 1;
      g.strokeStyle = `rgba(255,255,255,${.5 * (1 - sp)})`; g.lineWidth = 2;
      g.beginPath(); g.ellipse(cx, cy + 9 * base, 10 * base + sp * base * 60, (10 * base + sp * base * 60) * .3, 0, 0, Math.PI * 2); g.stroke();
    }
    // the ring of real logos (1.0 → 2.6 s): pops out of the splash, turns, gets pulled back into the drop
    const ring = seg(t, 1.0, 1.7);
    if (t < 1.4) RING = imgs.filter(im => im.complete && im.naturalWidth);
    if (ring > 0 && t < 2.68 && RING.length) {
      const n = RING.length, R = Math.min(W, H) * (W < 700 ? .36 : .32) * (1 - pull);
      for (let i = 0; i < n; i++) {
        const im = RING[i];
        const k = ease.back(clamp(ring * 1.6 - i * .05)), a = i / n * Math.PI * 2 - Math.PI / 2 + t * .45;
        const r = R * (i % 2 ? .78 : 1), x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * .86;
        const s = Math.max(0, base * 7.5 * k * (1 - pull * .8));
        if (s < 1) continue;
        g.save(); g.beginPath(); g.arc(x, y, s / 2 + 3, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill(); g.clip(); g.drawImage(im, x - s / 2, y - s / 2, s, s); g.restore();
      }
    }
    // 4. flood: the drop grows blue until it is the whole screen
    if (flood > 0) {
      const px = base * (1.25 + flood * flood * 60);
      drop(cx, cy - flood * H * .12, px, 1, BLUE, flood > .25 ? BLUE : '#7b9bff');
      if (flood > .7) { g.globalAlpha = (flood - .7) / .3; g.fillStyle = BLUE; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
    }
    if (t >= 3.5 && forced == null) finish();
  }
  raf = requestAnimationFrame(frame);
  return { skip: finish };
}
