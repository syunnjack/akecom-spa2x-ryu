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
};

function nowFrames(start) {
  return Math.round((performance.now() - start) / frameMs);
}

function expectedSequence() {
  const forward = state.facing;
  return ["down", `down-${forward}`, forward, "down", `down-${forward}`, forward, "punch"];
}

function currentDirection() {
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
  state.attempt = { startedAt: performance.now(), step: 0, lastDirection: "neutral" };
  state.history = [];
  addHistory("中K", 0);
  setResult("入力中");
  paintCommand(0);
  el.hint.textContent = "二回の波動を一息で入力！";
}

function finishAttempt(success, reason) {
  if (!state.attempt) return;
  const frames = nowFrames(state.attempt.startedAt);
  el.frames.textContent = frames;
  if (success) {
    state.streak += 1;
    setResult("成功！", "success");
    el.hint.textContent = `${frames}F。力まず、このリズムを再現しよう。`;
    paintCommand(7);
  } else {
    state.streak = 0;
    setResult("もう一度", "fail");
    el.hint.textContent = reason;
  }
  el.streak.textContent = state.streak;
  state.attempt = null;
}

function registerDirection(direction) {
  if (!state.attempt || direction === "neutral" || direction === state.attempt.lastDirection) return;
  state.attempt.lastDirection = direction;
  const frame = nowFrames(state.attempt.startedAt);
  addHistory(directionGlyph[direction], frame);

  const sequence = expectedSequence();
  if (direction === sequence[state.attempt.step]) {
    state.attempt.step += 1;
    paintCommand(state.attempt.step);
  } else if (direction === "down" && [0, 3].includes(state.attempt.step)) {
    // 同じ↓の再入力は継続として扱う
  }

  if (frame > Number(el.target.value)) {
    finishAttempt(false, `目標を${frame - Number(el.target.value)}F超えました。レバーを小さく速く。`);
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
  const complete = state.attempt.step >= 6;
  const withinTime = frame <= Number(el.target.value);
  finishAttempt(
    complete && withinTime,
    complete ? "コマンドは完成。パンチを少し早く。" : "方向が足りません。履歴で抜けた斜めを確認。"
  );
}

function updateHeld(direction, pressed) {
  pressed ? state.held.add(direction) : state.held.delete(direction);
  registerDirection(currentDirection());
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
    ? ["中K", "↓", "↘", "→", "↓", "↘", "→", "P"]
    : ["中K", "↓", "↙", "←", "↓", "↙", "←", "P"];
  el.command.forEach((node, i) => { node.textContent = glyphs[i]; });
  reset();
}

function reset() {
  state.attempt = null;
  state.history = [];
  state.held.clear();
  el.history.innerHTML = '<span class="muted">入力待ち</span>';
  el.frames.textContent = "—";
  el.timeline.style.width = "0";
  setResult("準備OK");
  paintCommand(-1);
  el.hint.textContent = "中Kを押すと計測を始めます。";
}

el.facing.addEventListener("click", toggleFacing);
document.querySelector("#reset").addEventListener("click", reset);
el.target.addEventListener("input", () => { el.targetOutput.textContent = `${el.target.value} F`; });

function gamepadDirection(pad) {
  const x = Math.abs(pad.axes[0] || 0) > .45 ? Math.sign(pad.axes[0]) : 0;
  const y = Math.abs(pad.axes[1] || 0) > .45 ? Math.sign(pad.axes[1]) : 0;
  const vertical = y > 0 ? "down" : y < 0 ? "up" : "";
  const horizontal = x > 0 ? "right" : x < 0 ? "left" : "";
  return [vertical, horizontal].filter(Boolean).join("-") || "neutral";
}

function pollGamepad() {
  const pad = navigator.getGamepads?.()[state.gamepadIndex];
  if (pad) {
    const direction = gamepadDirection(pad);
    if (direction !== state.previousPad.direction) {
      state.previousPad.direction = direction;
      registerDirection(direction);
    }
    const mk = Number(el.mkButton.value);
    const punches = el.punchButtons.value.split(",").map(Number).filter(Number.isInteger);
    pad.buttons.forEach((button, index) => {
      const wasPressed = state.previousPad.buttons[index] || false;
      if (button.pressed && !wasPressed) {
        if (index === mk) registerAction("mk");
        if (punches.includes(index)) registerAction("punch");
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

window.addEventListener("gamepadconnected", (event) => {
  state.gamepadIndex = event.gamepad.index;
  el.gamepadStatus.textContent = `接続中：${event.gamepad.id}`;
});

function animateTimeline() {
  if (state.attempt) {
    const progress = Math.min(100, nowFrames(state.attempt.startedAt) / Number(el.target.value) * 100);
    el.timeline.style.width = `${progress}%`;
    if (progress >= 100) finishAttempt(false, "時間切れ。まずは二回転だけを滑らかに。");
  }
  requestAnimationFrame(animateTimeline);
}

if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js");
pollGamepad();
animateTimeline();

