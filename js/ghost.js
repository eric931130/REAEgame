"use strict";

// Every ghost box randomly picks one of these three tiers.
// Gold intentionally preserves the original chase time and speed.
const GHOST_TYPES = Object.freeze({
  gold: Object.freeze({
    key: "gold",
    name: "金色幽靈",
    image: "assets/ghosts/ghost-gold.png",
    chaseDuration: 8,
    speed: 6.6,
    splitEvery: 0,
    hudColor: "#ffe27a",
    hudBorder: "#e7ae28",
    hudBackground: "rgba(92, 62, 8, .82)",
  }),
  purple: Object.freeze({
    key: "purple",
    name: "紫色分裂者",
    image: "assets/ghosts/ghost-purple.png",
    chaseDuration: 30,
    speed: 8.4,
    splitEvery: 5,
    hudColor: "#e0b6ff",
    hudBorder: "#ae66ff",
    hudBackground: "rgba(62, 19, 92, .82)",
  }),
  black: Object.freeze({
    key: "black",
    name: "黑色神龍殺手",
    image: "assets/ghosts/ghost-black.png",
    chaseDuration: 40,
    speed: 9.2,
    splitEvery: 0,
    hudColor: "#f0f0f0",
    hudBorder: "#777b86",
    hudBackground: "rgba(8, 9, 13, .88)",
  }),
});

const GHOST_TYPE_KEYS = Object.keys(GHOST_TYPES);
const GHOST_SPRITES = {};
for (const key of GHOST_TYPE_KEYS) {
  const image = new Image();
  image.src = GHOST_TYPES[key].image;
  GHOST_SPRITES[key] = image;
}

class GhostEventController {
  constructor() {
    this.state = "idle"; // idle | warning | escape | chase
    this.t = 0;
    this.ghosts = [];
    this.typeKey = "gold";
    this.config = GHOST_TYPES.gold;
    this.splitT = 0;
    this.anim = 0;
  }

  get active() { return this.state !== "idle"; }
  get boostActive() { return this.state === "escape"; }
  get ghostPos() { return this.ghosts.length ? this.ghosts[0] : null; }
  get sprite() { return GHOST_SPRITES[this.typeKey]; }

  makeGhost(x, y, angle) {
    const a = angle || 0;
    return {
      x,
      y,
      vx: Math.cos(a) * 0.25,
      vy: Math.sin(a) * 0.25,
      targetId: -1,
      retargetT: 0,
      phase: Math.random() * Math.PI * 2,
    };
  }

  trigger(x, y, byPlayerId, forcedTypeKey) {
    if (this.active) return false;
    const randomKey = GHOST_TYPE_KEYS[Math.floor(Math.random() * GHOST_TYPE_KEYS.length)];
    this.typeKey = GHOST_TYPES[forcedTypeKey] ? forcedTypeKey : randomKey;
    this.config = GHOST_TYPES[this.typeKey];
    this.state = "warning";
    this.t = 1.5;
    this.ghosts = [this.makeGhost(x, y - 0.5)];
    this.splitT = this.config.splitEvery;
    AUDIO.ghostWarn();
    return true;
  }

  cancel() {
    this.state = "idle";
    this.ghosts = [];
  }

  pickTarget(world, ghost) {
    let best = -1;
    let bestD = Infinity;
    for (const p of world.players) {
      if (!p.alive() || p.atGoal) continue;
      const d = Math.hypot(p.x - ghost.x, p.y - ghost.y);
      if (d < bestD) {
        bestD = d;
        best = p.id;
      }
    }
    ghost.targetId = best;
  }

  splitGhosts(world) {
    const originals = this.ghosts.slice();
    const total = originals.length;
    for (let i = 0; i < total; i++) {
      const original = originals[i];
      const angle = (i / Math.max(1, total)) * Math.PI * 2 + Math.PI / 2;
      const offsetX = Math.cos(angle) * 0.7;
      const offsetY = Math.sin(angle) * 0.7;
      original.x -= offsetX * 0.45;
      original.y -= offsetY * 0.45;
      this.ghosts.push(this.makeGhost(original.x + offsetX, original.y + offsetY, angle));
    }
    spawnBurst(world, this.ghostPos.x, this.ghostPos.y, "#c46cff", Math.min(42, 12 + total * 2), 5);
    AUDIO.tone(260, 0.16, "sawtooth", 0.045, 180);
    world.ui.flashBanner(`紫色幽靈分裂！目前 ${this.ghosts.length} 隻`, 1.1);
  }

  update(world, dt) {
    if (!this.active) return;
    this.anim += dt;

    if (this.state === "warning") {
      this.t -= dt;
      for (const ghost of this.ghosts) {
        ghost.y += Math.sin(this.anim * 6 + ghost.phase) * dt * 0.6 - dt * 0.8;
      }
      if (this.t <= 0) {
        this.state = "escape";
        this.t = 3;
        world.ui.flashBanner(`${this.config.name} 即將追來！快逃！`, 1.5);
      }
      return;
    }

    if (this.state === "escape") {
      this.t -= dt;
      for (const ghost of this.ghosts) {
        ghost.y += Math.sin(this.anim * 6 + ghost.phase) * dt * 0.5;
      }
      if (this.t <= 0) {
        this.state = "chase";
        this.t = this.config.chaseDuration;
        this.splitT = this.config.splitEvery;
        for (const ghost of this.ghosts) ghost.retargetT = 0;
      }
      return;
    }

    this.t -= dt;
    if (this.config.splitEvery > 0) {
      this.splitT -= dt;
      if (this.splitT <= 0 && this.t > 0.1) {
        this.splitGhosts(world);
        this.splitT += this.config.splitEvery;
      }
    }

    for (const ghost of this.ghosts) {
      ghost.retargetT -= dt;
      const current = world.players[ghost.targetId];
      if (ghost.targetId < 0 || !current || !current.alive() || current.atGoal || ghost.retargetT <= 0) {
        this.pickTarget(world, ghost);
        ghost.retargetT = 1;
      }

      const target = ghost.targetId >= 0 ? world.players[ghost.targetId] : null;
      if (target) {
        const dx = target.x - ghost.x;
        const dy = target.y - ghost.y;
        const distance = Math.hypot(dx, dy) || 1;
        ghost.vx += (dx / distance * this.config.speed - ghost.vx) * Math.min(1, dt * 4);
        ghost.vy += (dy / distance * this.config.speed - ghost.vy) * Math.min(1, dt * 4);
      } else {
        ghost.vx *= 0.98;
        ghost.vy *= 0.98;
      }

      ghost.x += ghost.vx * dt;
      ghost.y += ghost.vy * dt + Math.sin(this.anim * 5 + ghost.phase) * dt * 0.8;
    }

    for (const p of world.players) {
      if (!p.alive() || p.atGoal || p.starT > 0 || p.protectT > 0) continue;
      if (this.ghosts.some((ghost) => Math.hypot(p.x - ghost.x, p.y - ghost.y) < 0.9)) {
        p.die(world, "ghost");
      }
    }

    const anyChaseable = world.players.some((p) => p.alive() && !p.atGoal);
    if (!anyChaseable) {
      this.end(world, false);
      return;
    }

    if (this.t <= 0) this.end(world, true);
  }

  end(world, giveRewards) {
    this.state = "idle";
    this.ghosts = [];
    AUDIO.ghostGone();
    if (giveRewards) {
      for (const p of world.players) {
        if (p.eliminated) continue;
        if (p.diedDuringGhost) {
          p.score += 100;
        } else {
          p.score += 500;
          p.ghostEscapes += 1;
        }
      }
      world.ui.flashBanner(`${this.config.name} 已離開！`, 1.2);
    }
    for (const p of world.players) p.diedDuringGhost = false;
  }

  countdownText() {
    if (this.state === "warning") return `👻 ${this.config.name} 即將現身…`;
    if (this.state === "escape") return `👻 ${this.config.name}｜快逃！${this.t.toFixed(1)} 秒`;
    if (this.state === "chase") {
      const count = this.ghosts.length > 1 ? `｜${this.ghosts.length} 隻` : "";
      const split = this.config.splitEvery > 0 ? `｜${Math.max(0, this.splitT).toFixed(1)} 秒後分裂` : "";
      return `👻 ${this.config.name}｜追逐 ${this.t.toFixed(1)} 秒${count}${split}`;
    }
    return "";
  }
}
