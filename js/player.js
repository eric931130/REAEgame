"use strict";
// ============================================================
// PlayerController:每位玩家一個獨立實例。
// 所有能力、生命、無敵、投射物數量、重生狀態都屬於個別實例,
// 沒有任何全域單例共享狀態。
// ============================================================

const PLAYER_DEFS = [
  { name: "黑球", badge: "P1", body: "#16161c", outline: "#cfd6ff", eye: "#ffffff", pupil: "#16161c" },
  { name: "白球", badge: "P2", body: "#f5f5f5", outline: "#16161c", eye: "#16161c", pupil: "#ffffff" },
];

class PlayerController {
  constructor(id, spawn, lives, characterKey) {
    this.id = id; // PlayerId: 0 = P1, 1 = P2
    const d = PLAYER_DEFS[id];
    this.characterKey = CHARACTER_DEFS[characterKey] ? characterKey : CHARACTER_KEYS[id % CHARACTER_KEYS.length];
    this.name = characterDef(this.characterKey).name;
    this.badge = d.badge;
    this.colors = d;

    this.x = spawn.x; this.y = spawn.y;
    this.vx = 0; this.vy = 0;
    this.baseHW = 0.36; this.baseHH = 0.36;
    this.facing = 1;
    this.onGround = false;
    this.coyoteT = 0; this.jumpBufT = 0;
    this.hitWall = false;

    this.lives = lives;
    this.power = "none";  // none | fire | ice | potato
    this.starT = 0;       // 無敵星星剩餘時間
    this.protectT = 0;    // 重生保護剩餘時間

    this.dead = false;
    this.deadT = 0;
    this.eliminated = false;
    this.soul = null;     // 淘汰後的靈魂標記 {x, y}
    this.diedDuringGhost = false;

    this.atGoal = false;
    this.arrivalTime = -1;

    this.score = 0;
    this.kills = 0;
    this.ghostEscapes = 0;
    this.revivesGiven = 0;
    this.deaths = 0;

    this.lastGroundPos = { x: spawn.x, y: spawn.y };
    this.spawnPoint = { x: spawn.x, y: spawn.y };
    this.anim = 0;
  }

  get hw() { return this.power === "potato" ? this.baseHW * 1.45 : this.baseHW; }
  get hh() { return this.power === "potato" ? this.baseHH * 1.45 : this.baseHH; }
  get character() { return characterDef(this.characterKey); }
  get characterImage() { return characterSprite(this.characterKey); }

  alive() { return !this.dead && !this.eliminated; }
  canInteractWorld() { return this.alive() && !this.atGoal; }

  projectileCount(world) {
    // 火焰與冰晶同時存在上限「每位玩家」各自計算
    return world.projectiles.filter((p) => !p.dead && p.ownerPlayerId === this.id).length;
  }

  update(world, dt) {
    this.anim += dt;
    this.starT = Math.max(0, this.starT - dt);
    this.protectT = Math.max(0, this.protectT - dt);
    if (!this.alive()) return;

    const input = world.inputLocked ? null : world.input.frame(this.id);
    const left = input ? input.left : false;
    const right = input ? input.right : false;

    // ---- 在終點等待:不能離開終點區域、不受一般傷害 ----
    if (this.atGoal) {
      const z = world.level.goalZone;
      let mv = (right ? 1 : 0) - (left ? 1 : 0);
      this.vx = mv * 3;
      this.vy = Math.min(this.vy + 30 * dt, 18);
      collideMove(world.level, this, dt, { oneway: true });
      this.x = Math.max(z.x0 + this.hw, Math.min(z.x1 - this.hw, this.x));
      return;
    }

    // ---- 水平移動 ----
    let speed = world.endlessRunner ? world.endlessRunner.runSpeed : 7;
    if (world.ghost.boostActive) speed *= 1.4; // 鬼魂逃跑期間 +40%
    speed *= world.distanceCtl.speedFactor(this);
    // 無限模式像離線小恐龍一樣自動前進，玩家專注於跳躍、快速下降與技能。
    let mv = world.endlessRunner ? 1 : (right ? 1 : 0) - (left ? 1 : 0);
    if (world.distanceCtl.blockAway(this, mv)) mv = 0; // 距離上限:不能再拉開
    const targetVx = mv * speed;
    const accel = this.onGround ? 60 : 40;
    if (this.vx < targetVx) this.vx = Math.min(targetVx, this.vx + accel * dt);
    else if (this.vx > targetVx) this.vx = Math.max(targetVx, this.vx - accel * dt);
    if (mv !== 0) this.facing = mv;

    // ---- 跳躍(土狼時間 + 輸入緩衝) ----
    this.coyoteT = this.onGround ? 0.08 : Math.max(0, this.coyoteT - dt);
    this.jumpBufT = Math.max(0, this.jumpBufT - dt);
    if (input && input.jumpPressed) this.jumpBufT = 0.12;
    if (this.jumpBufT > 0 && this.coyoteT > 0) {
      this.vy = -15.5;
      this.jumpBufT = 0; this.coyoteT = 0;
      AUDIO.jump();
    }
    if (input && !input.jump && this.vy < -5) this.vy = -5; // 放開跳躍鍵 → 小跳

    // ---- 重力與快速下降 ----
    const fastFall = input && input.down && !this.onGround;
    this.vy = Math.min(this.vy + (fastFall ? 70 : 30) * dt, fastFall ? 28 : 18);

    collideMove(world.level, this, dt, { oneway: true });

    if (this.onGround) {
      // 記錄安全落腳點(供靈魂標記/重生使用)
      this.lastGroundPos.x = this.x; this.lastGroundPos.y = this.y;
    }

    // ---- 尖刺 ----
    if (touchingSpike(world.level, this)) this.damage(world, "spike");

    // ---- 掉出關卡(坑洞):直接死亡 ----
    if (this.y > world.level.height + 2) {
      if (this.alive()) this.die(world, "pit");
      return;
    }

    // ---- 使用能力(火焰 / 冰雪) ----
    if (input && input.abilityPressed && (this.power === "fire" || this.power === "ice")) {
      if (this.projectileCount(world) < 3) { // 每位玩家最多 3 顆
        world.projectiles.push(new Projectile(
          this.id, this.power,
          this.x + this.facing * (this.hw + 0.3), this.y - 0.1,
          this.facing
        ));
        AUDIO.shoot();
      }
    }
  }

  // ---- 一般受傷判定(狀態規則) ----
  damage(world, source) {
    if (!this.alive() || this.atGoal) return false;
    if (this.starT > 0 || this.protectT > 0) return false; // 無敵:不受傷
    if (this.power === "potato") { // 馬鈴薯:解除,不扣命
      this.power = "none";
      this.protectT = 1;
      AUDIO.hurt();
      spawnBurst(world, this.x, this.y, "#c8964b", 8);
      return true;
    }
    if (this.power === "fire" || this.power === "ice") { // 失去能力,不扣命
      this.power = "none";
      this.protectT = 1;
      AUDIO.hurt();
      spawnBurst(world, this.x, this.y, "#ffffff", 8);
      return true;
    }
    this.die(world, source);
    return true;
  }

  // ---- 死亡:只影響自己,不影響另一名玩家 ----
  die(world, source) {
    if (!this.alive()) return;
    this.dead = true;
    this.deadT = 1.5;
    this.vx = 0; this.vy = 0;
    this.lives -= 1;
    this.deaths += 1;
    this.diedDuringGhost = world.ghost.active;
    // 清除自己的火焰、冰雪、馬鈴薯與無敵狀態(不影響隊友)
    this.power = "none";
    this.starT = 0;
    this.protectT = 0;
    spawnBurst(world, this.x, this.y, this.character.accent, 14);
    AUDIO.die();
    world.reviveCtl.onPlayerDied(this);
    if (this.lives <= 0) {
      this.eliminated = true;
      this.soul = { x: this.lastGroundPos.x, y: this.lastGroundPos.y - 0.5 };
      world.ui.flashBanner(`${this.badge} ${this.name} 已失去所有生命`, 2.5);
    } else {
      world.ui.flashBanner(`${this.badge} 倒下了!`, 1);
    }
  }

  respawnAt(world, pos, protect) {
    this.x = pos.x; this.y = pos.y;
    this.vx = 0; this.vy = 0;
    this.dead = false;
    this.protectT = protect;
    this.diedDuringGhost = false;
  }

  // 合作復活:被救援者恢復一條生命,在救援者附近重生
  reviveNear(world, savior) {
    const spot = findSafeSpot(world, savior.x, savior.y, { minOffset: 1.5 }) ||
      { x: savior.x, y: savior.y - 1 };
    this.lives = 1;
    this.eliminated = false;
    this.soul = null;
    this.respawnAt(world, spot, 3); // 3 秒重生無敵
  }
}
