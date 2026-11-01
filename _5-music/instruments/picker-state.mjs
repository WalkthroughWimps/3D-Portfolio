export const PICKER_COLUMNS = 5;

export function createLatestAuditionQueue() {
  let tail = Promise.resolve();
  const versions = new Map();
  return {
    run(key, load, apply) {
      const version = (versions.get(key) || 0) + 1;
      versions.set(key, version);
      const latest = () => versions.get(key) === version;
      const pending = tail.then(async () => {
        if(!latest()) return null;
        const result = await load();
        if(!latest() || !result) return null;
        await apply(result);
        return result;
      });
      tail = pending.catch(() => {});
      return pending;
    },
    cancel(key) { versions.set(key, (versions.get(key) || 0) + 1); }
  };
}
