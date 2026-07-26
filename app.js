const FPS = 60;
const frameMs = 1000 / FPS;
const directionKeys = {
  ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
};
const actionKeys = { KeyJ: "mk", KeyU: "lp", KeyI: "mp", KeyO: "hp" };
const directionGlyph = {
  neutral: "・", up: "↑", down: "↓", left: "←", right: "→",
  "down-left": "↙", "down-right": "↘", "up-left": "↖", "up-right": "↗",
};

const state = {
  facing: "right",
  held: new Set(),
  history: [],
  attempt: null,
  streak: 0,
  gamepadIndex: null,
  previousPad: { buttons: [], direction: "neutral" },
  motionBuffer: [],
  lastDirection: "neutral",
  inputDirection: "neutral",
  learnTarget: null,
  learnedPunches: new Set(),
};

const el = {
  result: document.querySelector("#result"),
  frames: document.querySelector("#frames"),
  streak: document.querySelector("#streak"),
  command: [...document.querySelectorAll("#command span")],
  hint: document.querySelector("#hint"),
  history: document.querySelector("#history"),
  timeline: document.querySelector("#timeline-fill"),
  target: document.querySelector("#target-frames"),
  targetOutput: document.querySelector("#target-output"),
  facing: document.querySelector("#facing"),
  mkButton: document.querySelector("#mk-button"),
  punchButtons: document.querySelector("#punch-buttons"),
  gamepadStatus: document.querySelector("#gamepad-status"),
  liveDirection: document.querySelector("#live-direction"),
  liveButtons: document.querySelector("#live-buttons"),
  learnStatus: document.querySelector("#learn-status"),
  learnMk: document.querySelector("#learn-mk"),
  learnPunches: document.querySelector("#learn-punches"),
};

const savedSettings = JSON.parse(localStorage.getItem("shinku-trainer.settings") || "{}");
if (savedSettings.targetFrames) el.target.value = savedSettings.targetFrames;
if (Number.isInteger(savedSettings.mkButton)) el.mkButton.value = savedSettings.mkButton;
if (Array.isArray(savedSettings.punchButtons)) el.punchButtons.value = savedSettings.punchButtons.join(",");
el.targetOutput.textContent = `${el.target.value} F`;

function saveSettings() {
  const punchButtons = el.punchButtons.value.split(",").map(Number).filter(Number.isInteger);
  localStorage.setItem("shinku-trainer.settings", JSON.stringify({
    targetFrames: Number(el.target.value),
    mkButton: Number(el.mkButton.value),
    punchButtons,
  }));
}

function nowFrames(start) {
  return Math.round((performance.now() - start) / frameMs);
}

function starterSequence() {
  const forward = state.facing;
  return ["down", `down-${forward}`, forward, "down"];
}

function finishSequence() {
  const forward = state.facing;
  return [`down-${forward}`, forward];
}

function currentKeyboardDirection() {
  const vertical = state.held.has("down") ? "down" : state.held.has("up") ? "up" : "";
  const horizontal = state.held.has("left") ? "left" : state.held.has("right") ? "right" : "";
  return [vertical, horizontal].filter(Boolean).join("-") || "neutral";
}

function setResult(text, type = "") {
  el.result.textContent = text;
  el.result.className = type;
}

function addHistory(label, frame = null) {
  state.history.push({ label, frame });
  state.history = state.history.slice(-18);
  el.history.innerHTML = state.history.map((item) =>
    `<span>${item.label}${item.frame === null ? "" : ` <small>${item.frame}F</small>`}</span>`
  ).join("");
}

function paintCommand(step = -1) {
  el.command.forEach((node, index) => {
    node.classList.toggle("done", index <= step);
    node.classList.toggle("active", index === step + 1);
  });
}

function startAttempt() {
  if (state.inputDirection !== "down") {
    setResult("↓＋中Kから", "fail");
    el.hint.textContent = "↓↘→を仕込んでから、真下＋中Kを押してください。";
    return;
  }

  const starter = starterSequence();
  const recent = state.motionBuffer.slice(-starter.length);
  if (recent.length !== starter.length || recent.some((item, index) => item.direction !== starter[index])) {
    setResult("仕込み不足", "fail");
    el.hint.textContent = "中Kの前に ↓↘→、続けて ↓＋中K と入力してください。";
    return;
  }

  const startedAt = performance.now();
  state.attempt = { startedAt, step: 0 };
  state.history = [];
  recent.slice(0, -1).forEach((item) => {
    addHistory(directionGlyph[item.direction], Math.round((item.time - startedAt) / frameMs));
  });
  addHistory("↓＋中K", 0);
  state.motionBuffer = [];
  setResult("キャンセル入力");
  paintCommand(3);
  el.hint.textContent = "残りは ↘→＋P。中足が戻る前に入力！";
}

function finishAttempt(success, reason) {
  if (!state.attempt) return;
  const frames = nowFrames(state.attempt.startedAt);
  el.frames.textContent = frames;
  if (success) {
    state.streak += 1;
    setResult("成功！", "success");
    el.hint.textContent = `${frames}F。仕込みから残り半回転への流れを再現しよう。`;
    paintCommand(6);
  } else {
    state.streak = 0;
    setResult("もう一度", "fail");
    el.hint.textContent = reason;
  }
  el.streak.textContent = state.streak;
  state.attempt = null;
}

function updateStarterProgress() {
  const starter = starterSequence();
  let matched = 0;
  for (let size = Math.min(starter.length, state.motionBuffer.length); size > 0; size -= 1) {
    const tail = state.motionBuffer.slice(-size).map((item) => item.direction);
    if (tail.every((item, index) => item === starter[index])) {
      matched = size;
      break;
    }
  }
  paintCommand(Math.min(matched, 3) - 1);
}

function registerDirection(direction) {
  state.inputDirection = direction;
  if (direction === "neutral") {
    state.lastDirection = "neutral";
    return;
  }
  if (direction === state.lastDirection) return;
  state.lastDirection = direction;

  if (!state.attempt) {
    const time = performance.now();
    state.motionBuffer.push({ direction, time });
    state.motionBuffer = state.motionBuffer.filter((item) => time - item.time <= 1000).slice(-10);
    updateStarterProgress();
    return;
  }

  const frame = nowFrames(state.attempt.startedAt);
  addHistory(directionGlyph[direction], frame);
  const sequence = finishSequence();
  if (direction === sequence[state.attempt.step]) {
    state.attempt.step += 1;
    paintCommand(3 + state.attempt.step);
  }
  if (frame > Number(el.target.value)) {
    finishAttempt(false, `中K後の目標を${frame - Number(el.target.value)}F超えました。↘→＋Pを素早く。`);
  }
}

function registerAction(action) {
  if (action === "mk") {
    startAttempt();
    return;
  }
  if (!["lp", "mp", "hp", "punch"].includes(action) || !state.attempt) return;
  const frame = nowFrames(state.attempt.startedAt);
  addHistory("P", frame);
  const complete = state.attempt.step >= 2;
  const withinTime = frame <= Number(el.target.value);
  finishAttempt(
    complete && withinTime,
    complete ? "入力は完成。パンチを少し早く。" : "中K後の↘→が足りません。入力履歴を確認。"
  );
}

function updateHeld(direction, pressed) {
  pressed ? state.held.add(direction) : state.held.delete(direction);
  registerDirection(currentKeyboardDirection());
}

document.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  if (directionKeys[event.code]) {
    event.preventDefault();
    updateHeld(directionKeys[event.code], true);
  } else if (actionKeys[event.code]) {
    registerAction(actionKeys[event.code]);
  } else if (event.code === "KeyF") {
    toggleFacing();
  } else if (event.code === "Escape") {
    reset();
  }
});

document.addEventListener("keyup", (event) => {
  if (directionKeys[event.code]) updateHeld(directionKeys[event.code], false);
});

document.querySelectorAll("[data-direction]").forEach((button) => {
  const direction = button.dataset.direction;
  for (const type of ["pointerdown", "pointerup", "pointercancel", "pointerleave"]) {
    button.addEventListener(type, (event) => {
      event.preventDefault();
      const pressed = type === "pointerdown";
      button.classList.toggle("pressed", pressed);
      updateHeld(direction, pressed);
    });
  }
});

document.querySelectorAll("[data-action]").forEach((button) => {
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    button.classList.add("pressed");
    registerAction(button.dataset.action);
  });
  button.addEventListener("pointerup", () => button.classList.remove("pressed"));
  button.addEventListener("pointercancel", () => button.classList.remove("pressed"));
});

function toggleFacing() {
  state.facing = state.facing === "right" ? "left" : "right";
  el.facing.textContent = state.facing === "right" ? "向き：右 →" : "向き：左 ←";
  const glyphs = state.facing === "right"
    ? ["↓", "↘", "→", "↓＋中K", "↘", "→", "P"]
    : ["↓", "↙", "←", "↓＋中K", "↙", "←", "P"];
  el.command.forEach((node, i) => { node.textContent = glyphs[i]; });
  reset();
}

function reset() {
  state.attempt = null;
  state.history = [];
  state.held.clear();
  state.motionBuffer = [];
  state.lastDirection = "neutral";
  state.inputDirection = "neutral";
  el.history.innerHTML = '<span class="muted">入力待ち</span>';
  el.frames.textContent = "—";
  el.timeline.style.width = "0";
  setResult("準備OK");
  paintCommand(-1);
  el.hint.textContent = "↓↘→を仕込み、↓＋中Kから↘→＋Pへつなぎます。";
}

el.facing.addEventListener("click", toggleFacing);
document.querySelector("#reset").addEventListener("click", reset);
el.target.addEventListener("input", () => {
  el.targetOutput.textContent = `${el.target.value} F`;
  saveSettings();
});
el.mkButton.addEventListener("change", saveSettings);
el.punchButtons.addEventListener("change", saveSettings);

function gamepadDirection(pad) {
  const dpadX = pad.buttons[14]?.pressed ? -1 : pad.buttons[15]?.pressed ? 1 : 0;
  const dpadY = pad.buttons[12]?.pressed ? -1 : pad.buttons[13]?.pressed ? 1 : 0;
  const x = dpadX || (Math.abs(pad.axes[0] || 0) > .45 ? Math.sign(pad.axes[0]) : 0);
  const y = dpadY || (Math.abs(pad.axes[1] || 0) > .45 ? Math.sign(pad.axes[1]) : 0);
  const vertical = y > 0 ? "down" : y < 0 ? "up" : "";
  const horizontal = x > 0 ? "right" : x < 0 ? "left" : "";
  return [vertical, horizontal].filter(Boolean).join("-") || "neutral";
}

function learnButton(index) {
  if (state.learnTarget === "mk") {
    el.mkButton.value = index;
    state.learnTarget = null;
    el.learnMk.classList.remove("learning");
    el.learnMk.textContent = "中Kを自動設定";
    el.learnStatus.textContent = `ボタン${index}を中Kに設定しました。`;
    saveSettings();
    return true;
  }
  if (state.learnTarget === "punches") {
    state.learnedPunches.add(index);
    el.punchButtons.value = [...state.learnedPunches].join(",");
    el.learnStatus.textContent = `パンチ候補：${el.punchButtons.value}（3個押したら「設定完了」）`;
    saveSettings();
    return true;
  }
  return false;
}

function pollGamepad() {
  const pad = navigator.getGamepads?.()[state.gamepadIndex];
  if (pad) {
    const direction = gamepadDirection(pad);
    const pressed = pad.buttons.map((button, index) => button.pressed ? index : null).filter((index) => index !== null);
    el.liveDirection.textContent = directionGlyph[direction];
    el.liveButtons.textContent = pressed.length ? pressed.join(", ") : "なし";
    if (direction !== state.previousPad.direction) {
      state.previousPad.direction = direction;
      registerDirection(direction);
    }
    const mk = Number(el.mkButton.value);
    const punches = el.punchButtons.value.split(",").map(Number).filter(Number.isInteger);
    pad.buttons.forEach((button, index) => {
      const wasPressed = state.previousPad.buttons[index] || false;
      if (button.pressed && !wasPressed) {
        const learned = learnButton(index);
        if (!learned && index === mk) registerAction("mk");
        if (!learned && punches.includes(index)) registerAction("punch");
      }
      state.previousPad.buttons[index] = button.pressed;
    });
  }
  requestAnimationFrame(pollGamepad);
}

document.querySelector("#connect").addEventListener("click", () => {
  const pads = [...(navigator.getGamepads?.() || [])].filter(Boolean);
  if (pads[0]) {
    state.gamepadIndex = pads[0].index;
    el.gamepadStatus.textContent = `接続中：${pads[0].id}`;
  } else {
    el.gamepadStatus.textContent = "アケコンのボタンを一度押してから再試行してください。";
  }
});

el.learnMk.addEventListener("click", () => {
  state.learnTarget = state.learnTarget === "mk" ? null : "mk";
  state.learnedPunches.clear();
  el.learnMk.classList.toggle("learning", state.learnTarget === "mk");
  el.learnPunches.classList.remove("learning");
  el.learnMk.textContent = state.learnTarget === "mk" ? "中Kを押してください" : "中Kを自動設定";
  el.learnPunches.textContent = "パンチを自動設定";
  el.learnStatus.textContent = state.learnTarget === "mk" ? "アケコンの中Kボタンを1回押してください。" : "自動設定を中止しました。";
});

el.learnPunches.addEventListener("click", () => {
  if (state.learnTarget === "punches") {
    state.learnTarget = null;
    el.learnPunches.classList.remove("learning");
    el.learnPunches.textContent = "パンチを自動設定";
    el.learnStatus.textContent = `パンチ設定を保存しました：${el.punchButtons.value}`;
    return;
  }
  state.learnTarget = "punches";
  state.learnedPunches.clear();
  el.punchButtons.value = "";
  el.learnMk.classList.remove("learning");
  el.learnPunches.classList.add("learning");
  el.learnMk.textContent = "中Kを自動設定";
  el.learnPunches.textContent = "設定完了";
  el.learnStatus.textContent = "弱P・中P・強Pを1回ずつ押し、最後に「設定完了」を押してください。";
});

window.addEventListener("gamepadconnected", (event) => {
  state.gamepadIndex = event.gamepad.index;
  el.gamepadStatus.textContent = `接続中：${event.gamepad.id}`;
});

function animateTimeline() {
  if (state.attempt) {
    const progress = Math.min(100, nowFrames(state.attempt.startedAt) / Number(el.target.value) * 100);
    el.timeline.style.width = `${progress}%`;
    if (progress >= 100) finishAttempt(false, "時間切れ。中K後の↘→＋Pを滑らかに。");
  }
  requestAnimationFrame(animateTimeline);
}

if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js");
pollGamepad();
animateTimeline();
