"use strict";
// ============================================================
// PlayerUIController / MultiplayerHUDController:
// 左上 P1、右上 P2、中上團隊資訊,以及所有選單畫面。
// ============================================================

const UI = {
  banner: { text: "", t: 0 },

  $(id) { return document.getElementById(id); },

  init(game) {
    this.game = game;
    const $ = (id) => document.getElementById(id);

    // 主選單
    $("btn-start").onclick = () => game.openNormalReady();
    $("btn-ranked").onclick = () => game.openRankedMenu();
    $("btn-controls").onclick = () => game.openControls();
    $("btn-levels").onclick = () => game.openNormalLevels();
    $("btn-settings").onclick = () => game.openSettings();
    $("btn-quit").onclick = () => {
      window.close();
      this.flashBanner("請直接關閉瀏覽器分頁", 2);
      alert("感謝遊玩!請直接關閉瀏覽器分頁。");
    };

    // 準備畫面
    $("btn-ready-start").onclick = () => game.startRun(game.pendingLevel);
    $("btn-ready-back").onclick = () => game.backFromReady();
    for (const pid of [0, 1]) {
      const key = pid === 0 ? "p1" : "p2";
      $(`character-prev-${key}`).onclick = () => game.cycleCharacter(pid, -1);
      $(`character-next-${key}`).onclick = () => game.cycleCharacter(pid, 1);
    }

    // 排位模式
    $("btn-ranked-solo").onclick = () => game.beginRankedMode("solo");
    $("btn-ranked-multi").onclick = () => game.beginRankedMode("multi");
    $("btn-ranked-back").onclick = () => game.gotoMenu();

    // 控制設定
    $("btn-controls-back").onclick = () => game.gotoMenu();
    $("device-p1").onchange = (e) => { INPUT.setDevice(0, e.target.value); this.refreshControls(); };
    $("device-p2").onchange = (e) => { INPUT.setDevice(1, e.target.value); this.refreshControls(); };

    // 關卡選擇 / 設定
    $("btn-levels-back").onclick = () => game.backFromLevels();
    $("btn-settings-back").onclick = () => game.gotoMenu();
    $("setting-lives-mode").onchange = (e) => { game.settings.livesMode = e.target.value; game.saveSettings(); };
    $("setting-sound").onchange = (e) => { game.settings.sound = e.target.value === "on"; game.saveSettings(); };

    // 暫停
    $("btn-resume").onclick = () => game.togglePause();
    $("btn-pause-restart").onclick = () => { game.restartLevel(); };
    $("btn-pause-menu").onclick = () => game.gotoMenu();

    // 結算
    $("btn-next-level").onclick = () => game.nextLevel();
    $("btn-complete-menu").onclick = () => game.gotoMenu();
    $("btn-allclear-menu").onclick = () => game.gotoMenu();
    $("btn-retry").onclick = () => game.restartLevel();
    $("btn-gameover-menu").onclick = () => game.gotoMenu();

    // 手把熱插拔提示
    window.addEventListener("gamepadconnected", () => this.refreshControls());
    window.addEventListener("gamepaddisconnected", () => this.refreshControls());
  },

  screens: ["menu", "ranked", "ready", "controls", "levels", "settings", "pause", "complete", "allclear", "gameover"],
  showScreen(name) {
    for (const s of this.screens) {
      this.$("screen-" + s).classList.toggle("hidden", s !== name);
    }
  },
  setHud(v) { this.$("hud").classList.toggle("hidden", !v); },

  flashBanner(text, dur) {
    this.banner.text = text;
    this.banner.t = dur;
  },

  // ---------- 準備畫面 ----------
  updateReady(flags) {
    const solo = this.game.activePlayerCount() === 1;
    this.$("ready-title").textContent = solo ? "單人排位準備" : this.game.playMode === "ranked" ? "多人排位準備" : "雙人準備確認";
    this.$("ready-card-p2").classList.toggle("hidden", solo);
    const level = LEVELS[this.game.pendingLevel];
    if (level) {
      this.$("ready-level-info").textContent =
        `${level.difficultyName}｜第 ${level.stage} 關・${level.name}`;
    }
    for (const pid of [0, 1]) {
      const key = pid === 0 ? "p1" : "p2";
      const card = this.$(`ready-card-${key}`);
      const state = this.$(`ready-state-${key}`);
      const dev = this.$(`ready-device-${key}`);
      const hint = this.$(`ready-hint-${key}`);
      const selected = this.game.selectedCharacters[pid];
      const character = characterDef(selected);
      const image = this.$(`ready-character-img-${key}`);
      image.src = character.image;
      image.alt = `${pid === 0 ? "P1" : "P2"} ${character.name}`;
      this.$(`ready-character-name-${key}`).textContent = character.name;
      card.classList.toggle("is-ready", flags[pid]);
      state.textContent = flags[pid] ? "已準備!" : "未準備";
      dev.textContent = INPUT.deviceNameOf(pid);
      const d = INPUT.deviceOf(pid);
      hint.textContent = flags[pid] ? "等待開始…" :
        d === "keyboardL" ? "按 F 或 E 準備" :
        d === "keyboardR" ? "按 右Ctrl 或 右Shift 準備" : "按手把任意動作鍵準備";
    }
    const btn = this.$("btn-ready-start");
    const ready = flags.slice(0, solo ? 1 : 2).every(Boolean);
    btn.disabled = !ready;
    btn.textContent = ready ? (this.game.playMode === "ranked" ? "開始排位賽!" : "開始遊戲!") : solo ? "開始遊戲(P1 需準備)" : "開始遊戲(需雙方準備)";
  },

  // ---------- 排位模式 ----------
  refreshRanked() {
    for (const mode of ["solo", "multi"]) {
      const rank = RankedManager.rankFor(RankedManager.points(mode));
      const card = this.$(`rank-card-${mode}`);
      card.style.setProperty("--rank-color", rank.tier.color);
      card.style.setProperty("--rank-dark", rank.tier.dark);
      card.style.setProperty("--rank-glow", rank.tier.glow);
      this.$(`rank-emblem-${mode}`).innerHTML = RankedManager.emblem(rank.tier.key);
      this.$(`rank-name-${mode}`).textContent = rank.tier.name;
      this.$(`rank-stars-${mode}`).textContent = "★".repeat(rank.stars) + "☆".repeat(RANK_STARS_PER_TIER - rank.stars);
      this.$(`rank-points-${mode}`).textContent = `${rank.points.toLocaleString()} 積分`;
      this.$(`rank-progress-${mode}`).style.width = `${rank.tierProgress * 100}%`;
      this.$(`rank-next-${mode}`).textContent = rank.atMaximum
        ? "已達王牌四星最高段位"
        : `距離下一顆星還差 ${rank.pointsToNextStar} 分`;
    }
    const ladder = this.$("rank-tier-ladder");
    ladder.innerHTML = RANK_TIERS.map((tier) =>
      `<div class="rank-tier-step" style="--rank-color:${tier.color}">${tier.name}<br><small>4 星</small></div>`
    ).join("");
  },

  // ---------- 控制設定 ----------
  refreshControls() {
    this.$("device-p1").value = INPUT.deviceOf(0);
    this.$("device-p2").value = INPUT.deviceOf(1);
    this.$("controls-help-p1").textContent = DEVICE_HELP[INPUT.deviceOf(0)];
    this.$("controls-help-p2").textContent = DEVICE_HELP[INPUT.deviceOf(1)];
    this.$("controls-character-name-p1").textContent = characterDef(this.game.selectedCharacters[0]).name;
    this.$("controls-character-name-p2").textContent = characterDef(this.game.selectedCharacters[1]).name;
    const pads = INPUT.connectedGamepads();
    this.$("gamepad-status").textContent = pads.length === 0
      ? "目前未偵測到控制器。連接後即可在上方選擇(第一支→控制器1,第二支→控制器2)。"
      : `已偵測到 ${pads.length} 支控制器:${pads.map((p, i) => `控制器${i + 1}`).join("、")}。也可以一人鍵盤、一人控制器。`;
  },

  // ---------- 關卡選擇 ----------
  buildLevelGrid(game) {
    this.$("levels-title").textContent = game.playMode === "ranked"
      ? `${game.rankedMode === "solo" ? "單人" : "多人"}排位選關`
      : "關卡選擇";
    const difficultyGrid = this.$("difficulty-grid");
    difficultyGrid.innerHTML = "";
    for (const difficulty of DIFFICULTIES) {
      const card = document.createElement("button");
      card.className = "difficulty-card";
      card.classList.toggle("active", difficulty.key === game.selectedDifficulty);
      card.style.setProperty("--difficulty-color", difficulty.color);
      card.innerHTML =
        `<span class="difficulty-icon">${difficulty.icon}</span>` +
        `<strong>${difficulty.name}</strong>` +
        `<small>${difficulty.summary}</small>` +
        `<span class="difficulty-stats">幽靈 ${Math.round(difficulty.ghostChance * 100)}%・小怪 ×${difficulty.enemyMultiplier.toFixed(2)}</span>`;
      if (game.playMode === "ranked" && difficulty.key === "endless") {
        card.disabled = true;
        card.classList.add("locked");
        card.title = "無限模式沒有終點，因此不列入排位通關積分";
      }
      card.onclick = () => game.selectDifficulty(difficulty.key);
      difficultyGrid.appendChild(card);
    }

    const grid = this.$("level-grid");
    grid.innerHTML = "";
    const difficulty = DIFFICULTY_MAP[game.selectedDifficulty];
    const unlocked = game.unlockedLevels(difficulty.key);
    const modePrefix = game.playMode === "ranked" ? `${game.rankedMode === "solo" ? "單人" : "多人"}排位・` : "";
    this.$("level-mode-summary").textContent = difficulty.key === "endless"
      ? "自動向右奔跑，沒有終點；距離越遠，速度、障礙、小怪與幽靈節奏會持續提升。"
      : `${modePrefix}${difficulty.name}模式・已解鎖 ${unlocked} / 10 關`;
    const visibleLevels = difficulty.key === "endless"
      ? LEVEL_GROUPS[difficulty.key].slice(0, 1)
      : LEVEL_GROUPS[difficulty.key].slice(0, 10);
    visibleLevels.forEach((levelIndex, stageIndex) => {
      const lv = LEVELS[levelIndex];
      const b = document.createElement("button");
      b.innerHTML = difficulty.key === "endless"
        ? `<strong>∞</strong><small>開始無限奔跑</small>`
        : `<strong>${stageIndex + 1}</strong><small>${lv.name}</small>`;
      b.title = difficulty.key === "endless"
        ? "沒有終點，挑戰最遠距離"
        : `${difficulty.name}第 ${stageIndex + 1} 關：${lv.name}｜小怪 ${lv.enemyTarget} 隻｜幽靈箱 ${lv.ghostBoxCount} 個`;
      if (difficulty.key !== "endless" && stageIndex >= unlocked) { b.classList.add("locked"); b.disabled = true; }
      b.onclick = () => game.openReady(levelIndex);
      grid.appendChild(b);
    });
  },

  refreshSettings(settings) {
    this.$("setting-lives-mode").value = settings.livesMode;
    this.$("setting-sound").value = settings.sound ? "on" : "off";
  },

  // ---------- 遊戲中 HUD ----------
  updateHUD(game) {
    const w = game.world;
    if (!w) return;
    const solo = w.players.length === 1;
    this.$("hud-p2").classList.toggle("hidden", solo);
    this.$("arrow-p2").classList.toggle("hidden", solo);
    for (const p of w.players) {
      const k = p.id === 0 ? "p1" : "p2";
      const avatar = this.$(`hud-character-${k}`);
      avatar.src = p.character.image;
      avatar.alt = `${p.badge} ${p.character.name}`;
      avatar.title = p.character.name;
      this.$(`hud-${k}-lives`).textContent = "♥".repeat(Math.max(0, p.lives)) || "—";
      this.$(`hud-${k}-score`).textContent = String(p.score);
      this.$(`hud-${k}-power`).textContent = "能力:" + POWER_NAMES[p.power];
      let inv = "";
      if (p.starT > 0) inv = `⭐ 無敵 ${p.starT.toFixed(1)}s`;
      else if (p.protectT > 0) inv = `🛡 保護 ${p.protectT.toFixed(1)}s`;
      this.$(`hud-${k}-invuln`).textContent = inv;
      let status = "";
      if (p.eliminated) status = solo ? "已淘汰" : "已淘汰(隊友可靠近長按互動鍵救援)";
      else if (p.dead) status = w.ghost.active && p.diedDuringGhost ? "等待鬼魂離開…" : `重生中 ${Math.max(0, p.deadT).toFixed(1)}s`;
      else if (p.atGoal) status = "已抵達終點";
      this.$(`hud-${k}-status`).textContent = status;
    }

    const rankedLabel = game.run.playMode === "ranked" ? `${game.run.rankedMode === "solo" ? "單人" : "多人"}排位｜` : "";
    this.$("hud-level").textContent = w.endlessRunner
      ? `∞ 無限奔跑｜${Math.floor(w.endlessRunner.distance)}m｜節奏 ${w.endlessRunner.paceTier}`
      : `${rankedLabel}${w.level.def.difficultyName}｜第 ${w.level.def.stage} 關 ${w.level.def.name}`;
    const currentScore = game.run.teamAccum + w.players.reduce((sum, player) => sum + player.score, 0);
    this.$("hud-team-score").textContent = w.endlessRunner
      ? `${solo ? "個人" : "團隊"}分數 ${currentScore}｜速度 ${w.endlessRunner.runSpeed.toFixed(1)}｜最佳 ${w.endlessRunner.bestDistance}m`
      : `${solo ? "個人" : "團隊"}分數 ${currentScore}|時間 ${Math.floor(w.time)}s`;

    // 鬼魂倒數
    const gEl = this.$("hud-ghost");
    if (w.ghost.active) {
      gEl.classList.remove("hidden");
      gEl.textContent = w.ghost.countdownText();
      gEl.style.color = w.ghost.config.hudColor;
      gEl.style.borderColor = w.ghost.config.hudBorder;
      gEl.style.background = w.ghost.config.hudBackground;
    } else gEl.classList.add("hidden");

    // 集合倒數
    const rEl = this.$("hud-regroup");
    if (w.distanceCtl.regroupActive && w.distanceCtl.regroupT > 0.1) {
      rEl.classList.remove("hidden");
      rEl.textContent = `距離太遠!集合倒數 ${(3 - w.distanceCtl.regroupT).toFixed(1)}s`;
    } else rEl.classList.add("hidden");

    // 等待隊友(終點)
    this.$("hud-wait").classList.toggle("hidden", !!w.endlessRunner || !w.goalCtl.waitingForMate());

    // 距離警告箭頭
    this.updateArrows(game);

    // 中央橫幅
    const bEl = this.$("hud-banner");
    if (this.banner.t > 0) {
      this.banner.t -= 1 / 60;
      bEl.classList.remove("hidden");
      bEl.textContent = this.banner.text;
    } else bEl.classList.add("hidden");
  },

  updateArrows(game) {
    const w = game.world;
    for (const id of ["arrow-p1", "arrow-p2"]) this.$(id).classList.add("hidden");
    if (w.players.length < 2) return;
    const canvas = game.canvas;
    const rect = canvas.getBoundingClientRect();
    const root = document.getElementById("game-root").getBoundingClientRect();
    for (const p of w.players) {
      const el = this.$(p.id === 0 ? "arrow-p1" : "arrow-p2");
      const other = w.players[p.id === 0 ? 1 : 0];
      // 只在距離警告時,顯示指向「這名玩家」的箭頭給隊友看
      if (!w.distanceCtl.warning || !p.alive()) { el.classList.add("hidden"); continue; }
      const sp = w.camera.worldToScreen(canvas, p.x, p.y);
      const sx = rect.left - root.left + (sp.x / canvas.width) * rect.width;
      const sy = rect.top - root.top + (sp.y / canvas.height) * rect.height;
      const margin = 40;
      const cx = Math.max(rect.left - root.left + margin, Math.min(rect.right - root.left - margin, sx));
      const cy = Math.max(rect.top - root.top + margin + 70, Math.min(rect.bottom - root.top - margin, sy));
      const ang = Math.atan2(sy - cy, sx - cx);
      el.classList.remove("hidden");
      el.style.left = cx - 14 + "px";
      el.style.top = cy - 11 + "px";
      el.style.transform = `rotate(${ang * 180 / Math.PI + 90}deg)`;
    }
  },

  // ---------- 結算畫面 ----------
  playerStatsRows(w) {
    if (w.players.length === 1) {
      const p = w.players[0];
      const row = (label, value) => `<div class="stat-row"><span>${label}</span><span>P1:${value}</span></div>`;
      return (
        row("剩餘生命", p.lives) +
        row("個人分數", p.score) +
        row("消滅敵人", p.kills) +
        row("逃脫鬼魂", p.ghostEscapes) +
        row("是否淘汰", p.eliminated ? "是" : "否")
      );
    }
    const [p1, p2] = w.players;
    const row = (label, a, b) =>
      `<div class="stat-row"><span>${label}</span><span>P1:${a}</span><span>P2:${b}</span></div>`;
    return (
      row("剩餘生命", p1.lives, p2.lives) +
      row("個人分數", p1.score, p2.score) +
      row("消滅敵人", p1.kills, p2.kills) +
      row("逃脫鬼魂", p1.ghostEscapes, p2.ghostEscapes) +
      row("救援隊友", p1.revivesGiven, p2.revivesGiven) +
      row("是否淘汰", p1.eliminated ? "是" : "否", p2.eliminated ? "是" : "否")
    );
  },

  rankedResultRows(w, ranked) {
    if (!ranked) return "";
    const progress = ranked.progress;
    const before = progress.before;
    const after = progress.after;
    const tierPromoted = before.tier.key !== after.tier.key;
    const starPromoted = !tierPromoted && after.stars > before.stars;
    let breakdown;
    if (ranked.mode === "solo") {
      breakdown =
        `<div class="stat-row"><span>原關卡計分</span><span>+${ranked.baseAward}</span></div>`;
    } else {
      breakdown =
        `<div class="stat-row"><span>生命分（50%）</span><span>+${ranked.breakdown.lifeScore}</span></div>` +
        `<div class="stat-row"><span>擊殺分（30%）</span><span>+${ranked.breakdown.killScore}</span></div>` +
        `<div class="stat-row"><span>時間分（20%）</span><span>+${ranked.breakdown.timeScore}</span></div>` +
        `<div class="stat-row"><span>MVP：P${ranked.mvpId + 1}</span><span>+${ranked.mvpBonus}</span></div>`;
    }
    return (
      `<div class="rank-result" style="--rank-color:${after.tier.color}">` +
      `<div class="stat-row rank-result-title"><span>${ranked.mode === "solo" ? "單人" : "多人"}排位結算</span><span>+${progress.added} 積分</span></div>` +
      breakdown +
      `<div class="stat-row"><span>目前段位</span><span>${after.tier.name} ${"★".repeat(after.stars)}${"☆".repeat(RANK_STARS_PER_TIER - after.stars)}</span></div>` +
      `<div class="stat-row"><span>排位總積分</span><span>${after.points.toLocaleString()}</span></div>` +
      (tierPromoted ? `<div class="stat-row rank-promoted"><span>晉級成功！</span><span>${before.tier.name} → ${after.tier.name}</span></div>` : "") +
      (starPromoted ? `<div class="stat-row rank-promoted"><span>獲得新星！</span><span>${before.stars} 星 → ${after.stars} 星</span></div>` : "") +
      `</div>`
    );
  },

  showComplete(w, result, run, isLast) {
    const solo = w.players.length === 1;
    const html =
      `<div class="stat-row stat-head"><span>玩家統計</span></div>` +
      this.playerStatsRows(w) +
      `<div class="stat-row stat-head"><span>團隊結算</span></div>` +
      `<div class="stat-row"><span>過關時間</span><span>${Math.floor(w.time)} 秒</span></div>` +
      `<div class="stat-row"><span>個人分數合計</span><span>${result.base}</span></div>` +
      `<div class="stat-row"><span>完成關卡獎勵</span><span>+${result.levelBonus}</span></div>` +
      (result.coopBonus ? `<div class="stat-row"><span>合作獎勵(全程無人死亡)</span><span>+${result.coopBonus}</span></div>` : "") +
      (result.syncBonus ? `<div class="stat-row"><span>同步獎勵(一起抵達)</span><span>+${result.syncBonus}</span></div>` : "") +
      (result.timeBonus ? `<div class="stat-row"><span>時間獎勵</span><span>+${result.timeBonus}</span></div>` : "") +
      `<div class="stat-row team-total"><span>本關${solo ? "個人" : "團隊"}分數</span><span>${result.teamTotal}</span></div>` +
      `<div class="stat-row"><span>累計${solo ? "個人" : "團隊"}總分</span><span>${run.teamAccum}</span></div>` +
      this.rankedResultRows(w, result.ranked);
    if (isLast) {
      this.$("allclear-title").textContent = `恭喜完成${DIFFICULTY_MAP[run.difficultyKey].name}模式十關！`;
      this.$("allclear-stats").innerHTML = html;
      this.showScreen("allclear");
    } else {
      this.$("btn-next-level").textContent = run.difficultyKey === "endless"
        ? `繼續無盡第 ${run.stage + 1} 關`
        : "下一關";
      this.$("complete-stats").innerHTML = html;
      this.showScreen("complete");
    }
  },

  showGameOver(w, run) {
    const currentScore = run.teamAccum + w.players.reduce((sum, player) => sum + player.score, 0);
    const endlessRows = run.endlessResult
      ? `<div class="stat-row stat-head"><span>無限奔跑紀錄</span></div>` +
        `<div class="stat-row"><span>本次距離</span><span>${run.endlessResult.distance}m</span></div>` +
        `<div class="stat-row"><span>最佳距離</span><span>${run.endlessResult.bestDistance}m</span></div>`
      : "";
    this.$("gameover-stats").innerHTML =
      `<div class="stat-row stat-head"><span>${w.players.length === 1 ? "玩家生命已歸零" : "兩名玩家的生命皆已歸零"}</span></div>` +
      endlessRows +
      this.playerStatsRows(w) +
      `<div class="stat-row team-total"><span>累計${w.players.length === 1 ? "個人" : "團隊"}總分</span><span>${currentScore}</span></div>` +
      (run.playMode === "ranked" ? `<div class="stat-row"><span>排位賽未通關</span><span>積分不變</span></div>` : "");
    this.showScreen("gameover");
  },
};
