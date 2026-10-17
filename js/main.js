"use strict";
// ============================================================
// 進入點:固定時間步長遊戲迴圈。
// ============================================================

window.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("game-canvas");
  const game = new Game(canvas);
  window.GAME = game; // 方便除錯
  UI.init(game);
  game.gotoMenu();

  // 使用者第一次互動時啟動音訊
  const resumeAudio = () => { AUDIO.ensure(); };
  window.addEventListener("keydown", resumeAudio, { once: true });
  window.addEventListener("pointerdown", resumeAudio, { once: true });

  const STEP = 1 / 60;
  let last = performance.now();
  let acc = 0;
  let lastTick = performance.now();

  function tick(now) {
    lastTick = now;
    let frame = (now - last) / 1000;
    last = now;
    if (frame > 0.1) frame = 0.1; // 分頁切走後不追幀
    acc += frame;
    while (acc >= STEP) {
      game.update(STEP);
      acc -= STEP;
    }
    game.render();
  }

  function loop(now) {
    tick(now);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // 分頁被隱藏時 rAF 不會觸發 → 用計時器維持遊戲迴圈
  setInterval(() => {
    const now = performance.now();
    if (now - lastTick > 100) tick(now);
  }, 33);
});
