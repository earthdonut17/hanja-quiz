window.HanjaApp = window.HanjaApp || {};

// 효과음. 소리 파일 없이 Web Audio로 직접 만든다(정답: 밝은 세 음, 오답: 낮고 부드러운 두 음, 호칭: 짧은 팡파르).
// 브라우저는 사용자가 화면을 누르기 전에는 소리를 막으므로, 오디오는 처음 소리를 낼 때 만든다(정답을 누른 순간).
// 켜고 끄는 설정은 이 기기의 브라우저에만 저장한다.
(function () {
  const KEY = "hanja_app_sound";
  const Ctx = window.AudioContext || window.webkitAudioContext;
  let ctx = null;
  let master = null;

  function readEnabled() {
    try {
      return localStorage.getItem(KEY) !== "off";
    } catch {
      return true;
    }
  }
  let enabled = readEnabled();

  function ensureContext() {
    if (!Ctx) return null;
    if (!ctx) {
      ctx = new Ctx();
      master = ctx.createGain();
      master.gain.value = 0.5; // 너무 크지 않게
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  // 한 음: 짧게 올라갔다가 부드럽게 사라지는 소리
  function tone(freq, start, duration, type, volume) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t0 = ctx.currentTime + start;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  const SOUNDS = {
    // 도-미-솔: 밝게 올라가는 소리
    correct: () => {
      tone(523.25, 0, 0.16, "triangle", 0.5);
      tone(659.25, 0.09, 0.16, "triangle", 0.5);
      tone(783.99, 0.18, 0.3, "triangle", 0.55);
    },
    // 낮은 음에서 내려가는 부드러운 소리(놀라지 않게 사인파)
    wrong: () => {
      tone(311.13, 0, 0.18, "sine", 0.55);
      tone(233.08, 0.14, 0.32, "sine", 0.55);
    },
    // 호칭: 도-미-솔-높은 도
    title: () => {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.12, i === 3 ? 0.6 : 0.2, "triangle", 0.5));
      tone(1318.5, 0.5, 0.5, "sine", 0.25);
    },
  };

  function play(name) {
    if (!enabled || !SOUNDS[name]) return false;
    try {
      if (!ensureContext()) return false;
      SOUNDS[name]();
      return true;
    } catch {
      return false; // 소리가 안 나와도 문제 풀이는 계속된다
    }
  }

  function setEnabled(value) {
    enabled = !!value;
    try {
      localStorage.setItem(KEY, enabled ? "on" : "off");
    } catch {
      /* 저장하지 못해도 이번 접속에서는 적용된다 */
    }
  }

  window.HanjaApp.sound = {
    play,
    setEnabled,
    isEnabled: () => enabled,
    supported: () => !!Ctx,
    contextState: () => (ctx ? ctx.state : "none"), // 점검용
  };
})();
