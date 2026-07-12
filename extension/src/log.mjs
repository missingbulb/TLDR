// Tiny leveled console logger shared across every extension context (service worker, side panel,
// options page, category-menu popup, and the link-hover content script). Each line is prefixed
// `[tldr <scope>]` so our output is filterable in DevTools away from host-page / CSP noise — the
// content script in particular runs inside an arbitrary third-party page's console.
//
// Console-only by design (that's the whole ask — visibility without a telemetry backend) and
// dependency-free, so it's safe to pull into the content-script module graph without dragging in
// config/network code.
//
// DISCIPLINE (carried from auth.mjs): NEVER pass a raw token, a full id-token, or an account email
// to these. Log a reason string, a status code, an id, or booleans — never a secret.

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

// The compiled-in default threshold: everything at or above `debug` is emitted, i.e. all of it. The
// user asked for verbose logging, so nothing is dropped by default. Below the active threshold a call
// is a no-op.
let threshold = LEVELS.debug;

// A live override readable from any DevTools console — `globalThis.__tldrLogLevel = 'warn'` quiets the
// chatter without a rebuild, `= 'debug'` restores it. An unrecognized value is ignored (falls back to
// the compiled threshold), so a typo can't silence errors.
function activeThreshold() {
  const override = globalThis.__tldrLogLevel;
  return typeof override === 'string' && override in LEVELS ? LEVELS[override] : threshold;
}

// Change the compiled-in threshold programmatically (mainly for tests / boot code). Unknown level =
// no-op, so errors can never be suppressed by a bad argument.
export function setLogLevel(level) {
  if (level in LEVELS) threshold = LEVELS[level];
}

function emit(consoleMethod, level, scope, args) {
  if (LEVELS[level] < activeThreshold()) return;
  // console.debug/info/warn/error — DevTools colors and lets the reader filter by these natively.
  const fn = console[consoleMethod] ?? console.log;
  fn.call(console, `[tldr ${scope}]`, ...args);
}

// A scoped logger. `scope` is a short context tag (e.g. 'auth', 'sidepanel', 'link-hover') that lands
// in the `[tldr <scope>]` prefix. Usage: `const log = createLogger('vote'); log.warn('failed', err);`
export function createLogger(scope) {
  return {
    debug: (...args) => emit('debug', 'debug', scope, args),
    info: (...args) => emit('info', 'info', scope, args),
    warn: (...args) => emit('warn', 'warn', scope, args),
    error: (...args) => emit('error', 'error', scope, args),
  };
}
