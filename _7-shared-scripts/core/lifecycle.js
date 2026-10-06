export function createScope() {
  const controller = new AbortController();
  const disposers = [];
  let closed = false;
  let closing;
  const scope = {
    signal: controller.signal,
    get disposed() { return closed; },
    defer(disposer) { if (closed) { disposer?.(); return disposer; } disposers.push(disposer); return disposer; },
    listen(target, type, listener, options) { target.addEventListener(type, listener, options); scope.defer(() => target.removeEventListener(type, listener, options)); return listener; },
    timeout(fn, ms) { const id = setTimeout(fn, ms); scope.defer(() => clearTimeout(id)); return id; },
    interval(fn, ms) { const id = setInterval(fn, ms); scope.defer(() => clearInterval(id)); return id; },
    frame(fn) { const id = requestAnimationFrame(fn); scope.defer(() => cancelAnimationFrame(id)); return id; },
    async dispose() {
      if (closing) return closing;
      closed = true;
      controller.abort();
      closing = (async () => {
        const errors = [];
        for (const dispose of disposers.reverse()) try { await dispose?.(); } catch (error) { errors.push(error); }
        if (errors.length) console.error('Scope cleanup errors', errors);
        return errors;
      })();
      return closing;
    }
  };
  return scope;
}
