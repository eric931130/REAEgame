"use strict";
// ============================================================
// 關卡執行期:圖塊查詢、碰撞、門的狀態、安全位置搜尋。
// ============================================================

class RuntimeLevel {
  constructor(def, index) {
    this.def = def;
    this.index = index;
    this.width = def.width;
    this.height = def.height;
    this.tiles = def.tiles;
    // 門的執行期狀態
    this.doors = def.doors.map((d) => ({
      def: d, open: false, openness: 0, closeDelay: 0,
    }));
    // 檢查點執行期狀態
    this.checkpoints = def.checkpoints.map((c) => ({ x: c.x, y: c.y, active: false }));
    this.goal = def.goal;
    // 終點區(安全等待區)
    this.goalZone = {
      x0: def.goal.x - 2, x1: def.goal.x + 2,
      y0: def.goal.y - 3.5, y1: def.goal.y + 1.5,
    };
  }

  rawTile(tx, ty) {
    if (tx < 0 || tx >= this.width) return T_SOLID; // 左右邊界為牆
    if (ty < 0) return T_EMPTY;                      // 上方開放
    if (ty >= this.height) return T_EMPTY;           // 下方是坑洞
    return this.tiles[ty * this.width + tx];
  }

  doorAt(tx, ty) {
    for (const d of this.doors) {
      if (tx === d.def.x && ty >= d.def.yTop && ty < d.def.yTop + d.def.h) return d;
    }
    return null;
  }

  isSolid(tx, ty) {
    if (this.rawTile(tx, ty) === T_SOLID) return true;
    const d = this.doorAt(tx, ty);
    return !!(d && !d.open);
  }

  isOneway(tx, ty) {
    const t = this.rawTile(tx, ty);
    return t === T_ONEWAY || t === T_BRIDGE;
  }

  isSpike(tx, ty) { return this.rawTile(tx, ty) === T_SPIKE; }

  // 該位置(格)頂端是否可站立
  isStandable(tx, ty) {
    if (this.isSolid(tx, ty) || this.isOneway(tx, ty)) {
      return !this.isSolid(tx, ty - 1) && !this.isSolid(tx, ty - 2) &&
        !this.isSpike(tx, ty - 1) && !this.isSpike(tx, ty - 2);
    }
    return false;
  }

  inGoalZone(x, y) {
    if (this.def.endlessRunner) return false;
    const z = this.goalZone;
    return x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1;
  }

  extendWidth(newWidth) {
    const targetWidth = Math.max(this.width, Math.floor(newWidth));
    if (targetWidth === this.width) return;
    const oldWidth = this.width;
    const next = new Uint8Array(targetWidth * this.height);
    for (let y = 0; y < this.height; y++) {
      next.set(this.tiles.subarray(y * oldWidth, (y + 1) * oldWidth), y * targetWidth);
    }
    this.width = targetWidth;
    this.tiles = next;
    this.def.width = targetWidth;
    this.def.tiles = next;
  }

  setTile(tx, ty, value) {
    if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) return;
    this.tiles[ty * this.width + tx] = value;
  }
}

// ---------- AABB 圖塊碰撞(軸分離掃描) ----------
// ent 需要 x, y, vx, vy, hw, hh。opts.oneway = 是否可站上單向平台。
function collideMove(level, ent, dt, opts) {
  const oneway = !opts || opts.oneway !== false;
  const EPS = 0.001;
  ent.onGround = false;

  // --- X 軸 ---
  let nx = ent.x + ent.vx * dt;
  if (ent.vx > 0) {
    const edge = nx + ent.hw;
    const tx = Math.floor(edge);
    for (let ty = Math.floor(ent.y - ent.hh + EPS); ty <= Math.floor(ent.y + ent.hh - EPS); ty++) {
      if (level.isSolid(tx, ty)) { nx = tx - ent.hw - EPS; ent.vx = 0; ent.hitWall = true; break; }
    }
  } else if (ent.vx < 0) {
    const edge = nx - ent.hw;
    const tx = Math.floor(edge);
    for (let ty = Math.floor(ent.y - ent.hh + EPS); ty <= Math.floor(ent.y + ent.hh - EPS); ty++) {
      if (level.isSolid(tx, ty)) { nx = tx + 1 + ent.hw + EPS; ent.vx = 0; ent.hitWall = true; break; }
    }
  }
  ent.x = nx;

  // --- Y 軸 ---
  const oldBottom = ent.y + ent.hh;
  let ny = ent.y + ent.vy * dt;
  if (ent.vy > 0) {
    const bottom = ny + ent.hh;
    const ty = Math.floor(bottom);
    for (let tx = Math.floor(ent.x - ent.hw + EPS); tx <= Math.floor(ent.x + ent.hw - EPS); tx++) {
      const solid = level.isSolid(tx, ty);
      const platform = oneway && level.isOneway(tx, ty) && oldBottom <= ty + 0.05;
      if (solid || platform) {
        ny = ty - ent.hh - EPS;
        ent.vy = 0;
        ent.onGround = true;
        break;
      }
    }
  } else if (ent.vy < 0) {
    const top = ny - ent.hh;
    const ty = Math.floor(top);
    for (let tx = Math.floor(ent.x - ent.hw + EPS); tx <= Math.floor(ent.x + ent.hw - EPS); tx++) {
      if (level.isSolid(tx, ty)) { ny = ty + 1 + ent.hh + EPS; ent.vy = 0; break; }
    }
  }
  ent.y = ny;
}

// 實體是否踩在尖刺上/碰到尖刺
function touchingSpike(level, ent) {
  const EPS = 0.05;
  for (let tx = Math.floor(ent.x - ent.hw + EPS); tx <= Math.floor(ent.x + ent.hw - EPS); tx++) {
    for (let ty = Math.floor(ent.y - ent.hh + EPS); ty <= Math.floor(ent.y + ent.hh - EPS); ty++) {
      if (level.isSpike(tx, ty)) return true;
    }
  }
  return false;
}

// ---------- 安全位置搜尋 ----------
// 在 anchor 附近找一個可以安全站立的位置:
// 不在尖刺、炸彈、敵人、坑洞上方、鬼魂旁或終點觸發區內。
function findSafeSpot(world, anchorX, anchorY, opts) {
  const level = world.level;
  const minOff = (opts && opts.minOffset) || 0;
  const avoidGoal = !opts || opts.avoidGoal !== false;
  const offsets = [];
  for (const mag of [0, 1.5, 2, 2.5, 3, 4, 5, 6]) {
    if (mag < minOff) continue;
    offsets.push(mag, -mag);
  }
  for (const dx of offsets) {
    const cx = Math.round(anchorX + dx - 0.5) + 0.5;
    const tx = Math.floor(cx);
    if (tx < 1 || tx >= level.width - 1) continue;
    // 從 anchor 高度往下找可站立面
    const startTy = Math.max(0, Math.floor(anchorY) - 3);
    for (let ty = startTy; ty < level.height; ty++) {
      if (!level.isStandable(tx, ty)) continue;
      const px = cx, py = ty - 0.5; // 站在該格頂端
      if (avoidGoal && level.inGoalZone(px, py)) break;
      if (!spotIsSafe(world, px, py)) break;
      return { x: px, y: py };
    }
  }
  return null;
}

function spotIsSafe(world, px, py) {
  const level = world.level;
  // 尖刺
  for (let tx = Math.floor(px) - 1; tx <= Math.floor(px) + 1; tx++) {
    for (let ty = Math.floor(py) - 1; ty <= Math.floor(py) + 2; ty++) {
      if (level.isSpike(tx, ty)) return false;
    }
  }
  // 敵人
  for (const o of world.onions) {
    if (o.state !== "dead" && Math.abs(o.x - px) < 2.5 && Math.abs(o.y - py) < 2.5) return false;
  }
  // 炸彈
  for (const b of world.bombs) {
    if (b.state !== "done" && Math.abs(b.x - px) < 3.2 && Math.abs(b.y - py) < 3.2) return false;
  }
  // 鬼魂
  if (world.ghost.active && world.ghost.ghosts.some((g) => Math.hypot(g.x - px, g.y - py) < 5)) {
    return false;
  }
  return true;
}
