"use strict";
// ============================================================
// 雙人系統:PlayerManager(玩家清單/重生)、鏡頭、距離限制、
// 合作復活、終點判定、團隊分數。
// ============================================================

// ---------- PlayerManager / PlayerRegistry / PlayerSpawnManager ----------
class PlayerManager {
  constructor(world) {
    this.world = world;
  }
  get players() { return this.world.players; }
  alivePlayers() { return this.players.filter((p) => p.alive()); }
  eliminatedPlayers() { return this.players.filter((p) => p.eliminated); }
  allEliminated() { return this.players.every((p) => p.eliminated); }
  teammateOf(player) { return this.players.find((candidate) => candidate !== player); }

  update(dt) {
    const w = this.world;
    for (const p of this.players) {
      if (p.dead && !p.eliminated) {
        // 鬼魂事件期間死亡的玩家,要等事件結束才能重生
        if (w.ghost.active && p.diedDuringGhost) continue;
        p.deadT -= dt;
        if (p.deadT <= 0) {
          const pos = this.findRespawnPos(p);
          p.respawnAt(w, pos, 2); // 2 秒重生保護
        }
      }
    }
  }

  // 重生位置優先順序:
  // 1. 最近啟用的檢查點  2. 存活隊友附近的安全位置  3. 關卡起點
  findRespawnPos(player) {
    const w = this.world;
    const cp = w.activeCheckpoint;
    if (cp) {
      const s = findSafeSpot(w, cp.x, cp.y, {});
      if (s) return s;
    }
    const mate = this.teammateOf(player);
    if (mate && mate.alive() && !mate.atGoal) {
      // 隊友站在危險區域時,不強制在隊友旁邊重生
      if (spotIsSafe(w, mate.x, mate.y)) {
        const s = findSafeSpot(w, mate.x, mate.y, { minOffset: 1.5 });
        if (s) return s;
      }
    }
    const sp = player.spawnPoint;
    return findSafeSpot(w, sp.x, sp.y, {}) || { x: sp.x, y: sp.y };
  }
}

// ---------- MultiplayerCameraController ----------
class MultiplayerCameraController {
  constructor(world, canvas) {
    this.world = world;
    this.aspect = canvas.width / canvas.height;
    this.minOrtho = 5;
    this.maxOrtho = 8;
    this.zoomStartDist = 7;
    this.maxDist = 14;
    this.x = 0; this.y = 0;
    this.ortho = 6;
    this.init = false;
  }

  // 鏡頭目標:存活玩家(等待重生者不計入)。
  // 若一人已在終點安全等待、另一人仍在路上,只跟隨仍在移動的玩家。
  targets() {
    const alive = this.world.players.filter((p) => p.alive());
    const roaming = alive.filter((p) => !p.atGoal);
    return roaming.length > 0 ? roaming : alive;
  }

  update(dt) {
    const ts = this.targets();
    let tx = this.x, ty = this.y, tOrtho = this.minOrtho;
    if (ts.length === 2) {
      tx = (ts[0].x + ts[1].x) / 2;
      ty = (ts[0].y + ts[1].y) / 2 - 1;
      const d = Math.max(Math.abs(ts[0].x - ts[1].x), Math.abs(ts[0].y - ts[1].y) * this.aspect);
      const k = Math.max(0, Math.min(1, (d - this.zoomStartDist) / (this.maxDist - this.zoomStartDist)));
      tOrtho = this.minOrtho + (this.maxOrtho - this.minOrtho) * k;
    } else if (ts.length === 1) {
      tx = ts[0].x; ty = ts[0].y - 1;
      tOrtho = this.minOrtho + 1;
    }
    if (this.world.endlessRunner && ts.length > 0) {
      tx = Math.max(...ts.map((player) => player.x)) + 3.2;
    }
    if (!this.init) { this.x = tx; this.y = ty; this.ortho = tOrtho; this.init = true; }
    // 平滑移動與縮放(不突然跳動)
    const k1 = Math.min(1, dt * 6), k2 = Math.min(1, dt * 3);
    this.x += (tx - this.x) * k1;
    this.y += (ty - this.y) * k1;
    this.ortho += (tOrtho - this.ortho) * k2;
    this.clamp();
  }

  clamp() {
    const lvl = this.world.level;
    const halfH = this.ortho;
    const halfW = this.ortho * this.aspect;
    if (lvl.width <= halfW * 2) this.x = lvl.width / 2;
    else this.x = Math.max(halfW, Math.min(lvl.width - halfW, this.x));
    if (lvl.height <= halfH * 2) this.y = lvl.height - halfH; // 對齊底部
    else this.y = Math.max(halfH, Math.min(lvl.height - halfH, this.y));
  }

  scale(canvas) { return canvas.height / (2 * this.ortho); }
  worldToScreen(canvas, wx, wy) {
    const s = this.scale(canvas);
    return { x: (wx - this.x) * s + canvas.width / 2, y: (wy - this.y) * s + canvas.height / 2 };
  }
}

// ---------- PlayerDistanceController ----------
class PlayerDistanceController {
  constructor(world) {
    this.world = world;
    this.warnDist = 12;
    this.hardDist = 14;
    this.regroupDist = 13;
    this.regroupT = 0;
    this.regroupActive = false;
  }

  bothRoaming() {
    const ps = this.world.players;
    if (ps.length < 2) return false;
    return ps[0].alive() && ps[1].alive() && !ps[0].atGoal && !ps[1].atGoal;
  }

  dist() {
    const ps = this.world.players;
    return Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
  }

  // 領先者 = 離終點較近的玩家
  leader() {
    const ps = this.world.players;
    const g = this.world.level.goal;
    const d0 = Math.hypot(ps[0].x - g.x, ps[0].y - g.y);
    const d1 = Math.hypot(ps[1].x - g.x, ps[1].y - g.y);
    return d0 <= d1 ? ps[0] : ps[1];
  }

  get warning() { return this.bothRoaming() && this.dist() > this.warnDist; }

  // 玩家距離過遠時,領先者移動速度逐漸降低
  speedFactor(player) {
    if (!this.bothRoaming()) return 1;
    const d = this.dist();
    if (d <= this.warnDist) return 1;
    if (player !== this.leader()) return 1;
    return Math.max(0.25, 1 - (d - this.warnDist) / (this.hardDist - this.warnDist) * 0.75);
  }

  // 到達距離上限:領先者不能再往拉開距離的方向移動
  blockAway(player, mv) {
    if (mv === 0 || !this.bothRoaming()) return false;
    if (this.dist() < this.hardDist) return false;
    if (player !== this.leader()) return false;
    const other = this.world.players[player.id === 0 ? 1 : 0];
    return Math.sign(mv) === Math.sign(player.x - other.x);
  }

  update(dt) {
    const w = this.world;
    this.regroupActive = false;
    if (!this.bothRoaming() || w.ghost.active) { this.regroupT = 0; return; }
    const d = this.dist();
    if (d >= this.regroupDist) {
      this.regroupActive = true;
      this.regroupT += dt;
      if (this.regroupT >= 3) {
        // 三秒集合倒數結束 → 將落後玩家傳送到領先玩家附近的安全位置
        this.regroupT = 0;
        const lead = this.leader();
        const lag = w.players[lead.id === 0 ? 1 : 0];
        const spot = findSafeSpot(w, lead.x, lead.y, { minOffset: 1.5 });
        if (spot) {
          lag.x = spot.x; lag.y = spot.y;
          lag.vx = 0; lag.vy = 0;
          lag.protectT = Math.max(lag.protectT, 1); // 一秒短暫保護,不扣生命
          AUDIO.teleport();
          w.ui.flashBanner(`${lag.badge} 已傳送到隊友身邊`, 1.2);
        }
      }
    } else if (d < this.warnDist - 1) {
      this.regroupT = 0;
    }
  }
}

// ---------- ReviveController(合作復活) ----------
class ReviveController {
  constructor(world) {
    this.world = world;
    this.progress = 0;
    this.activeSaviorId = -1;
  }

  onPlayerDied(player) {
    // 救援過程中受到傷害 → 中斷
    if (this.activeSaviorId === player.id) { this.progress = 0; this.activeSaviorId = -1; }
  }

  canRevive(savior, target) {
    const w = this.world;
    if (!target) return false;
    if (!target.eliminated || !target.soul) return false;
    if (!savior.alive() || savior.atGoal || !savior.onGround) return false;
    if (savior.lives < 2) return false;           // 剩一條命不能救援
    if (w.ghost.active) return false;             // 鬼魂事件期間不能救援
    if (w.state !== "playing") return false;      // 關卡完成後不能救援
    if (Math.hypot(savior.x - target.soul.x, savior.y - target.soul.y) > 1.6) return false;
    if (!spotIsSafe(w, target.soul.x, target.soul.y)) return false; // 危險區域不能救援
    return true;
  }

  update(dt) {
    const w = this.world;
    let holding = false;
    for (const savior of w.players) {
      const target = w.playerMgr.teammateOf(savior);
      if (!this.canRevive(savior, target)) continue;
      const input = w.inputLocked ? null : w.input.frame(savior.id);
      if (input && input.interact) { // 長按互動鍵約 2 秒
        holding = true;
        if (this.activeSaviorId !== savior.id) { this.activeSaviorId = savior.id; this.progress = 0; }
        this.progress += dt;
        if (this.progress >= 2) {
          savior.lives -= 1;           // 救援者扣一條生命
          savior.score += 300;         // 救援分數
          savior.revivesGiven += 1;
          target.reviveNear(w, savior);
          AUDIO.revive();
          w.ui.flashBanner(`${savior.badge} 復活了 ${target.badge}!`, 1.5);
          this.progress = 0;
          this.activeSaviorId = -1;
        }
      }
    }
    if (!holding) { this.progress = 0; this.activeSaviorId = -1; }
  }
}

// ---------- TeamGoalController ----------
class TeamGoalController {
  constructor(world) {
    this.world = world;
  }

  update(dt) {
    const w = this.world;
    for (const p of w.players) {
      if (!p.alive() || p.atGoal) continue;
      if (w.level.inGoalZone(p.x, p.y)) {
        // 第一名抵達的玩家進入等待狀態,不會立即結束關卡
        p.atGoal = true;
        p.arrivalTime = w.time;
        AUDIO.goal();
        const mate = w.playerMgr.teammateOf(p);
        if (mate && mate.alive() && !mate.atGoal) {
          w.ui.flashBanner(`${p.badge} 抵達終點,等待隊友…`, 1.5);
        }
      }
    }
    // 過關條件:所有「未淘汰」玩家都抵達終點(淘汰玩家不需等待)
    const need = w.players.filter((p) => !p.eliminated);
    if (need.length > 0 && need.every((p) => p.atGoal)) {
      w.completeLevel();
    }
  }

  waitingForMate() {
    const ps = this.world.players;
    const oneAtGoal = ps.some((p) => p.atGoal);
    const otherComing = ps.some((p) => !p.atGoal && !p.eliminated);
    return oneAtGoal && otherComing;
  }
}

// ---------- TeamScoreManager ----------
class TeamScoreManager {
  // 結算關卡:個人分數 + 團隊獎勵
  static computeLevelResult(world) {
    const players = world.players;
    const base = players.reduce((sum, player) => sum + player.score, 0);
    const levelBonus = 1000;
    const coopBonus = players.length > 1 && players.every((player) => player.deaths === 0) ? 500 : 0;
    let syncBonus = 0;
    if (players.length > 1 && players.every((player) => !player.eliminated && player.atGoal) &&
        Math.abs(players[0].arrivalTime - players[1].arrivalTime) <= 3) {
      syncBonus = 300; // 一起抵達終點
    }
    const timeBonus = Math.max(0, Math.round(world.level.def.parTime - world.time)) * 10;
    return {
      base, levelBonus, coopBonus, syncBonus, timeBonus,
      teamTotal: base + levelBonus + coopBonus + syncBonus + timeBonus,
    };
  }
}
