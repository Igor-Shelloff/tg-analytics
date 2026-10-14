window.TG = window.TG || {};
TG.pages = TG.pages || {};

TG.i18n = (function () {
  let strings = {};
  let current = "en";

  const EMBEDDED_EN = {
    "app.title": "TG Analytics",
    "boot.checking": "Starting up…",
    "boot.session": "Restoring session…",
    "common.confirm": "Confirm",
    "common.cancel": "Cancel",
    "common.save": "Save",
    "common.error": "Error",
    "nav.dashboard": "Dashboard",
    "nav.channels": "Channels",
    "nav.settings": "Settings",
    "main.logout": "Sign out",
    "main.logout_confirm": "Sign out and remove the local session?",
    "login.title": "Welcome back",
    "login.subtitle": "Sign in to your Telegram account to get started",
    "login.tab_sms": "SMS / code",
    "login.tab_qr": "QR code",
    "login.api_id": "API ID",
    "login.api_hash": "API Hash",
    "login.phone": "Phone",
    "login.submit": "Sign in",
    "login.working": "Signing in…",
    "login.hint": "Get your API credentials at my.telegram.org",
    "login.connecting": "Connecting to Telegram…",
    "login.success": "Signed in as {name}",
    "login.failed": "Sign in failed: {error}",
    "login.code_title": "Enter confirmation code",
    "login.password_title": "Two-factor password",
    "login.qr_title": "Scan the QR code",
    "dash.empty_title": "No data yet",
    "dash.empty_hint": "Track a channel to see analytics here.",
    "channels.empty_title": "No channels yet",
    "channels.empty_hint": "Add channels you're an admin of to start tracking.",
    "settings.empty_title": "Settings",
    "settings.empty_hint": "Preferences will appear here soon.",
  };

  async function load(lang) {

    strings = { ...EMBEDDED_EN };
    current = lang || "en";

    try {
      const r = await fetch(`locales/${lang}.json`, { cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const data = await r.json();
      strings = { ...EMBEDDED_EN, ...data };
    } catch (e) {
      console.warn("i18n: cannot load locale, using embedded fallback", e);
      if (lang && lang !== "en") {
        try {
          const r2 = await fetch("locales/en.json", { cache: "no-store" });
          if (r2.ok) {
            const d2 = await r2.json();
            strings = { ...EMBEDDED_EN, ...d2 };
          }
        } catch (_) {  }
      }
    }
    apply();
  }

  function t(key, params) {
    let s = strings[key];
    if (s === undefined) s = EMBEDDED_EN[key];
    if (s === undefined) return key;
    if (params) {
      for (const k in params) {
        s = s.replace(new RegExp(`\\{${k}\\}`, "g"), params[k]);
      }
    }
    return s;
  }

  function apply(root) {
    const scope = root || document;
    scope.querySelectorAll("[data-i18n]").forEach(el => {
      const key = el.getAttribute("data-i18n");
      el.textContent = t(key);
    });
    scope.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
      el.setAttribute("placeholder",
        t(el.getAttribute("data-i18n-placeholder")));
    });
  }

  return { load, t, apply, get current() { return current; } };
})();
