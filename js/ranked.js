"use strict";

// 排位由低到高：青銅 → 白銀 → 黃金 → 鑽石 → 王牌。
// 每階 4 顆星，每顆星需要 500 積分。
const RANK_STAR_POINTS = 500;
const RANK_STARS_PER_TIER = 4;
const RANK_TIER_POINTS = RANK_STAR_POINTS * RANK_STARS_PER_TIER;
const RANK_MAX_POINTS = RANK_TIER_POINTS * 5;

const RANK_TIERS = [
  { key: "bronze", name: "青銅", color: "#c2764e", dark: "#6d3524", glow: "rgba(194,118,78,.38)" },
  { key: "silver", name: "白銀", color: "#eef3fa", dark: "#8390a3", glow: "rgba(224,234,246,.34)" },
  { key: "gold", name: "黃金", color: "#ffc83d", dark: "#9a5b08", glow: "rgba(255,200,61,.38)" },
  { key: "diamond", name: "鑽石", color: "#61b8ff", dark: "#2355a8", glow: "rgba(79,167,255,.42)" },
  { key: "ace", name: "王牌", color: "#39e5ad", dark: "#08765b", glow: "rgba(57,229,173,.42)" },
];

const RANK_EMBLEMS = {
  bronze: `<svg viewBox="0 0 96 96" aria-hidden="true"><path d="M48 7 78 18v25c0 20-12 35-30 46C30 78 18 63 18 43V18L48 7Z" fill="currentColor" opacity=".28"/><path d="M48 13 72 22v21c0 15-8 28-24 38-16-10-24-23-24-38V22l24-9Z" fill="none" stroke="currentColor" stroke-width="6"/><path d="m48 26 7 12 14 3-10 10 2 14-13-6-13 6 2-14-10-10 14-3 7-12Z" fill="currentColor"/></svg>`,
  silver: `<svg viewBox="0 0 96 96" aria-hidden="true"><path d="M48 7 61 22l20 1-3 20 11 16-17 10-7 19-17-9-17 9-7-19L7 59l11-16-3-20 20-1L48 7Z" fill="currentColor" opacity=".25"/><path d="M48 15 59 28l17 2-4 16 9 13-14 7-6 15-13-8-13 8-6-15-14-7 9-13-4-16 17-2 11-13Z" fill="none" stroke="currentColor" stroke-width="5"/><circle cx="48" cy="49" r="15" fill="currentColor"/></svg>`,
  gold: `<svg viewBox="0 0 96 96" aria-hidden="true"><path d="m15 29 20 15 13-27 13 27 20-15-8 42H23l-8-42Z" fill="currentColor" opacity=".32"/><path d="m15 29 20 15 13-27 13 27 20-15-8 42H23l-8-42Z" fill="none" stroke="currentColor" stroke-width="6" stroke-linejoin="round"/><path d="M25 72h46v10H25z" fill="currentColor"/><circle cx="48" cy="53" r="7" fill="currentColor"/></svg>`,
  diamond: `<svg viewBox="0 0 96 96" aria-hidden="true"><path d="M21 25 37 9h22l16 16 10 17-37 45L11 42l10-17Z" fill="currentColor" opacity=".27"/><path d="m12 41 12-19h48l12 19-36 43-36-43Z" fill="none" stroke="currentColor" stroke-width="6" stroke-linejoin="round"/><path d="m25 24 23 60 23-60M13 41h70M48 12 25 41M48 12l23 29" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/></svg>`,
  ace: `<svg viewBox="0 0 96 96" aria-hidden="true"><path d="M48 7 77 21v24c0 20-11 34-29 44C30 79 19 65 19 45V21L48 7Z" fill="currentColor" opacity=".25"/><path d="M48 11 73 24v21c0 16-8 28-25 38-17-10-25-22-25-38V24l25-13Z" fill="none" stroke="currentColor" stroke-width="6"/><path d="m48 24 7 14 16 2-12 11 3 16-14-8-14 8 3-16-12-11 16-2 7-14Z" fill="currentColor"/></svg>`,
};

class RankedManager {
  static storageKey(mode) { return `reae_ranked_${mode === "solo" ? "solo" : "multi"}`; }

  static points(mode) {
    try {
      const value = Number(localStorage.getItem(this.storageKey(mode)) || 0);
      return Math.max(0, Math.min(RANK_MAX_POINTS, Number.isFinite(value) ? Math.round(value) : 0));
    } catch (e) { return 0; }
  }

  static setPoints(mode, points) {
    const value = Math.max(0, Math.min(RANK_MAX_POINTS, Math.round(points)));
    try { localStorage.setItem(this.storageKey(mode), String(value)); } catch (e) {}
    return value;
  }

  static rankFor(points) {
    const value = Math.max(0, Math.min(RANK_MAX_POINTS, Math.round(points)));
    const atMaximum = value >= RANK_MAX_POINTS;
    const totalStars = Math.floor(value / RANK_STAR_POINTS);
    const tierIndex = atMaximum ? RANK_TIERS.length - 1 : Math.min(RANK_TIERS.length - 1, Math.floor(totalStars / RANK_STARS_PER_TIER));
    const tier = RANK_TIERS[tierIndex];
    const stars = atMaximum ? RANK_STARS_PER_TIER : totalStars - tierIndex * RANK_STARS_PER_TIER;
    const tierBase = tierIndex * RANK_TIER_POINTS;
    const tierPoints = Math.max(0, value - tierBase);
    const pointsIntoStar = atMaximum ? RANK_STAR_POINTS : value % RANK_STAR_POINTS;
    return {
      points: value,
      tierIndex,
      tier,
      stars,
      tierPoints,
      tierProgress: atMaximum ? 1 : Math.min(1, tierPoints / RANK_TIER_POINTS),
      pointsIntoStar,
      pointsToNextStar: atMaximum ? 0 : RANK_STAR_POINTS - pointsIntoStar,
      atMaximum,
    };
  }

  static addPoints(mode, amount) {
    const before = this.points(mode);
    const after = this.setPoints(mode, before + Math.max(0, Math.round(amount)));
    return { before: this.rankFor(before), after: this.rankFor(after), added: after - before };
  }

  static computeRound(world, normalResult, mode) {
    if (mode === "solo") {
      return {
        mode,
        baseAward: normalResult.teamTotal,
        mvpBonus: 0,
        totalAward: normalResult.teamTotal,
        mvpId: null,
        breakdown: {
          originalScore: normalResult.teamTotal,
          kills: world.players[0].kills,
          lives: Math.max(0, world.players[0].lives),
          time: world.time,
        },
      };
    }

    const players = world.players;
    const kills = players.reduce((sum, player) => sum + player.kills, 0);
    const lives = players.reduce((sum, player) => sum + Math.max(0, player.lives), 0);
    const lifeRatio = Math.max(0, Math.min(1, lives / (players.length * 5)));
    const killRatio = Math.max(0, Math.min(1, kills / Math.max(1, world.initialEnemyCount)));
    const parTime = Math.max(1, world.level.def.parTime);
    const timeRatio = Math.max(0, Math.min(1, (parTime * 1.5 - world.time) / parTime));
    const lifeScore = Math.round(75 * lifeRatio);       // 總分 1/2
    const killScore = Math.round(45 * killRatio);       // 總分 30%
    const timeScore = Math.round(30 * timeRatio);       // 總分 20%
    const baseAward = Math.min(150, lifeScore + killScore + timeScore);
    const mvp = players.reduce((best, player) => {
      const performance = player.kills * 120 + player.score + Math.max(0, player.lives) * 50 - player.deaths * 80;
      return !best || performance > best.performance ? { player, performance } : best;
    }, null);

    return {
      mode,
      baseAward,
      mvpBonus: 10,
      totalAward: baseAward + 10,
      mvpId: mvp ? mvp.player.id : 0,
      breakdown: { lifeScore, killScore, timeScore, kills, lives, time: world.time },
    };
  }

  static emblem(tierKey) { return RANK_EMBLEMS[tierKey] || RANK_EMBLEMS.bronze; }
}
