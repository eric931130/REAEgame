"use strict";

// 類似離線小恐龍的無終點跑酷控制器：玩家自動向右，地圖分段生成，
// 距離會同時提高跑速、障礙密度、敵人數量與幽靈事件頻率。
class EndlessRunnerController {
  constructor(world) {
    this.world = world;
    this.startX = Math.min(...world.players.map((player) => player.x));
    this.distance = 0;
    this.bestDistance = this.loadBest();
    this.runSpeed = 6.4;
    this.intensity = 0;
    this.paceTier = 1;
    this.generatedTo = 27;
    this.lastScoredMark = 0;
    this.nextCheckpoint = 100;
    this.nextGhostDistance = 145;
    this.lastCleanupDistance = 0;
    this.random = seededRandom((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0);
    this.generateUntil(170);
  }

  storageKey() {
    return `reae_endless_best_${this.world.players.length === 1 ? "solo" : "multi"}`;
  }

  loadBest() {
    try { return Math.max(0, Number(localStorage.getItem(this.storageKey())) || 0); }
    catch (error) { return 0; }
  }

  saveBest() {
    if (this.distance <= this.bestDistance) return;
    this.bestDistance = Math.floor(this.distance);
    try { localStorage.setItem(this.storageKey(), String(this.bestDistance)); }
    catch (error) {}
  }

  finish() {
    this.saveBest();
    return { distance: Math.floor(this.distance), bestDistance: this.bestDistance };
  }

  leader() {
    const alive = this.world.players.filter((player) => player.alive());
    return (alive.length ? alive : this.world.players).reduce((best, player) =>
      !best || player.x > best.x ? player : best, null);
  }

  update(dt) {
    if (this.world.state !== "playing") return;
    const leader = this.leader();
    if (!leader) return;
    this.distance = Math.max(this.distance, leader.x - this.startX);
    this.intensity = Math.min(1, this.distance / 1600);
    this.paceTier = 1 + Math.floor(this.distance / 250);
    this.runSpeed = Math.min(13.5, 6.4 + this.distance / 230);

    this.generateUntil(Math.floor(leader.x + 130));
    this.awardDistanceScore();
    this.updateCheckpoint(leader);
    this.updateGhostRhythm(leader);
    if (this.distance - this.lastCleanupDistance >= 120) {
      this.cleanup(leader.x - 70);
      this.lastCleanupDistance = this.distance;
      this.saveBest();
    }
  }

  ensureCapacity(targetX) {
    if (targetX < this.world.level.width - 8) return;
    const nextWidth = Math.ceil((targetX + 96) / 192) * 192;
    this.world.level.extendWidth(nextWidth);
  }

  ground(x0, x1) {
    const level = this.world.level;
    const gt = level.height - 2;
    this.ensureCapacity(x1 + 2);
    for (let x = x0; x <= x1; x++) {
      level.setTile(x, gt, T_SOLID);
      level.setTile(x, gt + 1, T_SOLID);
    }
  }

  clearGround(x0, x1) {
    const level = this.world.level;
    const gt = level.height - 2;
    for (let x = x0; x <= x1; x++) {
      level.setTile(x, gt, T_EMPTY);
      level.setTile(x, gt + 1, T_EMPTY);
    }
  }

  generateUntil(targetX) {
    const level = this.world.level;
    const gt = level.height - 2;
    while (this.generatedTo < targetX) {
      const x = this.generatedTo + 1;
      const distance = Math.max(0, x - this.startX);
      const intensity = Math.min(1, distance / 1600);
      const safeLength = Math.max(4, 9 - Math.floor(intensity * 4)) + Math.floor(this.random() * 5);
      const segmentEnd = x + safeLength;
      this.ground(x, segmentEnd);

      if (this.random() < 0.12 + intensity * 0.24) {
        const platformWidth = 3 + Math.floor(this.random() * 4);
        const platformX = x + 1 + Math.floor(this.random() * Math.max(1, safeLength - platformWidth));
        const platformY = gt - 3 - (this.random() < intensity * 0.35 ? 1 : 0);
        for (let i = 0; i < platformWidth; i++) level.setTile(platformX + i, platformY, T_ONEWAY);
      }

      const hazardChance = 0.38 + intensity * 0.46;
      if (this.random() < hazardChance) {
        const hazardX = segmentEnd + 1;
        const kind = this.random();
        if (kind < 0.20 + intensity * 0.08) {
          const gap = 1 + Math.floor(this.random() * (intensity > 0.45 ? 3 : 2));
          this.ground(hazardX, hazardX + gap - 1);
          this.clearGround(hazardX, hazardX + gap - 1);
          this.generatedTo = hazardX + gap - 1;
        } else if (kind < 0.55) {
          const spikeCount = 1 + Math.floor(this.random() * (intensity > 0.55 ? 3 : 2));
          this.ground(hazardX, hazardX + spikeCount - 1);
          for (let i = 0; i < spikeCount; i++) level.setTile(hazardX + i, gt - 1, T_SPIKE);
          this.generatedTo = hazardX + spikeCount - 1;
        } else if (kind < 0.87) {
          this.ground(hazardX, hazardX + 3);
          const pack = 1 + Math.floor(this.random() * (1 + Math.floor(intensity * 3)));
          for (let i = 0; i < pack; i++) {
            this.world.onions.push(new Onion({ x: hazardX + i * 1.35 + 0.5, y: gt - 0.5 }));
          }
          this.world.initialEnemyCount += pack;
          this.generatedTo = hazardX + Math.max(3, Math.ceil(pack * 1.35));
        } else {
          this.ground(hazardX, hazardX + 2);
          this.world.bombs.push(new Bomb({ x: hazardX + 0.5, y: gt - 0.5 }));
          this.generatedTo = hazardX + 2;
        }
      } else {
        this.generatedTo = segmentEnd;
      }

      if (Math.floor(distance / 70) !== Math.floor((distance - safeLength) / 70)) {
        const contents = ["fire", "ice", "potato", "star"];
        this.world.boxes.push(new ItemBox({
          x: x + Math.min(3, safeLength - 1) + 0.5,
          y: gt - 2.5,
          content: contents[Math.floor(this.random() * contents.length)],
          ghost: false,
        }));
      }
    }
  }

  awardDistanceScore() {
    const mark = Math.floor(this.distance / 10) * 10;
    if (mark <= this.lastScoredMark) return;
    const gained = mark - this.lastScoredMark;
    for (const player of this.world.players) {
      if (!player.eliminated) player.score += gained;
    }
    this.lastScoredMark = mark;
  }

  updateCheckpoint(leader) {
    if (this.distance < this.nextCheckpoint) return;
    const spot = findSafeSpot(this.world, leader.x - 2, leader.y, { avoidGoal: false }) ||
      { x: leader.x, y: leader.y };
    const checkpoint = { x: spot.x, y: spot.y, active: true };
    this.world.level.checkpoints = [checkpoint];
    this.world.activeCheckpoint = { x: checkpoint.x, y: checkpoint.y };
    this.nextCheckpoint += 100;
    AUDIO.checkpoint();
    this.world.ui.flashBanner(`距離 ${Math.floor(this.distance)}m｜節奏提升！`, 1.2);
  }

  updateGhostRhythm(leader) {
    if (this.distance < this.nextGhostDistance || this.world.ghost.active) return;
    const blackChance = Math.min(0.42, Math.max(0, (this.distance - 650) / 1800));
    const purpleChance = Math.min(0.48, 0.18 + this.distance / 4000);
    const roll = this.random();
    const type = roll < blackChance ? "black" : (roll < blackChance + purpleChance ? "purple" : "gold");
    this.world.ghost.trigger(leader.x + 9, Math.max(3, leader.y - 3), leader.id, type);
    const interval = Math.max(48, 125 - this.distance / 18);
    this.nextGhostDistance += interval + this.random() * 28;
  }

  cleanup(cutoffX) {
    this.world.onions = this.world.onions.filter((entity) => entity.x >= cutoffX && entity.state !== "dead");
    this.world.bombs = this.world.bombs.filter((entity) => entity.x >= cutoffX && entity.state !== "done");
    this.world.boxes = this.world.boxes.filter((entity) => entity.x >= cutoffX && !entity.used);
    this.world.droppedItems = this.world.droppedItems.filter((entity) => entity.x >= cutoffX && !entity.collected);
    this.world.projectiles = this.world.projectiles.filter((entity) => entity.x >= cutoffX && !entity.dead);
  }
}
