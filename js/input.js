"use strict";
// ============================================================
// 輸入層(PlayerInputRouter)
// 把實體裝置(兩組鍵盤配置、兩支控制器)轉成每位玩家獨立的 InputFrame。
// 遊戲邏輯只讀 InputFrame,不直接讀鍵盤/手把。
// 未來線上雙人:遠端玩家改為由網路封包餵入相同格式的 InputFrame 即可。
// ============================================================

const PlayerId = { P1: 0, P2: 1 };

const DEVICE_NAMES = {
  keyboardL: "鍵盤(左側 WASD)",
  keyboardR: "鍵盤(右側 方向鍵)",
  gamepad0: "控制器 1",
  gamepad1: "控制器 2",
};

const DEVICE_HELP = {
  keyboardL: "A/D 左右移動\nW 跳躍\nS 空中快速下降\nF 使用能力\nE 互動(救援)",
  keyboardR: "←/→ 左右移動\n↑ 跳躍\n↓ 空中快速下降\n右Ctrl 或 數字0 使用能力\n右Shift 互動(救援)",
  gamepad0: "左搖桿/十字鍵 移動\n南側按鈕(A/×) 跳躍\n西側按鈕(X/□) 使用能力\n東側按鈕(B/○) 互動(救援)",
  gamepad1: "左搖桿/十字鍵 移動\n南側按鈕(A/×) 跳躍\n西側按鈕(X/□) 使用能力\n東側按鈕(B/○) 互動(救援)",
};

const KEYMAPS = {
  keyboardL: {
    left: ["KeyA"], right: ["KeyD"], jump: ["KeyW"], down: ["KeyS"],
    ability: ["KeyF"], interact: ["KeyE"],
  },
  keyboardR: {
    left: ["ArrowLeft"], right: ["ArrowRight"], jump: ["ArrowUp"], down: ["ArrowDown"],
    ability: ["ControlRight", "Numpad0"], interact: ["ShiftRight"],
  },
};

function blankFrame() {
  return {
    left: false, right: false,
    jump: false, jumpPressed: false,
    down: false,
    ability: false, abilityPressed: false,
    interact: false, interactPressed: false,
  };
}

class PlayerInputRouter {
  constructor() {
    this.keysHeld = new Set();
    this.justPressedQueue = new Set(); // 從上次 poll 之後按下的鍵
    // 玩家 → 裝置。預設 P1 左鍵盤、P2 右鍵盤。
    this.assign = { 0: "keyboardL", 1: "keyboardR" };
    this.frames = [blankFrame(), blankFrame()];
    this.prevRaw = [blankFrame(), blankFrame()];
    this.gamepadStartPrev = [false, false];
    this.uiPause = false;
    this.uiRestart = false;

    window.addEventListener("keydown", (e) => {
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space", "ControlRight", "ShiftRight"].includes(e.code)) {
        e.preventDefault();
      }
      if (!e.repeat) this.justPressedQueue.add(e.code);
      this.keysHeld.add(e.code);
    });
    window.addEventListener("keyup", (e) => this.keysHeld.delete(e.code));
    window.addEventListener("blur", () => this.keysHeld.clear());
  }

  setDevice(playerId, device) {
    const other = playerId === 0 ? 1 : 0;
    if (this.assign[other] === device) {
      // 兩人不可共用裝置:交換
      this.assign[other] = this.assign[playerId];
    }
    this.assign[playerId] = device;
  }

  deviceOf(playerId) { return this.assign[playerId]; }
  deviceNameOf(playerId) { return DEVICE_NAMES[this.assign[playerId]]; }

  connectedGamepads() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const out = [];
    for (const p of pads) if (p && p.connected) out.push(p);
    return out;
  }

  readDevice(device) {
    const raw = blankFrame();
    if (device === "keyboardL" || device === "keyboardR") {
      const m = KEYMAPS[device];
      raw.left = m.left.some((k) => this.keysHeld.has(k));
      raw.right = m.right.some((k) => this.keysHeld.has(k));
      raw.jump = m.jump.some((k) => this.keysHeld.has(k));
      raw.down = m.down.some((k) => this.keysHeld.has(k));
      raw.ability = m.ability.some((k) => this.keysHeld.has(k));
      raw.interact = m.interact.some((k) => this.keysHeld.has(k));
      // 兩次 poll 之間快速按放的鍵也要觸發邊緣事件
      raw.jumpTap = m.jump.some((k) => this.justPressedQueue.has(k));
      raw.abilityTap = m.ability.some((k) => this.justPressedQueue.has(k));
      raw.interactTap = m.interact.some((k) => this.justPressedQueue.has(k));
    } else {
      const idx = device === "gamepad0" ? 0 : 1;
      const pads = this.connectedGamepads();
      const pad = pads[idx];
      if (pad) {
        const ax = pad.axes[0] || 0;
        const ay = pad.axes[1] || 0;
        const btn = (i) => !!(pad.buttons[i] && pad.buttons[i].pressed);
        raw.left = ax < -0.35 || btn(14);
        raw.right = ax > 0.35 || btn(15);
        raw.jump = btn(0) || btn(12);
        raw.down = ay > 0.5 || btn(13);
        raw.ability = btn(2);
        raw.interact = btn(1);
        if (btn(9) && !this.gamepadStartPrev[idx]) this.uiPause = true;
        this.gamepadStartPrev[idx] = btn(9);
      } else {
        this.gamepadStartPrev[idx] = false;
      }
    }
    return raw;
  }

  // 每個遊戲 tick 呼叫一次。
  poll() {
    if (this.justPressedQueue.has("Escape")) this.uiPause = true;
    if (this.justPressedQueue.has("KeyR")) this.uiRestart = true;

    for (const pid of [0, 1]) {
      const raw = this.readDevice(this.assign[pid]);
      const prev = this.prevRaw[pid];
      const f = this.frames[pid];
      f.left = raw.left; f.right = raw.right;
      f.jump = raw.jump; f.down = raw.down;
      f.ability = raw.ability; f.interact = raw.interact;
      f.jumpPressed = (raw.jump && !prev.jump) || !!raw.jumpTap;
      f.abilityPressed = (raw.ability && !prev.ability) || !!raw.abilityTap;
      f.interactPressed = (raw.interact && !prev.interact) || !!raw.interactTap;
      this.prevRaw[pid] = raw;
    }
    this.justPressedQueue.clear();
  }

  frame(playerId) { return this.frames[playerId]; }

  consumePause() { const v = this.uiPause; this.uiPause = false; return v; }
  consumeRestart() { const v = this.uiRestart; this.uiRestart = false; return v; }

  // 準備畫面:偵測某玩家是否按下「準備」(能力鍵或互動鍵)
  readyPressed(playerId) {
    const f = this.frames[playerId];
    return f.abilityPressed || f.interactPressed || f.jumpPressed;
  }
}

const INPUT = new PlayerInputRouter();
