// src/main.js
import './styles/global.css';
import './styles/ui.css';

import { App } from './core/App.js';
import { Store } from './core/Store.js';
import { Input } from './core/Input.js';
import { Assets } from './core/Assets.js';
import { StateMachine } from './core/StateMachine.js';
import { DEFAULT_CAR_MODELS, DEFAULT_SETTINGS, STATES } from './core/constants.js';

import { UiRoot } from './ui/UiRoot.js';

import { createMenuState } from './scenes/menu/MenuState.js';
import { createShowroomState } from './scenes/showroom/ShowroomState.js';
import { createRaceIntroState } from './scenes/race/RaceIntroState.js';
import { createRaceState } from './scenes/race/RaceState.js';

// 赛道模块：使用 NeonSpline (3D 霓虹赛道)
import * as TrackModule from './scenes/race/tracks/Track_NeonSpline.js';

function ensureAppMount() {
  let el = document.getElementById('app');
  if (!el) {
    el = document.createElement('div');
    el.id = 'app';
    document.body.appendChild(el);
  }
  return el;
}

(async function bootstrap() {
  const mount = ensureAppMount();

  // ---- core singletons ----
  const app = new App({ mount, maxPixelRatio: DEFAULT_SETTINGS.maxPixelRatio });
  const store = new Store({
    carModels: DEFAULT_CAR_MODELS,
    showroom: { carIndex: 0 },
    carConfig: null, // showroom 会自动补齐默认配置
    lastRace: null,
  });
  const assets = new Assets();
  const input = new Input();
  input.mount();

  const sm = new StateMachine();
  
  // Runtime 对象：用于跨场景传递临时数据 (如按键命令、车辆实例、转场标记)
  const runtime = {
    // UI -> RaceState 的按键模拟
    commands: Object.create(null),
    // 比赛场景的临时 Setup 数据
    raceSetup: null,
    // ★ 标记：是否正在从展厅进入比赛 (用于车辆无缝传递)
    isStartingRace: false, 
    // 缓存传递的车辆实例
    transferredCar: null, 
  };

  // 让 UI 可以“模拟按键”，RaceState 里只要 input.down('Escape'/'KeyR') 就能响应
  const rawDown = input.down.bind(input);
  input.down = (code) => {
    if (runtime.commands?.[code]) {
      runtime.commands[code] = false; // 一次性触发
      return true;
    }
    return rawDown(code);
  };

  // ---- UI root ----
  const ui = new UiRoot({
    mount: document.body,
    callbacks: {
      // Menu
      onEnterShowroom: () => sm.setState(showroomState),

      // Showroom
      onBackToMenu: () => sm.setState(menuState),
      onPrevCar: () => showroomState.prevCar?.(),
      onNextCar: () => showroomState.nextCar?.(),
      
      // ★ 关键修改：点击开始比赛时，设置标记
      onStartRace: () => {
        runtime.isStartingRace = true; 
        sm.setState(raceIntroState);
      },

      // HUD
      onExitRace: () => {
        // 触发 RaceState 的 Esc 逻辑 -> onRaceFinish -> Result
        runtime.commands.Escape = true;
      },
      onResetCar: () => {
        // 触发 RaceState 的 R 复位
        runtime.commands.KeyR = true;
      },
      onToggleCamera: () => {
        // RaceState 内部通过 input.down('KeyC') 响应
        runtime.commands.KeyC = true;
      },

      // Result
      onRestartRace: () => sm.setState(raceIntroState),
      onBackToShowroom: () => sm.setState(showroomState),
      onBackToMenu: () => sm.setState(menuState),
    },
  });
  ui.mount();

  // ---- ctx 注入给所有 scenes ----
  const ctx = {
    app,
    store,
    assets,
    input,
    sm,
    ui,
    runtime,
    trackModule: TrackModule,

    // 给 RaceIntroState 调用：倒计时结束 -> 进入 RaceState
    createRaceState: (c) => createRaceState(c),

    // RaceState 触发结束时（Esc 或 UI Exit）走这里：跳转结果页
    onRaceFinish: (result) => {
      store.setState({ lastRace: result });
      ui.setResult(result);
      ui.setLayer('result');

      // 直接切 UI 层即可，也可以切到一个“ResultState”
      // 但为了确保 RaceState.exit 能释放资源，我们还是走状态机切换：
      sm.setState(resultState);
    },
  };

  // ---- 生成 state 实例 ----
  const menuState = createMenuState(ctx);
  const showroomState = createShowroomState(ctx);
  const raceIntroState = createRaceIntroState(ctx);
  const raceStateFactory = () => createRaceState(ctx);

  // 一个最轻量 ResultState：不重新建 3D 场景，只负责保持 UI 在 result 层。
  // （也可以换成你后面单独的 scenes/result/ResultState.js）
  const resultState = {
    name: STATES.RESULT,
    async enter() {
      // 结果页只展示 UI（此时 RaceState.exit 会清理 race 的 3D 资源）
      ui.setLayer('result');

      // 给个干净背景：关掉 active scene 渲染也行
      app.setActive({ scene: null, camera: null, update: null });
    },
    async exit() {
      // nothing
    },
  };

  // RaceIntroState 内部会 sm.setState(ctx.createRaceState(ctx))
  // 我们让 ctx.createRaceState 返回“新实例”，避免复用状态对象产生意外引用
  ctx.createRaceState = () => raceStateFactory();

  // ---- 启动渲染循环 + 初始状态 ----
  app.start();
  await sm.setState(menuState);

  // Vite HMR 清理（可选）
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      try {
        input.unmount();
        ui.destroy();
        app.destroy();
      } catch (e) {
        console.warn('HMR dispose warning:', e);
      }
    });
  }
})().catch((e) => {
  console.error(e);
  alert(`启动失败：${e?.message || e}`);
});