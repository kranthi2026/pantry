// Speech-to-text that works in three places:
//  1. Installed app (Capacitor) on Android/iPhone -> native speech plugin
//  2. Chrome / Edge / Safari in the browser       -> Web Speech API
//  3. Anything else                                -> not available (user types instead)

function nativePlugin() {
  const cap = window.Capacitor;
  if (!cap || !cap.isNativePlatform || !cap.isNativePlatform()) return null;
  try {
    return (cap.Plugins && cap.Plugins.SpeechRecognition) || (cap.registerPlugin && cap.registerPlugin('SpeechRecognition')) || null;
  } catch (e) {
    return null;
  }
}

function webRecognizer() {
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

export function isSupported() {
  return !!(nativePlugin() || window.SpeechRecognition || window.webkitSpeechRecognition);
}

// listen({ onPartial }) -> Promise<string> with the final sentence.
// Returns a handle with stop() so the user can end listening early.
export function listen({ onPartial = () => {}, lang = 'en-US' } = {}) {
  const plugin = nativePlugin();
  if (plugin) return listenNative(plugin, onPartial, lang);
  const rec = webRecognizer();
  if (rec) return listenWeb(rec, onPartial, lang);
  return { promise: Promise.reject(new Error('unsupported')), stop() {} };
}

// Phones often end recognition at the first short pause ("add iron white shelves …"
// and then "to Walmart" is lost). So when the engine stops while the person was
// still talking, we start it again and join the pieces, until they are quiet for
// a moment, tap "Done speaking", or 20 seconds pass.
const KEEP_GOING_MS = 1600;   // restart if speech was heard this recently
const MAX_MS = 20000;

function listenWeb(rec, onPartial, lang) {
  let done = '';          // text from earlier rounds
  let roundFinal = '';    // final text in the current round
  let roundInterim = '';
  let lastHeard = 0;
  let stopped = false;
  const started = Date.now();
  rec.lang = lang;
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;

  const join = (...parts) => parts.map((p) => p.trim()).filter(Boolean).join(' ');
  const current = () => join(done, roundFinal || roundInterim);

  const promise = new Promise((resolve, reject) => {
    rec.onresult = (event) => {
      let fin = '';
      let interim = '';
      for (let i = 0; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) fin += r[0].transcript + ' ';
        else interim += r[0].transcript + ' ';
      }
      roundFinal = join(fin, interim);
      roundInterim = '';
      lastHeard = Date.now();
      onPartial(current());
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return; // onend decides
      stopped = true;
      if (current()) resolve(current());
      else reject(new Error(e.error || 'speech-error'));
    };
    rec.onend = () => {
      const text = current();
      const stillTalking = lastHeard && Date.now() - lastHeard < KEEP_GOING_MS;
      if (!stopped && stillTalking && Date.now() - started < MAX_MS) {
        done = text;
        roundFinal = '';
        roundInterim = '';
        try { rec.start(); return; } catch (err) { /* fall through and finish */ }
      }
      stopped = true;
      resolve(text);
    };
    try {
      rec.start();
    } catch (e) {
      reject(e);
    }
  });

  return { promise, stop: () => { stopped = true; try { rec.stop(); } catch (e) { /* already stopped */ } } };
}

function listenNative(plugin, onPartial, lang) {
  let latest = '';
  let partialHandle = null;
  let stateHandle = null;
  let finish;

  const cleanup = () => {
    if (partialHandle && partialHandle.remove) partialHandle.remove();
    if (stateHandle && stateHandle.remove) stateHandle.remove();
  };

  const promise = new Promise(async (resolve, reject) => {
    finish = (text) => { cleanup(); resolve((text || latest).trim()); };
    try {
      const avail = await plugin.available();
      if (avail && avail.available === false) throw new Error('unsupported');
      const perm = await plugin.checkPermissions();
      if (!perm || perm.speechRecognition !== 'granted') {
        const asked = await plugin.requestPermissions();
        if (!asked || asked.speechRecognition !== 'granted') throw new Error('not-allowed');
      }
      partialHandle = await plugin.addListener('partialResults', (data) => {
        const text = data && data.matches && data.matches[0];
        if (text) { latest = text; onPartial(text); }
      });
      stateHandle = await plugin.addListener('listeningState', (data) => {
        if (data && data.status === 'stopped') finish(latest);
      });
      const result = await plugin.start({ language: lang, maxResults: 1, partialResults: true, popup: false });
      // Some platforms return the final text from start() directly.
      if (result && result.matches && result.matches[0]) finish(result.matches[0]);
    } catch (e) {
      cleanup();
      reject(e);
    }
  });

  return {
    promise,
    stop: async () => {
      try { await plugin.stop(); } catch (e) { /* already stopped */ }
      if (finish) finish(latest);
    }
  };
}
