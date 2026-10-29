# Pantry – Voice Shopping List

Say an item and a shop, and Pantry saves it under that shop.

> "Buy milk and eggs from Costco" → **Costco:** Milk, Eggs
> "Save phone charger under Amazon" → **Amazon:** Phone charger
> "Remind me to call the dentist" → **Reminder:** Call the dentist
> "Add shop Home Depot" → creates a new shop

Works on **Android and iPhone**. Lists are saved **on the phone** (no account, works offline).

---

## What's in the app

| Screen | What it does |
|---|---|
| **Home – My Lists** | Shops on the left, items on the right. Tap a shop to see only its items; tap the **cart** (top right) to see everything. Tap an item to mark it bought → it moves to **Done**, where **Clear** removes it (with Undo). Type in the **Add an item** box, or use the **search** button to find any item across all lists. |
| **Listening** | Tap the big green **mic**, speak, check what Pantry understood (shop + items), then **Save**. You can change the shop or remove an item before saving. **Type instead** works everywhere, even without a mic. |
| **Manage shops** | **+ Add shop** opens a form: name, "Also listen for" spellings (tap the mic and say the shop name, and what the phone hears is added), and a color. Tap the pencil on any shop to edit or delete it (its items move to Unsorted). |

**Reminder** and **Unsorted** are built-in lists. Anything said without a shop name goes to Unsorted.

---

## Project layout

```
www/                 the app (plain HTML/CSS/JavaScript – no build step)
  index.html
  css/styles.css
  js/app.js          screens and buttons
  js/parser.js       turns a sentence into shop + items
  js/speech.js       microphone: native plugin in the app, Web Speech API in browsers
  js/storage.js      saves lists on the phone
  js/defaults.js     starting shops and colors
  manifest.webmanifest, sw.js, icons/   install-to-home-screen + offline support
tests/parser.test.mjs  tests for the voice parser
capacitor.config.json  settings for the Android / iPhone apps
.github/workflows/pages.yml  publishes the app to GitHub Pages
```

---

## Option 1 – Use it on both phones today (easiest, free)

This publishes Pantry as a website you install to the home screen.

1. In this GitHub repo go to **Settings → Pages → Source → GitHub Actions**.
2. Push anything to `main` (or open **Actions → Publish to GitHub Pages → Run workflow**).
3. Your app is live at `https://<your-username>.github.io/pantry/`.
4. **Android (Chrome):** open the link → ⋮ menu → **Add to Home screen / Install app**.
   **iPhone (Safari):** open the link → Share button → **Add to Home Screen**.
5. The first time you tap the mic, allow microphone access.

Voice works in Chrome on Android and in Safari on iPhone (iOS 14.5 or newer).

## Option 2 – Real Android / iPhone apps (Capacitor)

You need **Node.js 20+** installed on your computer.

```bash
git clone https://github.com/<your-username>/pantry.git
cd pantry
npm install
```

### Android (Windows, Mac or Linux)
Install **Android Studio**, then:
```bash
npm run android        # creates the android/ project and opens Android Studio
```
The microphone permission is added automatically by the speech plugin.
Press **Run ▶** in Android Studio with your phone plugged in (turn on USB debugging),
or use **Build → Generate Signed Bundle** to make a file for the Google Play Store.

### iPhone (needs a Mac with Xcode)
```bash
npm run ios            # creates the ios/ project and opens Xcode
```
In Xcode open `App/App/Info.plist` and add:
- **Privacy – Microphone Usage Description**: `Pantry listens when you tap the mic to add items.`
- **Privacy – Speech Recognition Usage Description**: `Pantry turns what you say into list items.`

Choose your iPhone and press **Run ▶**. A free Apple ID lets you install on your own
phone; publishing to the App Store needs an Apple Developer account.

### After changing anything in `www/`
```bash
npm run sync
```

---

## Run it on your computer

```bash
npm start              # opens http://localhost:5173
npm test               # checks the voice parser
```
Voice works in Chrome/Edge on desktop; in other browsers use **Type instead**.

## Tips for "Hey Google"
Pantry's mic works inside the app. Saying *"Hey Google, tell Pantry to…"* requires
Google App Actions in the Android app, which can be added later.
