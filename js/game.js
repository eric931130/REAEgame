"use strict";
// ============================================================
// GameWorld:單一關卡的執行世界(更新 + 繪製)
// Game:整體狀態機(選單 / 準備 / 遊玩 / 暫停 / 結算)
// ============================================================

class GameWorld {
  constructor(game, levelIndex, livesArr) {
    this.game = game;
    this.input = INPUT;
    this.ui = UI;
    this.level = new RuntimeLevel(LEVELS[levelIndex], levelIndex);
    const def = this.level.def;

    const playerCount = Math.max(1, Math.min(2, game.run.playerCount || 2));
    this.players = Array.from({ length: playerCount }, (_, id) =>
      new PlayerController(id, def.spawns[id], livesArr[id], game.selectedCharacters[id])
    );

    this.onions = def.onions.map((d) => new Onion(d));
    this.initialEnemyCount = this.onions.length;
    this.bombs = def.bombs.map((d) => new Bomb(d));
    this.boxes = def.boxes.map((d) => new ItemBox(d));
    this.droppedItems = [];
    this.projectiles = [];
    this.particles = [];

    this.ghost = new GhostEventController();
    this.playerMgr = new PlayerManager(this);
    this.camera = new MultiplayerCameraController(this, game.canvas);
    this.distanceCtl = new PlayerDistanceController(this);
    this.reviveCtl = new ReviveController(this);
    this.goalCtl = new TeamGoalController(this);
    this.endlessRunner = def.endlessRunner ? new EndlessRunnerController(this) : null;

    this.activeCheckpoint = null;
    this.time = 0;
    this.state = "playing"; // playing | complete | gameover
    this.inputLocked = false;
    this.gameOverT = 0;
    this.completeResult = null;
  }

  update(dt) {
    if (this.state === "playing") this.time += dt;
    this.inputLocked = this.state !== "playing";

    for (const b of this.boxes) b.update(this, dt);
    for (const it of this.droppedItems) it.update(this, dt);
    this.droppedItems = this.droppedItems.filter((i) => !i.collected);
    for (const pr of this.projectiles) pr.update(this, dt);
    this.projectiles = this.projectiles.filter((p) => !p.dead);
    for (const o of this.onions) o.update(this, dt);
    this.onions = this.onions.filter((o) => o.state !== "dead" || o.deadT > 0);
    for (const bm of this.bombs) bm.update(this, dt);
    for (const p of this.players) p.update(this, dt);

    if (this.endlessRunner) this.endlessRunner.update(dt);

    this.playerEnemyInteractions();
    this.updateDoors(dt);
    this.updateCheckpoints();
    this.ghost.update(this, dt);
    this.playerMgr.update(dt);
    if (this.state === "playing") {
      this.reviveCtl.update(dt);
      this.distanceCtl.update(dt);
      if (!this.endlessRunner) this.goalCtl.update(dt);
    }
    updateParticles(this, dt);
    this.camera.update(dt);

    // 兩名玩家生命都歸零 → Game Over
    if (this.state === "playing" && this.playerMgr.allEliminated()) {
      this.state = "gameover";
      this.ghost.cancel();
      this.gameOverT = 1.2;
    }
    if (this.state === "gameover" && this.gameOverT > 0) {
      this.gameOverT -= dt;
      if (this.gameOverT <= 0) this.game.onGameOver();
    }
  }

  playerEnemyInteractions() {
    for (const o of this.onions) {
      if (o.state === "dead") continue;
      // 依序判定 → 兩人同時踩到同一隻洋蔥時只會死一次、只計分一次
      for (const p of this.players) {
        if (!p.canInteractWorld() || o.state === "dead") continue;
        const overlapX = Math.abs(p.x - o.x) < p.hw + o.hw;
        const overlapY = Math.abs(p.y - o.y) < p.hh + o.hh;
        if (!overlapX || !overlapY) continue;
        if (p.starT > 0) { // 無敵星星:碰到就消滅
          o.die(this, p);
          continue;
        }
        const stomping = p.vy > 1 && (p.y + p.hh) < o.y + 0.15;
        if (stomping) {
          o.die(this, p);
          p.vy = -9; // 踩彈跳
        } else if (o.state === "walk") {
          p.damage(this, "onion");
        }
        // 冰凍中的洋蔥從側面碰到無害
      }
    }
  }

  updateDoors(dt) {
    // 單人排位或一名玩家已淘汰時，一塊壓力板即可開門。
    const singleMode = this.players.length === 1 || this.players.some((p) => p.eliminated);
    for (const d of this.doors_()) {
      const onA = this.plateOn(d.def.plateA);
      const onB = this.plateOn(d.def.plateB);
      const wantOpen = singleMode ? (onA || onB) : (onA && onB);
      if (wantOpen) {
        if (!d.open) AUDIO.door();
        d.open = true;
        d.closeDelay = 1; // 任一玩家離開後延遲一秒才關
      } else if (d.open) {
        d.closeDelay -= dt;
        if (d.closeDelay <= 0 && !this.playerInDoor(d)) { // 防止夾死玩家
          d.open = false;
        }
      }
      d.openness += ((d.open ? 1 : 0) - d.openness) * Math.min(1, dt * 5);
      d.pressedA = onA; d.pressedB = onB;
    }
  }

  doors_() { return this.level.doors; }

  plateOn(plate) {
    return this.players.some((p) =>
      p.alive() && p.onGround &&
      Math.abs(p.x - plate.x) < 0.8 && Math.abs(p.y - plate.y) < 1.0
    );
  }

  playerInDoor(d) {
    return this.players.some((p) => {
      if (!p.alive()) return false;
      return Math.abs(p.x - (d.def.x + 0.5)) < p.hw + 0.5 &&
        p.y + p.hh > d.def.yTop && p.y - p.hh < d.def.yTop + d.def.h;
    });
  }

  updateCheckpoints() {
    for (const cp of this.level.checkpoints) {
      for (const p of this.players) {
        if (!p.canInteractWorld()) continue;
        if (Math.abs(p.x - cp.x) < 1 && Math.abs(p.y - cp.y) < 1.5) {
          if (!cp.active) {
            cp.active = true;
            this.activeCheckpoint = { x: cp.x, y: cp.y };
            AUDIO.checkpoint();
            this.ui.flashBanner("檢查點!", 1);
          }
        }
      }
    }
  }

  completeLevel() {
    if (this.state !== "playing") return;
    this.state = "complete";
    this.ghost.cancel(); // 通關時立即取消鬼魂事件
    this.completeResult = TeamScoreManager.computeLevelResult(this);
    this.game.onLevelComplete(this.completeResult);
  }

  // ==================== 繪製 ====================
  render(ctx, canvas) {
    const cam = this.camera;
    const s = cam.scale(canvas);

    // 天空
    const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
    sky.addColorStop(0, "#7ec8f0");
    sky.addColorStop(1, "#cfeeff");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 遠景山丘(視差)
    ctx.fillStyle = "rgba(110, 170, 120, 0.5)";
    for (let i = 0; i < 8; i++) {
      const hx = ((i * 37 - cam.x * 0.3 * s / 32) % (canvas.width + 400)) * 1.5 - 200;
      ctx.beginPath();
      ctx.arc(hx, canvas.height * 0.95, 180 + (i % 3) * 60, Math.PI, 0);
      ctx.fill();
    }

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(s, s);
    ctx.translate(-cam.x, -cam.y);

    this.renderTiles(ctx, cam, canvas, s);
    this.renderDoors(ctx);
    this.renderCheckpoints(ctx);
    if (!this.endlessRunner) this.renderGoal(ctx);
    for (const b of this.boxes) this.renderBox(ctx, b);
    for (const it of this.droppedItems) this.renderItem(ctx, it.x, it.y, it.type, 0.34);
    for (const o of this.onions) this.renderOnion(ctx, o);
    for (const bm of this.bombs) this.renderBomb(ctx, bm);
    for (const pr of this.projectiles) this.renderProjectile(ctx, pr);
    for (const p of this.players) this.renderPlayer(ctx, p);
    this.renderSouls(ctx);
    this.renderGhost(ctx);
    for (const pt of this.particles) {
      ctx.globalAlpha = Math.min(1, pt.life * 2.5);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // 螢幕座標覆蓋層(玩家標籤)
    for (const p of this.players) {
      if (!p.alive()) continue;
      const sp = cam.worldToScreen(canvas, p.x, p.y - p.hh - 0.55);
      ctx.font = "bold 13px sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = p.id === 0 ? "#16161c" : "#f5f5f5";
      ctx.strokeStyle = p.id === 0 ? "#cfd6ff" : "#16161c";
      ctx.lineWidth = 3;
      ctx.strokeText(p.badge, sp.x, sp.y);
      ctx.fillText(p.badge, sp.x, sp.y);
    }
  }

  renderTiles(ctx, cam, canvas, s) {
    const lvl = this.level;
    const halfW = canvas.width / 2 / s, halfH = canvas.height / 2 / s;
    const x0 = Math.max(0, Math.floor(cam.x - halfW) - 1);
    const x1 = Math.min(lvl.width - 1, Math.ceil(cam.x + halfW) + 1);
    const y0 = Math.max(0, Math.floor(cam.y - halfH) - 1);
    const y1 = Math.min(lvl.height - 1, Math.ceil(cam.y + halfH) + 1);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const t = lvl.rawTile(tx, ty);
        if (t === T_SOLID) {
          ctx.fillStyle = "#8a5a33";
          ctx.fillRect(tx, ty, 1, 1);
          if (lvl.rawTile(tx, ty - 1) !== T_SOLID) {
            ctx.fillStyle = "#5cb85c";
            ctx.fillRect(tx, ty, 1, 0.28);
          }
        } else if (t === T_ONEWAY) {
          ctx.fillStyle = "#a67c52";
          ctx.fillRect(tx, ty, 1, 0.4);
          ctx.fillStyle = "#c69c6d";
          ctx.fillRect(tx, ty, 1, 0.12);
        } else if (t === T_BRIDGE) {
          ctx.fillStyle = "#8a6a3a";
          ctx.fillRect(tx, ty + 0.1, 1, 0.3);
          ctx.strokeStyle = "#6a4a22";
          ctx.lineWidth = 0.05;
          ctx.strokeRect(tx, ty + 0.1, 1, 0.3);
        } else if (t === T_SPIKE) {
          ctx.fillStyle = "#b8b8c8";
          ctx.beginPath();
          ctx.moveTo(tx, ty + 1);
          ctx.lineTo(tx + 0.25, ty + 0.15);
          ctx.lineTo(tx + 0.5, ty + 1);
          ctx.lineTo(tx + 0.75, ty + 0.15);
          ctx.lineTo(tx + 1, ty + 1);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }

  renderDoors(ctx) {
    for (const d of this.level.doors) {
      const def = d.def;
      // 門(往上滑開)
      const h = def.h * (1 - d.openness);
      if (h > 0.05) {
        ctx.fillStyle = "#666e7a";
        ctx.fillRect(def.x + 0.08, def.yTop, 0.84, h);
        ctx.fillStyle = "#8a93a2";
        ctx.fillRect(def.x + 0.2, def.yTop + 0.1, 0.6, Math.max(0, h - 0.2));
      }
      // 壓力板
      for (const [plate, pressed] of [[def.plateA, d.pressedA], [def.plateB, d.pressedB]]) {
        const py = plate.y + 0.5 - (pressed ? 0.1 : 0.22);
        ctx.fillStyle = pressed ? "#ffd75e" : "#c0c0d0";
        ctx.fillRect(plate.x - 0.55, py, 1.1, pressed ? 0.1 : 0.22);
        ctx.fillStyle = "#7a7a8a";
        ctx.fillRect(plate.x - 0.35, plate.y + 0.5 - 0.06, 0.7, 0.06);
      }
    }
  }

  renderCheckpoints(ctx) {
    for (const cp of this.level.checkpoints) {
      const gy = cp.y + 0.5;
      ctx.fillStyle = "#555";
      ctx.fillRect(cp.x - 0.05, gy - 2.2, 0.1, 2.2);
      ctx.fillStyle = cp.active ? "#4cd964" : "#9a9a9a";
      ctx.beginPath();
      ctx.moveTo(cp.x + 0.05, gy - 2.2);
      ctx.lineTo(cp.x + 0.9, gy - 1.95);
      ctx.lineTo(cp.x + 0.05, gy - 1.7);
      ctx.closePath();
      ctx.fill();
    }
  }

  renderGoal(ctx) {
    const g = this.level.goal;
    const gy = g.y + 0.5;
    // 安全等待區底色
    const z = this.level.goalZone;
    ctx.fillStyle = "rgba(120, 220, 140, 0.15)";
    ctx.fillRect(z.x0, z.y0, z.x1 - z.x0, z.y1 - z.y0);
    // 旗桿
    ctx.fillStyle = "#444";
    ctx.fillRect(g.x - 0.07, gy - 3.6, 0.14, 3.6);
    ctx.fillStyle = "#ffd75e";
    ctx.beginPath();
    ctx.arc(g.x, gy - 3.6, 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e64c4c";
    ctx.beginPath();
    ctx.moveTo(g.x + 0.07, gy - 3.4);
    ctx.lineTo(g.x + 1.3, gy - 3.0);
    ctx.lineTo(g.x + 0.07, gy - 2.6);
    ctx.closePath();
    ctx.fill();
  }

  renderBox(ctx, b) {
    const bob = b.used ? 0 : Math.sin(performance.now() / 400 + b.x) * 0.05;
    const y = b.y + bob - b.bump * 0.2;
    ctx.fillStyle = b.used ? "#8a8a8a" : "#e0a13a";
    ctx.fillRect(b.x - 0.42, y - 0.42, 0.84, 0.84);
    ctx.strokeStyle = b.used ? "#6a6a6a" : "#a06a1a";
    ctx.lineWidth = 0.07;
    ctx.strokeRect(b.x - 0.42, y - 0.42, 0.84, 0.84);
    if (!b.used) {
      ctx.fillStyle = "#fff8e0";
      ctx.font = "0.6px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("?", b.x, y + 0.22);
    }
  }

  renderItem(ctx, x, y, type, r) {
    if (type === "fire") {
      ctx.fillStyle = "#ff8c3a";
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ffd75e";
      ctx.beginPath(); ctx.arc(x, y + 0.05, r * 0.55, 0, Math.PI * 2); ctx.fill();
    } else if (type === "ice") {
      ctx.strokeStyle = "#8fdcff";
      ctx.lineWidth = 0.09;
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI) / 3;
        ctx.beginPath();
        ctx.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r);
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        ctx.stroke();
      }
    } else if (type === "potato") {
      ctx.fillStyle = "#c8964b";
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.75, 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#a5793a";
      ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.2, 0.05, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + r * 0.35, y + r * 0.15, 0.05, 0, Math.PI * 2); ctx.fill();
    } else if (type === "star") {
      ctx.fillStyle = "#ffd75e";
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 === 0 ? r : r * 0.45;
        ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      ctx.closePath(); ctx.fill();
    }
  }

  renderOnion(ctx, o) {
    ctx.save();
    ctx.translate(o.x, o.y);
    if (o.state === "dead") {
      ctx.globalAlpha = Math.max(0, o.deadT / 0.7);
      ctx.scale(1.3, 0.4);
    }
    const wob = o.state === "walk" ? Math.sin(o.anim * 10) * 0.06 : 0;
    ctx.fillStyle = "#f0e6c8";
    ctx.beginPath();
    ctx.ellipse(0, wob, o.hw, o.hh, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#c9b98a";
    ctx.lineWidth = 0.05;
    ctx.stroke();
    // 芽
    ctx.strokeStyle = "#5cb85c";
    ctx.lineWidth = 0.08;
    ctx.beginPath();
    ctx.moveTo(0, -o.hh + wob);
    ctx.quadraticCurveTo(0.15, -o.hh - 0.25, 0.05, -o.hh - 0.35);
    ctx.stroke();
    // 眼睛
    ctx.fillStyle = "#333";
    ctx.beginPath(); ctx.arc(-0.13 * o.dir * -1, -0.05 + wob, 0.06, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(0.13 * o.dir * -1 + 0.2 * o.dir, -0.05 + wob, 0.06, 0, Math.PI * 2); ctx.fill();
    if (o.state === "frozen") {
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = "#aadfff";
      ctx.fillRect(-o.hw - 0.1, -o.hh - 0.1, o.hw * 2 + 0.2, o.hh * 2 + 0.2);
    }
    ctx.restore();
  }

  renderBomb(ctx, bm) {
    if (bm.state === "done") return;
    const flash = bm.state === "fuse" && Math.floor(bm.fuseT * 8) % 2 === 0;
    ctx.fillStyle = flash ? "#e64c4c" : "#2a2a30";
    ctx.beginPath();
    ctx.arc(bm.x, bm.y, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#c9a227";
    ctx.lineWidth = 0.07;
    ctx.beginPath();
    ctx.moveTo(bm.x + 0.15, bm.y - 0.35);
    ctx.quadraticCurveTo(bm.x + 0.4, bm.y - 0.6, bm.x + 0.3, bm.y - 0.75);
    ctx.stroke();
    if (bm.state === "fuse") {
      ctx.fillStyle = "#ffd75e";
      ctx.beginPath();
      ctx.arc(bm.x + 0.3, bm.y - 0.75, 0.1 + Math.random() * 0.06, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  renderProjectile(ctx, pr) {
    ctx.fillStyle = pr.color();
    ctx.beginPath();
    ctx.arc(pr.x, pr.y, 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.beginPath();
    ctx.arc(pr.x, pr.y, 0.1, 0, Math.PI * 2);
    ctx.fill();
  }

  renderPlayer(ctx, p) {
    if (!p.alive()) return;
    // 重生保護:閃爍
    if (p.protectT > 0 && Math.floor(p.protectT * 10) % 2 === 0) return;
    ctx.save();
    ctx.translate(p.x, p.y);
    const r = p.hw;
    // 無敵星星:彩虹光環
    if (p.starT > 0) {
      const hue = (performance.now() / 3) % 360;
      ctx.strokeStyle = `hsl(${hue}, 90%, 60%)`;
      ctx.lineWidth = 0.12;
      ctx.beginPath(); ctx.arc(0, 0, r + 0.22, 0, Math.PI * 2); ctx.stroke();
    }
    // 能力光環
    if (p.power === "fire" || p.power === "ice") {
      ctx.strokeStyle = p.power === "fire" ? "rgba(255,140,58,0.8)" : "rgba(143,220,255,0.8)";
      ctx.lineWidth = 0.08;
      ctx.beginPath(); ctx.arc(0, 0, r + 0.12, 0, Math.PI * 2); ctx.stroke();
    }
    const sprite = p.characterImage;
    const size = p.power === "potato" ? 1.7 : 1.28;
    if (sprite && sprite.complete && sprite.naturalWidth > 0) {
      ctx.shadowColor = p.character.accent;
      ctx.shadowBlur = p.starT > 0 ? 0.22 : 0.08;
      ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
    } else {
      // 圖片尚未載入時保留原本球體，避免角色消失。
      ctx.fillStyle = p.colors.body;
      ctx.strokeStyle = p.colors.outline;
      ctx.lineWidth = 0.09;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  renderSouls(ctx) {
    for (const p of this.players) {
      if (!p.eliminated || !p.soul) continue;
      const bob = Math.sin(performance.now() / 300 + p.id) * 0.12;
      const sx = p.soul.x, sy = p.soul.y - 0.6 + bob;
      ctx.save();
      ctx.globalAlpha = 0.58;
      const sprite = p.characterImage;
      if (sprite && sprite.complete && sprite.naturalWidth > 0) {
        ctx.drawImage(sprite, sx - 0.46, sy - 0.46, 0.92, 0.92);
      } else {
        ctx.fillStyle = p.colors.body;
        ctx.strokeStyle = p.colors.outline;
        ctx.lineWidth = 0.07;
        ctx.beginPath(); ctx.arc(sx, sy, 0.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
      // 救援進度環
      const rc = this.reviveCtl;
      if (rc.activeSaviorId >= 0 && rc.progress > 0) {
        ctx.strokeStyle = "#4cd964";
        ctx.lineWidth = 0.1;
        ctx.beginPath();
        ctx.arc(sx, sy, 0.55, -Math.PI / 2, -Math.PI / 2 + (rc.progress / 2) * Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  renderGhost(ctx) {
    const g = this.ghost;
    if (!g.active || !g.ghosts.length) return;
    const blink = g.state === "warning" && Math.floor(performance.now() / 150) % 2 === 0;
    const sprite = g.sprite;
    for (const ghost of g.ghosts) {
      const bob = Math.sin(g.anim * 4.5 + ghost.phase) * 0.08;
      const size = g.typeKey === "black" ? 2.75 : 2.5;
      ctx.save();
      ctx.globalAlpha = blink ? 0.38 : 0.94;
      ctx.shadowColor = g.config.hudColor;
      ctx.shadowBlur = g.state === "chase" ? 0.32 : 0.18;
      if (sprite && sprite.complete && sprite.naturalWidth > 0) {
        ctx.drawImage(sprite, ghost.x - size / 2, ghost.y - size / 2 + bob, size, size);
      } else {
        ctx.fillStyle = g.config.hudColor;
        ctx.beginPath();
        ctx.arc(ghost.x, ghost.y + bob, 0.65, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}

// ============================================================
// Game:整體狀態機
// ============================================================
class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.state = "menu"; // menu | ranked | ready | controls | levels | settings | playing | paused | complete | gameover | allclear
    this.world = null;
    this.settings = this.loadSettings();
    this.selectedCharacters = this.settings.characters.slice();
    AUDIO.enabled = this.settings.sound;
    this.readyFlags = [false, false];
    this.readyCountdown = 0;
    this.selectedDifficulty = "easy";
    this.playMode = "normal";
    this.rankedMode = null;
    this.readyBackTarget = "menu";
    this.run = { levelIndex: levelIndexFor("easy", 1), difficultyKey: "easy", stage: 1, teamAccum: 0, playerCount: 2, playMode: "normal", rankedMode: null };
  }

  loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem("reae_settings") || "{}");
      const savedCharacters = Array.isArray(s.characters) ? s.characters : [];
      const characters = [
        CHARACTER_DEFS[savedCharacters[0]] ? savedCharacters[0] : "layer-cake",
        CHARACTER_DEFS[savedCharacters[1]] ? savedCharacters[1] : "dog",
      ];
      return { livesMode: s.livesMode || "reset", sound: s.sound !== false, characters };
    } catch (e) {
      return { livesMode: "reset", sound: true, characters: ["layer-cake", "dog"] };
    }
  }
  saveSettings() {
    try { localStorage.setItem("reae_settings", JSON.stringify(this.settings)); } catch (e) {}
    AUDIO.enabled = this.settings.sound;
  }
  unlockedLevels(difficultyKey) {
    const key = DIFFICULTY_MAP[difficultyKey] ? difficultyKey : this.selectedDifficulty;
    try {
      const progress = JSON.parse(localStorage.getItem("reae_unlocked_modes") || "{}");
      // 舊版的單一關卡進度會自動移轉到簡單模式。
      const legacy = key === "easy" ? parseInt(localStorage.getItem("reae_unlocked") || "1", 10) : 1;
      const n = Number(progress[key] || legacy || 1);
      return Math.max(1, Math.min(10, n));
    } catch (e) { return 1; }
  }
  unlockUpTo(difficultyKey, n) {
    const key = DIFFICULTY_MAP[difficultyKey] ? difficultyKey : "easy";
    try {
      const progress = JSON.parse(localStorage.getItem("reae_unlocked_modes") || "{}");
      progress[key] = Math.max(this.unlockedLevels(key), Math.min(10, n));
      localStorage.setItem("reae_unlocked_modes", JSON.stringify(progress));
    } catch (e) {}
  }

  cycleCharacter(playerId, direction) {
    const current = this.selectedCharacters[playerId];
    const currentIndex = Math.max(0, CHARACTER_KEYS.indexOf(current));
    const nextIndex = (currentIndex + direction + CHARACTER_KEYS.length) % CHARACTER_KEYS.length;
    this.selectedCharacters[playerId] = CHARACTER_KEYS[nextIndex];
    this.settings.characters = this.selectedCharacters.slice();
    this.saveSettings();
    UI.updateReady(this.readyFlags);
  }

  // ---------- 流程 ----------
  gotoMenu() {
    this.state = "menu";
    this.world = null;
    this.playMode = "normal";
    this.rankedMode = null;
    UI.showScreen("menu");
    UI.setHud(false);
  }
  activePlayerCount() { return this.playMode === "ranked" && this.rankedMode === "solo" ? 1 : 2; }
  openNormalReady() {
    this.playMode = "normal";
    this.rankedMode = null;
    this.readyBackTarget = "menu";
    this.openReady(levelIndexFor("easy", 1));
  }
  openNormalLevels() {
    this.playMode = "normal";
    this.rankedMode = null;
    this.openLevels();
  }
  openRankedMenu() {
    this.state = "ranked";
    this.world = null;
    UI.showScreen("ranked");
    UI.setHud(false);
    UI.refreshRanked();
  }
  beginRankedMode(mode) {
    this.playMode = "ranked";
    this.rankedMode = mode === "solo" ? "solo" : "multi";
    this.selectedDifficulty = "easy";
    this.openLevels();
  }
  backFromLevels() {
    if (this.playMode === "ranked") this.openRankedMenu();
    else this.gotoMenu();
  }
  backFromReady() {
    if (this.readyBackTarget === "levels") this.openLevels();
    else this.gotoMenu();
  }
  openReady(levelIndex) {
    const cameFromLevels = this.state === "levels";
    this.pendingLevel = levelIndex === undefined ? levelIndexFor("easy", 1) : levelIndex;
    const def = LEVELS[this.pendingLevel];
    if (def) this.selectedDifficulty = def.difficultyKey;
    this.readyBackTarget = cameFromLevels ? "levels" : this.readyBackTarget;
    this.readyFlags = [false, this.activePlayerCount() === 1];
    this.readyCountdown = 0;
    this.state = "ready";
    UI.showScreen("ready");
    UI.updateReady(this.readyFlags);
  }
  openControls() { this.state = "controls"; UI.showScreen("controls"); UI.refreshControls(); }
  openLevels() { this.state = "levels"; UI.showScreen("levels"); UI.buildLevelGrid(this); }
  selectDifficulty(difficultyKey) {
    if (!DIFFICULTY_MAP[difficultyKey]) return;
    this.selectedDifficulty = difficultyKey;
    UI.buildLevelGrid(this);
  }
  openSettings() { this.state = "settings"; UI.showScreen("settings"); UI.refreshSettings(this.settings); }

  startRun(levelIndex) {
    const def = LEVELS[levelIndex];
    const playerCount = this.activePlayerCount();
    this.run = {
      levelIndex,
      difficultyKey: def.difficultyKey,
      stage: def.stage,
      teamAccum: 0,
      playerCount,
      playMode: this.playMode,
      rankedMode: this.rankedMode,
    };
    this.startLevel(levelIndex, Array(playerCount).fill(5));
  }

  startLevel(levelIndex, livesArr) {
    this.run.levelIndex = levelIndex;
    this.world = new GameWorld(this, levelIndex, livesArr);
    this.state = "playing";
    UI.showScreen(null);
    UI.setHud(true);
  }

  restartLevel() {
    // 重新開始:所有參賽玩家恢復五條命、清除整個世界。
    this.startLevel(this.run.levelIndex, Array(this.run.playerCount).fill(5));
  }

  togglePause() {
    if (this.state === "playing") {
      this.state = "paused";
      UI.showScreen("pause");
    } else if (this.state === "paused") {
      this.state = "playing";
      UI.showScreen(null);
    }
  }

  onLevelComplete(result) {
    this.run.teamAccum += result.teamTotal;
    this.unlockUpTo(this.run.difficultyKey, this.run.stage + 1);
    if (this.run.playMode === "ranked") {
      const round = RankedManager.computeRound(this.world, result, this.run.rankedMode);
      result.ranked = { ...round, progress: RankedManager.addPoints(this.run.rankedMode, round.totalAward) };
    }
    this.state = "complete";
    const last = this.run.difficultyKey !== "endless" && this.run.stage >= 10;
    UI.showComplete(this.world, result, this.run, last);
  }

  onGameOver() {
    if (this.world && this.world.endlessRunner) {
      this.run.endlessResult = this.world.endlessRunner.finish();
    }
    this.state = "gameover";
    UI.showGameOver(this.world, this.run);
  }

  nextLevel() {
    const nextStage = this.run.stage + 1;
    if (this.run.difficultyKey !== "endless" && nextStage > 10) { this.gotoMenu(); return; }
    const next = levelIndexFor(this.run.difficultyKey, nextStage);
    let lives;
    if (this.settings.livesMode === "carry") {
      // 延續模式:存活者保留生命;淘汰者下一關以 3 條命回歸
      lives = this.world.players.map((p) => (p.eliminated ? 3 : p.lives));
    } else {
      lives = Array(this.run.playerCount).fill(5); // 預設:每關恢復五條命
    }
    this.run.stage = nextStage;
    this.startLevel(next, lives);
  }

  // ---------- 更新 ----------
  update(dt) {
    INPUT.poll();

    if (this.state === "ready") {
      const playerCount = this.activePlayerCount();
      for (let pid = 0; pid < playerCount; pid++) {
        if (!this.readyFlags[pid] && INPUT.readyPressed(pid)) {
          this.readyFlags[pid] = true;
          AUDIO.collect();
          UI.updateReady(this.readyFlags);
        }
      }
      if (this.readyFlags.slice(0, playerCount).every(Boolean)) {
        this.readyCountdown += dt;
        if (this.readyCountdown > 1) this.startRun(this.pendingLevel);
      }
      if (INPUT.consumePause()) this.backFromReady();
      return;
    }

    if (this.state === "playing") {
      if (INPUT.consumePause()) { this.togglePause(); return; }
      if (INPUT.consumeRestart()) { this.restartLevel(); return; }
      this.world.update(dt);
      UI.updateHUD(this);
      return;
    }

    if (this.state === "paused") {
      // 暫停:所有玩家/敵人/炸彈/鬼魂/投射物停止,UI 仍可操作
      if (INPUT.consumePause()) this.togglePause();
      return;
    }

    // 其他狀態消化掉輸入旗標
    INPUT.consumePause();
    INPUT.consumeRestart();
  }

  render() {
    const ctx = this.ctx;
    if (this.world) {
      this.world.render(ctx, this.canvas);
    } else {
      ctx.fillStyle = "#1b2340";
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }
}
