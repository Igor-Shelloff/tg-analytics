TG.pages.login = (function () {

  const state = {
    method: "sms",
    busy: false,
    config: {},
  };

  function render(params) {
    state.config = (params && params.config) || {};

    const root = document.createElement("div");
    root.className = "login-page";
    root.innerHTML = `
      <div class="login-bg"></div>
      <div class="login-card">
        <div class="login-logo">
          <svg class="icon" style="width:28px;height:28px;">
            <use href="#i-send"/>
          </svg>
        </div>
        <h1 class="login-title" data-i18n="login.title"></h1>
        <p class="login-subtitle" data-i18n="login.subtitle"></p>

        <div class="login-tabs">
          <div class="tabs">
            <button class="tab active" data-method="sms" data-i18n="login.tab_sms"></button>
            <button class="tab" data-method="qr" data-i18n="login.tab_qr"></button>
          </div>
        </div>

        <form class="login-form" id="login-form">
          <div class="field">
            <label data-i18n="login.api_id"></label>
            <input class="input" type="text" name="api_id"
                   placeholder="12345678" autocomplete="off" spellcheck="false">
          </div>
          <div class="field">
            <label data-i18n="login.api_hash"></label>
            <input class="input" type="text" name="api_hash"
                   placeholder="0123456789abcdef0123456789abcdef"
                   autocomplete="off" spellcheck="false">
          </div>
          <div class="field" id="phone-field">
            <label data-i18n="login.phone"></label>
            <input class="input" type="tel" name="phone"
                   placeholder="+1 555 0100" autocomplete="off" spellcheck="false">
          </div>

          <button type="submit" class="btn btn-primary btn-block" id="login-submit">
            <span data-i18n="login.submit"></span>
          </button>
        </form>

        <div class="login-status" id="login-status" style="display:none"></div>

        <p class="login-hint" data-i18n="login.hint"></p>
      </div>
    `;

    setTimeout(() => {
      const c = state.config || {};
      if (c.api_id)   root.querySelector('[name="api_id"]').value   = c.api_id;
      if (c.api_hash) root.querySelector('[name="api_hash"]').value = c.api_hash;
      if (c.phone)    root.querySelector('[name="phone"]').value    = c.phone;
    }, 0);

    return root;
  }

  function onMount() {
    const page = document.querySelector(".login-page");
    if (!page) return;

    page.querySelectorAll(".tab").forEach(tab => {
      tab.onclick = () => {
        if (state.busy) return;
        page.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        state.method = tab.dataset.method;
        const phoneField = page.querySelector("#phone-field");
        phoneField.style.display = state.method === "sms" ? "" : "none";
      };
    });

    page.querySelector("#login-form").onsubmit = e => {
      e.preventDefault();
      if (state.busy) return;
      handleSubmit(page);
    };
  }

  async function handleSubmit(page) {
    const apiId   = page.querySelector('[name="api_id"]').value.trim();
    const apiHash = page.querySelector('[name="api_hash"]').value.trim();
    const phone   = page.querySelector('[name="phone"]').value.trim();

    if (!apiId || !apiHash) return setStatus("err", "API ID and API Hash are required");
    if (!/^\d+$/.test(apiId)) return setStatus("err", "API ID must be digits");
    if (state.method === "sms" && !phone) return setStatus("err", "Phone is required");

    setBusy(page, true);
    setStatus("info", TG.i18n.t("login.connecting"));

    try {
      let result;
      if (state.method === "sms") {
        result = await TG.api.loginSms(apiId, apiHash, phone);
      } else {
        result = await TG.api.loginQr(apiId, apiHash);
      }

      if (result && result.ok) {
        setStatus("ok", TG.i18n.t("login.success", { name: result.message }));
        setTimeout(() => {
          document.dispatchEvent(new CustomEvent("tg:signed-in", {
            detail: { user: result.message },
          }));
        }, 500);
      } else {
        const msg = (result && result.message) || "unknown";
        setStatus("err", TG.i18n.t("login.failed", { error: msg }));
        setBusy(page, false);

        document.dispatchEvent(new CustomEvent("tg:auth-failed"));
      }
    } catch (e) {
      setStatus("err", TG.i18n.t("login.failed", { error: String(e) }));
      setBusy(page, false);
      document.dispatchEvent(new CustomEvent("tg:auth-failed"));
    }
  }

  function setBusy(page, busy) {
    state.busy = busy;
    const btn = page.querySelector("#login-submit");
    const inputs = page.querySelectorAll("input");
    inputs.forEach(i => { i.disabled = busy; });
    page.querySelectorAll(".tab").forEach(t => {
      t.style.pointerEvents = busy ? "none" : "";
    });
    if (busy) {
      btn.disabled = true;
      btn.innerHTML = `<div class="spinner"></div><span>${TG.i18n.t("login.working")}</span>`;
    } else {
      btn.disabled = false;
      btn.innerHTML = `<span>${TG.i18n.t("login.submit")}</span>`;
    }
  }

  function setStatus(kind, message) {
    const el = document.getElementById("login-status");
    if (!el) return;
    el.style.display = "";
    el.className = "login-status " + (kind === "info" ? "" : kind);
    el.textContent = message;
  }

  return { titleKey: "login.title", render, onMount };
})();
