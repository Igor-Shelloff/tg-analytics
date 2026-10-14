window.TG = window.TG || {};

TG.api = (function () {
  let ready = false;
  const readyPromise = new Promise(resolve => {
    if (window.pywebview && window.pywebview.api) {
      ready = true;
      resolve();
    } else {
      window.addEventListener("pywebviewready", () => {
        ready = true;
        resolve();
      });
    }
  });

  function call(method, ...args) {
    return readyPromise.then(() => {
      const api = window.pywebview.api;
      if (!api || typeof api[method] !== "function") {
        throw new Error(`API method not found: ${method}`);
      }
      return api[method](...args);
    });
  }

  return {
    ready: () => readyPromise,

    getConfig:  () => call("get_config"),
    saveConfig: (patch) => call("save_config", patch),

    setLanguage:         (lang)    => call("set_language", lang),
    setCollectInterval:  (minutes) => call("set_collect_interval", minutes),
    setRetentionDays:    (days)    => call("set_retention_days", days),
    setTheme:            (theme)   => call("set_theme", theme),
    chooseExportDir:     ()        => call("choose_export_dir"),
    getStorageStats:     ()        => call("get_storage_stats"),
    purgeOldData:        ()        => call("purge_old_data"),
    deleteAllTracked:    ()        => call("delete_all_tracked"),
    triggerCollectNow:   ()        => call("trigger_collect_now"),
    getCollectorStatus:  ()        => call("get_collector_status"),

    openLogsDir:   () => call("open_logs_dir"),
    getLogsInfo:   () => call("get_logs_info"),

    hasSession:   () => call("has_session"),
    checkSession: () => call("check_session"),

    loginSms:       (id, h, phone) => call("login_sms", id, h, phone),
    loginQr:        (id, h)        => call("login_qr", id, h),
    submitCode:     (code)         => call("submit_code", code),
    submitPassword: (pwd)          => call("submit_password", pwd),
    cancelAuth:     ()             => call("cancel_auth"),
    logout:         ()             => call("logout"),

    listDialogs:        ()                => call("list_dialogs"),
    listTracked:        ()                => call("list_tracked"),
    trackChannel:       (tg, un, t, subs) => call("track_channel", tg, un, t, subs),
    untrackChannel:     (tg)              => call("untrack_channel", tg),
    collectNow:         (tg)              => call("collect_channel_now", tg),
    resolveChannel:     (identifier)      => call("resolve_channel", identifier),
    addPublicChannel:   (identifier)      => call("add_public_channel", identifier),

    getDashboard: (channelId, days) => call("get_dashboard", channelId, days),

    compareChannels: (ids, days) => call("compare_channels", ids, days),

    exportChannelData: (channelId, days, fmt) =>
      call("export_channel_data", channelId, days, fmt),

    openExternal: (url) => call("open_external_url", url),
  };
})();
