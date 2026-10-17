"use strict";
// ============================================================
// 道具格、掉落道具、投射物、洋蔥怪、炸彈、粒子。
// ============================================================

const POWER_NAMES = { none: "一般", fire: "火焰", ice: "冰雪", potato: "馬鈴薯" };

// ---------- 道具格 ----------
class ItemBox {
  constructor(def) {
    this.x = def.x; this.y = def.y;
    this.content = def.content; // 'fire'|'ice'|'potato'|'star'|null(鬼魂)
    this.ghost = def.ghost;
    this.used = false;
    this.bump = 0;
  }
  update(world, dt) {
    this.bump = Math.max(0, this.bump - dt * 3);
    if (this.used) return;
    for (const p of world.players) {
      if (!p.canInteractWorld()) continue;
      if (Math.abs(p.x - this.x) < p.hw + 0.5 && Math.abs(p.y - this.y) < p.hh + 0.5) {
        // 原子式:第一位碰到的玩家啟動,立即標記已使用
        this.used = true;
        this.bump = 1;
        if (this.ghost) {
          world.ghost.trigger(this.x, this.y, p.id);
        } else {
          world.droppedItems.push(new DroppedItem(this.x, this.y - 0.6, this.content));
          AUDIO.tone(500, 0.08, "square", 0.05, 200);
        }
        break;
      }
    }
  }
}

// ---------- 掉落道具 ----------
class DroppedItem {
  constructor(x, y, type) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = -7;
    this.hw = 0.32; this.hh = 0.32;
    this.type = type;
    this.collected = false;
    this.age = 0;
    this.onGround = false;
  }
  update(world, dt) {
    this.age += dt;
    this.vy = Math.min(this.vy + 22 * dt, 14);
    collideMove(world.level, this, dt, { oneway: true });
    if (this.y > world.level.height + 3) this.collected = true; // 掉出關卡即消失
    if (this.age < 0.25 || this.collected) return;
    for (const p of world.players) {
      if (!p.canInteractWorld()) continue;
      if (Math.abs(p.x - this.x) < p.hw + this.hw && Math.abs(p.y - this.y) < p.hh + this.hh) {
        if (this.tryCollect(world, p)) break;
      }
    }
  }
  // 原子式取得:同一格道具只會發放一次
  tryCollect(world, player) {
    if (this.collected) return false;
    this.collected = true;
    player.score += 50;
    if (this.type === "star") {
      player.starT = 8;
    } else {
      player.power = this.type;
    }
    spawnBurst(world, this.x, this.y, "#ffd75e", 10);
    AUDIO.collect();
    world.ui.flashBanner(`${player.badge} 取得 ${this.type === "star" ? "無敵星星" : POWER_NAMES[this.type]}!`, 1.2);
    return true;
  }
}

// ---------- 投射物(火焰 / 冰晶) ----------
class Projectile {
  constructor(ownerPlayerId, type, x, y, dir) {
    this.ownerPlayerId = ownerPlayerId; // 發射者
    this.ownerTeam = 0;                 // 同隊:不互相傷害
    this.projectileType = type;         // 'fire' | 'ice'
    this.x = x; this.y = y;
    this.vx = dir * 13; this.vy = -2;
    this.hw = 0.22; this.hh = 0.22;
    this.life = 2.4;
    this.dead = false;
    this.onGround = false;
    this.hitWall = false;
  }
  update(world, dt) {
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    this.vy = Math.min(this.vy + 24 * dt, 16);
    this.hitWall = false;
    collideMove(world.level, this, dt, { oneway: false });
    if (this.onGround) this.vy = -7; // 彈跳前進
    if (this.hitWall) { this.dead = true; spawnBurst(world, this.x, this.y, this.color(), 5); return; }
    if (this.y > world.level.height + 2) { this.dead = true; return; }
    // 打中洋蔥(不會打中任何玩家 — 兩名玩家的投射物皆不傷害玩家)
    for (const o of world.onions) {
      if (o.state === "dead") continue;
      if (Math.abs(o.x - this.x) < o.hw + this.hw && Math.abs(o.y - this.y) < o.hh + this.hh) {
        const owner = world.players[this.ownerPlayerId];
        if (this.projectileType === "fire") {
          o.die(world, owner, o.state === "frozen" ? 150 : 100);
        } else {
          if (o.state === "frozen") o.die(world, owner, 150);
          else o.freeze(world);
        }
        this.dead = true;
        spawnBurst(world, this.x, this.y, this.color(), 6);
        break;
      }
    }
  }
  color() { return this.projectileType === "fire" ? "#ff8c3a" : "#8fdcff"; }
}

// ---------- 洋蔥怪 ----------
class Onion {
  constructor(def) {
    this.x = def.x; this.y = def.y;
    this.spawnX = def.x; this.spawnY = def.y;
    this.hw = 0.38; this.hh = 0.42;
    this.dir = -1;
    this.vx = 0; this.vy = 0;
    this.state = "walk"; // walk | frozen | dead
    this.frozenT = 0;
    this.deadT = 0;
    this.onGround = false;
    this.hitWall = false;
    this.anim = Math.random() * 10;
  }
  update(world, dt) {
    this.anim += dt;
    if (this.state === "dead") { this.deadT -= dt; return; }
    if (this.state === "frozen") {
      this.frozenT -= dt;
      if (this.frozenT <= 0) this.state = "walk";
      this.vx = 0;
    } else {
      this.vx = this.dir * 1.6;
      // 前方是牆或沒有地面 → 轉向
      const aheadX = this.x + this.dir * (this.hw + 0.15);
      const tx = Math.floor(aheadX);
      const footTy = Math.floor(this.y + this.hh + 0.2);
      const wall = world.level.isSolid(tx, Math.floor(this.y));
      const hasFloor = world.level.isSolid(tx, footTy) || world.level.isOneway(tx, footTy);
      if (this.onGround && (wall || !hasFloor)) this.dir *= -1;
    }
    this.vy = Math.min(this.vy + 30 * dt, 18);
    this.hitWall = false;
    collideMove(world.level, this, dt, { oneway: true });
    if (this.hitWall) this.dir *= -1;
    if (this.y > world.level.height + 3) { this.state = "dead"; this.deadT = 0; }
  }
  freeze(world) {
    if (this.state !== "walk") return;
    this.state = "frozen";
    this.frozenT = 6;
    AUDIO.freeze();
    spawnBurst(world, this.x, this.y, "#bfeaff", 8);
  }
  // 只會死一次;分數給造成擊殺的那位玩家
  die(world, killer, points) {
    if (this.state === "dead") return;
    const wasFrozen = this.state === "frozen";
    this.state = "dead";
    this.deadT = 0.7;
    if (killer) {
      killer.score += points !== undefined ? points : (wasFrozen ? 150 : 100);
      killer.kills += 1;
    }
    if (wasFrozen) AUDIO.shatter(); else AUDIO.stomp();
    spawnBurst(world, this.x, this.y, wasFrozen ? "#bfeaff" : "#e8e0c8", 10);
  }
}

// ---------- 炸彈 ----------
class Bomb {
  constructor(def) {
    this.x = def.x; this.y = def.y;
    this.hw = 0.4; this.hh = 0.4;
    this.state = "idle"; // idle | fuse | done
    this.fuseT = 0;
    this.blastR = 2.6;
  }
  update(world, dt) {
    if (this.state === "done") return;
    if (this.state === "idle") {
      for (const p of world.players) {
        if (!p.canInteractWorld()) continue;
        if (Math.hypot(p.x - this.x, p.y - this.y) < 2.2) {
          this.state = "fuse";
          this.fuseT = 1.6;
          AUDIO.tone(700, 0.1, "square", 0.05);
          break;
        }
      }
    } else if (this.state === "fuse") {
      this.fuseT -= dt;
      if (this.fuseT <= 0) this.explode(world);
    }
  }
  explode(world) {
    this.state = "done";
    AUDIO.explode();
    spawnBurst(world, this.x, this.y, "#ff8c3a", 24, 9);
    spawnBurst(world, this.x, this.y, "#555", 14, 6);
    // 可以同時傷害兩名玩家,但每名玩家只受到一次傷害判定
    for (const p of world.players) {
      if (!p.canInteractWorld()) continue;
      if (Math.hypot(p.x - this.x, p.y - this.y) < this.blastR + p.hw) {
        p.damage(world, "bomb");
      }
    }
    for (const o of world.onions) {
      if (o.state !== "dead" && Math.hypot(o.x - this.x, o.y - this.y) < this.blastR) {
        o.die(world, null, 0);
      }
    }
  }
}

// ---------- 粒子 ----------
function spawnBurst(world, x, y, color, count, speed) {
  const sp = speed || 5;
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = sp * (0.4 + Math.random() * 0.6);
    world.particles.push({
      x, y,
      vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2,
      life: 0.4 + Math.random() * 0.4,
      color, size: 0.08 + Math.random() * 0.12,
    });
  }
}

function updateParticles(world, dt) {
  for (const pt of world.particles) {
    pt.life -= dt;
    pt.vy += 12 * dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
  }
  world.particles = world.particles.filter((p) => p.life > 0);
}
