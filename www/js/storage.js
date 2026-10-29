// Saves everything on the phone. Inside the installed app (Capacitor) it uses
// the native Preferences store, which iOS/Android will not clear on their own.
// In a browser it falls back to localStorage.
const KEY = 'pantry-data-v1';

function nativePreferences() {
  const cap = window.Capacitor;
  if (!cap || !cap.isNativePlatform || !cap.isNativePlatform()) return null;
  try {
    return (cap.Plugins && cap.Plugins.Preferences) || (cap.registerPlugin && cap.registerPlugin('Preferences')) || null;
  } catch (e) {
    return null;
  }
}

export async function load() {
  const prefs = nativePreferences();
  try {
    if (prefs) {
      const { value } = await prefs.get({ key: KEY });
      return value ? JSON.parse(value) : null;
    }
    const raw = window.localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn('Could not load saved lists', e);
    return null;
  }
}

export async function save(data) {
  const value = JSON.stringify(data);
  const prefs = nativePreferences();
  try {
    if (prefs) await prefs.set({ key: KEY, value });
    else window.localStorage.setItem(KEY, value);
  } catch (e) {
    console.warn('Could not save lists', e);
  }
}
