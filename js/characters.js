"use strict";

const CHARACTER_DEFS = Object.freeze({
  "layer-cake": Object.freeze({ name: "千層蛋糕", image: "assets/characters/layer-cake.png", accent: "#e6ad61" }),
  dog: Object.freeze({ name: "狗狗", image: "assets/characters/dog.png", accent: "#9b6cff" }),
  "gold-element": Object.freeze({ name: "金元素", image: "assets/characters/gold-element.png", accent: "#ffd75e" }),
  "azure-dragon": Object.freeze({ name: "青龍", image: "assets/characters/azure-dragon.png", accent: "#54d7ec" }),
  "bubble-tea": Object.freeze({ name: "珍珠奶茶", image: "assets/characters/bubble-tea.png", accent: "#d89f74" }),
  lightning: Object.freeze({ name: "閃電", image: "assets/characters/lightning.png", accent: "#8ea2ff" }),
  snake: Object.freeze({ name: "蛇蛇", image: "assets/characters/snake.png", accent: "#76d9d2" }),
  bell: Object.freeze({ name: "鈴鐺", image: "assets/characters/bell.png", accent: "#65c4ee" }),
  yakult: Object.freeze({ name: "養樂多", image: "assets/characters/yakult.png", accent: "#efb17f" }),
  demon: Object.freeze({ name: "魔", image: "assets/characters/demon.png", accent: "#d957dd" }),
});

const CHARACTER_KEYS = Object.keys(CHARACTER_DEFS);
const CHARACTER_SPRITES = {};

for (const key of CHARACTER_KEYS) {
  const image = new Image();
  image.src = CHARACTER_DEFS[key].image;
  CHARACTER_SPRITES[key] = image;
}

function characterDef(key) {
  return CHARACTER_DEFS[key] || CHARACTER_DEFS[CHARACTER_KEYS[0]];
}

function characterSprite(key) {
  return CHARACTER_SPRITES[key] || CHARACTER_SPRITES[CHARACTER_KEYS[0]];
}
