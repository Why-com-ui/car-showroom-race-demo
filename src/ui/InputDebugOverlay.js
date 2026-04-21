// src/ui/InputDebugOverlay.js
export class InputDebugOverlay {
  constructor({ mount = document.body, input, app } = {}) {
    this.mountEl = mount;
    this.input = input;
    this.app = app;
    this.metricsProvider = null;
    this.lastSnapshot = null;

    this.root = document.createElement('aside');
    this.root.setAttribute('aria-live', 'off');
    this.root.style.cssText = [
      'position:fixed',
      'top:12px',
      'right:12px',
      'width:min(420px, calc(100vw - 24px))',
      'max-height:calc(100vh - 24px)',
      'overflow:auto',
      'padding:12px 14px',
      'border:1px solid rgba(0,255,225,0.28)',
      'background:rgba(4,8,18,0.88)',
      'box-shadow:0 12px 40px rgba(0,0,0,0.35)',
      'backdrop-filter:blur(10px)',
      'color:#d7f9ff',
      'font:12px/1.45 ui-monospace,SFMono-Regular,Consolas,Monaco,monospace',
      'z-index:2147483647',
      'pointer-events:none',
      'white-space:pre-wrap',
    ].join(';');
  }

  mount() {
    if (!this.root.parentNode) {
      this.mountEl.appendChild(this.root);
    }
  }

  destroy() {
    if (this.root.parentNode) {
      this.root.parentNode.removeChild(this.root);
    }
  }

  setMetricsProvider(provider) {
    this.metricsProvider = typeof provider === 'function' ? provider : null;
  }

  getSnapshot() {
    const inputSnapshot = this.input?.getDebugSnapshot?.() ?? {};
    const focusSnapshot = this.app?.getFocusDebugSnapshot?.() ?? {};
    const metricsSnapshot = this.metricsProvider?.() ?? null;
    const activeElement = describeActiveElement(document.activeElement);

    this.lastSnapshot = {
      hasDocumentFocus: document.hasFocus(),
      activeElement,
      inputSurfaceFocused: this.app?.isInputSurfaceFocused?.() ?? false,
      focus: focusSnapshot,
      input: inputSnapshot,
      race: metricsSnapshot,
    };

    return this.lastSnapshot;
  }

  render() {
    const snapshot = this.getSnapshot();
    const lines = [
      '[debugInput=1]',
      `document.hasFocus(): ${snapshot.hasDocumentFocus}`,
      `activeElement: ${snapshot.activeElement}`,
      `inputSurfaceFocused: ${snapshot.inputSurfaceFocused}`,
      `surface focus/blur: ${snapshot.focus.surfaceFocusCount ?? 0}/${snapshot.focus.surfaceBlurCount ?? 0}`,
      `pointer focus req: ${snapshot.focus.pointerDownCount ?? 0}`,
      `session active: ${snapshot.input.gameplaySessionActive ?? false}`,
      `held keys: ${(snapshot.input.heldKeys || []).join(', ') || '-'}`,
      `raw keys: ${(snapshot.input.rawKeys || []).join(', ') || '-'}`,
      `axis: ${formatAxis(snapshot.input.axis)}`,
      `clear reason: ${snapshot.input.lastClearReason || '-'}`,
      `clear counts: ${formatClearCounts(snapshot.input.clearCounts)}`,
      '',
      '[race]',
      snapshot.race ? formatRaceSnapshot(snapshot.race) : 'waiting for RaceState...',
      '',
      '[events]',
      ...(snapshot.input.eventLog || []).map(formatEventLine),
    ];

    this.root.textContent = lines.join('\n');
  }
}

function formatAxis(axis = {}) {
  return `throttle=${axis.throttle ?? 0}, steer=${axis.steer ?? 0}`;
}

function formatClearCounts(clearCounts = {}) {
  return Object.entries(clearCounts)
    .map(([key, value]) => `${key}:${value}`)
    .join(' ');
}

function formatRaceSnapshot(race) {
  return [
    `phase: ${race.phase ?? '-'}`,
    `frame: ${race.frame ?? 0}`,
    `time: ${race.timeSec ?? '0.0'}s`,
    `axis: ${formatAxis(race.axis)}`,
    `speed: ${race.speedKmh ?? 0} km/h`,
    `onGround: ${race.onGround ?? false}`,
    `posY: ${race.posY ?? '-'}`,
    `handbrake: ${race.handbrake ?? false}`,
    `road meshes: ${race.roadMeshCount ?? 0}`,
    `reset state: ${race.initialReset ? `y=${race.initialReset.posY}, onGround=${race.initialReset.onGround}` : '-'}`,
  ].join('\n');
}

function formatEventLine(entry) {
  const time = `${(entry.at ?? 0).toFixed(0)}ms`.padStart(7, ' ');
  const repeat = entry.repeat ? ' repeat' : '';
  return `${time} ${entry.type} ${entry.code}${repeat} target=${entry.target}`;
}

function describeActiveElement(activeElement) {
  if (!(activeElement instanceof Element)) return 'none';
  const parts = [activeElement.tagName.toLowerCase()];
  if (activeElement.id) parts.push(`#${activeElement.id}`);
  if (activeElement.classList.length) {
    parts.push(`.${[...activeElement.classList].slice(0, 2).join('.')}`);
  }
  if (activeElement.getAttribute('data-action')) {
    parts.push(`[data-action="${activeElement.getAttribute('data-action')}"]`);
  }
  return parts.join('');
}
