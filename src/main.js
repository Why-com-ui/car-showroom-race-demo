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
import { InputDebugOverlay } from './ui/InputDebugOverlay.js';

import { createMenuState } from './scenes/menu/MenuState.js';
import { createShowroomState } from './scenes/showroom/ShowroomState.js';
import { createRaceIntroState } from './scenes/race/RaceIntroState.js';
import { createRaceState } from './scenes/race/RaceState.js';

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

function reportRuntimeError(error) {
  console.error(error);
  alert(`启动失败：${error?.message || error}`);
}

(async function bootstrap() {
  const mount = ensureAppMount();
  const searchParams = new URLSearchParams(window.location.search);
  const debugInputEnabled = searchParams.get('debugInput') === '1';

  const app = new App({ mount, maxPixelRatio: DEFAULT_SETTINGS.maxPixelRatio });
  const store = new Store({
    carModels: DEFAULT_CAR_MODELS,
    showroom: { carIndex: 0 },
    carConfig: null,
    lastRace: null,
  });
  const assets = new Assets();
  const input = new Input();
  input.bindSurface(app.renderer.domElement);
  input.setDebugEnabled(debugInputEnabled);
  input.mount();

  const inputDebugOverlay = debugInputEnabled
    ? new InputDebugOverlay({ mount: document.body, input, app })
    : null;
  let debugOverlayRaf = 0;
  inputDebugOverlay?.mount();

  const sm = new StateMachine();

  const queueInputFocus = () => {
    window.requestAnimationFrame(() => app.focusInputSurface());
  };

  const triggerCommand = (code) => {
    input.pressOnce(code);
    queueInputFocus();
  };

  const transitionTo = (nextState) => {
    if (!nextState) return Promise.resolve();
    return sm.setState(nextState).then(() => {
      queueInputFocus();
    });
  };

  const runtime = {
    raceSetup: null,
    isStartingRace: false,
    transferredCar: null,
  };

  let menuState = null;
  let showroomState = null;
  let raceIntroState = null;
  let resultState = null;
  let raceMetricsProvider = null;

  const setRaceDebugMetricsProvider = (provider) => {
    raceMetricsProvider = typeof provider === 'function' ? provider : null;
    inputDebugOverlay?.setMetricsProvider(raceMetricsProvider);
  };

  if (debugInputEnabled) {
    Object.defineProperty(window, '__raceDebug', {
      configurable: true,
      get: () => inputDebugOverlay?.getSnapshot() ?? null,
    });

    const renderDebugOverlay = () => {
      inputDebugOverlay?.render();
      debugOverlayRaf = requestAnimationFrame(renderDebugOverlay);
    };
    renderDebugOverlay();
  }

  const ui = new UiRoot({
    mount: document.body,
    callbacks: {
      onUiAction: () => {
        queueInputFocus();
      },

      onEnterShowroom: () => {
        void transitionTo(showroomState).catch(reportRuntimeError);
      },

      onBackToMenu: () => {
        void transitionTo(menuState).catch(reportRuntimeError);
      },

      onPrevCar: () => {
        void showroomState?.prevCar?.();
      },

      onNextCar: () => {
        void showroomState?.nextCar?.();
      },

      onStartRace: () => {
        runtime.isStartingRace = true;
        void transitionTo(raceIntroState).catch(reportRuntimeError);
      },

      onExitRace: () => {
        triggerCommand('Escape');
      },

      onResetCar: () => {
        triggerCommand('KeyR');
      },

      onToggleCamera: () => {
        triggerCommand('KeyC');
      },

      onRestartRace: () => {
        runtime.isStartingRace = true;
        void transitionTo(raceIntroState).catch(reportRuntimeError);
      },

      onBackToShowroom: () => {
        void transitionTo(showroomState).catch(reportRuntimeError);
      },
    },
  });
  ui.mount();

  const ctx = {
    app,
    store,
    assets,
    input,
    sm,
    ui,
    runtime,
    trackModule: TrackModule,
    requestInputFocus: queueInputFocus,
    setRaceDebugMetricsProvider,
    debugFlags: {
      input: debugInputEnabled,
    },
    createRaceState: (c) => createRaceState(c),
    onRaceFinish: (result) => {
      store.setState({ lastRace: result });
      ui.setResult(result);
      ui.setLayer('result');

      void transitionTo(resultState).catch(reportRuntimeError);
    },
  };

  menuState = createMenuState(ctx);
  showroomState = createShowroomState(ctx);
  raceIntroState = createRaceIntroState(ctx);
  const raceStateFactory = () => createRaceState(ctx);

  resultState = {
    name: STATES.RESULT,
    async enter() {
      ui.setLayer('result');
      app.setActive({ scene: null, camera: null, update: null });
      setRaceDebugMetricsProvider(() => ({
        phase: 'result',
      }));
      queueInputFocus();
    },
    async exit() {
      app.blurInputSurface();
    },
  };

  ctx.createRaceState = () => raceStateFactory();

  app.start();
  await transitionTo(menuState);

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      try {
        cancelAnimationFrame(debugOverlayRaf);
        input.unmount();
        inputDebugOverlay?.destroy();
        setRaceDebugMetricsProvider(null);
        ui.destroy();
        app.destroy();
      } catch (error) {
        console.warn('HMR dispose warning:', error);
      }
    });
  }
})().catch(reportRuntimeError);
