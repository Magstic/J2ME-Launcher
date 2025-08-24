// 通用 Gamepad 輪詢 Hook：提供方向移動與動作按鍵回調
// 僅在 enabled 為 true 時生效；採用 rAF 輪詢與邊沿觸發 + 重複輸入支持

import { useEffect, useRef } from 'react';
import { controllerBindings as bindings } from '@config/controllerBindings';

export default function useGamepad({ enabled, onMove, onPress }) {
  const rafRef = useRef(null);
  const lastStateRef = useRef({
    // 方向鍵邊沿觸發與重複控制
    dirHold: { up: false, down: false, left: false, right: false },
    dirFirstTs: { up: 0, down: 0, left: 0, right: 0 },
    dirLastRep: { up: 0, down: 0, left: 0, right: 0 },
    // 按鍵邊沿
    btnHold: {},
  });

  useEffect(() => {
    if (!enabled) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }

    

    const onConnected = (e) => {
      try {
        console.log(`[Gamepad] connected: id="${e.gamepad.id}", index=${e.gamepad.index}, mapping=${e.gamepad.mapping || 'unknown'}`);
      } catch {}
    };
    const onDisconnected = (e) => {
      try { console.log(`[Gamepad] disconnected: index=${e.gamepad.index}`); } catch {}
    };
    window.addEventListener('gamepadconnected', onConnected);
    window.addEventListener('gamepaddisconnected', onDisconnected);

    const poll = (ts) => {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      let pad = null;
      if (pads && pads.length) {
        for (let i = 0; i < pads.length; i++) {
          const p = pads[i];
          if (p && p.connected) { pad = p; break; }
        }
        if (!pad) { pad = pads[0]; }
      }
      if (pad && pad.connected) {
        handlePad(ts, pad);
      }
      rafRef.current = requestAnimationFrame(poll);
    };

    rafRef.current = requestAnimationFrame(poll);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      window.removeEventListener('gamepadconnected', onConnected);
      window.removeEventListener('gamepaddisconnected', onDisconnected);
    };
     
  }, [enabled]);

  function handlePad(ts, pad) {
    const { buttons, axes } = pad;
    const st = lastStateRef.current;

    // 方向：D-Pad 或 左搖桿
    let dUp = btnPressed(buttons[bindings.buttons.DPadUp]);
    let dDown = btnPressed(buttons[bindings.buttons.DPadDown]);
    let dLeft = btnPressed(buttons[bindings.buttons.DPadLeft]);
    let dRight = btnPressed(buttons[bindings.buttons.DPadRight]);

    const lx = axes[bindings.axes.LX] ?? 0;
    const ly = axes[bindings.axes.LY] ?? 0;
    const stick = bindings.thresholds.stick;
    const aUp = ly < -stick;
    const aDown = ly > stick;
    const aLeft = lx < -stick;
    const aRight = lx > stick;

    // Fallback: 某些控制器的 D-Pad 可能在 axes[9]（hat）上報
    if (!dUp && !dDown && !dLeft && !dRight && typeof axes[9] !== 'undefined') {
      const hat = axes[9];
      // 採用寬鬆分段（常見 8 向帽值），此映射在不同驅動上可能不同，但作為補救
      // 近似：-1=上, -0.5=右, 0=下, 0.5=左, 1=上（或其它序）— 因差異大，僅以閾值粗略判斷
      if (hat <= -0.75) { dUp = true; }
      else if (hat >= 0.75) { dDown = true; }
      else if (hat > 0.2 && hat < 0.75) { dLeft = true; }
      else if (hat < -0.2 && hat > -0.75) { dRight = true; }
    }

    // Fallback2: 部分舊驅動將 D-Pad 報在 axes[6]/[7]
    if (!dUp && !dDown && !dLeft && !dRight && (typeof axes[6] !== 'undefined' || typeof axes[7] !== 'undefined')) {
      const ax6 = axes[6] ?? 0; // 水平
      const ax7 = axes[7] ?? 0; // 垂直
      const th = 0.5;
      if (ax7 < -th) dUp = true; else if (ax7 > th) dDown = true;
      if (ax6 < -th) dLeft = true; else if (ax6 > th) dRight = true;
    }

    // 合併方向輸入（D-Pad 優先於搖桿）
    const want = {
      up: dUp || aUp,
      down: dDown || aDown,
      left: dLeft || aLeft,
      right: dRight || aRight,
    };

    // 單一方向選擇：避免同一幀觸發多個方向導致抖動
    let chosen = null;
    const anyDpad = dUp || dDown || dLeft || dRight;
    if (anyDpad) {
      // D-Pad 同時多方向時選擇一個優先方向（可調整優先序）
      if (dUp) chosen = 'up';
      else if (dDown) chosen = 'down';
      else if (dLeft) chosen = 'left';
      else if (dRight) chosen = 'right';
    } else if (aUp || aDown || aLeft || aRight) {
      // 搖桿：取主導軸
      const ax = Math.abs(lx);
      const ay = Math.abs(ly);
      if (ay > ax) chosen = ly < 0 ? 'up' : 'down';
      else chosen = lx < 0 ? 'left' : 'right';
    }

    // Debug：輸入狀態（僅在觸發時輸出以免刷屏）
    if (dUp || dDown || dLeft || dRight || aUp || aDown || aLeft || aRight) {
      try {
        console.debug('[Gamepad] axes lx=%d ly=%d | dpad(up:%s,down:%s,left:%s,right:%s)',
          Number(lx).toFixed(2), Number(ly).toFixed(2), dUp, dDown, dLeft, dRight);
      } catch {}
    }

    // 單獨記錄 D-Pad 按鈕 12~15 狀態變化，便於定位映射
    try {
      const dbg = [12,13,14,15].map(i => btnPressed(buttons[i]));
      if (!Array.isArray(st._dbgDpad)) st._dbgDpad = [];
      if (st._dbgDpad[0] !== dbg[0] || st._dbgDpad[1] !== dbg[1] || st._dbgDpad[2] !== dbg[2] || st._dbgDpad[3] !== dbg[3]) {
        console.debug('[Gamepad] buttons dpad12-15 =', dbg);
        st._dbgDpad = dbg;
      }
    } catch {}

    ['up','down','left','right'].forEach(dir => {
      const now = ts || performance.now();
      if (chosen === dir) {
        if (!st.dirHold[dir]) {
          st.dirHold[dir] = true;
          st.dirFirstTs[dir] = now;
          st.dirLastRep[dir] = 0;
          onMove && onMove(dir, { repeat: false });
        } else {
          const dtFirst = now - st.dirFirstTs[dir];
          if (dtFirst >= bindings.thresholds.repeatInitial) {
            const dtRep = now - (st.dirLastRep[dir] || 0);
            if (dtRep >= bindings.thresholds.repeatRate) {
              st.dirLastRep[dir] = now;
              onMove && onMove(dir, { repeat: true });
            }
          }
        }
      } else {
        st.dirHold[dir] = false;
        st.dirFirstTs[dir] = 0;
        st.dirLastRep[dir] = 0;
      }
    });

    // 其他按鍵（邊沿）
    handleButtonEdge(ts, 'A', buttons, () => { try { console.debug('[Gamepad] A pressed -> launch'); } catch {}; onPress && onPress('launch'); });
    handleButtonEdge(ts, 'B', buttons, () => { try { console.debug('[Gamepad] B pressed -> back'); } catch {}; onPress && onPress('back'); });
    handleButtonEdge(ts, 'X', buttons, () => { try { console.debug('[Gamepad] X pressed -> info'); } catch {}; onPress && onPress('info'); });
    handleButtonEdge(ts, 'Y', buttons, () => { try { console.debug('[Gamepad] Y pressed -> config'); } catch {}; onPress && onPress('config'); });

    handleButtonEdge(ts, 'LB', buttons, () => { try { console.debug('[Gamepad] LB pressed -> pageUp'); } catch {}; onPress && onPress('pageUp'); });
    handleButtonEdge(ts, 'RB', buttons, () => { try { console.debug('[Gamepad] RB pressed -> pageDown'); } catch {}; onPress && onPress('pageDown'); });

    handleButtonEdge(ts, 'Select', buttons, () => { try { console.debug('[Gamepad] Select pressed -> focusSearch'); } catch {}; onPress && onPress('focusSearch'); });
    handleButtonEdge(ts, 'Start', buttons, () => { try { console.debug('[Gamepad] Start pressed -> toggleMode'); } catch {}; onPress && onPress('toggleMode'); });
  }

  function handleButtonEdge(_ts, name, buttons, cb) {
    const st = lastStateRef.current;
    const idx = bindings.buttons[name];
    const pressed = btnPressed(buttons[idx]);
    const prev = !!st.btnHold[name];
    if (pressed && !prev) {
      st.btnHold[name] = true;
      try { console.debug(`[Gamepad] edge: ${name} (index=${idx})`); } catch {}
      cb && cb();
    } else if (!pressed && prev) {
      st.btnHold[name] = false;
    }
  }

  function btnPressed(btn) {
    if (!btn) return false;
    if (typeof btn === 'object') return btn.pressed || btn.value > 0.5;
    return btn > 0.5;
  }
}
