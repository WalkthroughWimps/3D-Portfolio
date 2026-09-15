// Preferences must remain usable when browser storage is full or unavailable.
// Only failed writes are kept here; successful reads still see other tabs' edits.
export function createLocalPreferences(getStorage = () => window.localStorage) {
    const unsaved = new Map();
    return {
        getItem(key) {
            key = String(key);
            if (unsaved.has(key)) return unsaved.get(key);
            try { return getStorage().getItem(key); } catch { return null; }
        },
        setItem(key, value) {
            key = String(key);
            value = String(value);
            try {
                getStorage().setItem(key, value);
                unsaved.delete(key);
            } catch {
                unsaved.set(key, value);
            }
        },
        removeItem(key) {
            key = String(key);
            try {
                getStorage().removeItem(key);
                unsaved.delete(key);
            } catch {
                unsaved.set(key, null);
            }
        }
    };
}

export const localPreferences = createLocalPreferences();
