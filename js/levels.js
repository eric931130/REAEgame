"use strict";
// ============================================================
// 十個基礎關卡定義，會依四種難度產生不同的地形與敵人配置。
// 所有關卡都以「兩名玩家同時遊玩」為前提:
//   平台寬度足夠兩人並排、終點前有安全等待區、
//   重要跳躍前有集合平地、鬼魂事件有逃跑路線。
// 座標單位 = 圖塊(tile)。y 向下遞增。
// ============================================================

const T_EMPTY = 0, T_SOLID = 1, T_ONEWAY = 2, T_BRIDGE = 3, T_SPIKE = 4;

class LevelBuilder {
  constructor(name, width, height, parTime, opts) {
    this.def = {
      name, parTime, width, height,
      livesMode: (opts && opts.livesMode) || null, // null = 依全域設定
      tiles: new Uint8Array(width * height),
      spawns: [null, null],
      goal: null,
      checkpoints: [],
      onions: [],
      bombs: [],
      boxes: [],
      doors: [],
    };
    this.gt = height - 2; // 地面頂端列
  }
  t(x, y, v) {
    const d = this.def;
    if (x >= 0 && y >= 0 && x < d.width && y < d.height) d.tiles[y * d.width + x] = v;
  }
  ground(x0, x1) { for (let x = x0; x <= x1; x++) { this.t(x, this.gt, T_SOLID); this.t(x, this.gt + 1, T_SOLID); } return this; }
  block(x, y, w, h) { for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) this.t(x + i, y + j, T_SOLID); return this; }
  platform(x, y, w) { for (let i = 0; i < w; i++) this.t(x + i, y, T_ONEWAY); return this; }
  bridge(x, y, w) { for (let i = 0; i < w; i++) this.t(x + i, y, T_BRIDGE); return this; }
  spikes(x0, x1, y) { const yy = y === undefined ? this.gt - 1 : y; for (let x = x0; x <= x1; x++) this.t(x, yy, T_SPIKE); return this; }
  spawn(x1, x2) {
    this.def.spawns[0] = { x: x1 + 0.5, y: this.gt - 0.5 };
    this.def.spawns[1] = { x: x2 + 0.5, y: this.gt - 0.5 };
    return this;
  }
  goal(x, standY) { this.def.goal = { x: x + 0.5, y: (standY === undefined ? this.gt - 1 : standY) + 0.5 }; return this; }
  checkpoint(x, standY) { this.def.checkpoints.push({ x: x + 0.5, y: (standY === undefined ? this.gt - 1 : standY) + 0.5 }); return this; }
  onion(x, standY) { this.def.onions.push({ x: x + 0.5, y: (standY === undefined ? this.gt - 1 : standY) + 0.5 }); return this; }
  bomb(x, standY) { this.def.bombs.push({ x: x + 0.5, y: (standY === undefined ? this.gt - 1 : standY) + 0.5 }); return this; }
  box(x, y, content) { this.def.boxes.push({ x: x + 0.5, y: y + 0.5, content, ghost: false }); return this; }
  ghostBox(x, y) { this.def.boxes.push({ x: x + 0.5, y: y + 0.5, content: null, ghost: true }); return this; }
  // 雙人壓力板門:門柱 2 格高 + 上方 3 格實心牆,兩塊壓力板。
  door(x, plateAx, plateBx) {
    this.block(x, this.gt - 5, 1, 3); // 門上方的牆
    this.def.doors.push({
      x, yTop: this.gt - 2, h: 2,
      plateA: { x: plateAx + 0.5, y: this.gt - 0.5 },
      plateB: { x: plateBx + 0.5, y: this.gt - 0.5 },
    });
    return this;
  }
  build() { return this.def; }
}

const BASE_LEVELS = [];

// ---------- 第 1 關:草原教學 ----------
BASE_LEVELS.push(new LevelBuilder("草原教學", 110, 14, 80)
  .ground(0, 63).ground(68, 109)
  .platform(38, 8, 10)
  .box(18, 9, "fire").box(30, 9, "ice").box(41, 5, "potato").box(78, 9, "star")
  .onion(24).onion(50).onion(74).onion(88)
  .checkpoint(58)
  .spawn(2, 4).goal(102)
  .build());

// ---------- 第 2 關:木橋與尖刺 ----------
BASE_LEVELS.push(new LevelBuilder("木橋與尖刺", 120, 14, 100)
  .ground(0, 29).bridge(30, 11, 6).ground(36, 69)
  .bridge(70, 11, 6).ground(76, 119)
  .spikes(55, 57)
  .platform(50, 9, 6)
  .box(12, 9, "fire").ghostBox(44, 9).box(85, 9, "ice").box(95, 9, "star")
  .onion(20).onion(48).onion(82).onion(92)
  .checkpoint(62)
  .spawn(2, 4).goal(112)
  .build());

// ---------- 第 3 關:雙人壓力板門 ----------
BASE_LEVELS.push(new LevelBuilder("雙人壓力板門", 120, 14, 110)
  .ground(0, 30).ground(35, 119)
  .platform(40, 9, 8)
  .door(70, 62, 66)
  .box(14, 9, "fire").box(24, 9, "potato").ghostBox(80, 9).box(95, 9, "ice")
  .onion(20).onion(44).onion(88).onion(100)
  .checkpoint(76)
  .spawn(2, 4).goal(112)
  .build());

// ---------- 第 4 關:炸彈地帶 ----------
BASE_LEVELS.push(new LevelBuilder("炸彈地帶", 125, 14, 120)
  .ground(0, 44).ground(50, 95).ground(100, 124)
  .platform(20, 9, 8).platform(65, 9, 8)
  .bomb(16).bomb(34).bomb(60).bomb(78).bomb(90).bomb(104)
  .onion(25).onion(55).onion(70).onion(85)
  .box(12, 9, "fire").ghostBox(52, 9).box(68, 6, "star").box(86, 9, "ice")
  .checkpoint(58)
  .spawn(2, 4).goal(118)
  .build());

// ---------- 第 5 關:高塔攀爬 ----------
BASE_LEVELS.push(new LevelBuilder("高塔攀爬", 60, 26, 130)
  .ground(0, 59)
  .platform(8, 21, 14)
  .platform(26, 18, 14)
  .platform(8, 15, 14)
  .platform(26, 12, 14)
  .platform(8, 9, 14)
  .platform(26, 6, 20)
  .box(12, 18, "fire").box(32, 15, "ice").ghostBox(30, 9).box(12, 6, "star")
  .onion(20).onion(40).onion(30, 17).onion(12, 14)
  .checkpoint(30, 11)
  .spawn(2, 4).goal(40, 5)
  .build());

// ---------- 第 6 關:幽靈木橋 ----------
BASE_LEVELS.push(new LevelBuilder("幽靈木橋", 140, 14, 130)
  .ground(0, 9).bridge(10, 11, 6).ground(16, 79)
  .bridge(80, 11, 6).ground(86, 139)
  .platform(60, 9, 8)
  .door(50, 42, 46)
  .ghostBox(28, 9).ghostBox(95, 9)
  .box(8, 9, "fire").box(64, 9, "ice").box(105, 9, "star").box(115, 9, "potato")
  .onion(22).onion(35).onion(66).onion(100).onion(110)
  .checkpoint(58).checkpoint(120)
  .spawn(2, 4).goal(132)
  .build());

// ---------- 第 7 關:尖刺長廊 ----------
BASE_LEVELS.push(new LevelBuilder("尖刺長廊", 125, 14, 130)
  .ground(0, 124)
  .spikes(18, 20).spikes(34, 37).spikes(52, 54).spikes(68, 71).spikes(88, 90).spikes(100, 102)
  .platform(32, 9, 8).platform(66, 9, 8).platform(98, 9, 8)
  .box(10, 9, "star").box(44, 9, "fire").ghostBox(60, 9).box(80, 9, "ice").box(110, 9, "potato")
  .onion(26).onion(46).onion(78).onion(95)
  .checkpoint(58)
  .spawn(2, 4).goal(118)
  .build());

// ---------- 第 8 關:洋蔥大軍 ----------
BASE_LEVELS.push(new LevelBuilder("洋蔥大軍", 130, 14, 140)
  .ground(0, 36).ground(41, 129)
  .platform(20, 9, 10).platform(60, 9, 10).platform(88, 9, 10)
  .onion(12).onion(18).onion(24).onion(30).onion(50).onion(56).onion(62)
  .onion(75).onion(82).onion(90).onion(98).onion(105)
  .bomb(45).bomb(70)
  .box(8, 9, "fire").box(14, 9, "ice").ghostBox(58, 9).box(86, 9, "star").box(100, 9, "potato")
  .checkpoint(66)
  .spawn(2, 4).goal(122)
  .build());

// ---------- 第 9 關:雙板連動 ----------
BASE_LEVELS.push(new LevelBuilder("雙板連動", 135, 14, 150)
  .ground(0, 42).ground(47, 134)
  .platform(55, 9, 8).platform(100, 9, 8)
  .door(26, 18, 22).door(90, 82, 86)
  .ghostBox(60, 9).ghostBox(110, 9)
  .bomb(52).bomb(74)
  .onion(12).onion(34).onion(56).onion(70).onion(100).onion(108)
  .box(8, 9, "ice").box(38, 9, "fire").box(64, 9, "star").box(116, 9, "potato")
  .checkpoint(32).checkpoint(96)
  .spawn(2, 4).goal(128)
  .build());

// ---------- 第 10 關:最終試煉 ----------
BASE_LEVELS.push(new LevelBuilder("最終試煉", 160, 14, 200)
  .ground(0, 34).bridge(35, 11, 5).ground(40, 89).ground(95, 159)
  .spikes(24, 26).spikes(70, 73).spikes(120, 123)
  .platform(22, 9, 8).platform(68, 9, 8).platform(118, 9, 8)
  .door(60, 52, 56)
  .bomb(46).bomb(78).bomb(105).bomb(130)
  .onion(15).onion(30).onion(48).onion(66).onion(84).onion(100).onion(112).onion(126).onion(138)
  .ghostBox(20, 9).ghostBox(102, 9)
  .box(10, 9, "fire").box(44, 9, "ice").box(75, 9, "star").box(98, 9, "potato").box(135, 9, "fire")
  .checkpoint(64).checkpoint(116)
  .spawn(2, 4).goal(152)
  .build());

// ============================================================
// 難度系統
// 每個難度先提供 10 關。無盡模式通過第 10 關後，會沿用同一套規則
// 產生第 11 關以後的地圖，幽靈與小怪密度也會持續上升。
// ============================================================
const DIFFICULTIES = [
  {
    key: "easy", name: "簡單", icon: "🌱", color: "#63e6a6",
    summary: "安全地形較多，適合熟悉合作操作",
    ghostChance: 0.20, enemyMultiplier: 0.70, extraEnemies: 0,
    minGhosts: 0, maxGhosts: 1, mapTier: 0,
  },
  {
    key: "expert", name: "專家", icon: "⚡", color: "#72b7ff",
    summary: "追加浮台與陷阱，敵人會更密集",
    ghostChance: 0.45, enemyMultiplier: 1.25, extraEnemies: 1,
    minGhosts: 0, maxGhosts: 2, mapTier: 1,
  },
  {
    key: "hard", name: "困難", icon: "🔥", color: "#ff7b69",
    summary: "危險橋面、更多小怪與高機率幽靈",
    ghostChance: 0.75, enemyMultiplier: 1.70, extraEnemies: 2,
    minGhosts: 1, maxGhosts: 3, mapTier: 2,
  },
  {
    key: "endless", name: "無盡", icon: "∞", color: "#cf8cff",
    summary: "自動向前、沒有終點，距離越遠節奏越快",
    ghostChance: 0.85, enemyMultiplier: 1.85, extraEnemies: 3,
    minGhosts: 1, maxGhosts: 4, mapTier: 3,
  },
];

function createEndlessRunnerLevel(stage) {
  const width = 192;
  const height = 14;
  const gt = height - 2;
  const tiles = new Uint8Array(width * height);
  for (let x = 0; x < 28; x++) {
    tiles[gt * width + x] = T_SOLID;
    tiles[(gt + 1) * width + x] = T_SOLID;
  }
  return {
    name: "無限奔跑", parTime: 0, width, height, livesMode: null, tiles,
    spawns: [{ x: 3.5, y: gt - 0.5 }, { x: 5.5, y: gt - 0.5 }],
    goal: { x: 1000000, y: gt - 0.5 },
    checkpoints: [], onions: [], bombs: [], boxes: [], doors: [],
    difficultyKey: "endless", difficultyName: "無盡", stage,
    endless: true, endlessRunner: true,
    enemyTarget: 0, ghostBoxCount: 0, ghostChance: 0.85,
  };
}

const DIFFICULTY_MAP = Object.fromEntries(DIFFICULTIES.map((d) => [d.key, d]));
const LEVELS = [];
const LEVEL_GROUPS = Object.fromEntries(DIFFICULTIES.map((d) => [d.key, []]));

function seededRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clonePoint(point) { return point ? { ...point } : null; }
function cloneLevel(base) {
  return {
    ...base,
    tiles: new Uint8Array(base.tiles),
    spawns: base.spawns.map(clonePoint),
    goal: clonePoint(base.goal),
    checkpoints: base.checkpoints.map(clonePoint),
    onions: base.onions.map(clonePoint),
    bombs: base.bombs.map(clonePoint),
    boxes: base.boxes.map((box) => ({ ...box })),
    doors: base.doors.map((door) => ({
      ...door,
      plateA: clonePoint(door.plateA),
      plateB: clonePoint(door.plateB),
    })),
  };
}

function isProtectedX(def, x, radius) {
  const objects = [
    ...def.spawns.filter(Boolean), def.goal,
    ...def.checkpoints, ...def.doors.flatMap((door) => [door.plateA, door.plateB, { x: door.x }]),
  ].filter(Boolean);
  return objects.some((obj) => Math.abs(obj.x - x) < radius);
}

function canUseGround(def, x, width) {
  const gt = def.height - 2;
  if (x < 9 || x + width >= def.width - 7 || isProtectedX(def, x + width / 2, width + 2)) return false;
  for (let i = 0; i < width; i++) {
    const xx = x + i;
    if (def.tiles[gt * def.width + xx] !== T_SOLID) return false;
    if (def.tiles[(gt - 1) * def.width + xx] !== T_EMPTY) return false;
  }
  return true;
}

function findGroundSection(def, random, width) {
  for (let tries = 0; tries < 80; tries++) {
    const x = 9 + Math.floor(random() * Math.max(1, def.width - width - 17));
    if (canUseGround(def, x, width)) return x;
  }
  return null;
}

function setTile(def, x, y, value) {
  if (x >= 0 && y >= 0 && x < def.width && y < def.height) def.tiles[y * def.width + x] = value;
}

function varyMap(def, tier, stage, random) {
  const gt = def.height - 2;

  if (tier === 0) {
    // 簡單模式移除約一半尖刺，並加上安全的中繼浮台。
    let spikeNumber = 0;
    for (let i = 0; i < def.tiles.length; i++) {
      if (def.tiles[i] === T_SPIKE && spikeNumber++ % 2 === 0) def.tiles[i] = T_EMPTY;
    }
    const x = findGroundSection(def, random, 7);
    if (x !== null) for (let i = 0; i < 7; i++) setTile(def, x + i, gt - 3, T_ONEWAY);
    return;
  }

  const platformCount = tier + Math.floor((stage - 1) / 5);
  for (let n = 0; n < platformCount; n++) {
    const width = 4 + Math.floor(random() * 4);
    const x = findGroundSection(def, random, width);
    if (x !== null) for (let i = 0; i < width; i++) setTile(def, x + i, gt - 3 - (n % 2), T_ONEWAY);
  }

  const spikePatches = tier + Math.floor(stage / 4);
  for (let n = 0; n < spikePatches; n++) {
    const width = tier >= 3 && n % 2 === 0 ? 3 : 2;
    const x = findGroundSection(def, random, width);
    if (x !== null) for (let i = 0; i < width; i++) setTile(def, x + i, gt - 1, T_SPIKE);
  }

  // 困難以上會將部分平地換成仍可通過、但更容易失足的窄橋。
  const bridgeCount = Math.max(0, tier - 1) + (tier >= 3 ? Math.floor(stage / 6) : 0);
  for (let n = 0; n < bridgeCount; n++) {
    const width = 3;
    const x = findGroundSection(def, random, width);
    if (x === null) continue;
    for (let i = 0; i < width; i++) {
      setTile(def, x + i, gt, T_EMPTY);
      setTile(def, x + i, gt + 1, T_EMPTY);
      setTile(def, x + i, gt - 1, T_BRIDGE);
    }
  }
}

function enemySpawnCandidates(def) {
  const candidates = [];
  for (let y = 2; y < def.height; y++) {
    for (let x = 8; x < def.width - 6; x++) {
      const surface = def.tiles[y * def.width + x];
      const above = def.tiles[(y - 1) * def.width + x];
      if (![T_SOLID, T_ONEWAY, T_BRIDGE].includes(surface) || above !== T_EMPTY) continue;
      if (isProtectedX(def, x + 0.5, 3.5)) continue;
      candidates.push({ x: x + 0.5, y: y - 0.5 });
    }
  }
  return candidates;
}

function scaleEnemies(def, difficulty, stage, random) {
  const target = difficulty.key === "endless"
    ? Math.min(36, 8 + stage * 2)
    : Math.min(36, Math.max(2, Math.round(
      def.onions.length * difficulty.enemyMultiplier + difficulty.extraEnemies + Math.floor(stage / 4)
    )));

  if (def.onions.length > target) def.onions = def.onions.slice(0, target);
  const minSpacing = difficulty.key === "endless" ? 1.7 : difficulty.key === "hard" ? 2.2 : difficulty.key === "expert" ? 2.8 : 3.2;
  const candidates = enemySpawnCandidates(def);
  let attempts = 0;
  while (def.onions.length < target && attempts++ < 1000) {
    const position = candidates[Math.floor(random() * candidates.length)];
    if (!position) break;
    if (def.onions.some((enemy) => Math.abs(enemy.x - position.x) < minSpacing && Math.abs(enemy.y - position.y) < 1.4)) continue;
    def.onions.push({ ...position });
  }
  def.enemyTarget = def.onions.length;
}

function scaleGhostBoxes(def, difficulty, stage, random) {
  const endlessBonus = difficulty.key === "endless" ? Math.min(0.10, stage * 0.005) : 0;
  const chance = Math.min(0.95, difficulty.ghostChance + endlessBonus);
  let ghosts = def.boxes.filter((box) => box.ghost && random() < chance);
  const regular = def.boxes.filter((box) => !box.ghost);
  const maxGhosts = Math.min(7, difficulty.maxGhosts + (difficulty.key === "endless" ? Math.floor((stage - 1) / 5) : 0));
  const candidates = [0.23, 0.38, 0.53, 0.68, 0.82, 0.91];

  for (const ratio of candidates) {
    if (ghosts.length >= maxGhosts) break;
    if (random() > chance) continue;
    const x = Math.floor(def.width * ratio) + 0.5;
    if (isProtectedX(def, x, 4) || ghosts.some((box) => Math.abs(box.x - x) < 7)) continue;
    ghosts.push({ x, y: def.height - 4.5, content: null, ghost: true });
  }
  while (ghosts.length < difficulty.minGhosts) {
    const ratio = candidates[ghosts.length % candidates.length];
    ghosts.push({ x: Math.floor(def.width * ratio) + 0.5, y: def.height - 4.5, content: null, ghost: true });
  }
  def.boxes = [...regular, ...ghosts.slice(0, maxGhosts)];
  def.ghostChance = chance;
  def.ghostBoxCount = Math.min(ghosts.length, maxGhosts);
}

function createDifficultyLevel(difficulty, stage) {
  if (difficulty.key === "endless") return createEndlessRunnerLevel(stage);
  const base = BASE_LEVELS[(stage - 1) % BASE_LEVELS.length];
  const def = cloneLevel(base);
  const difficultyNumber = DIFFICULTIES.findIndex((d) => d.key === difficulty.key) + 1;
  const random = seededRandom(difficultyNumber * 100000 + stage * 9973);
  const cycle = Math.floor((stage - 1) / BASE_LEVELS.length);

  def.difficultyKey = difficulty.key;
  def.difficultyName = difficulty.name;
  def.stage = stage;
  def.endless = difficulty.key === "endless";
  def.name = cycle > 0 ? `${base.name}・循環 ${cycle + 1}` : base.name;
  def.parTime = Math.round(base.parTime * (difficulty.key === "easy" ? 1.18 : 1 + cycle * 0.08));
  varyMap(def, difficulty.mapTier, stage, random);
  scaleEnemies(def, difficulty, stage, random);
  scaleGhostBoxes(def, difficulty, stage, random);
  return def;
}

function registerDifficultyLevel(difficulty, stage) {
  const def = createDifficultyLevel(difficulty, stage);
  const index = LEVELS.length;
  LEVELS.push(def);
  LEVEL_GROUPS[difficulty.key][stage - 1] = index;
  return index;
}

for (const difficulty of DIFFICULTIES) {
  for (let stage = 1; stage <= 10; stage++) registerDifficultyLevel(difficulty, stage);
}

function ensureEndlessLevel(stage) {
  const normalizedStage = Math.max(1, Math.floor(stage));
  if (LEVEL_GROUPS.endless[normalizedStage - 1] === undefined) {
    registerDifficultyLevel(DIFFICULTY_MAP.endless, normalizedStage);
  }
  return LEVEL_GROUPS.endless[normalizedStage - 1];
}

function levelIndexFor(difficultyKey, stage) {
  const key = DIFFICULTY_MAP[difficultyKey] ? difficultyKey : "easy";
  const normalizedStage = Math.max(1, Math.floor(stage));
  if (key === "endless") return ensureEndlessLevel(normalizedStage);
  return LEVEL_GROUPS[key][Math.min(10, normalizedStage) - 1];
}
