/* =====================================================================
   RESERPINE — Escape the Cursed Line Forest
   2-Player Local Co-op Puzzle-Adventure Prototype
   Story preserved exactly from the design brief.
   ===================================================================== */
(function () {
  'use strict';

  // ------------------------------------------------------------------
  // CONSTANTS
  // ------------------------------------------------------------------
  const WORLD_W = 1280, WORLD_H = 720;
  const PLAYER_R = 15;
  const SPEED = 210; // px/sec

  // ------------------------------------------------------------------
  // INPUT
  // ------------------------------------------------------------------
  const keys = {};
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    keys[k] = true;
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'enter'].includes(k)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

  // ------------------------------------------------------------------
  // TINY AUDIO SYNTH (feedback beeps — no external files)
  // ------------------------------------------------------------------
  let actx = null;
  function beep(freq, dur, type, vol) {
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type || 'sine'; o.frequency.value = freq;
      g.gain.value = vol == null ? 0.05 : vol;
      o.connect(g); g.connect(actx.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + (dur || 0.15));
      o.stop(actx.currentTime + (dur || 0.15));
    } catch (e) { /* audio optional */ }
  }

  // ------------------------------------------------------------------
  // UTILITIES
  // ------------------------------------------------------------------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  const rand = (a, b) => a + Math.random() * (b - a);

  function rectsOverlapCircle(cx, cy, r, rect) {
    const nx = clamp(cx, rect.x, rect.x + rect.w);
    const ny = clamp(cy, rect.y, rect.y + rect.h);
    return dist(cx, cy, nx, ny) < r;
  }
  function pointInRect(px, py, r) {
    return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
  }

  // ------------------------------------------------------------------
  // PLAYER
  // ------------------------------------------------------------------
  class Player {
    constructor(id, color, spawn) {
      this.id = id;              // 1 or 2
      this.color = color;
      this.x = spawn.x; this.y = spawn.y;
      this.vx = 0; this.vy = 0;
      this.facing = { x: 0, y: -1 };
      this.alive = true;
      this.hasStick = false;
      this.hasBoard = false;
      this.interactCooldown = 0;
    }
    get controls() {
      if (this.id === 1) return { up: 'w', down: 's', left: 'a', right: 'd', act: 'e' };
      return { up: 'arrowup', down: 'arrowdown', left: 'arrowleft', right: 'arrowright', act: 'enter' };
    }
    update(dt, level) {
      if (!this.alive) return;
      const c = this.controls;
      let dx = 0, dy = 0;
      if (keys[c.up]) dy -= 1;
      if (keys[c.down]) dy += 1;
      if (keys[c.left]) dx -= 1;
      if (keys[c.right]) dx += 1;
      const len = Math.hypot(dx, dy);
      if (len > 0) {
        dx /= len; dy /= len;
        this.facing.x = dx; this.facing.y = dy;
      }
      const nx = this.x + dx * SPEED * dt;
      const ny = this.y + dy * SPEED * dt;
      // axis-separated collision
      if (!this.collides(nx, this.y, level)) this.x = nx;
      if (!this.collides(this.x, ny, level)) this.y = ny;
      this.x = clamp(this.x, PLAYER_R, WORLD_W - PLAYER_R);
      this.y = clamp(this.y, PLAYER_R, WORLD_H - PLAYER_R);
      if (this.interactCooldown > 0) this.interactCooldown -= dt;
    }
    collides(x, y, level) {
      for (const w of level.walls) {
        if (rectsOverlapCircle(x, y, PLAYER_R, w)) return true;
      }
      return false;
    }
    draw(ctx) {
      if (!this.alive) return;
      // shadow
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.ellipse(this.x, this.y + PLAYER_R * 0.8, PLAYER_R, PLAYER_R * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // body
      ctx.save();
      ctx.shadowColor = this.color; ctx.shadowBlur = 18;
      ctx.fillStyle = this.color;
      ctx.beginPath(); ctx.arc(this.x, this.y, PLAYER_R, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // inner
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath(); ctx.arc(this.x, this.y, PLAYER_R * 0.45, 0, Math.PI * 2); ctx.fill();
      // facing dot
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.arc(this.x + this.facing.x * PLAYER_R * 0.55, this.y + this.facing.y * PLAYER_R * 0.55, 3, 0, Math.PI * 2);
      ctx.fill();
      // label
      ctx.fillStyle = this.color;
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('P' + this.id, this.x, this.y - PLAYER_R - 6);
    }
  }

  // ------------------------------------------------------------------
  // FIREFLIES
  // ------------------------------------------------------------------
  function spawnFireflies(level, x, y, count) {
    for (let i = 0; i < count; i++) {
      level.fireflies.push({
        x: x + rand(-60, 60), y: y + rand(-60, 60),
        tx: x, ty: y, attracted: false,
        vx: rand(-20, 20), vy: rand(-20, 20),
        phase: rand(0, Math.PI * 2), size: rand(2, 3.5)
      });
    }
  }
  function updateFireflies(level, dt) {
    for (const f of level.fireflies) {
      if (f.attracted) {
        f.x += (f.tx - f.x) * Math.min(1, dt * 2.2) + Math.sin(f.phase) * 0.6;
        f.y += (f.ty - f.y) * Math.min(1, dt * 2.2) + Math.cos(f.phase * 1.3) * 0.6;
      } else {
        f.x += f.vx * dt; f.y += f.vy * dt;
        if (f.x < 40 || f.x > WORLD_W - 40) f.vx *= -1;
        if (f.y < 40 || f.y > WORLD_H - 40) f.vy *= -1;
      }
      f.phase += dt * 3;
    }
  }
  function drawFireflies(ctx, level) {
    for (const f of level.fireflies) {
      const glow = 0.6 + 0.4 * Math.sin(f.phase);
      ctx.save();
      ctx.shadowColor = 'rgba(200,255,120,0.95)';
      ctx.shadowBlur = 16 * glow;
      ctx.fillStyle = 'rgba(230,255,150,' + (0.7 + 0.3 * glow) + ')';
      ctx.beginPath(); ctx.arc(f.x, f.y, f.size, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  // ------------------------------------------------------------------
  // GAME STATE
  // ------------------------------------------------------------------
  const Game = {
    state: 'menu',      // menu | intro | play | cutscene | win | ending
    phaseIndex: 0,
    level: null,
    players: [],
    blueberries: 0,
    timer: 0,
    cutscene: null,
    introTimer: 0,
    winTimer: 0,
    message: '',
    messageTimer: 0,
    flash: 0,
    shake: 0,
    totalTime: 0
  };

  function setMessage(txt, dur) {
    Game.message = txt; Game.messageTimer = dur || 3;
  }

  // ------------------------------------------------------------------
  // PHASE BUILDERS
  // ------------------------------------------------------------------
  const PHASES = [];

  // ============ PHASE 1 — Welcome to Cursed Line Forest ============
  PHASES.push({
    name: 'Phase 1 — Welcome to Cursed Line Forest',
    objective: 'Find the correct path. The board hides a secret.',
    build() {
      const level = {
        walls: [
          // forest border
          { x: 0, y: 0, w: WORLD_W, h: 30 },
          { x: 0, y: WORLD_H - 30, w: WORLD_W, h: 30 },
          { x: 0, y: 0, w: 30, h: WORLD_H },
          { x: WORLD_W - 30, y: 0, w: 30, h: WORLD_H },
          // central divider between the two trails
          { x: 560, y: 30, w: 160, h: 300 }
        ],
        spawn: [{ x: 600, y: 650 }, { x: 680, y: 650 }],
        fireflies: [],
        board: { x: 640, y: 360, revealed: false, revealT: 0 },
        bush: { x: 200, y: 520, collected: false },
        leftZone: { x: 90, y: 40, w: 240, h: 130 },   // wrong path
        rightZone: { x: 950, y: 40, w: 240, h: 130 }, // correct path
        trees: []
      };
      // decorative trees
      for (let i = 0; i < 26; i++) {
        level.trees.push({ x: rand(60, WORLD_W - 60), y: rand(60, WORLD_H - 60), r: rand(14, 26) });
      }
      spawnFireflies(level, 640, 300, 8);
      return level;
    },
    interact(level, player) {
      // collect blueberry
      if (!level.bush.collected && dist(player.x, player.y, level.bush.x, level.bush.y) < 55) {
        level.bush.collected = true; Game.blueberries++;
        setMessage('P' + player.id + ' collected a blueberry. (Shared: ' + Game.blueberries + ')');
        beep(660, 0.12, 'triangle');
        return;
      }
      // squeeze on board
      if (!level.board.revealed && dist(player.x, player.y, level.board.x, level.board.y) < 70) {
        if (Game.blueberries > 0) {
          Game.blueberries--;
          level.board.revealed = true;
          level.board.revealT = 0;
          spawnFireflies(level, level.board.x, level.board.y, 14);
          for (const f of level.fireflies) { f.attracted = true; f.tx = level.board.x + rand(-70, 70); f.ty = level.board.y + rand(-30, 30); }
          setMessage('You squeeze blueberry essence on the board. Fireflies gather...');
          beep(880, 0.2, 'sine');
        } else {
          setMessage('You need a blueberry to attract the fireflies.');
        }
      }
    },
    update(level, dt) {
      if (level.board.revealed) level.board.revealT = Math.min(1, level.board.revealT + dt * 0.5);
      // check zones
      for (const p of Game.players) {
        if (pointInRect(p.x, p.y, level.leftZone)) {
          triggerWrongPath('You chose the WRONG path. The same obstacles repeat to Phase 7... and there is no Rauvolfia plant. It takes more than 30 days to escape.');
          return;
        }
      }
      if (Game.players.every(p => pointInRect(p.x, p.y, level.rightZone))) {
        completePhase();
      }
    },
    draw(ctx, level) {
      // ground
      const g = ctx.createLinearGradient(0, 0, 0, WORLD_H);
      g.addColorStop(0, '#1c2a1a'); g.addColorStop(1, '#0e160d');
      ctx.fillStyle = g; ctx.fillRect(0, 0, WORLD_W, WORLD_H);
      // trees
      for (const t of level.trees) {
        ctx.fillStyle = 'rgba(30,50,28,0.9)';
        ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(20,35,20,0.9)';
        ctx.beginPath(); ctx.arc(t.x, t.y, t.r * 0.6, 0, Math.PI * 2); ctx.fill();
      }
      // trails
      ctx.fillStyle = 'rgba(70,55,35,0.55)';
      ctx.fillRect(level.leftZone.x, level.leftZone.y, level.leftZone.w, level.leftZone.h);
      ctx.fillRect(level.rightZone.x, level.rightZone.y, level.rightZone.w, level.rightZone.h);
      ctx.strokeStyle = 'rgba(120,100,70,0.6)'; ctx.lineWidth = 3;
      ctx.strokeRect(level.leftZone.x, level.leftZone.y, level.leftZone.w, level.leftZone.h);
      ctx.strokeRect(level.rightZone.x, level.rightZone.y, level.rightZone.w, level.rightZone.h);
      ctx.fillStyle = 'rgba(200,200,200,0.5)'; ctx.font = '14px monospace'; ctx.textAlign = 'center';
      ctx.fillText('LEFT TRAIL', level.leftZone.x + level.leftZone.w / 2, level.leftZone.y + 22);
      ctx.fillText('RIGHT TRAIL', level.rightZone.x + level.rightZone.w / 2, level.rightZone.y + 22);
      // divider wall
      ctx.fillStyle = '#0a120a';
      ctx.fillRect(560, 30, 160, 300);
      // board
      drawBoard(ctx, level.board);
      // bush
      drawBush(ctx, level.bush);
      // fireflies
      drawFireflies(ctx, level);
    }
  });

  function drawBoard(ctx, board) {
    ctx.save();
    ctx.translate(board.x, board.y);
    // post
    ctx.fillStyle = '#3a2a18'; ctx.fillRect(-6, 20, 12, 60);
    // board
    ctx.fillStyle = '#5a4326';
    ctx.fillRect(-110, -50, 220, 80);
    ctx.strokeStyle = '#2e2110'; ctx.lineWidth = 4; ctx.strokeRect(-110, -50, 220, 80);
    // cracks
    ctx.strokeStyle = 'rgba(20,15,8,0.8)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-60, -50); ctx.lineTo(-40, 30); ctx.moveTo(30, -50); ctx.lineTo(50, 30); ctx.stroke();
    // title
    ctx.fillStyle = 'rgba(210,200,170,0.85)'; ctx.font = 'bold 15px monospace'; ctx.textAlign = 'center';
    ctx.fillText('WELCOME TO', 0, -18);
    ctx.fillText('CURSED LINE FOREST', 0, 2);
    // hidden text revealed by fireflies
    if (board.revealed) {
      ctx.globalAlpha = board.revealT;
      ctx.fillStyle = 'rgba(255,240,150,0.95)';
      ctx.font = 'bold 13px monospace';
      ctx.fillText('CORRECT PATH:', 0, 22);
      ctx.fillText('BLACK CURSED PINE FOREST  \u2192', 0, 40);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function drawBush(ctx, bush) {
    ctx.save();
    ctx.translate(bush.x, bush.y);
    ctx.fillStyle = '#1f3a1c';
    ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI * 2); ctx.fill();
    if (!bush.collected) {
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2;
        ctx.fillStyle = '#3a5bd0';
        ctx.beginPath(); ctx.arc(Math.cos(a) * 14, Math.sin(a) * 14, 5, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  // ============ PHASE 2 — The Silent Narrow Path ============
  PHASES.push({
    name: 'Phase 2 — The Silent Narrow Path',
    objective: 'The ground lies. Test every step with the stick.',
    build() {
      const level = {
        walls: [
          { x: 0, y: 0, w: WORLD_W, h: 30 },
          { x: 0, y: WORLD_H - 30, w: WORLD_W, h: 30 },
          { x: 0, y: 0, w: 30, h: WORLD_H },
          { x: WORLD_W - 30, y: 0, w: 30, h: WORLD_H },
          // corridor walls
          { x: 30, y: 30, w: WORLD_W - 60, h: 220 },
          { x: 30, y: 470, w: WORLD_W - 60, h: 220 }
        ],
        spawn: [{ x: 90, y: 320 }, { x: 90, y: 400 }],
        fireflies: [],
        stick: { x: 150, y: 360, taken: false },
        tiles: [],
        exitZone: { x: 1160, y: 280, w: 90, h: 160 }
      };
      // build tiles across corridor (y 250..470)
      const pattern = [1, 1, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1];
      let x = 240;
      for (let i = 0; i < pattern.length; i++) {
        level.tiles.push({ x: x, y: 250, w: 56, h: 220, safe: pattern[i] === 1, revealed: false });
        x += 60;
      }
      return level;
    },
    interact(level, player) {
      if (!level.stick.taken && dist(player.x, player.y, level.stick.x, level.stick.y) < 55) {
        level.stick.taken = true; player.hasStick = true;
        setMessage('P' + player.id + ' picked up a stick. Tap the ground ahead to test it.');
        beep(520, 0.12, 'square');
        return;
      }
      if (player.hasStick) {
        // find tile ahead
        const ax = player.x + player.facing.x * 55;
        const ay = player.y + player.facing.y * 55;
        for (const t of level.tiles) {
          if (pointInRect(ax, ay, t)) {
            t.revealed = true;
            if (t.safe) { setMessage('*thock* — solid ground.'); beep(300, 0.08, 'square'); }
            else { setMessage('*shimmer* — QUICKSAND! Do not step.'); beep(140, 0.2, 'sawtooth'); }
            return;
          }
        }
        setMessage('Nothing to tap there.');
      }
    },
    update(level, dt) {
      for (const p of Game.players) {
        for (const t of level.tiles) {
          if (pointInRect(p.x, p.y, t) && !t.safe) {
            triggerWrongPath('You stepped into quicksand and sank... You are thrown back to Phase 1.');
            return;
          }
        }
      }
      if (Game.players.every(p => pointInRect(p.x, p.y, level.exitZone))) completePhase();
    },
    draw(ctx, level) {
      ctx.fillStyle = '#0c0f0c'; ctx.fillRect(0, 0, WORLD_W, WORLD_H);
      // corridor floor
      ctx.fillStyle = '#2a2418'; ctx.fillRect(30, 250, WORLD_W - 60, 220);
      // tiles
      for (const t of level.tiles) {
        if (t.revealed) {
          ctx.fillStyle = t.safe ? 'rgba(90,80,50,0.9)' : 'rgba(120,90,40,0.9)';
        } else {
          ctx.fillStyle = 'rgba(70,62,42,0.85)';
        }
        ctx.fillRect(t.x, t.y, t.w, t.h);
        ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2; ctx.strokeRect(t.x, t.y, t.w, t.h);
        if (t.revealed && !t.safe) {
          ctx.fillStyle = 'rgba(180,140,60,0.5)';
          for (let i = 0; i < 5; i++) {
            ctx.beginPath(); ctx.arc(t.x + 10 + i * 9, t.y + 40 + (i % 3) * 50, 4, 0, Math.PI * 2); ctx.fill();
          }
        }
      }
      // exit
      ctx.fillStyle = 'rgba(120,200,120,0.25)';
      ctx.fillRect(level.exitZone.x, level.exitZone.y, level.exitZone.w, level.exitZone.h);
      ctx.strokeStyle = 'rgba(150,255,150,0.6)'; ctx.lineWidth = 3;
      ctx.strokeRect(level.exitZone.x, level.exitZone.y, level.exitZone.w, level.exitZone.h);
      ctx.fillStyle = 'rgba(180,255,180,0.8)'; ctx.font = '13px monospace'; ctx.textAlign = 'center';
      ctx.fillText('EXIT', level.exitZone.x + level.exitZone.w / 2, level.exitZone.y + 20);
      // stick
      if (!level.stick.taken) {
        ctx.save(); ctx.translate(level.stick.x, level.stick.y); ctx.rotate(-0.5);
        ctx.fillStyle = '#6b4a24'; ctx.fillRect(-4, -30, 8, 60);
        ctx.restore();
      }
      drawFireflies(ctx, level);
    }
  });

  // ============ PHASE 3 — The Unfunctioning Rainbow Bridge ============
  PHASES.push({
    name: 'Phase 3 — The Unfunctioning Rainbow Bridge',
    objective: 'The bridge you see is not the bridge that is. Look behind.',
    build() {
      const level = {
        walls: [
          { x: 0, y: 0, w: WORLD_W, h: 30 },
          { x: 0, y: WORLD_H - 30, w: WORLD_W, h: 30 },
          { x: 0, y: 0, w: 30, h: WORLD_H },
          { x: WORLD_W - 30, y: 0, w: 30, h: WORLD_H }
        ],
        spawn: [{ x: 200, y: 360 }, { x: 200, y: 440 }],
        fireflies: [],
        chasm: { x: 760, y: 30, w: 490, h: 660 },
        waterfall: { x: 560, y: 120, w: 160, h: 480 },
        behindZone: { x: 600, y: 150, w: 80, h: 110 },
        rock: { x: 470, y: 420, read: false },
        riseTrigger: { x: 640, y: 520 },
        textRead: false,
        rising: false,
        riseT: 0
      };
      return level;
    },
    interact(level, player) {
      if (dist(player.x, player.y, level.rock.x, level.rock.y) < 60) {
        level.rock.read = true;
        setMessage('The rock sculpture reads: "...behind the waterfall..."');
        beep(440, 0.15, 'sine');
      }
    },
    update(level, dt) {
      // behind waterfall reveal
      for (const p of Game.players) {
        if (pointInRect(p.x, p.y, level.behindZone)) {
          if (!level.textRead) {
            level.textRead = true;
            setMessage('Carved behind the waterfall: "BEHIND THE WATERFALL REVEAL THE PATH."');
            beep(700, 0.25, 'sine');
          }
        }
      }
      // rise trigger
      if (!level.rising) {
        for (const p of Game.players) {
          if (dist(p.x, p.y, level.riseTrigger.x, level.riseTrigger.y) < 45) {
            if (level.textRead) {
              level.rising = true;
              setMessage('You step onto the waterfall — it suddenly rises!');
              beep(300, 0.5, 'sine');
            } else {
              setMessage('You must read the words behind the waterfall first.');
            }
          }
        }
      } else {
        level.riseT += dt;
        if (level.riseT > 1.6) completePhase();
      }
    },
    draw(ctx, level) {
      ctx.fillStyle = '#0a0e14'; ctx.fillRect(0, 0, WORLD_W, WORLD_H);
      // left ledge
      ctx.fillStyle = '#2b2f26'; ctx.fillRect(30, 30, 730, 660);
      // chasm
      ctx.fillStyle = '#05070a'; ctx.fillRect(level.chasm.x, level.chasm.y, level.chasm.w, level.chasm.h);
      // rainbow bridge ghost (perception)
      ctx.save();
      ctx.globalAlpha = 0.18;
      const rg = ctx.createLinearGradient(760, 0, 1250, 0);
      rg.addColorStop(0, '#ff0000'); rg.addColorStop(0.2, '#ff9900'); rg.addColorStop(0.4, '#ffff00');
      rg.addColorStop(0.6, '#00ff00'); rg.addColorStop(0.8, '#0099ff'); rg.addColorStop(1, '#9900ff');
      ctx.fillStyle = rg; ctx.fillRect(760, 340, 490, 40);
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.font = '12px monospace'; ctx.textAlign = 'center';
      ctx.fillText('(a rainbow bridge you perceive...)', 1005, 330);
      // rock
      ctx.save(); ctx.translate(level.rock.x, level.rock.y);
      ctx.fillStyle = '#4a4a4a';
      ctx.beginPath(); ctx.moveTo(-40, 30); ctx.lineTo(-20, -30); ctx.lineTo(20, -35); ctx.lineTo(45, 20); ctx.lineTo(0, 40); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(200,200,200,0.6)'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
      ctx.fillText('...behind the', 0, -5); ctx.fillText('waterfall...', 0, 8);
      ctx.restore();
      // waterfall
      const wf = level.waterfall;
      const wg = ctx.createLinearGradient(wf.x, 0, wf.x + wf.w, 0);
      wg.addColorStop(0, 'rgba(120,180,230,0.55)');
      wg.addColorStop(0.5, 'rgba(180,220,255,0.75)');
      wg.addColorStop(1, 'rgba(120,180,230,0.55)');
      ctx.fillStyle = wg;
      const riseOffset = level.rising ? -level.riseT * 120 : 0;
      ctx.fillRect(wf.x, wf.y + riseOffset, wf.w, wf.h);
      // falling streaks
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
      for (let i = 0; i < 8; i++) {
        const sx = wf.x + 12 + i * 18;
        ctx.beginPath(); ctx.moveTo(sx, wf.y + riseOffset); ctx.lineTo(sx, wf.y + wf.h + riseOffset); ctx.stroke();
      }
      // behind zone marker
      ctx.strokeStyle = 'rgba(255,255,180,0.5)'; ctx.setLineDash([6, 6]); ctx.lineWidth = 2;
      ctx.strokeRect(level.behindZone.x, level.behindZone.y, level.behindZone.w, level.behindZone.h);
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,255,180,0.7)'; ctx.font = '11px monospace'; ctx.textAlign = 'center';
      ctx.fillText('behind the waterfall', level.behindZone.x + level.behindZone.w / 2, level.behindZone.y - 6);
      if (level.textRead) {
        ctx.fillStyle = 'rgba(255,255,150,0.9)'; ctx.font = 'bold 12px monospace';
        ctx.fillText('REVEAL THE PATH', level.behindZone.x + level.behindZone.w / 2, level.behindZone.y + level.behindZone.h + 16);
      }
      drawFireflies(ctx, level);
    }
  });

  // ============ PHASE 4 — The Castle of Clones ============
  PHASES.push({
    name: 'Phase 4 — The Castle of Clones',
    objective: 'Kill the other\u2019s face, never your own.',
    build() {
      const level = {
        walls: [
          { x: 0, y: 0, w: WORLD_W, h: 30 },
          { x: 0, y: WORLD_H - 30, w: WORLD_W, h: 30 },
          { x: 0, y: 0, w: 30, h: WORLD_H },
          { x: WORLD_W - 30, y: 0, w: 30, h: WORLD_H },
          // pillars
          { x: 400, y: 150, w: 60, h: 60 },
          { x: 820, y: 150, w: 60, h: 60 },
          { x: 400, y: 510, w: 60, h: 60 },
          { x: 820, y: 510, w: 60, h: 60 }
        ],
        spawn: [{ x: 120, y: 320 }, { x: 120, y: 400 }],
        fireflies: [],
        clones: [],
        exitZone: { x: 1160, y: 300, w: 90, h: 120 },
        exitOpen: false
      };
      const faces = ['P1', 'P2', 'P1', 'P2', 'P1', 'P2'];
      const pos = [
        { x: 520, y: 200 }, { x: 700, y: 200 }, { x: 520, y: 520 },
        { x: 700, y: 520 }, { x: 950, y: 300 }, { x: 950, y: 440 }
      ];
      for (let i = 0; i < faces.length; i++) {
        level.clones.push({ x: pos[i].x, y: pos[i].y, face: faces[i], alive: true, bob: rand(0, 6) });
      }
      return level;
    },
    interact(level, player) {
      for (const c of level.clones) {
        if (!c.alive) continue;
        if (dist(player.x, player.y, c.x, c.y) < 50) {
          const myFace = 'P' + player.id;
          if (c.face === myFace) {
            // killed own face -> die -> reset
            triggerPhaseReset('You destroyed your own face. The real P' + player.id + ' dies. Back to the previous step.');
            return;
          } else {
            c.alive = false;
            setMessage('P' + player.id + ' destroyed a ' + c.face + '-faced clone. Correct!');
            beep(600, 0.12, 'triangle');
            if (level.clones.every(cl => !cl.alive)) {
              level.exitOpen = true;
              setMessage('All clones cleared. The gate opens!');
              beep(880, 0.3, 'sine');
            }
            return;
          }
        }
      }
    },
    update(level, dt) {
      for (const c of level.clones) c.bob += dt * 2;
      if (level.exitOpen && Game.players.every(p => pointInRect(p.x, p.y, level.exitZone))) completePhase();
    },
    draw(ctx, level) {
      ctx.fillStyle = '#141018'; ctx.fillRect(0, 0, WORLD_W, WORLD_H);
      // floor
      ctx.fillStyle = '#241c2c'; ctx.fillRect(30, 30, WORLD_W - 60, WORLD_H - 60);
      // pillars
      for (const w of level.walls) {
        if (w.w === 60 && w.h === 60) {
          ctx.fillStyle = '#3a3040'; ctx.fillRect(w.x, w.y, w.w, w.h);
          ctx.strokeStyle = '#1a1420'; ctx.lineWidth = 3; ctx.strokeRect(w.x, w.y, w.w, w.h);
        }
      }
      // clones
      for (const c of level.clones) {
        if (!c.alive) continue;
        const col = c.face === 'P1' ? '#4aa3ff' : '#ffb04a';
        const yy = c.y + Math.sin(c.bob) * 4;
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(c.x, yy, 15, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center';
        ctx.fillText(c.face, c.x, yy - 22);
      }
      // exit
      ctx.fillStyle = level.exitOpen ? 'rgba(120,255,120,0.3)' : 'rgba(120,120,120,0.15)';
      ctx.fillRect(level.exitZone.x, level.exitZone.y, level.exitZone.w, level.exitZone.h);
      ctx.strokeStyle = level.exitOpen ? 'rgba(150,255,150,0.8)' : 'rgba(120,120,120,0.5)';
      ctx.lineWidth = 3; ctx.strokeRect(level.exitZone.x, level.exitZone.y, level.exitZone.w, level.exitZone.h);
      ctx.fillStyle = 'rgba(200,255,200,0.8)'; ctx.font = '12px monospace'; ctx.textAlign = 'center';
      ctx.fillText(level.exitOpen ? 'EXIT OPEN' : 'LOCKED', level.exitZone.x + level.exitZone.w / 2, level.exitZone.y + 20);
      drawFireflies(ctx, level);
    }
  });

  // ============ PHASE 5 — The Cave of False Paths ============
  PHASES.push({
    name: 'Phase 5 — The Cave of False Paths',
    objective: 'Only the true path sings. Let the sand listen.',
    build() {
      const level = {
        walls: [
          { x: 0, y: 0, w: WORLD_W, h: 30 },
          { x: 0, y: WORLD_H - 30, w: WORLD_W, h: 30 },
          { x: 0, y: 0, w: 30, h: WORLD_H },
          { x: WORLD_W - 30, y: 0, w: 30, h: WORLD_H }
        ],
        spawn: [{ x: 600, y: 380 }, { x: 680, y: 380 }],
        fireflies: [],
        hub: { x: 640, y: 360 },
        board: { x: 640, y: 360, taken: false },
        tunnels: [
          { id: 'top', x: 640, y: 90, w: 140, h: 90, real: false },
          { id: 'right', x: 1150, y: 320, w: 100, h: 140, real: true },
          { id: 'bottom', x: 640, y: 590, w: 140, h: 90, real: false },
          { id: 'left', x: 90, y: 320, w: 100, h: 140, real: false }
        ],
        sandVibrate: 0,
        nearReal: false
      };
      return level;
    },
    interact(level, player) {
      if (!level.board.taken && dist(player.x, player.y, level.board.x, level.board.y) < 55) {
        level.board.taken = true; player.hasBoard = true;
        setMessage('P' + player.id + ' picked up the sand board. Carry it near each path.');
        beep(500, 0.12, 'square');
      }
    },
    update(level, dt) {
      // sand reaction when a board-carrier is near a tunnel
      level.nearReal = false;
      for (const p of Game.players) {
        if (!p.hasBoard) continue;
        for (const t of level.tunnels) {
          const cx = t.x + t.w / 2, cy = t.y + t.h / 2;
          if (dist(p.x, p.y, cx, cy) < 130) {
            if (t.real) { level.nearReal = true; level.sandVibrate = Math.min(1, level.sandVibrate + dt * 2); }
          }
        }
      }
      if (!level.nearReal) level.sandVibrate = Math.max(0, level.sandVibrate - dt * 2);
      // entering tunnels
      for (const p of Game.players) {
        for (const t of level.tunnels) {
          if (pointInRect(p.x, p.y, t)) {
            if (t.real) {
              if (Game.players.every(pp => pointInRect(pp.x, pp.y, t))) completePhase();
            } else {
              // fake -> loop back to hub
              p.x = level.hub.x + rand(-30, 30); p.y = level.hub.y + rand(-30, 30);
              setMessage('This path is a thought, not a place. You are back at the hub.');
              beep(200, 0.2, 'sawtooth');
            }
          }
        }
      }
    },
    draw(ctx, level) {
      ctx.fillStyle = '#0a0a0c'; ctx.fillRect(0, 0, WORLD_W, WORLD_H);
      // cave floor
      ctx.fillStyle = '#1a1a20';
      ctx.beginPath(); ctx.arc(level.hub.x, level.hub.y, 200, 0, Math.PI * 2); ctx.fill();
      // tunnels
      for (const t of level.tunnels) {
        ctx.fillStyle = 'rgba(40,40,50,0.9)';
        ctx.fillRect(t.x, t.y, t.w, t.h);
        ctx.strokeStyle = 'rgba(90,90,110,0.6)'; ctx.lineWidth = 3;
        ctx.strokeRect(t.x, t.y, t.w, t.h);
        // fake bats (visual only) in fake tunnels
        if (!t.real) {
          ctx.fillStyle = 'rgba(120,120,140,0.5)';
          for (let i = 0; i < 3; i++) {
            const bx = t.x + 20 + i * 30, by = t.y + 20 + (i % 2) * 30;
            ctx.beginPath(); ctx.arc(bx, by, 5, 0, Math.PI * 2); ctx.fill();
          }
        } else {
          // real bats
          ctx.fillStyle = 'rgba(200,180,120,0.8)';
          for (let i = 0; i < 3; i++) {
            const bx = t.x + 20 + i * 30, by = t.y + 20 + (i % 2) * 30;
            ctx.beginPath(); ctx.arc(bx, by, 5, 0, Math.PI * 2); ctx.fill();
          }
        }
      }
      // sand board
      if (!level.board.taken) {
        ctx.save(); ctx.translate(level.board.x, level.board.y);
        ctx.fillStyle = '#6b5a3a'; ctx.fillRect(-30, -20, 60, 40);
        ctx.fillStyle = '#d8c890'; ctx.fillRect(-26, -16, 52, 32);
        ctx.restore();
      }
      // sand vibration indicator
      if (level.sandVibrate > 0.05) {
        ctx.save();
        ctx.globalAlpha = level.sandVibrate;
        ctx.strokeStyle = 'rgba(255,230,150,0.9)'; ctx.lineWidth = 2;
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          ctx.arc(level.hub.x, level.hub.y, 40 + i * 22 + Math.sin(Game.totalTime * 10 + i) * 6, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
        ctx.fillStyle = 'rgba(255,230,150,0.9)'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center';
        ctx.fillText('SAND VIBRATES \u2014 TRUE PATH NEARBY', level.hub.x, level.hub.y - 210);
      }
      drawFireflies(ctx, level);
    }
  });

  // ============ PHASE 6 — The Beautiful Fairy Garden ============
  PHASES.push({
    name: 'Phase 6 — The Beautiful Fairy Garden',
    objective: 'Light makes flowers bloom. Hands make them break.',
    build() {
      const level = {
        walls: [
          { x: 0, y: 0, w: WORLD_W, h: 30 },
          { x: 0, y: WORLD_H - 30, w: WORLD_W, h: 30 },
          { x: 0, y: 0, w: 30, h: WORLD_H },
          { x: WORLD_W - 30, y: 0, w: 30, h: WORLD_H }
        ],
        spawn: [{ x: 600, y: 620 }, { x: 680, y: 620 }],
        fireflies: [],
        bush: { x: 300, y: 520, collected: false },
        door: { x: 640, y: 130, lit: false, bloomT: 0, open: false },
        petals: [],
        smog: []
      };
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2;
        level.petals.push({ a: a, bloom: 0 });
      }
      for (let i = 0; i < 14; i++) {
        level.smog.push({ x: rand(60, WORLD_W - 60), y: rand(60, WORLD_H - 60), r: rand(40, 90), vx: rand(-8, 8) });
      }
      return level;
    },
    interact(level, player) {
      if (!level.bush.collected && dist(player.x, player.y, level.bush.x, level.bush.y) < 55) {
        level.bush.collected = true; Game.blueberries++;
        setMessage('P' + player.id + ' collected a blueberry. (Shared: ' + Game.blueberries + ')');
        beep(660, 0.12, 'triangle');
        return;
      }
      if (dist(player.x, player.y, level.door.x, level.door.y) < 90) {
        if (level.door.lit) { setMessage('The flowers are blooming in the light.'); return; }
        if (Game.blueberries > 0) {
          Game.blueberries--;
          level.door.lit = true;
          spawnFireflies(level, level.door.x, level.door.y, 16);
          for (const f of level.fireflies) { f.attracted = true; f.tx = level.door.x + rand(-60, 60); f.ty = level.door.y + rand(-40, 40); }
          setMessage('You squeeze blueberry essence on the door. Fireflies bring light...');
          beep(880, 0.25, 'sine');
        } else {
          // manual touch -> detach petal -> fail
          triggerPhaseReset('You touched a petal by hand \u2014 it detached! Back to the previous phase.');
        }
      }
    },
    update(level, dt) {
      for (const s of level.smog) { s.x += s.vx * dt; if (s.x < 0 || s.x > WORLD_W) s.vx *= -1; }
      if (level.door.lit) {
        level.door.bloomT = Math.min(1, level.door.bloomT + dt * 0.4);
        for (const p of level.petals) p.bloom = level.door.bloomT;
        if (level.door.bloomT >= 1 && !level.door.open) {
          level.door.open = true;
          setMessage('All petals bloom. The black door opens!');
          beep(900, 0.4, 'sine');
        }
      }
      if (level.door.open && Game.players.every(p => dist(p.x, p.y, level.door.x, level.door.y) < 100)) completePhase();
    },
    draw(ctx, level) {
      const g = ctx.createLinearGradient(0, 0, 0, WORLD_H);
      g.addColorStop(0, '#1a2a1e'); g.addColorStop(1, '#0e1a12');
      ctx.fillStyle = g; ctx.fillRect(0, 0, WORLD_W, WORLD_H);
      // smog
      for (const s of level.smog) {
        ctx.fillStyle = 'rgba(180,200,190,0.06)';
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
      }
      // door
      const d = level.door;
      ctx.save(); ctx.translate(d.x, d.y);
      ctx.fillStyle = d.open ? '#0a0a0a' : '#050505';
      ctx.fillRect(-70, -90, 140, 180);
      ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 4; ctx.strokeRect(-70, -90, 140, 180);
      // flowers / petals
      for (const p of level.petals) {
        const open = p.bloom;
        const baseR = 40;
        const px = Math.cos(p.a) * (baseR + open * 30);
        const py = Math.sin(p.a) * (baseR + open * 30);
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(p.a);
        ctx.fillStyle = d.lit ? 'rgba(255,180,220,0.95)' : 'rgba(120,80,110,0.9)';
        ctx.beginPath(); ctx.ellipse(0, 0, 14, 8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      // center
      ctx.fillStyle = d.lit ? 'rgba(255,240,150,0.95)' : 'rgba(90,70,60,0.9)';
      ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // bush
      drawBush(ctx, level.bush);
      drawFireflies(ctx, level);
    }
  });

  // ============ PHASE 7 — Dragon Valley ============
  PHASES.push({
    name: 'Phase 7 — Dragon Valley',
    objective: 'You cannot see it. You can only breathe with it.',
    build() {
      const level = {
        walls: [
          { x: 0, y: 0, w: WORLD_W, h: 30 },
          { x: 0, y: WORLD_H - 30, w: WORLD_W, h: 30 },
          { x: 0, y: 0, w: 30, h: WORLD_H },
          { x: WORLD_W - 30, y: 0, w: 30, h: WORLD_H }
        ],
        spawn: [{ x: 600, y: 650 }, { x: 680, y: 650 }],
        fireflies: [],
        dragon: { x: 640, y: 120, shadowRevealed: false, breathT: 0, exhaling: false },
        shadow: { x: 640, y: 200 },
        plant: { x: 640, y: 80, taken: false },
        lanes: [
          { y: 300, timer: 0, period: 3.6, fireDur: 1.2, firing: false },
          { y: 440, timer: 1.2, period: 3.6, fireDur: 1.2, firing: false },
          { y: 570, timer: 2.4, period: 3.6, fireDur: 1.2, firing: false }
        ],
        lava: []
      };
      for (let i = 0; i < 20; i++) level.lava.push({ x: rand(60, WORLD_W - 60), y: rand(60, WORLD_H - 60), r: rand(3, 8), p: rand(0, 6) });
      return level;
    },
    interact(level, player) {
      // throw blueberry at shadow
      if (!level.dragon.shadowRevealed && dist(player.x, player.y, level.shadow.x, level.shadow.y) < 120) {
        if (Game.blueberries > 0) {
          Game.blueberries--;
          level.dragon.shadowRevealed = true;
          spawnFireflies(level, level.shadow.x, level.shadow.y, 18);
          for (const f of level.fireflies) { f.attracted = true; f.tx = level.shadow.x + rand(-90, 90); f.ty = level.shadow.y + rand(-40, 40); }
          setMessage('You throw blueberries at the shadow. Fireflies reveal the full shadow of a DRAGON!');
          beep(300, 0.4, 'sawtooth');
        } else {
          setMessage('You need a blueberry to throw at the shadow.');
        }
        return;
      }
      // collect reserpine
      if (dist(player.x, player.y, level.plant.x, level.plant.y) < 60) {
        level.plant.taken = true;
        setMessage('You take the reserpine sample from the Rauvolfia serpentina plant!');
        beep(1000, 0.5, 'sine');
        completePhase();
      }
    },
    update(level, dt) {
      const d = level.dragon;
      d.breathT += dt;
      const cycle = 3.6;
      const t = d.breathT % cycle;
      d.exhaling = t > 2.4; // last 1.2s exhale
      // lanes fire
      for (const l of level.lanes) {
        l.timer += dt;
        const lt = l.timer % l.period;
        l.firing = lt > (l.period - l.fireDur);
      }
      // check player in firing lane
      if (d.shadowRevealed) {
        for (const p of Game.players) {
          for (const l of level.lanes) {
            if (l.firing && Math.abs(p.y - l.y) < 26) {
              p.x = 600 + (p.id === 1 ? -40 : 40); p.y = 650;
              setMessage('Dragon fire! You are thrown back to the valley entrance. Breathe with it.');
              beep(120, 0.3, 'sawtooth');
            }
          }
        }
      }
    },
    draw(ctx, level) {
      const g = ctx.createLinearGradient(0, 0, 0, WORLD_H);
      g.addColorStop(0, '#2a0e0a'); g.addColorStop(1, '#120604');
      ctx.fillStyle = g; ctx.fillRect(0, 0, WORLD_W, WORLD_H);
      // lava specks
      for (const l of level.lava) {
        ctx.fillStyle = 'rgba(255,120,40,' + (0.4 + 0.4 * Math.sin(Game.totalTime * 3 + l.p)) + ')';
        ctx.beginPath(); ctx.arc(l.x, l.y, l.r, 0, Math.PI * 2); ctx.fill();
      }
      // dragon shadow
      const d = level.dragon;
      if (d.shadowRevealed) {
        ctx.save();
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = '#000';
        // body
        ctx.beginPath(); ctx.ellipse(d.x, d.y + 40, 90, 50, 0, 0, Math.PI * 2); ctx.fill();
        // head
        ctx.beginPath(); ctx.arc(d.x, d.y - 10, 40, 0, Math.PI * 2); ctx.fill();
        // wings
        ctx.beginPath(); ctx.moveTo(d.x - 40, d.y + 20); ctx.lineTo(d.x - 150, d.y - 40); ctx.lineTo(d.x - 60, d.y + 60); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(d.x + 40, d.y + 20); ctx.lineTo(d.x + 150, d.y - 40); ctx.lineTo(d.x + 60, d.y + 60); ctx.closePath(); ctx.fill();
        ctx.restore();
        // breathing indicator
        const breathe = d.exhaling ? 'EXHALE' : 'INHALE';
        ctx.fillStyle = d.exhaling ? 'rgba(255,120,60,0.95)' : 'rgba(120,220,255,0.95)';
        ctx.font = 'bold 14px monospace'; ctx.textAlign = 'center';
        ctx.fillText('DRAGON ' + breathe, d.x, d.y - 70);
      } else {
        // faint shadow
        ctx.save(); ctx.globalAlpha = 0.25; ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.ellipse(level.shadow.x, level.shadow.y, 60, 30, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        ctx.fillStyle = 'rgba(200,200,200,0.5)'; ctx.font = '12px monospace'; ctx.textAlign = 'center';
        ctx.fillText('...a shadow of something...', level.shadow.x, level.shadow.y - 40);
      }
      // fire lanes
      if (d.shadowRevealed) {
        for (const l of level.lanes) {
          if (l.firing) {
            const fg = ctx.createLinearGradient(0, l.y - 26, 0, l.y + 26);
            fg.addColorStop(0, 'rgba(255,180,40,0.1)');
            fg.addColorStop(0.5, 'rgba(255,120,20,0.85)');
            fg.addColorStop(1, 'rgba(255,180,40,0.1)');
            ctx.fillStyle = fg;
            ctx.fillRect(30, l.y - 26, WORLD_W - 60, 52);
          } else {
            ctx.strokeStyle = 'rgba(255,120,40,0.25)'; ctx.setLineDash([8, 8]); ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(30, l.y); ctx.lineTo(WORLD_W - 30, l.y); ctx.stroke();
            ctx.setLineDash([]);
          }
        }
      }
      // plant
      const pl = level.plant;
      if (!pl.taken) {
        ctx.save(); ctx.translate(pl.x, pl.y);
        ctx.strokeStyle = '#2f6b2f'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(0, 30); ctx.lineTo(0, -10); ctx.stroke();
        ctx.fillStyle = '#e8e8f0';
        for (let i = 0; i < 5; i++) {
          const a = i / 5 * Math.PI * 2;
          ctx.beginPath(); ctx.ellipse(Math.cos(a) * 12, -10 + Math.sin(a) * 12, 8, 5, a, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = '#ffd24a'; ctx.beginPath(); ctx.arc(0, -10, 6, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        ctx.fillStyle = 'rgba(220,255,220,0.8)'; ctx.font = '11px monospace'; ctx.textAlign = 'center';
        ctx.fillText('Rauvolfia serpentina', pl.x, pl.y + 50);
      }
      drawFireflies(ctx, level);
    }
  });

  // ------------------------------------------------------------------
  // PHASE FLOW
  // ------------------------------------------------------------------
  function startPhase(index) {
    Game.phaseIndex = index;
    const def = PHASES[index];
    Game.level = def.build();
    Game.players = [
      new Player(1, '#4aa3ff', Game.level.spawn[0]),
      new Player(2, '#ffb04a', Game.level.spawn[1])
    ];
    Game.state = 'intro';
    Game.introTimer = 0;
    Game.message = ''; Game.messageTimer = 0;
  }

  function completePhase() {
    if (Game.state !== 'play') return;
    Game.state = 'win';
    Game.winTimer = 0;
    beep(880, 0.4, 'sine');
  }

  function triggerWrongPath(text) {
    if (Game.state !== 'play') return;
    Game.state = 'cutscene';
    Game.cutscene = { text: text, t: 0, dur: 4.5, target: 0 };
    beep(160, 0.6, 'sawtooth');
  }

  function triggerPhaseReset(text) {
    if (Game.state !== 'play') return;
    Game.state = 'cutscene';
    const target = Math.max(0, Game.phaseIndex - 1);
    Game.cutscene = { text: text, t: 0, dur: 3.5, target: target };
    beep(160, 0.6, 'sawtooth');
  }

  // ------------------------------------------------------------------
  // MAIN UPDATE
  // ------------------------------------------------------------------
  function update(dt) {
    Game.totalTime += dt;
    if (Game.messageTimer > 0) Game.messageTimer -= dt;
    if (Game.flash > 0) Game.flash -= dt * 2;
    if (Game.shake > 0) Game.shake -= dt * 2;

    if (Game.state === 'intro') {
      Game.introTimer += dt;
      if (Game.introTimer > 2.2) Game.state = 'play';
      return;
    }
    if (Game.state === 'cutscene') {
      Game.cutscene.t += dt;
      if (Game.cutscene.t > Game.cutscene.dur) {
        startPhase(Game.cutscene.target);
      }
      return;
    }
    if (Game.state === 'win') {
      Game.winTimer += dt;
      if (Game.winTimer > 2.0) {
        if (Game.phaseIndex >= PHASES.length - 1) {
          Game.state = 'ending';
        } else {
          startPhase(Game.phaseIndex + 1);
        }
      }
      return;
    }
    if (Game.state !== 'play') return;

    const level = Game.level;
    const def = PHASES[Game.phaseIndex];

    // players
    for (const p of Game.players) {
      p.update(dt, level);
      if (p.interactCooldown <= 0 && keys[p.controls.act]) {
        p.interactCooldown = 0.35;
        def.interact(level, p);
      }
    }
    updateFireflies(level, dt);
    def.update(level, dt);
  }

  // ------------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  function render() {
    const cw = canvas.width, ch = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cw, ch);

    // fit world into canvas
    const scale = Math.min(cw / WORLD_W, ch / WORLD_H);
    const ox = (cw - WORLD_W * scale) / 2;
    const oy = (ch - WORLD_H * scale) / 2;

    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);

    if (Game.state === 'menu') {
      drawMenu(ctx);
      ctx.restore();
      return;
    }
    if (Game.state === 'ending') {
      drawEnding(ctx);
      ctx.restore();
      return;
    }

    // draw level
    const def = PHASES[Game.phaseIndex];
    def.draw(ctx, Game.level);

    // players
    for (const p of Game.players) p.draw(ctx);

    // perception distortion overlay
    drawPerception(ctx);

    // HUD
    drawHUD(ctx);

    // intro card
    if (Game.state === 'intro') drawIntroCard(ctx, def);

    // win overlay
    if (Game.state === 'win') drawWinOverlay(ctx);

    // cutscene overlay
    if (Game.state === 'cutscene') drawCutscene(ctx);

    ctx.restore();
  }

  function drawPerception(ctx) {
    // subtle vignette + chromatic shimmer
    const vg = ctx.createRadialGradient(WORLD_W / 2, WORLD_H / 2, 200, WORLD_W / 2, WORLD_H / 2, 760);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(20,0,40,0.45)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    // shimmer lines
    ctx.save();
    ctx.globalAlpha = 0.04 + 0.02 * Math.sin(Game.totalTime * 2);
    ctx.fillStyle = '#a060ff';
    for (let i = 0; i < 6; i++) {
      const y = (Game.totalTime * 40 + i * 130) % WORLD_H;
      ctx.fillRect(0, y, WORLD_W, 2);
    }
    ctx.restore();
  }

  function drawHUD(ctx) {
    // top bar
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, WORLD_W, 54);
    ctx.fillStyle = '#e8e8f0';
    ctx.font = 'bold 18px monospace'; ctx.textAlign = 'left';
    ctx.fillText(PHASES[Game.phaseIndex].name, 20, 34);
    // objective
    ctx.font = '13px monospace'; ctx.fillStyle = '#b8c8b8';
    ctx.fillText('Objective: ' + PHASES[Game.phaseIndex].objective, 20, 50);
    // blueberries
    ctx.textAlign = 'right';
    ctx.fillStyle = '#7aa0ff'; ctx.font = 'bold 16px monospace';
    ctx.fillText('Blueberries: ' + Game.blueberries, WORLD_W - 20, 34);
    // controls hint
    ctx.fillStyle = 'rgba(200,200,220,0.6)'; ctx.font = '11px monospace';
    ctx.fillText('P1: WASD + E   |   P2: Arrows + Enter', WORLD_W - 20, 50);
    ctx.restore();

    // message
    if (Game.messageTimer > 0 && Game.message) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, Game.messageTimer);
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      const w = Math.min(900, ctx.measureText(Game.message).width + 60);
      ctx.fillRect(WORLD_W / 2 - w / 2, WORLD_H - 90, w, 44);
      ctx.fillStyle = '#ffe9a8'; ctx.font = 'bold 15px monospace'; ctx.textAlign = 'center';
      ctx.fillText(Game.message, WORLD_W / 2, WORLD_H - 62);
      ctx.restore();
    }
  }

  function drawIntroCard(ctx, def) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e8e8f0'; ctx.font = 'bold 34px monospace';
    ctx.fillText(def.name, WORLD_W / 2, WORLD_H / 2 - 20);
    ctx.fillStyle = '#a8c8a8'; ctx.font = '18px monospace';
    ctx.fillText(def.objective, WORLD_W / 2, WORLD_H / 2 + 30);
    ctx.fillStyle = 'rgba(200,200,220,0.6)'; ctx.font = '13px monospace';
    ctx.fillText('Get ready...', WORLD_W / 2, WORLD_H / 2 + 80);
    ctx.restore();
  }

  function drawWinOverlay(ctx) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.85, Game.winTimer);
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#9dff9d'; ctx.font = 'bold 40px monospace';
    ctx.fillText('PHASE CLEARED', WORLD_W / 2, WORLD_H / 2);
    ctx.fillStyle = '#e8e8f0'; ctx.font = '18px monospace';
    ctx.fillText('Advancing...', WORLD_W / 2, WORLD_H / 2 + 40);
    ctx.restore();
  }

  function drawCutscene(ctx) {
    const c = Game.cutscene;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.9)';
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    ctx.textAlign = 'center';
    // calendar pages effect
    ctx.globalAlpha = 0.3;
    for (let i = 0; i < 30; i++) {
      const x = (i * 137 + c.t * 60) % WORLD_W;
      const y = (i * 89 + c.t * 30) % WORLD_H;
      ctx.fillStyle = '#3a3a4a';
      ctx.fillRect(x, y, 40, 50);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffb0b0'; ctx.font = 'bold 26px monospace';
    ctx.fillText('30 DAYS PASS...', WORLD_W / 2, WORLD_H / 2 - 60);
    ctx.fillStyle = '#e8e8f0'; ctx.font = '16px monospace';
    wrapText(ctx, c.text, WORLD_W / 2, WORLD_H / 2, 800, 26);
    ctx.fillStyle = 'rgba(200,200,220,0.6)'; ctx.font = '13px monospace';
    ctx.fillText('Restarting...', WORLD_W / 2, WORLD_H - 80);
    ctx.restore();
  }

  function wrapText(ctx, text, x, y, maxW, lineH) {
    const words = text.split(' ');
    let line = '', yy = y;
    for (const w of words) {
      const test = line + w + ' ';
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line.trim(), x, yy);
        line = w + ' '; yy += lineH;
      } else line = test;
    }
    ctx.fillText(line.trim(), x, yy);
  }

  function drawMenu(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, WORLD_H);
    g.addColorStop(0, '#0a1410'); g.addColorStop(1, '#050806');
    ctx.fillStyle = g; ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    // fireflies
    for (let i = 0; i < 30; i++) {
      const x = (i * 173 + Game.totalTime * 20) % WORLD_W;
      const y = (i * 97 + Math.sin(Game.totalTime + i) * 40 + 200) % WORLD_H;
      ctx.save();
      ctx.shadowColor = 'rgba(200,255,120,0.9)'; ctx.shadowBlur = 14;
      ctx.fillStyle = 'rgba(230,255,150,0.8)';
      ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e8e8f0'; ctx.font = 'bold 52px monospace';
    ctx.fillText('RESERPINE', WORLD_W / 2, 220);
    ctx.fillStyle = '#9dff9d'; ctx.font = 'bold 22px monospace';
    ctx.fillText('Escape the Cursed Line Forest', WORLD_W / 2, 260);
    ctx.fillStyle = '#b8c8b8'; ctx.font = '15px monospace';
    ctx.fillText('A 2-Player Local Co-op Puzzle-Adventure', WORLD_W / 2, 300);
    ctx.fillStyle = '#e8e8f0'; ctx.font = '16px monospace';
    ctx.fillText('P1: WASD to move, E to interact', WORLD_W / 2, 400);
    ctx.fillText('P2: Arrow Keys to move, Enter to interact', WORLD_W / 2, 430);
    ctx.fillStyle = '#ffe9a8'; ctx.font = 'bold 20px monospace';
    ctx.fillText('Press SPACE to begin', WORLD_W / 2, 520);
    ctx.fillStyle = 'rgba(200,200,220,0.5)'; ctx.font = '12px monospace';
    ctx.fillText('7 phases \u2022 fireflies & blueberries \u2022 perception distortion', WORLD_W / 2, 600);
  }

  function drawEnding(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, WORLD_H);
    g.addColorStop(0, '#2a2418'); g.addColorStop(1, '#0e0c08');
    ctx.fillStyle = g; ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    // warm fireflies
    for (let i = 0; i < 40; i++) {
      const x = (i * 137 + Game.totalTime * 15) % WORLD_W;
      const y = (i * 89 + Math.sin(Game.totalTime * 0.8 + i) * 50 + 300) % WORLD_H;
      ctx.save();
      ctx.shadowColor = 'rgba(255,220,120,0.9)'; ctx.shadowBlur = 16;
      ctx.fillStyle = 'rgba(255,235,160,0.85)';
      ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffe9a8'; ctx.font = 'bold 44px monospace';
    ctx.fillText('THE CURE WAS FOUND', WORLD_W / 2, 240);
    ctx.fillStyle = '#e8e8f0'; ctx.font = '17px monospace';
    wrapText(ctx, 'The father isolates reserpine from the Rauvolfia serpentina flower. The girl\u2019s perception clears \u2014 the world becomes stable, warm, and true. Father and daughter stand together, fireflies drifting peacefully.', WORLD_W / 2, 320, 820, 28);
    ctx.fillStyle = '#9dff9d'; ctx.font = 'bold 22px monospace';
    ctx.fillText('RESERPINE \u2014 the cure was always in the forest.', WORLD_W / 2, 500);
    ctx.fillStyle = 'rgba(200,200,220,0.6)'; ctx.font = '14px monospace';
    ctx.fillText('Press SPACE to play again', WORLD_W / 2, 600);
  }

  // ------------------------------------------------------------------
  // LOOP
  // ------------------------------------------------------------------
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  // start / restart handling
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === ' ') {
      if (Game.state === 'menu') { Game.blueberries = 0; startPhase(0); }
      else if (Game.state === 'ending') { Game.blueberries = 0; Game.state = 'menu'; }
    }
  });

  requestAnimationFrame(loop);

  // Debug/testing hook (harmless in production; enables automated QA)
  window.__DEBUG = {
    Game: Game,
    PHASES: PHASES,
    startPhase: startPhase,
    completePhase: completePhase,
    teleport: function (id, x, y) {
      const p = Game.players.find(pp => pp.id === id);
      if (p) { p.x = x; p.y = y; }
    },
    setBlueberries: function (n) { Game.blueberries = n; }
  };
})();
