(() => {
  const state = {
    activeView: "stream",
    apiOrigin: "",
    apiToken: "",
    commandPaletteActiveIndex: 0,
    commandPaletteQuery: "",
    correlationGroups: [],
    detailEntriesById: new Map(),
    expanded: new Set(),
    hasMoreLogs: false,
    healthAbortController: null,
    healthRequestId: 0,
    insightsAbortController: null,
    insightsRequestId: 0,
    isRestoringScope: false,
    lastAppliedScope: null,
    logsAbortController: null,
    logsRequestId: 0,
    timelineBucketMsOverride: null,
    timelineFilter: null,
    timelineSelectionEndIndex: null,
    timelineSelectionPointerId: null,
    timelineSelectionStartIndex: null,
    timelineSelectionSuppressClick: false,
    logs: [],
    nextCursor: "",
    recentScopes: [],
    savedQueries: [],
    scopeHistory: [],
    serverInsights: {
      errorCorrelations: [],
      levelDistribution: [],
      topComponents: [],
      topEvents: [],
    },
    webhookHealth: {
      alerting: null,
      alertPolicy: null,
      error: "",
      loadedAt: 0,
      loading: false,
    },
    webhookCrud: {
      available: false,
      endpoints: {
        configGet: null,
        configPut: null,
        test: null,
      },
      error: "",
      loading: false,
      policy: null,
    },
    visibleLogs: [],
  };

  const elements = {
    activeQueryChips: document.getElementById("active-query-chips"),
    clearLocalButton: document.getElementById("clear-local-button"),
    correlationGroups: document.getElementById("correlation-groups"),
    errorCorrelations: document.getElementById("error-correlations"),
    fieldOptions: document.getElementById("field-options"),
    timeline: document.getElementById("timeline"),
    timelineBucketSize: document.getElementById("timeline-bucket-size"),
    timelinePane: document.getElementById("view-timeline"),
    timelineTooltip: document.getElementById("timeline-tooltip"),
    levelDistribution: document.getElementById("level-distribution"),
    localField: document.getElementById("local-field"),
    localFilterForm: document.getElementById("local-filter-form"),
    localMatchMode: document.getElementById("local-match-mode"),
    localValue: document.getElementById("local-value"),
    logsModalTbody: document.getElementById("logs-modal-tbody"),
    logsTbody: document.getElementById("logs-tbody"),
    streamLoadMoreButton: document.getElementById("stream-load-more-button"),
    metricCorrelations: document.getElementById("metric-correlations"),
    metricErrors: document.getElementById("metric-errors"),
    metricLoaded: document.getElementById("metric-loaded"),
    metricVisible: document.getElementById("metric-visible"),
    presetButtons: Array.from(document.querySelectorAll("[data-preset]")),
    queryAudit: document.getElementById("query-audit"),
    queryDetails: document.querySelector(".query-details"),
    queryField: document.getElementById("query-field"),
    queryFrom: document.getElementById("query-from"),
    queryFromTime: document.getElementById("query-from-time"),
    queryLevel: document.getElementById("query-level"),
    queryLimit: document.getElementById("query-limit"),
    queryToTime: document.getElementById("query-to-time"),
    queryTo: document.getElementById("query-to"),
    queryValue: document.getElementById("query-value"),
    rangeAllButtons: Array.from(document.querySelectorAll("[data-range-all]")),
    rangeButtons: Array.from(document.querySelectorAll("[data-range-hours]")),
    recentScopeSelect: document.getElementById("recent-scope-select"),
    applyRecentScopeButton: document.getElementById("apply-recent-scope-button"),
    refreshButton: document.getElementById("refresh-button"),
    resetBaselineButton: document.getElementById("reset-baseline-button"),
    remoteQueryForm: document.getElementById("remote-query-form"),
    commandPaletteButton: document.getElementById("command-palette-button"),
    commandPaletteInput: document.getElementById("command-palette-input"),
    commandPaletteList: document.getElementById("command-palette-list"),
    commandPaletteModal: document.getElementById("command-palette-modal"),
    webhookConfigButton: document.getElementById("webhook-config-button"),
    webhookConfigModal: document.getElementById("webhook-config-modal"),
    webhookConfigModalClose: document.getElementById("webhook-config-modal-close"),
    shortcutsHelpButton: document.getElementById("shortcuts-help-button"),
    shortcutsModal: document.getElementById("shortcuts-modal"),
    shortcutsModalClose: document.getElementById("shortcuts-modal-close"),
    saveQueryButton: document.getElementById("save-query-button"),
    savedQueryName: document.getElementById("saved-query-name"),
    savedQuerySelect: document.getElementById("saved-query-select"),
    copyViewUrlButton: document.getElementById("copy-view-url-button"),
    deleteSavedQueryButton: document.getElementById("delete-saved-query-button"),
    sortDirection: document.getElementById("sort-direction"),
    sortField: document.getElementById("sort-field"),
    statusLine: document.getElementById("status-line"),
    scopeBackButton: document.getElementById("scope-back-button"),
    scopeTrail: document.getElementById("scope-trail"),
    workspacePanel: document.querySelector(".workspace-panel"),
    inspectDetails: document.querySelector(".inspect-panel"),
    insightsDetails: document.querySelector(".insights-details"),
    traceClearButton: document.getElementById("trace-clear-button"),
    traceField: document.getElementById("trace-field"),
    traceGoButton: document.getElementById("trace-go-button"),
    traceList: document.getElementById("trace-list"),
    traceValue: document.getElementById("trace-value"),
    streamExpandButton: document.getElementById("stream-expand-button"),
    streamClearButton: document.getElementById("stream-clear-button"),
    streamModal: document.getElementById("stream-modal"),
    streamModalClearButton: document.getElementById("stream-modal-clear-button"),
    streamModalClose: document.getElementById("stream-modal-close"),
    themeToggle: document.getElementById("theme-toggle"),
    topComponents: document.getElementById("top-components"),
    topEvents: document.getElementById("top-events"),
    webhookAlertEnabled: document.getElementById("webhook-alert-enabled"),
    webhookConfigured: document.getElementById("webhook-configured"),
    webhookLoopRunning: document.getElementById("webhook-loop-running"),
    webhookSentSuppressed: document.getElementById("webhook-sent-suppressed"),
    webhookTimeoutRetry: document.getElementById("webhook-timeout-retry"),
    webhookLastSuccess: document.getElementById("webhook-last-success"),
    webhookStatusNote: document.getElementById("webhook-status-note"),
    webhookRefreshButton: document.getElementById("webhook-refresh-button"),
    webhookCrudNote: document.getElementById("webhook-crud-note"),
    webhookCrudForm: document.getElementById("webhook-crud-form"),
    webhookCrudUrl: document.getElementById("webhook-crud-url"),
    webhookCrudEnabled: document.getElementById("webhook-crud-enabled"),
    webhookCrudIntervalMs: document.getElementById("webhook-crud-interval-ms"),
    webhookCrudWindowMinutes: document.getElementById("webhook-crud-window-minutes"),
    webhookCrudErrorThreshold: document.getElementById("webhook-crud-error-threshold"),
    webhookCrudNoLogsThresholdMinutes: document.getElementById(
      "webhook-crud-no-logs-threshold-minutes",
    ),
    webhookCrudCooldownMs: document.getElementById("webhook-crud-cooldown-ms"),
    webhookCrudTimeoutMs: document.getElementById("webhook-crud-timeout-ms"),
    webhookCrudRetryAttempts: document.getElementById("webhook-crud-retry-attempts"),
    webhookCrudBackoffMs: document.getElementById("webhook-crud-backoff-ms"),
    webhookCrudRefreshButton: document.getElementById("webhook-crud-refresh-button"),
    webhookCrudCreateButton: document.getElementById("webhook-crud-create-button"),
    webhookCrudUpdateButton: document.getElementById("webhook-crud-update-button"),
    webhookCrudDeleteButton: document.getElementById("webhook-crud-delete-button"),
    webhookCrudClearButton: document.getElementById("webhook-crud-clear-button"),
    viewPanes: Array.from(document.querySelectorAll(".view-pane")),
    viewTabs: Array.from(document.querySelectorAll(".view-tab")),
  };

  const STORAGE_KEY_THEME = "mikroscope-console-theme";
  const THEME_ICONS = {
    moon: '<svg class="icon" aria-hidden="true"><use href="#icon-moon"></use></svg>',
    sun: '<svg class="icon" aria-hidden="true"><use href="#icon-sun"></use></svg>',
  };
  const STORAGE_KEY_RECENT_SCOPES = "mikroscope-console-recent-scopes";
  const STORAGE_KEY_SAVED_QUERIES = "mikroscope-console-saved-queries";
  const DEFAULT_QUERY_LIMIT = 1000;
  const MAX_QUERY_LIMIT = 1000;
  const MAX_RECENT_SCOPES = 16;
  const MAX_SCOPE_HISTORY = 24;
  const SCOPE_TRAIL_WINDOW = 3;
  const QUERY_KEYS = ["from", "to", "level", "audit", "field", "value", "limit"];
  const VALID_LEVELS = new Set(["", "DEBUG", "INFO", "WARN", "ERROR"]);
  const BASE_SORT_FIELDS = [
    "timestamp",
    "level",
    "event",
    "message",
    "data.correlationId",
    "data.requestId",
    "data.customerId",
    "data.component",
  ];
  const DEFAULT_ALERT_POLICY = Object.freeze({
    cooldownMs: 300000,
    enabled: false,
    errorThreshold: 20,
    intervalMs: 30000,
    noLogsThresholdMinutes: 0,
    webhookBackoffMs: 250,
    webhookRetryAttempts: 3,
    webhookTimeoutMs: 5000,
    webhookUrl: "",
    windowMinutes: 5,
  });
  const themeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

  function setStatus(message) {
    elements.statusLine.textContent = message;
  }

  function showErrorAlert(message) {
    if (typeof window.alert === "function") {
      window.alert(message);
    }
  }

  function updateSaveQueryButtonState() {
    if (!elements.saveQueryButton) return;
    const hasName = safeText(elements.savedQueryName?.value).trim().length > 0;
    elements.saveQueryButton.disabled = !hasName;
  }

  function isAbortError(error) {
    return Boolean(
      error && typeof error === "object" && "name" in error && error.name === "AbortError",
    );
  }

  function beginLogsRequest() {
    setRunQueryButtonState("running");
    const requestId = ++state.logsRequestId;
    if (state.logsAbortController) {
      state.logsAbortController.abort();
    }
    const controller = new AbortController();
    state.logsAbortController = controller;
    return {
      requestId,
      signal: controller.signal,
    };
  }

  function hasScopeToClear() {
    const from = safeText(elements.queryFrom?.value).trim();
    const to = safeText(elements.queryTo?.value).trim();
    const level = safeText(elements.queryLevel?.value).trim();
    const audit = safeText(elements.queryAudit?.value).trim();
    const field = safeText(elements.queryField?.value).trim();
    const value = safeText(elements.queryValue?.value).trim();
    return Boolean(from || to || level || audit || state.timelineFilter || (field && value));
  }

  function updateScopeClearVisibility() {
    const hasScope = hasScopeToClear();
    if (elements.streamModalClearButton) {
      elements.streamModalClearButton.hidden = !hasScope;
      elements.streamModalClearButton.disabled = !hasScope;
    }
    if (elements.streamClearButton) {
      elements.streamClearButton.hidden = !hasScope;
      elements.streamClearButton.disabled = !hasScope;
    }
  }

  function setRunQueryButtonState(mode) {
    if (!elements.refreshButton) return;
    elements.refreshButton.classList.remove("is-running", "is-done");
    elements.workspacePanel?.classList.remove("is-loading");
    elements.refreshButton.disabled = false;
    if (mode === "running") {
      elements.refreshButton.classList.add("is-running");
      elements.workspacePanel?.classList.add("is-loading");
      elements.refreshButton.disabled = true;
      updateScopeBackButtonState();
      updateRecentScopeRestoreButtonState();
      return;
    }
    if (mode === "done") {
      elements.refreshButton.classList.add("is-done");
      window.setTimeout(() => {
        elements.refreshButton.classList.remove("is-done");
      }, 520);
    }
    updateScopeBackButtonState();
    updateRecentScopeRestoreButtonState();
  }

  function runQueryNow() {
    if (elements.refreshButton.disabled) return;
    state.timelineFilter = null;
    setRunQueryButtonState("running");
    void fetchLogs()
      .then((applied) => {
        if (!applied) return;
        setRunQueryButtonState("done");
      })
      .catch((error) => {
        setRunQueryButtonState("idle");
        setStatus(String(error));
      });
  }

  function clearLocalFilter() {
    elements.localField.value = "";
    elements.localValue.value = "";
    elements.localMatchMode.value = "contains";
    elements.sortField.value = "timestamp";
    elements.sortDirection.value = "desc";
    applyLocalView();
  }

  function copyCurrentViewPath(sourceButton = null) {
    const path = buildViewPathFromControls();
    void copyText(path)
      .then(() => {
        if (sourceButton) {
          flashCopyState(sourceButton, true);
        }
        setStatus("Copied current view URL path.");
      })
      .catch(() => {
        if (sourceButton) {
          flashCopyState(sourceButton, false);
        }
        setStatus("Could not copy current view URL path.");
      });
  }

  function getLocalStorageSafe() {
    try {
      const storage = window.localStorage;
      if (!storage) return null;
      if (typeof storage.getItem !== "function") return null;
      if (typeof storage.setItem !== "function") return null;
      return storage;
    } catch {
      return null;
    }
  }

  function readStorageItem(key) {
    const storage = getLocalStorageSafe();
    if (!storage) return null;
    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  }

  function writeStorageItem(key, value) {
    const storage = getLocalStorageSafe();
    if (!storage) return false;
    try {
      storage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  function toggleThemeNow() {
    const currentTheme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const nextTheme = currentTheme === "dark" ? "light" : "dark";
    writeStorageItem(STORAGE_KEY_THEME, nextTheme);
    applyTheme(nextTheme);
  }

  function resetToBaselineQuery() {
    setRangeHours(720);
    elements.queryLevel.value = "";
    elements.queryAudit.value = "";
    elements.queryLimit.value = String(DEFAULT_QUERY_LIMIT);
    setServerFilter("", "");
    elements.localField.value = "";
    elements.localValue.value = "";
    elements.localMatchMode.value = "contains";
    elements.sortField.value = "timestamp";
    elements.sortDirection.value = "desc";
    state.timelineFilter = null;
    state.timelineBucketMsOverride = null;
    if (elements.timelineBucketSize) {
      elements.timelineBucketSize.value = "auto";
    }
    setActiveView("stream");
    syncQueryToUrl();
    void fetchLogs().catch((error) => {
      setStatus(String(error));
    });
  }

  function runPinnedPresetQuery(presetName) {
    applyPinnedPreset(presetName);
    void fetchLogs().catch((error) => {
      setStatus(String(error));
    });
  }

  function toggleStreamModal() {
    updateScopeClearVisibility();
    if (elements.streamModal.open) {
      elements.streamModal.close();
      return;
    }
    elements.streamModal.showModal();
  }

  function toggleShortcutsModal() {
    if (!elements.shortcutsModal) return;
    if (elements.shortcutsModal.open) {
      elements.shortcutsModal.close();
      return;
    }
    elements.shortcutsModal.showModal();
  }

  function toggleWebhookConfigModal() {
    if (!elements.webhookConfigModal) return;
    if (elements.webhookConfigModal.open) {
      elements.webhookConfigModal.close();
      return;
    }
    elements.webhookConfigModal.showModal();
  }

  function normalizeCommandPaletteText(value) {
    return safeText(value).trim().toLowerCase();
  }

  function buildCommandPaletteActions() {
    const queryPanelAction = elements.queryDetails?.open
      ? "Hide query controls"
      : "Show query controls";
    const inspectPanelAction = elements.inspectDetails?.open
      ? "Hide inspect panel"
      : "Show inspect panel";
    const insightsPanelAction = elements.insightsDetails?.open
      ? "Hide insights panel"
      : "Show insights panel";
    const streamModalAction = elements.streamModal?.open
      ? "Close expanded stream"
      : "Open expanded stream";
    const shortcutsAction = elements.shortcutsModal?.open
      ? "Hide keyboard shortcuts"
      : "Show keyboard shortcuts";
    const webhookConfigAction = elements.webhookConfigModal?.open
      ? "Hide alert webhook config"
      : "Show alert webhook config";
    const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";

    return [
      {
        id: "run-query",
        icon: "#icon-play",
        label: "Run query",
        detail: "Fetch logs with current filters",
        keywords: "refresh play enter fetch",
        shortcut: "Enter",
        run: () => runQueryNow(),
      },
      {
        id: "reset-baseline-query",
        icon: "#icon-reset",
        label: "Reset to baseline query",
        detail: "Reset scope, filters, and view to default 30d stream",
        keywords: "reset baseline defaults clear all",
        shortcut: "X",
        run: () => resetToBaselineQuery(),
      },
      {
        id: "copy-view-url",
        icon: "#icon-link",
        label: "Copy current view URL",
        detail: "Share exact filters and scope",
        keywords: "url path share link",
        shortcut: "U",
        run: () => copyCurrentViewPath(),
      },
      {
        id: "refresh-webhook-health",
        icon: "#icon-refresh",
        label: "Refresh alert webhook status",
        detail: "Fetch /health alerting policy and runtime state",
        keywords: "health webhook alert policy status",
        run: () => {
          void refreshWebhookHealth({ notify: true });
        },
      },
      {
        id: "refresh-webhook-crud",
        icon: "#icon-webhook",
        label: "Reload alert webhook config",
        detail: "Re-check /openapi.json and load /api/alerts/config",
        keywords: "webhook alerts config openapi",
        run: () => {
          void refreshWebhookCrudCapabilities({ notify: true });
        },
      },
      {
        id: "open-webhook-config",
        icon: "#icon-webhook",
        label: webhookConfigAction,
        detail: "Open modal for alert webhook policy and test webhook",
        keywords: "webhook alert config modal",
        shortcut: "W",
        run: () => toggleWebhookConfigModal(),
      },
      {
        id: "view-stream",
        icon: "#icon-list",
        label: "Open stream view",
        detail: "Focus log stream",
        keywords: "stream tab logs",
        shortcut: "S",
        run: () => setActiveView("stream"),
      },
      {
        id: "view-correlations",
        icon: "#icon-network",
        label: "Open correlations view",
        detail: "Focus correlation cards",
        keywords: "correlations tab cards",
        shortcut: "C",
        run: () => setActiveView("correlations"),
      },
      {
        id: "view-timeline",
        icon: "#icon-timeline",
        label: "Open timeline view",
        detail: "Focus timeline histogram",
        keywords: "timeline tab buckets",
        shortcut: "T",
        run: () => setActiveView("timeline"),
      },
      {
        id: "toggle-query-controls",
        icon: "#icon-panel-top",
        label: queryPanelAction,
        detail: "Toggle top query panel",
        keywords: "query controls panel open close",
        shortcut: "Q",
        run: () => toggleDetailsPanel(elements.queryDetails),
      },
      {
        id: "toggle-inspect-panel",
        icon: "#icon-panel-right",
        label: inspectPanelAction,
        detail: "Toggle inspect panel",
        keywords: "inspect panel open close",
        shortcut: "I",
        run: () => toggleDetailsPanel(elements.inspectDetails),
      },
      {
        id: "toggle-insights-panel",
        icon: "#icon-spark",
        label: insightsPanelAction,
        detail: "Toggle insights panel",
        keywords: "insights panel open close",
        shortcut: "N",
        run: () => toggleDetailsPanel(elements.insightsDetails),
      },
      {
        id: "toggle-stream-expanded",
        icon: "#icon-expand",
        label: streamModalAction,
        detail: "Toggle expanded stream table",
        keywords: "expand modal full screen space",
        shortcut: "Space",
        run: () => toggleStreamModal(),
      },
      {
        id: "toggle-shortcuts",
        icon: "#icon-keyboard",
        label: shortcutsAction,
        detail: "Open shortcut reference",
        keywords: "shortcuts keyboard help question",
        shortcut: "?",
        run: () => toggleShortcutsModal(),
      },
      {
        id: "toggle-theme",
        icon: "#icon-theme",
        label: `Switch to ${nextTheme} mode`,
        detail: "Toggle light/dark theme",
        keywords: "theme light dark",
        run: () => toggleThemeNow(),
      },
      {
        id: "clear-local-filter",
        icon: "#icon-filter",
        label: "Clear local filter",
        detail: "Reset field/value/match and sort",
        keywords: "clear local filter sort",
        run: () => clearLocalFilter(),
      },
      {
        id: "preset-errors-24h",
        icon: "#icon-alert",
        label: "Run preset: Errors 24h",
        detail: "Set 24h range + ERROR level",
        keywords: "preset errors",
        run: () => runPinnedPresetQuery("errors24h"),
      },
      {
        id: "preset-audit-7d",
        icon: "#icon-alert",
        label: "Run preset: Audit 7d",
        detail: "Set 7d range + audit only",
        keywords: "preset audit",
        run: () => runPinnedPresetQuery("audit7d"),
      },
      {
        id: "clear-trace-scope",
        icon: "#icon-trace",
        label: "Clear trace/correlation scope",
        detail: "Remove active trace filter and reload logs",
        keywords: "trace correlation clear scope",
        run: () => clearTraceNavigation(),
      },
    ];
  }

  function getFilteredCommandPaletteActions() {
    const actions = buildCommandPaletteActions();
    const query = normalizeCommandPaletteText(state.commandPaletteQuery);
    if (!query) return actions;
    return actions.filter((action) => {
      const haystack = normalizeCommandPaletteText(
        `${action.label} ${action.detail} ${action.keywords || ""} ${action.shortcut || ""}`,
      );
      return haystack.includes(query);
    });
  }

  function renderCommandPalette() {
    if (!elements.commandPaletteList) return;
    const actions = getFilteredCommandPaletteActions();
    elements.commandPaletteList.innerHTML = "";
    elements.commandPaletteList.dataset.size =
      actions.length === 0 ? "empty" : actions.length === 1 ? "single" : "many";

    if (actions.length === 0) {
      const empty = document.createElement("div");
      empty.className = "command-palette-empty";
      empty.textContent = "No matching actions.";
      elements.commandPaletteList.appendChild(empty);
      return;
    }

    state.commandPaletteActiveIndex = Math.max(
      0,
      Math.min(state.commandPaletteActiveIndex, actions.length - 1),
    );

    actions.forEach((action, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "command-palette-item";
      button.dataset.commandIndex = String(index);
      button.setAttribute("role", "option");
      button.setAttribute(
        "aria-selected",
        index === state.commandPaletteActiveIndex ? "true" : "false",
      );
      if (index === state.commandPaletteActiveIndex) {
        button.classList.add("is-active");
      }

      const iconWrap = document.createElement("span");
      iconWrap.className = "command-palette-item-icon";
      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.classList.add("icon");
      icon.setAttribute("aria-hidden", "true");
      const iconUse = document.createElementNS("http://www.w3.org/2000/svg", "use");
      iconUse.setAttribute("href", action.icon || "#icon-spark");
      icon.appendChild(iconUse);
      iconWrap.appendChild(icon);

      const textWrap = document.createElement("span");
      textWrap.className = "command-palette-item-text";

      const title = document.createElement("span");
      title.className = "command-palette-item-title";
      title.textContent = action.label;

      const detail = document.createElement("span");
      detail.className = "command-palette-item-detail";
      detail.textContent = action.detail;
      textWrap.append(title, detail);

      button.append(iconWrap, textWrap);

      if (action.shortcut) {
        const shortcut = document.createElement("kbd");
        shortcut.className = "command-palette-item-shortcut";
        shortcut.textContent = action.shortcut;
        button.appendChild(shortcut);
      }

      elements.commandPaletteList.appendChild(button);
    });

    const active = elements.commandPaletteList.querySelector(".command-palette-item.is-active");
    if (active instanceof HTMLElement) {
      active.scrollIntoView({ block: "nearest" });
    }
  }

  function runCommandPaletteSelection(index) {
    const actions = getFilteredCommandPaletteActions();
    if (actions.length === 0) return;
    const clampedIndex = Math.max(0, Math.min(index, actions.length - 1));
    const action = actions[clampedIndex];
    if (!action || typeof action.run !== "function") return;
    if (elements.commandPaletteModal?.open) {
      elements.commandPaletteModal.close();
    }
    action.run();
  }

  function openCommandPalette() {
    if (!elements.commandPaletteModal) return;
    if (elements.streamModal?.open) {
      elements.streamModal.close();
    }
    if (elements.shortcutsModal?.open) {
      elements.shortcutsModal.close();
    }
    if (elements.webhookConfigModal?.open) {
      elements.webhookConfigModal.close();
    }
    state.commandPaletteQuery = "";
    state.commandPaletteActiveIndex = 0;
    if (elements.commandPaletteInput) {
      elements.commandPaletteInput.value = "";
    }
    renderCommandPalette();
    if (!elements.commandPaletteModal.open) {
      elements.commandPaletteModal.showModal();
    }
    window.requestAnimationFrame(() => {
      elements.commandPaletteInput?.focus();
      elements.commandPaletteInput?.select();
    });
  }

  function toggleCommandPalette() {
    if (!elements.commandPaletteModal) return;
    if (elements.commandPaletteModal.open) {
      elements.commandPaletteModal.close();
      return;
    }
    openCommandPalette();
  }

  function toggleDetailsPanel(panel) {
    if (!(panel instanceof HTMLDetailsElement)) return;
    panel.open = !panel.open;
  }

  function isEditableShortcutTarget(target) {
    if (!(target instanceof Element)) return false;
    if (
      target.closest(
        "input, textarea, select, button, [contenteditable='true'], [contenteditable=''], [role='textbox']",
      )
    ) {
      return true;
    }
    return false;
  }

  function handleGlobalShortcuts(event) {
    if (event.defaultPrevented) return;
    if (event.isComposing || event.repeat) return;
    const key = safeText(event.key).toLowerCase();
    const isSpaceShortcut = key === " " || key === "space" || key === "spacebar";
    const isCommandPaletteShortcut =
      key === "k" && (event.metaKey || event.ctrlKey) && !event.altKey;
    if (isCommandPaletteShortcut) {
      event.preventDefault();
      toggleCommandPalette();
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const isQuestionShortcut = key === "?" || (key === "/" && event.shiftKey);

    if (elements.shortcutsModal?.open && isQuestionShortcut) {
      event.preventDefault();
      toggleShortcutsModal();
      return;
    }

    if (isSpaceShortcut && elements.streamModal?.open) {
      event.preventDefault();
      toggleStreamModal();
      return;
    }

    if (isEditableShortcutTarget(event.target)) return;

    if (isQuestionShortcut && !elements.streamModal.open) {
      event.preventDefault();
      toggleShortcutsModal();
      return;
    }

    if (key === "q") {
      event.preventDefault();
      toggleDetailsPanel(elements.queryDetails);
      return;
    }
    if (key === "i") {
      event.preventDefault();
      toggleDetailsPanel(elements.inspectDetails);
      return;
    }
    if (key === "n") {
      event.preventDefault();
      toggleDetailsPanel(elements.insightsDetails);
      return;
    }
    if (key === "w") {
      event.preventDefault();
      toggleWebhookConfigModal();
      return;
    }
    if (key === "s") {
      event.preventDefault();
      setActiveView("stream");
      return;
    }
    if (key === "c") {
      event.preventDefault();
      setActiveView("correlations");
      return;
    }
    if (key === "t") {
      event.preventDefault();
      setActiveView("timeline");
      return;
    }
    if (key === "u") {
      event.preventDefault();
      copyCurrentViewPath(elements.copyViewUrlButton || undefined);
      return;
    }
    if (key === "x") {
      event.preventDefault();
      resetToBaselineQuery();
      return;
    }
    if (key === "enter") {
      event.preventDefault();
      runQueryNow();
      return;
    }
    if (isSpaceShortcut) {
      event.preventDefault();
      toggleStreamModal();
    }
  }

  function updateLoadMoreButton() {
    if (!elements.streamLoadMoreButton) return;
    const shouldShow = Boolean(state.hasMoreLogs && state.nextCursor);
    elements.streamLoadMoreButton.hidden = !shouldShow;
    elements.streamLoadMoreButton.disabled = !shouldShow;
  }

  function trimTrailingSlash(value) {
    if (!value) return "";
    return value.endsWith("/") ? value.slice(0, -1) : value;
  }

  function defaultApiOrigin() {
    if (window.location.port === "3000") {
      return `${window.location.protocol}//${window.location.hostname}:3000`;
    }
    return "http://127.0.0.1:3000";
  }

  async function loadClientConfig() {
    try {
      const response = await fetch("./config.json", { cache: "no-store" });
      if (!response.ok) return { apiOrigin: defaultApiOrigin(), apiToken: "" };
      const data = await response.json();
      const configOrigin =
        typeof data.apiOrigin === "string" && data.apiOrigin.trim().length > 0
          ? trimTrailingSlash(data.apiOrigin.trim())
          : defaultApiOrigin();
      const configToken =
        typeof data.apiToken === "string" && data.apiToken.trim().length > 0
          ? data.apiToken.trim()
          : "";
      return { apiOrigin: configOrigin, apiToken: configToken };
    } catch {
      return { apiOrigin: defaultApiOrigin(), apiToken: "" };
    }
  }

  function toApiUrl(path) {
    return `${state.apiOrigin}${path}`;
  }

  function authHeaders(extra = {}) {
    return state.apiToken ? { Authorization: `Bearer ${state.apiToken}`, ...extra } : { ...extra };
  }

  function safeText(value) {
    if (value === null || value === undefined) return "";
    return String(value);
  }

  function escapeHtml(value) {
    return safeText(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function isTraceField(field) {
    return field === "correlationId" || field === "requestId";
  }

  function resolveTraceField(mode, traceValue) {
    if (mode === "correlationId" || mode === "requestId") return mode;
    const normalized = safeText(traceValue).trim().toLowerCase();
    if (normalized.startsWith("req-") || normalized.startsWith("request-")) {
      return "requestId";
    }
    return "correlationId";
  }

  function setServerFilter(field, value, options = {}) {
    const normalizedField = safeText(field).trim();
    const normalizedValue = safeText(value).trim();

    elements.queryField.value = normalizedField;
    elements.queryValue.value = normalizedValue;

    if (options.syncTrace !== false) {
      if (normalizedField && isTraceField(normalizedField) && normalizedValue) {
        elements.traceField.value = normalizedField;
        elements.traceValue.value = normalizedValue;
      } else {
        elements.traceField.value = "auto";
        elements.traceValue.value = "";
      }
    }

    renderQueryChips();
  }

  function normalizeLimitValue(value) {
    const trimmed = safeText(value).trim();
    if (!trimmed) return "";
    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(parsed) || parsed < 1) return "";
    return String(Math.min(MAX_QUERY_LIMIT, parsed));
  }

  function normalizeQueryObject(input = {}) {
    const source = input && typeof input === "object" ? input : {};
    const normalized = {
      from: safeText(source.from).trim(),
      to: safeText(source.to).trim(),
      level: safeText(source.level).trim().toUpperCase(),
      audit: safeText(source.audit).trim().toLowerCase(),
      field: safeText(source.field).trim(),
      value: safeText(source.value).trim(),
      limit: normalizeLimitValue(source.limit),
    };

    if (!VALID_LEVELS.has(normalized.level)) normalized.level = "";
    if (normalized.audit !== "true" && normalized.audit !== "false") normalized.audit = "";
    return normalized;
  }

  function normalizeTimeInput(value) {
    const trimmed = safeText(value).trim();
    if (!trimmed) return "";
    const match = trimmed.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!match) return "";
    const hours = Number.parseInt(match[1], 10);
    const minutes = Number.parseInt(match[2], 10);
    const seconds = Number.parseInt(match[3] || "0", 10);
    if (
      !Number.isFinite(hours) ||
      !Number.isFinite(minutes) ||
      !Number.isFinite(seconds) ||
      hours < 0 ||
      hours > 23 ||
      minutes < 0 ||
      minutes > 59 ||
      seconds < 0 ||
      seconds > 59
    ) {
      return "";
    }
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function extractLocalDatePart(value) {
    const match = safeText(value)
      .trim()
      .match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : "";
  }

  function extractLocalTimePart(value) {
    const match = safeText(value)
      .trim()
      .match(/[T ](\d{2}:\d{2})(?::(\d{2}))?$/);
    if (!match) return "";
    return normalizeTimeInput(`${match[1]}:${match[2] || "00"}`);
  }

  function combineDateAndTime(dateTimeValue, fallbackTimeValue) {
    const datePart = extractLocalDatePart(dateTimeValue);
    if (!datePart) return "";
    const fallbackTime = normalizeTimeInput(fallbackTimeValue);
    const explicitTime = extractLocalTimePart(dateTimeValue);
    const timePart = fallbackTime || explicitTime || "00:00:00";
    return `${datePart}T${timePart}`;
  }

  function syncTimeControlFromDateTime(dateControl, timeControl) {
    if (!dateControl || !timeControl) return;
    const datePart = extractLocalDatePart(dateControl.value);
    if (!datePart) {
      timeControl.value = "";
      return;
    }
    const explicitTime = extractLocalTimePart(dateControl.value);
    const fallbackTime = normalizeTimeInput(timeControl.value) || "00:00:00";
    timeControl.value = explicitTime || fallbackTime;
  }

  function syncDateTimeControlFromTime(dateControl, timeControl) {
    if (!dateControl || !timeControl) return;
    const timePart = normalizeTimeInput(timeControl.value);
    if (!timePart) {
      timeControl.value = "";
      return;
    }
    timeControl.value = timePart;
  }

  function syncDateTimeControlPairs() {
    syncTimeControlFromDateTime(elements.queryFrom, elements.queryFromTime);
    syncTimeControlFromDateTime(elements.queryTo, elements.queryToTime);
  }

  function queryDateToLocalInput(value) {
    const trimmed = safeText(value).trim();
    if (!trimmed) return "";
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) {
      return `${trimmed}:00`;
    }
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    const parsed = Date.parse(trimmed);
    if (!Number.isFinite(parsed)) return "";
    return formatLocalDateInput(new Date(parsed));
  }

  function getServerQueryFromControls() {
    const fromValue = combineDateAndTime(elements.queryFrom.value, elements.queryFromTime?.value);
    const toValue = combineDateAndTime(elements.queryTo.value, elements.queryToTime?.value);
    return normalizeQueryObject({
      from: localDateTimeToIso(fromValue) || "",
      to: localDateTimeToIso(toValue) || "",
      level: elements.queryLevel.value,
      audit: elements.queryAudit.value,
      field: elements.queryField.value,
      value: elements.queryValue.value,
      limit: elements.queryLimit.value,
    });
  }

  function applyServerQueryToControls(query, options = {}) {
    const normalized = normalizeQueryObject(query);
    const fromLocalValue = queryDateToLocalInput(normalized.from);
    const toLocalValue = queryDateToLocalInput(normalized.to);
    elements.queryFrom.value = extractLocalDatePart(fromLocalValue);
    elements.queryTo.value = extractLocalDatePart(toLocalValue);
    if (elements.queryFromTime) {
      elements.queryFromTime.value = extractLocalTimePart(fromLocalValue);
    }
    if (elements.queryToTime) {
      elements.queryToTime.value = extractLocalTimePart(toLocalValue);
    }
    syncDateTimeControlPairs();
    elements.queryLevel.value = normalized.level;
    elements.queryAudit.value = normalized.audit;
    elements.queryLimit.value = normalized.limit || String(DEFAULT_QUERY_LIMIT);
    setServerFilter(normalized.field, normalized.value, options);
  }

  function buildServerQuerySignature(query) {
    return queryObjectToSearchParams(normalizeQueryObject(query)).toString();
  }

  function queryObjectToSearchParams(query) {
    const normalized = normalizeQueryObject(query);
    const params = new URLSearchParams();
    for (const key of QUERY_KEYS) {
      const value = safeText(normalized[key]).trim();
      if (value) params.set(key, value);
    }
    return params;
  }

  function hydrateQueryFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const query = {};
    let hasQuery = false;
    for (const key of QUERY_KEYS) {
      const value = params.get(key);
      if (value === null) continue;
      hasQuery = true;
      query[key] = value;
    }
    if (!hasQuery) return false;
    applyServerQueryToControls(query);
    return true;
  }

  function buildViewPathFromControls() {
    const currentParams = new URLSearchParams(window.location.search);
    for (const key of QUERY_KEYS) {
      currentParams.delete(key);
    }
    const queryParams = queryObjectToSearchParams(getServerQueryFromControls());
    for (const [key, value] of queryParams.entries()) {
      currentParams.set(key, value);
    }
    const queryString = currentParams.toString();
    return `${window.location.pathname}${queryString ? `?${queryString}` : ""}${window.location.hash}`;
  }

  function syncQueryToUrl() {
    if (!window.history || typeof window.history.replaceState !== "function") return;
    const nextUrl = buildViewPathFromControls();
    window.history.replaceState(null, "", nextUrl);
  }

  function truncateMiddle(value, maxLength = 48) {
    const input = safeText(value);
    if (input.length <= maxLength) return input;
    const chunk = Math.max(1, Math.floor((maxLength - 3) / 2));
    return `${input.slice(0, chunk)}...${input.slice(input.length - chunk)}`;
  }

  function formatScopeDate(value) {
    const parsed = Date.parse(safeText(value).trim());
    if (!Number.isFinite(parsed)) return "";
    return new Date(parsed).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function normalizeTimelineScopeFilter(input) {
    if (!input || typeof input !== "object") return null;
    const fromMs = Number.parseInt(safeText(input.fromMs), 10);
    const toMs = Number.parseInt(safeText(input.toMs), 10);
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) return null;
    const key = safeText(input.key).trim() || `${fromMs}-${toMs}`;
    const label =
      safeText(input.label).trim() ||
      buildTimelineBucketLabel(fromMs, toMs, Math.max(1, toMs - fromMs));
    return { fromMs, key, label, toMs };
  }

  function buildScopeLabel(scope) {
    const query = normalizeQueryObject(scope?.query);
    const timelineLabel = safeText(scope?.timelineFilter?.label).trim();
    let focus = "all logs";
    if (query.field && query.value) {
      focus = `${query.field}=${truncateMiddle(query.value, 32)}`;
    } else if (query.level) {
      focus = `level=${query.level}`;
    } else if (query.audit) {
      focus = `audit=${query.audit}`;
    }

    const fromLabel = formatScopeDate(query.from);
    const toLabel = formatScopeDate(query.to);
    let rangeLabel = "all time";
    if (fromLabel && toLabel) {
      rangeLabel = `${fromLabel} -> ${toLabel}`;
    } else if (fromLabel) {
      rangeLabel = `from ${fromLabel}`;
    } else if (toLabel) {
      rangeLabel = `to ${toLabel}`;
    }

    if (timelineLabel) {
      return `${focus} | ${truncateMiddle(timelineLabel, 44)}`;
    }
    return `${focus} | ${rangeLabel}`;
  }

  function normalizeScopeSnapshot(input, fallbackReason = "") {
    if (!input || typeof input !== "object") return null;
    const activeViewCandidate = safeText(input.activeView).trim();
    const activeView =
      activeViewCandidate === "timeline" || activeViewCandidate === "correlations"
        ? activeViewCandidate
        : "stream";
    const timelineBucketMs = Number.parseInt(safeText(input.timelineBucketMsOverride), 10);
    const createdAtRaw = Number.parseInt(safeText(input.createdAt), 10);
    const createdAt = Number.isFinite(createdAtRaw) ? createdAtRaw : Date.now();
    const query = normalizeQueryObject(input.query);
    const timelineFilter = normalizeTimelineScopeFilter(input.timelineFilter);
    const timelineBucketMsOverride =
      Number.isFinite(timelineBucketMs) && timelineBucketMs > 0 ? timelineBucketMs : null;
    const scope = {
      id: safeText(input.id).trim() || `${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt,
      activeView,
      query,
      reason: safeText(input.reason).trim() || fallbackReason,
      timelineBucketMsOverride,
      timelineFilter,
    };
    scope.signature = JSON.stringify({
      activeView: scope.activeView,
      query: scope.query,
      timelineBucketMsOverride: scope.timelineBucketMsOverride,
      timelineFilter: scope.timelineFilter,
    });
    scope.label = safeText(input.label).trim() || buildScopeLabel(scope);
    return scope;
  }

  function captureCurrentScopeSnapshot(reason = "") {
    return normalizeScopeSnapshot(
      {
        activeView: state.activeView,
        createdAt: Date.now(),
        query: getServerQueryFromControls(),
        reason,
        timelineBucketMsOverride: state.timelineBucketMsOverride,
        timelineFilter: state.timelineFilter
          ? {
              fromMs: state.timelineFilter.fromMs,
              key: state.timelineFilter.key,
              label: state.timelineFilter.label,
              toMs: state.timelineFilter.toMs,
            }
          : null,
      },
      reason,
    );
  }

  function persistRecentScopes() {
    if (!writeStorageItem(STORAGE_KEY_RECENT_SCOPES, JSON.stringify(state.recentScopes))) {
      setStatus("Could not persist recent scopes.");
    }
  }

  function updateRecentScopeRestoreButtonState() {
    if (!elements.applyRecentScopeButton || !elements.recentScopeSelect) return;
    const selected = safeText(elements.recentScopeSelect.value).trim();
    const isBusy = Boolean(elements.refreshButton?.disabled);
    elements.applyRecentScopeButton.disabled = !selected || state.isRestoringScope || isBusy;
  }

  function updateScopeBackButtonState() {
    if (!elements.scopeBackButton) return;
    const isBusy = Boolean(elements.refreshButton?.disabled);
    const canRestore = state.scopeHistory.length > 0 && !state.isRestoringScope && !isBusy;
    elements.scopeBackButton.disabled = !canRestore;
    if (!canRestore) {
      elements.scopeBackButton.title = "No previous scope";
      return;
    }
    const previousScope = state.scopeHistory[state.scopeHistory.length - 1];
    elements.scopeBackButton.title = `Back: ${previousScope.label}`;
  }

  function renderRecentScopes(preferredId = "") {
    if (!elements.recentScopeSelect) return;
    const selectedId = preferredId || safeText(elements.recentScopeSelect.value).trim();
    elements.recentScopeSelect.innerHTML = '<option value="">Select...</option>';
    for (const scope of state.recentScopes) {
      const option = document.createElement("option");
      option.value = scope.id;
      option.textContent = `${scope.label} (${new Date(scope.createdAt).toLocaleString()})`;
      elements.recentScopeSelect.appendChild(option);
    }
    if (selectedId && state.recentScopes.some((scope) => scope.id === selectedId)) {
      elements.recentScopeSelect.value = selectedId;
    } else {
      elements.recentScopeSelect.value = "";
    }
    updateRecentScopeRestoreButtonState();
  }

  function buildScopeTrailTitle(scope) {
    const lines = [scope.label];
    const query = buildServerQuerySignature(scope.query);
    if (query) lines.push(`?${query}`);
    if (scope.timelineFilter) {
      lines.push(`Timeline: ${scope.timelineFilter.label}`);
    }
    return lines.join("\n");
  }

  function renderScopeTrail() {
    if (!elements.scopeTrail) return;
    elements.scopeTrail.innerHTML = "";
    const historyWindow = state.scopeHistory.slice(-SCOPE_TRAIL_WINDOW);
    const historyStartIndex = state.scopeHistory.length - historyWindow.length;
    const trailScopes = [...historyWindow];
    if (state.lastAppliedScope) {
      trailScopes.push(state.lastAppliedScope);
    }
    if (trailScopes.length === 0) {
      elements.scopeTrail.hidden = true;
      return;
    }

    elements.scopeTrail.hidden = false;
    trailScopes.forEach((scope, index) => {
      const isCurrent = index === trailScopes.length - 1;
      if (isCurrent) {
        const current = document.createElement("span");
        current.className = "scope-trail-item is-current";
        current.textContent = scope.label;
        current.title = buildScopeTrailTitle(scope);
        elements.scopeTrail.appendChild(current);
      } else {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "scope-trail-item";
        button.dataset.scopeHistoryIndex = String(historyStartIndex + index);
        button.textContent = scope.label;
        button.title = buildScopeTrailTitle(scope);
        elements.scopeTrail.appendChild(button);
      }

      if (index < trailScopes.length - 1) {
        const separator = document.createElement("span");
        separator.className = "scope-trail-sep";
        separator.textContent = ">";
        elements.scopeTrail.appendChild(separator);
      }
    });
  }

  function renderScopeContinuity() {
    updateScopeBackButtonState();
    updateRecentScopeRestoreButtonState();
    renderScopeTrail();
  }

  function upsertRecentScope(scope) {
    const timestamp = Date.now();
    const snapshot = normalizeScopeSnapshot({
      ...scope,
      createdAt: timestamp,
      id: `${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
    });
    if (!snapshot) return;
    state.recentScopes = state.recentScopes.filter(
      (entry) => entry.signature !== snapshot.signature,
    );
    state.recentScopes.unshift(snapshot);
    if (state.recentScopes.length > MAX_RECENT_SCOPES) {
      state.recentScopes = state.recentScopes.slice(0, MAX_RECENT_SCOPES);
    }
    persistRecentScopes();
    renderRecentScopes();
  }

  function commitCurrentScope(reason = "") {
    const snapshot = captureCurrentScopeSnapshot(reason);
    if (!snapshot) return;

    if (!state.lastAppliedScope) {
      state.lastAppliedScope = snapshot;
      upsertRecentScope(snapshot);
      renderScopeContinuity();
      return;
    }

    if (state.lastAppliedScope.signature !== snapshot.signature) {
      if (!state.isRestoringScope) {
        const previous = state.lastAppliedScope;
        const latest = state.scopeHistory[state.scopeHistory.length - 1];
        if (!latest || latest.signature !== previous.signature) {
          state.scopeHistory.push(previous);
          if (state.scopeHistory.length > MAX_SCOPE_HISTORY) {
            state.scopeHistory = state.scopeHistory.slice(-MAX_SCOPE_HISTORY);
          }
        }
      }
      state.lastAppliedScope = snapshot;
      upsertRecentScope(snapshot);
    } else {
      state.lastAppliedScope = snapshot;
    }

    renderScopeContinuity();
  }

  function loadRecentScopes() {
    try {
      const raw = readStorageItem(STORAGE_KEY_RECENT_SCOPES);
      if (!raw) {
        state.recentScopes = [];
        renderRecentScopes();
        return;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        state.recentScopes = [];
        renderRecentScopes();
        return;
      }
      state.recentScopes = parsed
        .map((entry) => normalizeScopeSnapshot(entry))
        .filter((entry) => Boolean(entry))
        .slice(0, MAX_RECENT_SCOPES);
      renderRecentScopes();
    } catch {
      state.recentScopes = [];
      renderRecentScopes();
    }
  }

  function applyScopeSnapshot(scope) {
    const normalized = normalizeScopeSnapshot(scope);
    if (!normalized) return null;
    applyServerQueryToControls(normalized.query);
    state.timelineFilter = normalized.timelineFilter
      ? {
          fromMs: normalized.timelineFilter.fromMs,
          key: normalized.timelineFilter.key,
          label: normalized.timelineFilter.label,
          toMs: normalized.timelineFilter.toMs,
        }
      : null;
    state.timelineBucketMsOverride = normalized.timelineBucketMsOverride;
    if (elements.timelineBucketSize) {
      elements.timelineBucketSize.value = state.timelineBucketMsOverride
        ? String(state.timelineBucketMsOverride)
        : "auto";
    }
    setActiveView(normalized.activeView);
    syncQueryToUrl();
    renderQueryChips();
    updateScopeClearVisibility();
    return normalized;
  }

  async function restoreScopeSnapshot(scope, reason = "scope restore") {
    const normalized = normalizeScopeSnapshot(scope, reason);
    if (!normalized) return false;

    const currentServerSignature = buildServerQuerySignature(getServerQueryFromControls());
    state.isRestoringScope = true;
    renderScopeContinuity();
    try {
      const applied = applyScopeSnapshot(normalized);
      if (!applied) return false;
      const nextServerSignature = buildServerQuerySignature(getServerQueryFromControls());
      if (nextServerSignature !== currentServerSignature) {
        const didApply = await fetchLogs();
        if (!didApply) return false;
      } else {
        applyLocalView({ commitScope: true, reason });
      }
      setStatus(`Restored scope: ${applied.label}`);
      return true;
    } catch (error) {
      setStatus(String(error));
      return false;
    } finally {
      state.isRestoringScope = false;
      renderScopeContinuity();
    }
  }

  function restorePreviousScope() {
    if (state.scopeHistory.length === 0) {
      setStatus("No previous scope available.");
      renderScopeContinuity();
      return;
    }

    const target = state.scopeHistory[state.scopeHistory.length - 1];
    const previousHistory = [...state.scopeHistory];
    state.scopeHistory = state.scopeHistory.slice(0, -1);
    renderScopeContinuity();
    void restoreScopeSnapshot(target, "scope back").then((restored) => {
      if (restored) return;
      state.scopeHistory = previousHistory;
      renderScopeContinuity();
    });
  }

  function restoreScopeByHistoryIndex(indexValue) {
    const index = Number.parseInt(safeText(indexValue), 10);
    if (!Number.isFinite(index) || index < 0 || index >= state.scopeHistory.length) return;
    const previousHistory = [...state.scopeHistory];
    const target = state.scopeHistory[index];
    state.scopeHistory = state.scopeHistory.slice(0, index);
    renderScopeContinuity();
    void restoreScopeSnapshot(target, "scope trail").then((restored) => {
      if (restored) return;
      state.scopeHistory = previousHistory;
      renderScopeContinuity();
    });
  }

  function applySelectedRecentScope() {
    const selectedId = safeText(elements.recentScopeSelect?.value).trim();
    if (!selectedId) {
      setStatus("Select a recent scope to restore.");
      return;
    }
    const scope = state.recentScopes.find((entry) => entry.id === selectedId);
    if (!scope) {
      setStatus("Selected scope was not found.");
      renderRecentScopes();
      return;
    }
    void restoreScopeSnapshot(scope, "recent scope");
  }

  function flattenDetailData(input, prefix, rows) {
    if (input === null || input === undefined) {
      rows.push([prefix, "null"]);
      return;
    }

    if (Array.isArray(input)) {
      rows.push([prefix, JSON.stringify(input)]);
      return;
    }

    if (typeof input !== "object") {
      rows.push([prefix, safeText(input)]);
      return;
    }

    for (const [key, value] of Object.entries(input)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        flattenDetailData(value, path, rows);
      } else if (Array.isArray(value)) {
        rows.push([path, JSON.stringify(value)]);
      } else {
        rows.push([path, value === null || value === undefined ? "null" : safeText(value)]);
      }
    }
  }

  function buildPrettyDetailMarkup(entry) {
    const rows = [];
    flattenDetailData(entry.data, "", rows);
    if (rows.length === 0) {
      return '<div class="empty-state">No structured fields available.</div>';
    }

    return `
      <dl class="log-detail-grid">
        ${rows
          .sort((left, right) => left[0].localeCompare(right[0]))
          .map(
            ([key, value]) => `
              <div class="log-detail-row">
                <dt>${escapeHtml(key)}</dt>
                <dd>${escapeHtml(value)}</dd>
              </div>
            `,
          )
          .join("")}
      </dl>
    `;
  }

  function updateThemeToggleLabel() {
    const currentTheme = document.documentElement.dataset.theme || "light";
    const nextTheme = currentTheme === "dark" ? "light" : "dark";
    elements.themeToggle.innerHTML = nextTheme === "dark" ? THEME_ICONS.moon : THEME_ICONS.sun;
    elements.themeToggle.setAttribute("aria-label", `Switch to ${nextTheme} mode`);
    elements.themeToggle.setAttribute("title", `Switch to ${nextTheme} mode`);
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    updateThemeToggleLabel();
    renderTimeline();
  }

  function resolveInitialTheme() {
    const stored = readStorageItem(STORAGE_KEY_THEME);
    if (stored === "light" || stored === "dark") return stored;
    return themeMediaQuery.matches ? "dark" : "light";
  }

  function getByPath(entry, path) {
    if (!path || path === "*") return undefined;
    const parts = path.split(".");
    let current = entry;
    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      current = current[part];
    }
    return current;
  }

  function flattenPaths(input, prefix, target) {
    if (input === null || input === undefined) return;
    if (Array.isArray(input)) return;
    if (typeof input !== "object") return;

    for (const [key, value] of Object.entries(input)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (value === null || value === undefined) {
        target.add(path);
        continue;
      }
      if (typeof value === "object" && !Array.isArray(value)) {
        flattenPaths(value, path, target);
      } else {
        target.add(path);
      }
    }
  }

  function collectFieldPaths(logs) {
    const paths = new Set();
    for (const entry of logs) {
      flattenPaths(entry, "", paths);
    }
    return [...paths].sort((a, b) => a.localeCompare(b));
  }

  function updateFieldControls() {
    const paths = collectFieldPaths(state.logs);
    const options = ["*", ...new Set([...BASE_SORT_FIELDS, ...paths])];

    elements.fieldOptions.innerHTML = "";
    for (const path of options) {
      const option = document.createElement("option");
      option.value = path;
      elements.fieldOptions.appendChild(option);
    }

    const currentSort = elements.sortField.value;
    elements.sortField.innerHTML = "";
    for (const path of options.filter((item) => item !== "*")) {
      const option = document.createElement("option");
      option.value = path;
      option.textContent = path;
      elements.sortField.appendChild(option);
    }

    if (currentSort && options.includes(currentSort)) {
      elements.sortField.value = currentSort;
    } else {
      elements.sortField.value = "timestamp";
    }
  }

  function includesByMode(candidate, searchValue, mode) {
    const candidateText = safeText(candidate).toLowerCase();
    if (mode === "equals") return candidateText === searchValue;
    return candidateText.includes(searchValue);
  }

  function correlationInfo(entry) {
    const correlationId = getByPath(entry, "data.correlationId");
    if (correlationId) return { field: "correlationId", value: safeText(correlationId) };
    const requestId = getByPath(entry, "data.requestId");
    if (requestId) return { field: "requestId", value: safeText(requestId) };
    return { field: "", value: "" };
  }

  function sortLogsChronologically(entries) {
    return [...entries].sort((left, right) => {
      const leftMs = Date.parse(safeText(left?.timestamp));
      const rightMs = Date.parse(safeText(right?.timestamp));
      if (Number.isFinite(leftMs) && Number.isFinite(rightMs) && leftMs !== rightMs) {
        return leftMs - rightMs;
      }
      if (Number.isFinite(leftMs) && !Number.isFinite(rightMs)) return -1;
      if (!Number.isFinite(leftMs) && Number.isFinite(rightMs)) return 1;
      return safeText(left?.id).localeCompare(safeText(right?.id));
    });
  }

  function buildCorrelationChainPayload(field, value) {
    const entries = sortLogsChronologically(
      state.logs.filter((entry) => {
        const correlation = correlationInfo(entry);
        return correlation.field === field && correlation.value === value;
      }),
    );
    const first = entries.length > 0 ? entries[0] : null;
    const last = entries.length > 0 ? entries[entries.length - 1] : null;
    return {
      correlation: {
        count: entries.length,
        field,
        firstTimestamp: first ? safeText(first.timestamp) : "",
        lastTimestamp: last ? safeText(last.timestamp) : "",
        value,
      },
      query: getServerQueryFromControls(),
      entries,
    };
  }

  function matchEntry(entry, field, value, mode) {
    if (!value) return true;
    const searchValue = value.toLowerCase();
    if (!field || field === "*") {
      return JSON.stringify(entry).toLowerCase().includes(searchValue);
    }
    return includesByMode(getByPath(entry, field), searchValue, mode);
  }

  function matchesTimelineFilter(entry) {
    if (!state.timelineFilter) return true;
    const timestamp = Date.parse(safeText(entry.timestamp));
    if (!Number.isFinite(timestamp)) return false;
    return timestamp >= state.timelineFilter.fromMs && timestamp < state.timelineFilter.toMs;
  }

  function compareValues(a, b, direction) {
    const multiplier = direction === "asc" ? 1 : -1;
    if (a === b) return 0;
    if (a === undefined || a === null) return 1 * multiplier;
    if (b === undefined || b === null) return -1 * multiplier;
    if (typeof a === "number" && typeof b === "number") return (a - b) * multiplier;
    return safeText(a).localeCompare(safeText(b)) * multiplier;
  }

  function applyLocalView(options = {}) {
    const localField = elements.localField.value.trim();
    const localValue = elements.localValue.value.trim();
    const mode = elements.localMatchMode.value;
    const sortField = elements.sortField.value;
    const sortDirection = elements.sortDirection.value;

    const filtered = state.logs
      .filter((entry) => matchEntry(entry, localField, localValue, mode))
      .filter((entry) => matchesTimelineFilter(entry));

    const sorted = [...filtered].sort((left, right) => {
      const leftValue = getByPath(left, sortField);
      const rightValue = getByPath(right, sortField);
      return compareValues(leftValue, rightValue, sortDirection);
    });

    state.visibleLogs = sorted;
    render();
    if (options.commitScope) {
      commitCurrentScope(safeText(options.reason).trim() || "scope change");
    } else {
      renderScopeContinuity();
    }
  }

  function levelClass(level) {
    const normalized = safeText(level).toUpperCase();
    if (normalized === "ERROR") return "level-error";
    if (normalized === "WARN") return "level-warn";
    if (normalized === "DEBUG") return "level-debug";
    return "level-info";
  }

  function buildNoResultsGuidance() {
    const query = getServerQueryFromControls();
    const localField = safeText(elements.localField.value).trim();
    const localValue = safeText(elements.localValue.value).trim();
    const reasons = [];
    const actions = [];
    const actionIds = new Set();

    const addAction = (id, label) => {
      if (actionIds.has(id)) return;
      actionIds.add(id);
      actions.push({ id, label });
    };

    if (state.logs.length === 0) {
      reasons.push("No logs were returned from the server for the current query.");
      if (query.from || query.to) {
        reasons.push("The selected time range may be too narrow.");
        addAction("clear-range", "Clear Time Range");
      }
      if (query.level) {
        reasons.push(`Level filter "${query.level}" may be too strict.`);
      }
      if (query.audit) {
        reasons.push(`Audit filter is set to "${query.audit}".`);
      }
      if (query.field && query.value) {
        reasons.push(`Scoped to ${query.field}: ${query.value}.`);
        if (isTraceField(query.field)) {
          addAction("clear-trace-scope", "Clear Trace Scope");
        }
      }
      if (query.level || query.audit || query.field || query.value) {
        addAction("clear-server-filters", "Clear Server Filters");
      }
      addAction("run-errors-24h", "Run Errors 24h");
      addAction("reset-baseline", "Reset To Baseline");
      return {
        title: "No logs matched your server query.",
        reasons,
        actions,
      };
    }

    reasons.push("Logs are loaded, but current local scope hides them.");
    if (localValue) {
      reasons.push(
        localField
          ? `Local filter "${localField}" does not match any loaded logs.`
          : "Local free-text filter does not match any loaded logs.",
      );
      addAction("clear-local-filter", "Clear Local Filter");
    }
    if (state.timelineFilter) {
      reasons.push(`Timeline drilldown is active (${state.timelineFilter.label}).`);
      addAction("clear-timeline-drilldown", "Clear Timeline Drilldown");
    }
    addAction("reset-baseline", "Reset To Baseline");
    return {
      title: "No logs are visible with current local filters.",
      reasons,
      actions,
    };
  }

  function renderNoResultsMarkup() {
    const guidance = buildNoResultsGuidance();
    const reasonsMarkup = guidance.reasons
      .map((reason) => `<li>${escapeHtml(reason)}</li>`)
      .join("");
    const actionsMarkup = guidance.actions
      .map(
        (action) =>
          `<button class="button button-sm" type="button" data-empty-action="${action.id}">${escapeHtml(action.label)}</button>`,
      )
      .join("");

    return `
      <div class="empty-state empty-state-rich">
        <p class="empty-state-title">${escapeHtml(guidance.title)}</p>
        ${reasonsMarkup ? `<ul class="empty-state-reasons">${reasonsMarkup}</ul>` : ""}
        ${actionsMarkup ? `<div class="empty-state-actions">${actionsMarkup}</div>` : ""}
      </div>
    `;
  }

  function renderLogsInto(tbody) {
    tbody.innerHTML = "";
    if (state.visibleLogs.length === 0) {
      const emptyRow = document.createElement("tr");
      emptyRow.innerHTML = `<td colspan="7">${renderNoResultsMarkup()}</td>`;
      tbody.appendChild(emptyRow);
      return;
    }

    state.visibleLogs.forEach((entry, index) => {
      const correlation = correlationInfo(entry);
      const id = `${entry.id}-${index}`;
      const isExpanded = state.expanded.has(id);

      const row = document.createElement("tr");
      row.className = "row-main";
      row.innerHTML = `
        <td><button class="expand-button" data-toggle-id="${id}" aria-label="Toggle log details">${isExpanded ? "−" : "+"}</button></td>
        <td><code>${safeText(entry.timestamp)}</code></td>
        <td><span class="level-badge ${levelClass(entry.level)}">${safeText(entry.level)}</span></td>
        <td><code>${safeText(entry.event)}</code></td>
        <td>${correlation.value ? `<button class="correlation-link" data-correlation-field="${correlation.field}" data-correlation-value="${correlation.value}">${correlation.value}</button>` : '<span class="panel-note">-</span>'}</td>
        <td><code>${safeText(getByPath(entry, "data.component"))}</code></td>
        <td>${safeText(entry.message)}</td>
      `;
      tbody.appendChild(row);

      if (isExpanded) {
        const rawJson = JSON.stringify(entry.data, null, 2);
        const detail = document.createElement("tr");
        detail.className = "row-details";
        detail.innerHTML = `
          <td colspan="7">
            <div class="log-detail" data-detail-id="${id}">
              <div class="log-detail-toolbar">
                <div class="log-detail-tabs">
                  <button class="log-detail-tab is-active" type="button" data-detail-id="${id}" data-detail-view="pretty">Pretty View</button>
                  <button class="log-detail-tab" type="button" data-detail-id="${id}" data-detail-view="raw">Raw JSON</button>
                </div>
                <div class="log-detail-actions">
                  <button class="button button-sm copy-json-button" type="button" data-copy-json-id="${id}">Copy JSON</button>
                  ${
                    correlation.value
                      ? `<button class="button button-sm copy-json-button" type="button" data-copy-chain-id="${id}">Copy Chain JSON</button>`
                      : '<button class="button button-sm copy-json-button" type="button" disabled title="No correlation/request id for this log">Copy Chain JSON</button>'
                  }
                </div>
              </div>
              <div class="log-detail-panel is-active" data-detail-id="${id}" data-detail-content="pretty">
                ${buildPrettyDetailMarkup(entry)}
              </div>
              <div class="log-detail-panel" data-detail-id="${id}" data-detail-content="raw">
                <pre>${escapeHtml(rawJson)}</pre>
              </div>
            </div>
          </td>
        `;
        tbody.appendChild(detail);
        state.detailEntriesById.set(id, entry);
      }
    });
  }

  function renderLogs() {
    state.detailEntriesById.clear();
    renderLogsInto(elements.logsTbody);
    renderLogsInto(elements.logsModalTbody);
  }

  function countBy(items, mapper) {
    const output = new Map();
    for (const item of items) {
      const key = mapper(item);
      output.set(key, (output.get(key) || 0) + 1);
    }
    return output;
  }

  function toCountEntries(input, maxItems) {
    let entries = [];
    if (input instanceof Map) {
      entries = [...input.entries()];
    } else if (Array.isArray(input)) {
      entries = input.map((item) => [safeText(item?.key), Number(item?.count || 0)]);
    }

    return entries
      .filter(([key, count]) => safeText(key).length > 0 && Number.isFinite(count) && count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxItems);
  }

  function renderTopList(targetElement, input, maxItems) {
    targetElement.innerHTML = "";
    const sorted = toCountEntries(input, maxItems);
    if (sorted.length === 0) {
      const li = document.createElement("li");
      li.textContent = "No data";
      targetElement.appendChild(li);
      return;
    }

    for (const [key, value] of sorted) {
      const li = document.createElement("li");
      li.textContent = `${safeText(key)} (${value})`;
      targetElement.appendChild(li);
    }
  }

  function levelCountsFromBuckets(buckets) {
    const output = new Map();
    if (!Array.isArray(buckets)) return output;
    for (const bucket of buckets) {
      const level = safeText(bucket?.key).toUpperCase();
      const count = Number(bucket?.count || 0);
      if (!level || !Number.isFinite(count)) continue;
      output.set(level, (output.get(level) || 0) + count);
    }
    return output;
  }

  function renderLevelDistribution() {
    const serverCounts = levelCountsFromBuckets(state.serverInsights.levelDistribution);
    const counts =
      serverCounts.size > 0
        ? serverCounts
        : countBy(state.visibleLogs, (entry) => safeText(entry.level).toUpperCase() || "UNKNOWN");
    const levels = ["ERROR", "WARN", "INFO", "DEBUG"];
    const max = Math.max(1, ...levels.map((level) => counts.get(level) || 0));
    elements.levelDistribution.innerHTML = "";

    for (const level of levels) {
      const count = counts.get(level) || 0;
      const width = (count / max) * 100;
      const row = document.createElement("div");
      row.className = "bar-row";
      row.innerHTML = `
        <span>${level}</span>
        <div class="bar"><span style="width:${width}%"></span></div>
        <span>${count}</span>
      `;
      elements.levelDistribution.appendChild(row);
    }
  }

  function renderErrorCorrelationList(input) {
    elements.errorCorrelations.innerHTML = "";
    const sorted = toCountEntries(input, 10);
    if (sorted.length === 0) {
      const li = document.createElement("li");
      li.textContent = "No data";
      elements.errorCorrelations.appendChild(li);
      return;
    }

    for (const [key, value] of sorted) {
      const li = document.createElement("li");
      if (!key || key === "(missing)") {
        li.textContent = `${key} (${value})`;
      } else {
        const splitAt = key.indexOf(":");
        const field = splitAt > -1 ? key.slice(0, splitAt) : "trace";
        const fieldValue = splitAt > -1 ? key.slice(splitAt + 1) : key;
        const button = document.createElement("button");
        button.dataset.correlationField = field;
        button.dataset.correlationValue = fieldValue;
        button.textContent = fieldValue;
        li.appendChild(button);
        li.append(` (${value})`);
      }
      elements.errorCorrelations.appendChild(li);
    }
  }

  function setWebhookPill(target, value, labels = { off: "Disabled", on: "Enabled" }) {
    if (!(target instanceof HTMLElement)) return;
    target.classList.remove("is-on", "is-off", "is-neutral");
    if (value === true) {
      target.classList.add("is-on");
      target.textContent = labels.on;
      return;
    }
    if (value === false) {
      target.classList.add("is-off");
      target.textContent = labels.off;
      return;
    }
    target.classList.add("is-neutral");
    target.textContent = "Unknown";
  }

  function setWebhookText(target, text) {
    if (!(target instanceof HTMLElement)) return;
    target.textContent = text;
  }

  function formatDateTimeLabel(value) {
    const parsed = Date.parse(safeText(value).trim());
    if (!Number.isFinite(parsed)) return "-";
    return new Date(parsed).toLocaleString();
  }

  function formatMsLabel(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) return "-";
    return `${Math.round(numeric)}ms`;
  }

  function formatCountLabel(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) return "-";
    return String(Math.round(numeric));
  }

  function hasConfiguredWebhook(policy) {
    const webhook = safeText(policy?.webhookUrl).trim();
    return webhook.length > 0;
  }

  function renderWebhookHealth() {
    const policy = state.webhookHealth.alertPolicy;
    const alerting = state.webhookHealth.alerting;
    const webhookConfigured = hasConfiguredWebhook(policy);
    const hasPolicy = Boolean(policy && typeof policy === "object");
    const hasAlerting = Boolean(alerting && typeof alerting === "object");

    setWebhookPill(elements.webhookAlertEnabled, hasPolicy ? Boolean(policy.enabled) : null, {
      off: "Disabled",
      on: "Enabled",
    });
    setWebhookPill(elements.webhookConfigured, hasPolicy ? webhookConfigured : null, {
      off: "Not set",
      on: "Configured",
    });
    setWebhookPill(elements.webhookLoopRunning, hasAlerting ? Boolean(alerting.running) : null, {
      off: "Stopped",
      on: "Running",
    });

    const sent = formatCountLabel(alerting?.sent);
    const suppressed = formatCountLabel(alerting?.suppressed);
    setWebhookText(elements.webhookSentSuppressed, `${sent} / ${suppressed}`);

    const timeout = formatMsLabel(policy?.webhookTimeoutMs);
    const retries = formatCountLabel(policy?.webhookRetryAttempts);
    setWebhookText(elements.webhookTimeoutRetry, `${timeout} / ${retries}`);
    setWebhookText(elements.webhookLastSuccess, formatDateTimeLabel(alerting?.lastSuccessAt));

    if (state.webhookHealth.loading && !state.webhookHealth.loadedAt) {
      setWebhookText(elements.webhookStatusNote, "Loading alert webhook status...");
      return;
    }
    if (state.webhookHealth.error) {
      setWebhookText(
        elements.webhookStatusNote,
        `Health unavailable: ${state.webhookHealth.error}`,
      );
      return;
    }
    if (state.webhookHealth.loadedAt) {
      const loadedLabel = new Date(state.webhookHealth.loadedAt).toLocaleTimeString();
      const lastError = safeText(alerting?.lastError).trim();
      if (lastError) {
        setWebhookText(
          elements.webhookStatusNote,
          `Updated ${loadedLabel}. Last alerting error: ${lastError}`,
        );
        return;
      }
      setWebhookText(elements.webhookStatusNote, `Updated ${loadedLabel}.`);
      return;
    }
    setWebhookText(elements.webhookStatusNote, "Health status not loaded yet.");
  }

  function toFiniteNumber(value, fallback) {
    const parsed = Number(safeText(value).trim());
    if (!Number.isFinite(parsed)) return fallback;
    return parsed;
  }

  function toFiniteInteger(value, fallback) {
    const parsed = Number(safeText(value).trim());
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return fallback;
    return parsed;
  }

  function normalizeOpenApiOperation(path, method, operation) {
    return {
      method: safeText(method).toUpperCase(),
      operationId: safeText(operation?.operationId).trim(),
      path: safeText(path),
    };
  }

  function findOpenApiOperation(paths, predicate) {
    for (const [path, pathItem] of Object.entries(paths)) {
      if (!pathItem || typeof pathItem !== "object") continue;
      for (const method of ["get", "post", "put", "patch", "delete"]) {
        const operation = pathItem[method];
        if (!operation || typeof operation !== "object") continue;
        const normalized = normalizeOpenApiOperation(path, method, operation);
        if (predicate(normalized, operation, pathItem)) {
          return normalized;
        }
      }
    }
    return null;
  }

  function parseWebhookCrudEndpoints(spec) {
    const paths = spec?.paths;
    if (!paths || typeof paths !== "object") return null;

    const configGet =
      (paths["/api/alerts/config"]?.get
        ? normalizeOpenApiOperation("/api/alerts/config", "get", paths["/api/alerts/config"]?.get)
        : null) ||
      findOpenApiOperation(
        paths,
        (candidate, operation) =>
          candidate.method === "GET" &&
          (candidate.operationId === "getAlertConfig" ||
            safeText(operation.summary).toLowerCase().includes("alert webhook policy")),
      );

    const configPut =
      (paths["/api/alerts/config"]?.put
        ? normalizeOpenApiOperation("/api/alerts/config", "put", paths["/api/alerts/config"]?.put)
        : null) ||
      findOpenApiOperation(
        paths,
        (candidate, operation) =>
          candidate.method === "PUT" &&
          (candidate.operationId === "updateAlertConfig" ||
            safeText(operation.summary).toLowerCase().includes("alert webhook policy")),
      );

    const test =
      (paths["/api/alerts/test-webhook"]?.post
        ? normalizeOpenApiOperation(
            "/api/alerts/test-webhook",
            "post",
            paths["/api/alerts/test-webhook"]?.post,
          )
        : null) ||
      findOpenApiOperation(
        paths,
        (candidate, operation) =>
          candidate.method === "POST" &&
          (candidate.operationId === "testAlertWebhook" ||
            safeText(operation.summary).toLowerCase().includes("manual webhook test")),
      );

    if (!configGet && !configPut) return null;
    return { configGet, configPut, test };
  }

  async function fetchOpenApiDocument(signal) {
    const response = await fetch(toApiUrl("/openapi.json"), {
      cache: "no-store",
      headers: authHeaders(),
      signal,
    });
    if (!response.ok) {
      throw new Error(`/openapi.json returned ${response.status}`);
    }
    return response.json();
  }

  function normalizeAlertPolicy(input) {
    const source = input && typeof input === "object" ? input : {};
    return {
      cooldownMs: Math.max(
        1000,
        toFiniteNumber(source.cooldownMs, DEFAULT_ALERT_POLICY.cooldownMs),
      ),
      enabled: Boolean(source.enabled),
      errorThreshold: Math.max(
        1,
        toFiniteNumber(source.errorThreshold, DEFAULT_ALERT_POLICY.errorThreshold),
      ),
      intervalMs: Math.max(
        1000,
        toFiniteNumber(source.intervalMs, DEFAULT_ALERT_POLICY.intervalMs),
      ),
      noLogsThresholdMinutes: Math.max(
        0,
        toFiniteNumber(source.noLogsThresholdMinutes, DEFAULT_ALERT_POLICY.noLogsThresholdMinutes),
      ),
      webhookBackoffMs: Math.max(
        25,
        toFiniteNumber(source.webhookBackoffMs, DEFAULT_ALERT_POLICY.webhookBackoffMs),
      ),
      webhookRetryAttempts: Math.max(
        1,
        toFiniteInteger(source.webhookRetryAttempts, DEFAULT_ALERT_POLICY.webhookRetryAttempts),
      ),
      webhookTimeoutMs: Math.max(
        250,
        toFiniteNumber(source.webhookTimeoutMs, DEFAULT_ALERT_POLICY.webhookTimeoutMs),
      ),
      webhookUrl: safeText(source.webhookUrl).trim(),
      windowMinutes: Math.max(
        1,
        toFiniteNumber(source.windowMinutes, DEFAULT_ALERT_POLICY.windowMinutes),
      ),
    };
  }

  function formatPolicyNumber(value, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return String(fallback);
    if (Number.isInteger(parsed)) return String(parsed);
    return String(parsed);
  }

  function readNumberInput(element, label, minimum, integer = false) {
    const raw = safeText(element?.value).trim();
    const parsed = Number(raw);
    if (!raw || !Number.isFinite(parsed)) {
      throw new Error(`${label} must be a number.`);
    }
    if (integer && !Number.isInteger(parsed)) {
      throw new Error(`${label} must be an integer.`);
    }
    if (parsed < minimum) {
      throw new Error(`${label} must be at least ${minimum}.`);
    }
    return parsed;
  }

  function readWebhookCrudForm() {
    const webhookUrl = safeText(elements.webhookCrudUrl?.value).trim();
    const enabled = Boolean(elements.webhookCrudEnabled?.checked);

    if (enabled && !webhookUrl) {
      throw new Error("Webhook URL must be configured when alerting is enabled.");
    }

    return {
      cooldownMs: readNumberInput(elements.webhookCrudCooldownMs, "Cooldown", 1000),
      enabled,
      errorThreshold: readNumberInput(elements.webhookCrudErrorThreshold, "Error threshold", 1),
      intervalMs: readNumberInput(elements.webhookCrudIntervalMs, "Interval", 1000),
      noLogsThresholdMinutes: readNumberInput(
        elements.webhookCrudNoLogsThresholdMinutes,
        "No-logs threshold",
        0,
      ),
      webhookBackoffMs: readNumberInput(elements.webhookCrudBackoffMs, "Backoff", 25),
      webhookRetryAttempts: readNumberInput(
        elements.webhookCrudRetryAttempts,
        "Retry attempts",
        1,
        true,
      ),
      webhookTimeoutMs: readNumberInput(elements.webhookCrudTimeoutMs, "Timeout", 250),
      webhookUrl: webhookUrl || null,
      windowMinutes: readNumberInput(elements.webhookCrudWindowMinutes, "Window", 1),
    };
  }

  function applyWebhookCrudForm(policyInput) {
    const policy = normalizeAlertPolicy(policyInput || DEFAULT_ALERT_POLICY);
    if (elements.webhookCrudUrl) {
      elements.webhookCrudUrl.value = policy.webhookUrl;
    }
    if (elements.webhookCrudEnabled) {
      elements.webhookCrudEnabled.checked = Boolean(policy.enabled);
    }
    if (elements.webhookCrudIntervalMs) {
      elements.webhookCrudIntervalMs.value = formatPolicyNumber(
        policy.intervalMs,
        DEFAULT_ALERT_POLICY.intervalMs,
      );
    }
    if (elements.webhookCrudWindowMinutes) {
      elements.webhookCrudWindowMinutes.value = formatPolicyNumber(
        policy.windowMinutes,
        DEFAULT_ALERT_POLICY.windowMinutes,
      );
    }
    if (elements.webhookCrudErrorThreshold) {
      elements.webhookCrudErrorThreshold.value = formatPolicyNumber(
        policy.errorThreshold,
        DEFAULT_ALERT_POLICY.errorThreshold,
      );
    }
    if (elements.webhookCrudNoLogsThresholdMinutes) {
      elements.webhookCrudNoLogsThresholdMinutes.value = formatPolicyNumber(
        policy.noLogsThresholdMinutes,
        DEFAULT_ALERT_POLICY.noLogsThresholdMinutes,
      );
    }
    if (elements.webhookCrudCooldownMs) {
      elements.webhookCrudCooldownMs.value = formatPolicyNumber(
        policy.cooldownMs,
        DEFAULT_ALERT_POLICY.cooldownMs,
      );
    }
    if (elements.webhookCrudTimeoutMs) {
      elements.webhookCrudTimeoutMs.value = formatPolicyNumber(
        policy.webhookTimeoutMs,
        DEFAULT_ALERT_POLICY.webhookTimeoutMs,
      );
    }
    if (elements.webhookCrudRetryAttempts) {
      elements.webhookCrudRetryAttempts.value = formatPolicyNumber(
        policy.webhookRetryAttempts,
        DEFAULT_ALERT_POLICY.webhookRetryAttempts,
      );
    }
    if (elements.webhookCrudBackoffMs) {
      elements.webhookCrudBackoffMs.value = formatPolicyNumber(
        policy.webhookBackoffMs,
        DEFAULT_ALERT_POLICY.webhookBackoffMs,
      );
    }
  }

  function clearWebhookCrudSelection() {
    applyWebhookCrudForm(state.webhookCrud.policy || DEFAULT_ALERT_POLICY);
  }

  function endpointLabel(endpoint) {
    if (!endpoint) return "n/a";
    return `${endpoint.method} ${endpoint.path}`;
  }

  function renderWebhookCrudManager() {
    const manager = state.webhookCrud;

    if (!manager.available) {
      const note = manager.error
        ? `Alert config unavailable: ${manager.error}`
        : "Alert config endpoints were not detected in /openapi.json yet.";
      if (elements.webhookCrudNote) {
        elements.webhookCrudNote.textContent = note;
      }
      if (elements.webhookCrudCreateButton) elements.webhookCrudCreateButton.disabled = true;
      if (elements.webhookCrudUpdateButton) elements.webhookCrudUpdateButton.disabled = true;
      if (elements.webhookCrudDeleteButton) elements.webhookCrudDeleteButton.disabled = true;
      if (elements.webhookCrudClearButton) elements.webhookCrudClearButton.disabled = true;
      applyWebhookCrudForm(DEFAULT_ALERT_POLICY);
      return;
    }

    if (elements.webhookCrudNote) {
      const descriptors = [
        `Read: ${endpointLabel(manager.endpoints.configGet)}`,
        `Save: ${endpointLabel(manager.endpoints.configPut)}`,
        `Test: ${endpointLabel(manager.endpoints.test)}`,
      ];
      elements.webhookCrudNote.textContent = manager.loading
        ? "Loading alert webhook config..."
        : manager.error
          ? `Config error: ${manager.error} | ${descriptors.join(" | ")}`
          : descriptors.join(" | ");
    }

    const saveEnabled = Boolean(manager.endpoints.configPut) && !manager.loading;
    const testEnabled = Boolean(manager.endpoints.test) && !manager.loading;
    const clearEnabled = Boolean(manager.endpoints.configPut) && !manager.loading;
    if (elements.webhookCrudCreateButton) elements.webhookCrudCreateButton.disabled = !saveEnabled;
    if (elements.webhookCrudUpdateButton) elements.webhookCrudUpdateButton.disabled = !testEnabled;
    if (elements.webhookCrudDeleteButton) elements.webhookCrudDeleteButton.disabled = !clearEnabled;
    if (elements.webhookCrudClearButton) {
      elements.webhookCrudClearButton.disabled = !manager.policy || manager.loading;
    }
  }

  async function refreshWebhookCrudList(options = {}) {
    const notify = Boolean(options.notify);
    const getEndpoint = state.webhookCrud.endpoints.configGet;
    if (!state.webhookCrud.available || !getEndpoint) {
      renderWebhookCrudManager();
      return;
    }

    state.webhookCrud.loading = true;
    renderWebhookCrudManager();
    try {
      const response = await fetch(toApiUrl(getEndpoint.path), {
        cache: "no-store",
        headers: authHeaders(),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Config load failed (${response.status})${text ? `: ${text}` : ""}`);
      }
      const payload = await response.json();
      const policySource =
        payload &&
        typeof payload === "object" &&
        payload.policy &&
        typeof payload.policy === "object"
          ? payload.policy
          : payload;
      state.webhookCrud.policy = normalizeAlertPolicy(policySource);
      state.webhookCrud.error = "";
      applyWebhookCrudForm(state.webhookCrud.policy);
      renderWebhookCrudManager();
      if (notify) {
        setStatus("Loaded alert webhook config.");
      }
    } catch (error) {
      state.webhookCrud.error = safeText(error).trim() || "Unknown error";
      renderWebhookCrudManager();
      if (notify) {
        setStatus("Could not load alert webhook config.");
      }
    } finally {
      state.webhookCrud.loading = false;
      renderWebhookCrudManager();
    }
  }

  async function refreshWebhookCrudCapabilities(options = {}) {
    const notify = Boolean(options.notify);
    state.webhookCrud.loading = true;
    state.webhookCrud.error = "";
    renderWebhookCrudManager();

    try {
      const controller = new AbortController();
      const spec = await fetchOpenApiDocument(controller.signal);
      const endpoints = parseWebhookCrudEndpoints(spec);
      if (!endpoints || !endpoints.configGet || !endpoints.configPut) {
        state.webhookCrud.available = false;
        state.webhookCrud.endpoints = { configGet: null, configPut: null, test: null };
        state.webhookCrud.policy = null;
        state.webhookCrud.error = "Alert config paths not detected.";
        state.webhookCrud.loading = false;
        renderWebhookCrudManager();
        if (notify) {
          setStatus("Alert webhook config endpoints not detected yet.");
        }
        return;
      }

      state.webhookCrud.available = true;
      state.webhookCrud.endpoints = endpoints;
      state.webhookCrud.error = "";
      state.webhookCrud.loading = false;
      renderWebhookCrudManager();
      await refreshWebhookCrudList({ notify });
      return;
    } catch (error) {
      state.webhookCrud.available = false;
      state.webhookCrud.endpoints = { configGet: null, configPut: null, test: null };
      state.webhookCrud.policy = null;
      state.webhookCrud.error = safeText(error).trim() || "Unknown error";
      state.webhookCrud.loading = false;
      renderWebhookCrudManager();
      if (notify) {
        setStatus("Alert webhook config discovery failed.");
      }
    }
  }

  async function submitWebhookCrudCreate() {
    const endpoint = state.webhookCrud.endpoints.configPut;
    if (!endpoint) {
      setStatus("Save endpoint is not available.");
      return null;
    }
    const payload = readWebhookCrudForm();
    state.webhookCrud.loading = true;
    renderWebhookCrudManager();
    try {
      const response = await fetch(toApiUrl(endpoint.path), {
        body: JSON.stringify(payload),
        headers: authHeaders({ "content-type": "application/json" }),
        method: endpoint.method,
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Save failed (${response.status})${text ? `: ${text}` : ""}`);
      }
      const body = await response.json();
      const policySource =
        body && typeof body === "object" && body.policy && typeof body.policy === "object"
          ? body.policy
          : body;
      state.webhookCrud.policy = normalizeAlertPolicy(policySource);
      state.webhookCrud.error = "";
      applyWebhookCrudForm(state.webhookCrud.policy);
      return body;
    } finally {
      state.webhookCrud.loading = false;
      renderWebhookCrudManager();
    }
  }

  async function submitWebhookCrudUpdate() {
    const endpoint = state.webhookCrud.endpoints.test;
    if (!endpoint) {
      setStatus("Test endpoint is not available.");
      return null;
    }
    const webhookUrl = safeText(elements.webhookCrudUrl?.value).trim();
    const payload = webhookUrl ? { webhookUrl } : {};
    state.webhookCrud.loading = true;
    renderWebhookCrudManager();
    try {
      const response = await fetch(toApiUrl(endpoint.path), {
        body: JSON.stringify(payload),
        headers: authHeaders({ "content-type": "application/json" }),
        method: endpoint.method,
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Test failed (${response.status})${text ? `: ${text}` : ""}`);
      }
      return response.json();
    } finally {
      state.webhookCrud.loading = false;
      renderWebhookCrudManager();
    }
  }

  async function submitWebhookCrudDelete() {
    const endpoint = state.webhookCrud.endpoints.configPut;
    if (!endpoint) {
      setStatus("Save endpoint is not available.");
      return null;
    }
    state.webhookCrud.loading = true;
    renderWebhookCrudManager();
    try {
      const response = await fetch(toApiUrl(endpoint.path), {
        body: JSON.stringify({ enabled: false, webhookUrl: null }),
        headers: authHeaders({ "content-type": "application/json" }),
        method: endpoint.method,
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Clear failed (${response.status})${text ? `: ${text}` : ""}`);
      }
      const body = await response.json();
      const policySource =
        body && typeof body === "object" && body.policy && typeof body.policy === "object"
          ? body.policy
          : body;
      state.webhookCrud.policy = normalizeAlertPolicy(policySource);
      state.webhookCrud.error = "";
      applyWebhookCrudForm(state.webhookCrud.policy);
      return body;
    } finally {
      state.webhookCrud.loading = false;
      renderWebhookCrudManager();
    }
  }

  function getLogsTimeRange(logs) {
    let minMs = Number.POSITIVE_INFINITY;
    let maxMs = Number.NEGATIVE_INFINITY;
    for (const entry of logs) {
      const timestamp = Date.parse(safeText(entry.timestamp));
      if (!Number.isFinite(timestamp)) continue;
      minMs = Math.min(minMs, timestamp);
      maxMs = Math.max(maxMs, timestamp);
    }
    if (!Number.isFinite(minMs) || !Number.isFinite(maxMs)) return null;
    return { minMs, maxMs };
  }

  function resolveTimelineWindow() {
    const fromIso = localDateTimeToIso(
      combineDateAndTime(elements.queryFrom.value, elements.queryFromTime?.value),
    );
    const toIso = localDateTimeToIso(
      combineDateAndTime(elements.queryTo.value, elements.queryToTime?.value),
    );
    let fromMs = fromIso ? Date.parse(fromIso) : Number.NaN;
    let toMs = toIso ? Date.parse(toIso) : Number.NaN;
    const logsRange = getLogsTimeRange(state.logs);

    if (!Number.isFinite(fromMs)) {
      fromMs = logsRange ? logsRange.minMs : Number.NaN;
    }
    if (!Number.isFinite(toMs)) {
      toMs = logsRange ? logsRange.maxMs : Number.NaN;
    }

    const nowMs = Date.now();
    if (!Number.isFinite(fromMs) && !Number.isFinite(toMs)) {
      toMs = nowMs;
      fromMs = nowMs - 24 * 60 * 60 * 1000;
    } else if (!Number.isFinite(fromMs)) {
      fromMs = toMs - 24 * 60 * 60 * 1000;
    } else if (!Number.isFinite(toMs)) {
      toMs = fromMs + 24 * 60 * 60 * 1000;
    }

    if (toMs <= fromMs) {
      toMs = fromMs + 60 * 60 * 1000;
    }

    return { fromMs, toMs };
  }

  function chooseTimelineBucketMs(rangeMs, availableWidthPx) {
    const minuteMs = 60 * 1000;
    const hourMs = 60 * minuteMs;
    const dayMs = 24 * hourMs;
    const candidates = [
      minuteMs,
      5 * minuteMs,
      15 * minuteMs,
      30 * minuteMs,
      hourMs,
      3 * hourMs,
      6 * hourMs,
      12 * hourMs,
      dayMs,
      2 * dayMs,
      7 * dayMs,
      14 * dayMs,
      30 * dayMs,
    ];
    const safeWidth = Math.max(240, Number.isFinite(availableWidthPx) ? availableWidthPx : 240);
    const minPitchPx = 6;
    const maxBuckets = Math.max(8, Math.floor(safeWidth / minPitchPx));
    for (const candidate of candidates) {
      const bucketCount = Math.ceil(rangeMs / candidate);
      if (bucketCount <= maxBuckets) return candidate;
    }
    return candidates[candidates.length - 1];
  }

  function resolveTimelinePlotWidthPx() {
    const timelineRectWidth = elements.timeline?.getBoundingClientRect().width || 0;
    const paneRectWidth = elements.timelinePane?.getBoundingClientRect().width || 0;
    const measuredWidth = Math.max(timelineRectWidth, paneRectWidth);
    if (Number.isFinite(measuredWidth) && measuredWidth > 0) {
      return Math.max(320, measuredWidth - 22);
    }
    const viewportFallback = Number.isFinite(window.innerWidth) ? window.innerWidth - 96 : 320;
    return Math.max(320, viewportFallback);
  }

  function resolveTimelineBarSizing(bucketCount, availablePlotWidth, manualMode) {
    const safeBucketCount = Math.max(1, bucketCount);
    const naturalBarWidth = safeBucketCount <= 72 ? 14 : safeBucketCount <= 144 ? 10 : 8;
    const naturalGap = safeBucketCount <= 72 ? 4 : 3;
    const naturalPitch = naturalBarWidth + naturalGap;
    const naturalWidth = Math.max(0, safeBucketCount * naturalPitch - naturalGap);
    const minBarWidth = 2.5;
    const minGap = 1.5;
    const maxGap = 8;

    if (!manualMode || naturalWidth < availablePlotWidth) {
      const gapRatio = manualMode ? 0.18 : 0.22;
      const barGap =
        safeBucketCount <= 1
          ? 0
          : clamp((availablePlotWidth / safeBucketCount) * gapRatio, minGap, maxGap);
      let barWidth =
        (availablePlotWidth - Math.max(0, safeBucketCount - 1) * barGap) / safeBucketCount;

      if (barWidth < minBarWidth) {
        barWidth = minBarWidth;
      }

      const pitch = barWidth + barGap;
      const chartWidth = Math.max(0, safeBucketCount * pitch - barGap);
      return { barGap, barWidth, chartWidth, pitch };
    }

    return {
      barGap: naturalGap,
      barWidth: naturalBarWidth,
      chartWidth: naturalWidth,
      pitch: naturalPitch,
    };
  }

  function formatTimelineTime(ms, bucketMs) {
    if (bucketMs < 60 * 60 * 1000) {
      return new Date(ms).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    if (bucketMs < 24 * 60 * 60 * 1000) {
      return new Date(ms).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    if (bucketMs < 14 * 24 * 60 * 60 * 1000) {
      return new Date(ms).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
    }
    return new Date(ms).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function formatBucketSize(bucketMs) {
    const minuteMs = 60 * 1000;
    const hourMs = 60 * minuteMs;
    const dayMs = 24 * hourMs;
    if (bucketMs < hourMs) return `${Math.max(1, Math.round(bucketMs / minuteMs))}m`;
    if (bucketMs < dayMs) return `${Math.max(1, Math.round(bucketMs / hourMs))}h`;
    return `${Math.max(1, Math.round(bucketMs / dayMs))}d`;
  }

  function buildTimelineBucketLabel(fromMs, toMs, bucketMs) {
    return `${formatTimelineTime(fromMs, bucketMs)} to ${formatTimelineTime(toMs, bucketMs)}`;
  }

  function getTimelineBarFromEvent(event) {
    const target = event.target;
    if (target instanceof HTMLElement) {
      const bar = target.closest(".timeline-bar");
      if (bar instanceof HTMLElement && elements.timeline?.contains(bar)) return bar;
    }

    if (typeof document.elementFromPoint !== "function") return null;
    const pointTarget = document.elementFromPoint(event.clientX, event.clientY);
    if (!(pointTarget instanceof HTMLElement)) return null;
    const bar = pointTarget.closest(".timeline-bar");
    return bar instanceof HTMLElement && elements.timeline?.contains(bar) ? bar : null;
  }

  function timelineBarData(bar) {
    const count = Number.parseInt(bar.dataset.count || "", 10);
    const fromMs = Number.parseInt(bar.dataset.fromMs || "", 10);
    const index = Number.parseInt(bar.dataset.index || "", 10);
    const toMs = Number.parseInt(bar.dataset.toMs || "", 10);
    const bucketMs = Number.parseInt(bar.dataset.bucketMs || "", 10);
    const key = safeText(bar.dataset.key).trim();
    const label = safeText(bar.dataset.label).trim();
    if (
      !Number.isFinite(count) ||
      !Number.isFinite(fromMs) ||
      !Number.isFinite(index) ||
      !Number.isFinite(toMs) ||
      toMs <= fromMs ||
      !key ||
      !label
    ) {
      return null;
    }
    return {
      bucketMs: Number.isFinite(bucketMs) && bucketMs > 0 ? bucketMs : toMs - fromMs,
      count,
      fromMs,
      index,
      key,
      label,
      toMs,
    };
  }

  function getTimelineBarIndexFromEvent(event) {
    const bar = getTimelineBarFromEvent(event);
    const data = bar ? timelineBarData(bar) : null;
    return data ? data.index : null;
  }

  function renderTimelineSelectionPreview(startIndex, endIndex) {
    const start = Math.min(startIndex, endIndex);
    const end = Math.max(startIndex, endIndex);
    elements.timeline?.classList.add("is-selecting");
    for (const bar of elements.timeline?.querySelectorAll(".timeline-bar") || []) {
      if (!(bar instanceof HTMLElement)) continue;
      const data = timelineBarData(bar);
      bar.classList.toggle(
        "is-selected-preview",
        Boolean(data && data.index >= start && data.index <= end),
      );
    }
  }

  function clearTimelineSelectionPreview() {
    state.timelineSelectionEndIndex = null;
    state.timelineSelectionPointerId = null;
    state.timelineSelectionStartIndex = null;
    elements.timeline?.classList.remove("is-selecting");
    for (const bar of elements.timeline?.querySelectorAll(".timeline-bar.is-selected-preview") ||
      []) {
      bar.classList.remove("is-selected-preview");
    }
  }

  function timelineRangeFilterFromIndexes(startIndex, endIndex) {
    const start = Math.min(startIndex, endIndex);
    const end = Math.max(startIndex, endIndex);
    const bars = Array.from(elements.timeline?.querySelectorAll(".timeline-bar") || [])
      .filter((bar) => bar instanceof HTMLElement)
      .map((bar) => timelineBarData(bar))
      .filter((data) => data && data.index >= start && data.index <= end);
    if (bars.length === 0) return null;
    const fromMs = bars[0].fromMs;
    const toMs = bars[bars.length - 1].toMs;
    const count = bars.reduce((sum, bar) => sum + bar.count, 0);
    if (count <= 0 || toMs <= fromMs) return null;
    return {
      count,
      filter: {
        fromMs,
        key: `${fromMs}-${toMs}`,
        label: buildTimelineBucketLabel(fromMs, toMs, bars[0].bucketMs),
        toMs,
      },
    };
  }

  function applyTimelineRangeFilter(startIndex, endIndex) {
    const range = timelineRangeFilterFromIndexes(startIndex, endIndex);
    if (!range) {
      setStatus("No logs for selected timeline range.");
      return;
    }
    state.timelineFilter = range.filter;
    setActiveView("stream");
    applyLocalView({ commitScope: true, reason: "timeline range" });
    setStatus(`Selected ${range.filter.label} (${range.count} logs).`);
  }

  function applyTimelineBarFilter(bar) {
    const data = timelineBarData(bar);
    if (!data) return;
    if (data.count <= 0) {
      setStatus("No logs for selected timeline bucket.");
      return;
    }

    if (state.timelineFilter && state.timelineFilter.key === data.key) {
      state.timelineFilter = null;
    } else {
      state.timelineFilter = {
        fromMs: data.fromMs,
        key: data.key,
        label: data.label,
        toMs: data.toMs,
      };
    }
    setActiveView("stream");
    applyLocalView({
      commitScope: true,
      reason: state.timelineFilter ? "timeline drilldown" : "timeline drilldown cleared",
    });
    setStatus(
      state.timelineFilter
        ? `Drilled into ${state.timelineFilter.label}`
        : "Timeline drilldown cleared.",
    );
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function quantile(values, percentile) {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((left, right) => left - right);
    if (sorted.length === 1) return sorted[0];
    const index = clamp(percentile, 0, 1) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return sorted[lower];
    const weight = index - lower;
    return sorted[lower] + (sorted[upper] - sorted[lower]) * weight;
  }

  function timelineIntensity(count, stats) {
    if (count <= 0) return 0;

    const logShare = Math.log1p(count) / Math.log1p(stats.max);
    const baselineShare = stats.median > 0 ? count / stats.median : count;
    const baselineScore = clamp((baselineShare - 0.8) / 2.8, 0, 1);
    const outlierScore =
      stats.p90 > stats.median
        ? clamp((count - stats.median) / (stats.p90 - stats.median), 0, 1)
        : baselineScore;
    return clamp(logShare * 0.35 + baselineScore * 0.25 + outlierScore * 0.4, 0.08, 1);
  }

  function renderTimeline() {
    hideTimelineTooltip();
    const isDark = document.documentElement.dataset.theme === "dark";
    const { fromMs, toMs } = resolveTimelineWindow();
    const rangeMs = Math.max(1, toMs - fromMs);
    const availablePlotWidth = resolveTimelinePlotWidthPx();
    const manualMode =
      Number.isFinite(state.timelineBucketMsOverride) && state.timelineBucketMsOverride > 0;
    const bucketMs = manualMode
      ? state.timelineBucketMsOverride
      : chooseTimelineBucketMs(rangeMs, availablePlotWidth);
    const bucketCount = Math.max(1, Math.ceil(rangeMs / bucketMs));
    const buckets = Array.from({ length: bucketCount }, () => 0);

    for (const entry of state.logs) {
      const timestamp = Date.parse(safeText(entry.timestamp));
      if (!Number.isFinite(timestamp)) continue;
      if (timestamp < fromMs || timestamp >= toMs) continue;
      const bucketIndex = Math.min(bucketCount - 1, Math.floor((timestamp - fromMs) / bucketMs));
      buckets[bucketIndex] += 1;
    }

    const nonZeroCounts = buckets.filter((count) => count > 0);
    const stats = {
      max: Math.max(1, ...buckets),
      median: quantile(nonZeroCounts, 0.5),
      p90: quantile(nonZeroCounts, 0.9),
    };
    elements.timeline.innerHTML = "";
    const chart = document.createElement("div");
    chart.className = "timeline-chart";

    const chartMeta = document.createElement("p");
    chartMeta.className = "timeline-meta";
    chartMeta.textContent = `${buildTimelineBucketLabel(fromMs, toMs, bucketMs)} · ${bucketCount} buckets · ${formatBucketSize(bucketMs)} each · ${manualMode ? "manual" : "auto-fit"}`;
    chart.appendChild(chartMeta);

    if (elements.timelineBucketSize) {
      elements.timelineBucketSize.value = manualMode ? String(bucketMs) : "auto";
    }

    const plot = document.createElement("div");
    plot.className = "timeline-plot";
    const bars = document.createElement("div");
    bars.className = "timeline-bars";
    const axis = document.createElement("div");
    axis.className = "timeline-axis";
    const { barGap, barWidth, chartWidth, pitch } = resolveTimelineBarSizing(
      bucketCount,
      availablePlotWidth,
      manualMode,
    );
    bars.style.width = `${chartWidth}px`;
    axis.style.width = `${chartWidth}px`;
    bars.style.setProperty("--timeline-bar-width", `${barWidth}px`);
    bars.style.setProperty("--timeline-bar-gap", `${barGap}px`);

    for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex++) {
      const count = buckets[bucketIndex];
      const intensity = timelineIntensity(count, stats);
      const bucketFromMs = fromMs + bucketIndex * bucketMs;
      const bucketToMs = Math.min(toMs, bucketFromMs + bucketMs);
      const bucketKey = `${bucketFromMs}-${bucketToMs}`;
      const bucketLabel = buildTimelineBucketLabel(bucketFromMs, bucketToMs, bucketMs);
      const heightRatio = count > 0 ? Math.max(0.06, count / stats.max) : 0;
      const heightPx = count <= 0 ? 6 : Math.round(16 + heightRatio * 168);

      const bar = document.createElement("button");
      bar.type = "button";
      bar.className = "timeline-bar";
      if (
        state.timelineFilter &&
        bucketFromMs < state.timelineFilter.toMs &&
        bucketToMs > state.timelineFilter.fromMs
      ) {
        bar.classList.add("is-active");
      }
      bar.dataset.bucketMs = String(bucketMs);
      bar.dataset.key = bucketKey;
      bar.dataset.fromMs = String(bucketFromMs);
      bar.dataset.index = String(bucketIndex);
      bar.dataset.toMs = String(bucketToMs);
      bar.dataset.label = bucketLabel;
      bar.dataset.count = String(count);
      bar.style.height = `${heightPx}px`;
      if (count <= 0) {
        bar.style.background = isDark ? "hsl(214deg 18% 23%)" : "hsl(210deg 11% 92%)";
      } else {
        const saturation = isDark
          ? 22 + Math.round(intensity * 56)
          : 18 + Math.round(intensity * 58);
        const lightness = isDark
          ? 22 + Math.round(intensity * 35)
          : 89 - Math.round(intensity * 50);
        bar.style.background = `hsl(164deg ${saturation}% ${lightness}%)`;
      }
      bars.appendChild(bar);
    }

    const maxLabels = 8;
    const targetStep = Math.max(1, Math.ceil(bucketCount / maxLabels));
    const labelIndexes = new Set([0, Math.max(0, bucketCount - 1)]);
    for (let index = 0; index < bucketCount; index += targetStep) {
      labelIndexes.add(index);
    }

    [...labelIndexes]
      .sort((left, right) => left - right)
      .forEach((index) => {
        const label = document.createElement("span");
        label.className = "timeline-axis-label";
        label.style.left = `${index * pitch + barWidth / 2}px`;
        label.textContent = formatTimelineTime(fromMs + index * bucketMs, bucketMs);
        axis.appendChild(label);
      });

    plot.appendChild(bars);
    plot.appendChild(axis);
    chart.appendChild(plot);
    elements.timeline.appendChild(chart);
  }

  function buildCorrelationGroups(logs) {
    const groups = new Map();
    for (const entry of logs) {
      const correlation = correlationInfo(entry);
      if (!correlation.value) continue;
      const key = `${correlation.field}:${correlation.value}`;
      const existing = groups.get(key) || {
        count: 0,
        errorCount: 0,
        field: correlation.field,
        firstMs: Number.POSITIVE_INFINITY,
        lastMs: Number.NEGATIVE_INFINITY,
        value: correlation.value,
      };

      existing.count++;
      if (safeText(entry.level).toUpperCase() === "ERROR") existing.errorCount++;
      const timestamp = Date.parse(safeText(entry.timestamp));
      if (Number.isFinite(timestamp)) {
        existing.firstMs = Math.min(existing.firstMs, timestamp);
        existing.lastMs = Math.max(existing.lastMs, timestamp);
      }
      groups.set(key, existing);
    }

    return [...groups.values()]
      .sort((a, b) => {
        if (b.errorCount !== a.errorCount) return b.errorCount - a.errorCount;
        if (b.count !== a.count) return b.count - a.count;
        return b.lastMs - a.lastMs;
      })
      .slice(0, 200);
  }

  function renderCorrelationGroups() {
    elements.correlationGroups.innerHTML = "";
    if (state.correlationGroups.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "No correlations available in the current result set.";
      elements.correlationGroups.appendChild(empty);
      return;
    }

    const fields = new Set(state.correlationGroups.map((group) => group.field));
    const showFieldKey = fields.size > 1;

    for (const group of state.correlationGroups) {
      const card = document.createElement("article");
      card.className = "correlation-card";

      const head = document.createElement("div");
      head.className = "correlation-card-head";
      const idButton = document.createElement("button");
      idButton.type = "button";
      idButton.className = "correlation-pill correlation-id-button copy-json-button";
      idButton.dataset.copyCorrelationId = group.value;
      idButton.dataset.fullId = group.value;
      idButton.title = group.value;
      idButton.setAttribute("aria-label", `Copy correlation ID ${group.value}`);
      idButton.textContent = group.value;
      head.appendChild(idButton);

      const meta = document.createElement("div");
      meta.className = "correlation-meta";
      const firstText =
        group.firstMs === Number.POSITIVE_INFINITY ? "-" : new Date(group.firstMs).toISOString();
      const lastText =
        group.lastMs === Number.NEGATIVE_INFINITY ? "-" : new Date(group.lastMs).toISOString();
      const errorClass = group.errorCount > 0 ? "is-error" : "is-zero";
      meta.innerHTML = `
        <div class="correlation-meta-row">
          <span class="correlation-meta-key">First</span>
          <span class="correlation-meta-value">${escapeHtml(firstText)}</span>
        </div>
        <div class="correlation-meta-row">
          <span class="correlation-meta-key">Last</span>
          <span class="correlation-meta-value">${escapeHtml(lastText)}</span>
        </div>
        <div class="correlation-meta-row">
          <span class="correlation-meta-key">Errors${showFieldKey ? ` · Key: ${escapeHtml(group.field)}` : ""}</span>
          <span class="correlation-error-pill ${errorClass}">${group.errorCount}</span>
        </div>
      `;

      const countRow = document.createElement("button");
      countRow.type = "button";
      countRow.className = "correlation-meta-row correlation-log-row";
      countRow.dataset.correlationField = group.field;
      countRow.dataset.correlationValue = group.value;

      const countLabel = document.createElement("span");
      countLabel.className = "correlation-meta-key";
      countLabel.textContent = "Logs";

      const countValue = document.createElement("span");
      countValue.className = "correlation-log-count-pill";
      countValue.textContent = `${group.count} ${group.count === 1 ? "log" : "logs"}`;

      countRow.append(countLabel, countValue);
      meta.prepend(countRow);

      card.appendChild(head);
      card.appendChild(meta);
      elements.correlationGroups.appendChild(card);
    }
  }

  function renderTraceList() {
    elements.traceList.innerHTML = "";

    if (state.correlationGroups.length === 0) {
      const empty = document.createElement("div");
      empty.className = "trace-empty";
      empty.textContent = "No traces available in the current result set.";
      elements.traceList.appendChild(empty);
      return;
    }

    const list = document.createElement("div");
    list.className = "trace-list-items";
    const activeTraceField = elements.queryField.value.trim();
    const activeTraceValue = elements.queryValue.value.trim();

    for (const group of state.correlationGroups.slice(0, 80)) {
      const button = document.createElement("button");
      button.className = "trace-list-item";
      button.type = "button";
      button.dataset.correlationField = group.field;
      button.dataset.correlationValue = group.value;
      if (activeTraceField === group.field && activeTraceValue === group.value) {
        button.classList.add("is-active");
      }
      button.innerHTML = `
        <span class="trace-list-id">${escapeHtml(group.value)}</span>
        <span class="trace-list-meta">${group.count} logs${group.errorCount > 0 ? ` · ${group.errorCount} errors` : ""}</span>
      `;
      list.appendChild(button);
    }

    elements.traceList.appendChild(list);
  }

  function renderQueryChips() {
    elements.activeQueryChips.innerHTML = "";
    const chips = [];
    const from = elements.queryFrom.value;
    const to = elements.queryTo.value;
    if (from) chips.push({ action: "clear-from", label: `from: ${from.replace("T", " ")}` });
    if (to) chips.push({ action: "clear-to", label: `to: ${to.replace("T", " ")}` });
    if (elements.queryLevel.value)
      chips.push({ action: "clear-level", label: `level: ${elements.queryLevel.value}` });
    if (elements.queryAudit.value)
      chips.push({ action: "clear-audit", label: `audit: ${elements.queryAudit.value}` });
    if (elements.queryField.value && elements.queryValue.value) {
      const field = elements.queryField.value;
      const value = elements.queryValue.value;
      const label = isTraceField(field) ? `trace: ${value}` : `${field}: ${value}`;
      chips.push({ action: "clear-field-value", label });
    }
    if (state.timelineFilter) {
      chips.push({
        action: "clear-timeline",
        label: `timeline: ${state.timelineFilter.label}`,
      });
    }

    if (chips.length === 0) {
      const info = document.createElement("span");
      info.className = "panel-note";
      info.textContent = "No active query filters.";
      elements.activeQueryChips.appendChild(info);
      updateScopeClearVisibility();
      return;
    }

    for (const chip of chips) {
      const node = document.createElement("span");
      node.className = "query-chip";
      node.innerHTML = `<span>${chip.label}</span><button type="button" data-chip-action="${chip.action}" aria-label="Clear filter">x</button>`;
      elements.activeQueryChips.appendChild(node);
    }
    updateScopeClearVisibility();
  }

  function renderSummary() {
    const errorCount = state.visibleLogs.filter(
      (entry) => safeText(entry.level).toUpperCase() === "ERROR",
    ).length;
    const correlationIds = new Set();
    const localEventCounts = countBy(
      state.visibleLogs,
      (entry) => safeText(entry.event) || "(none)",
    );
    const localComponentCounts = countBy(
      state.visibleLogs,
      (entry) => safeText(getByPath(entry, "data.component")) || "(none)",
    );
    const localErrorCorrelationCounts = countBy(
      state.visibleLogs.filter((entry) => safeText(entry.level).toUpperCase() === "ERROR"),
      (entry) => {
        const correlation = correlationInfo(entry);
        return correlation.value ? `${correlation.field}:${correlation.value}` : "(missing)";
      },
    );

    for (const entry of state.visibleLogs) {
      const value = correlationInfo(entry).value;
      if (value) correlationIds.add(value);
    }

    elements.metricLoaded.textContent = String(state.logs.length);
    elements.metricVisible.textContent = String(state.visibleLogs.length);
    elements.metricErrors.textContent = String(errorCount);
    elements.metricCorrelations.textContent = String(correlationIds.size);
    renderTopList(
      elements.topEvents,
      state.serverInsights.topEvents.length > 0 ? state.serverInsights.topEvents : localEventCounts,
      10,
    );
    renderTopList(
      elements.topComponents,
      state.serverInsights.topComponents.length > 0
        ? state.serverInsights.topComponents
        : localComponentCounts,
      10,
    );
    renderErrorCorrelationList(
      state.serverInsights.errorCorrelations.length > 0
        ? state.serverInsights.errorCorrelations
        : localErrorCorrelationCounts,
    );
    state.correlationGroups = buildCorrelationGroups(state.visibleLogs);
    renderCorrelationGroups();
    renderTraceList();
    renderWebhookHealth();
    renderWebhookCrudManager();
  }

  function render() {
    renderLogs();
    renderLevelDistribution();
    if (state.activeView === "timeline") {
      renderTimeline();
    }
    renderSummary();
    renderQueryChips();
  }

  function localDateTimeToIso(value) {
    const trimmed = safeText(value).trim();
    if (!trimmed) return undefined;
    let normalized = trimmed;
    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      normalized = `${normalized}T00:00:00`;
    } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)) {
      normalized = `${normalized}:00`;
    }
    const parsed = Date.parse(normalized);
    if (!Number.isFinite(parsed)) return undefined;
    return new Date(parsed).toISOString();
  }

  function formatLocalDateInput(date) {
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return localDate.toISOString().slice(0, 19);
  }

  function formatLocalDateValue(date) {
    return formatLocalDateInput(date).slice(0, 10);
  }

  function formatLocalTimeValue(date) {
    return formatLocalDateInput(date).slice(11, 19);
  }

  function setRangeHours(hours) {
    const now = new Date();
    const from = new Date(now.getTime() - hours * 60 * 60 * 1000);
    elements.queryFrom.value = formatLocalDateValue(from);
    elements.queryTo.value = formatLocalDateValue(now);
    if (elements.queryFromTime) {
      elements.queryFromTime.value = formatLocalTimeValue(from);
    }
    if (elements.queryToTime) {
      elements.queryToTime.value = formatLocalTimeValue(now);
    }
  }

  function clearRange() {
    elements.queryFrom.value = "";
    elements.queryTo.value = "";
    if (elements.queryFromTime) {
      elements.queryFromTime.value = "";
    }
    if (elements.queryToTime) {
      elements.queryToTime.value = "";
    }
  }

  function ensureDefaultRange() {
    if (elements.queryFrom.value && elements.queryTo.value) return;
    setRangeHours(720);
  }

  function hasCorrelationFilter() {
    const key = elements.queryField.value.trim();
    const value = elements.queryValue.value.trim();
    return (key === "correlationId" || key === "requestId") && value.length > 0;
  }

  function clearCorrelationFilter() {
    if (!hasCorrelationFilter()) return false;
    setServerFilter("", "");
    return true;
  }

  function maybeClearCorrelationFilter(reason) {
    if (!clearCorrelationFilter()) return;
    setStatus(`Correlation filter cleared (${reason}).`);
    renderQueryChips();
  }

  function applyPinnedPreset(name) {
    state.timelineFilter = null;
    if (name === "errors24h") {
      setRangeHours(24);
      elements.queryLevel.value = "ERROR";
      elements.queryAudit.value = "";
      setServerFilter("", "");
      elements.queryLimit.value = String(DEFAULT_QUERY_LIMIT);
      return;
    }

    if (name === "audit7d") {
      setRangeHours(168);
      elements.queryLevel.value = "";
      elements.queryAudit.value = "true";
      setServerFilter("", "");
      elements.queryLimit.value = String(DEFAULT_QUERY_LIMIT);
      return;
    }
  }

  function buildQueryString() {
    return queryObjectToSearchParams(getServerQueryFromControls()).toString();
  }

  function resetServerInsights() {
    state.serverInsights = {
      errorCorrelations: [],
      levelDistribution: [],
      topComponents: [],
      topEvents: [],
    };
  }

  function buildInsightsScope() {
    const query = getServerQueryFromControls();
    return {
      audit: query.audit,
      field: query.field,
      from: query.from,
      level: query.level,
      to: query.to,
      value: query.value,
    };
  }

  function toSearchParams(input) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(input)) {
      const text = safeText(value).trim();
      if (text.length > 0) params.set(key, text);
    }
    return params;
  }

  function normalizeBuckets(input) {
    if (!Array.isArray(input)) return [];
    return input
      .map((bucket) => ({
        count: Number(bucket?.count || 0),
        key: safeText(bucket?.key),
      }))
      .filter(
        (bucket) => bucket.key.length > 0 && Number.isFinite(bucket.count) && bucket.count > 0,
      );
  }

  async function fetchAggregateBuckets(scope, options, signal) {
    const params = toSearchParams({
      ...scope,
      groupBy: options.groupBy,
      groupField: options.groupField || "",
      limit: options.limit,
    });
    const response = await fetch(toApiUrl(`/api/logs/aggregate?${params.toString()}`), {
      headers: authHeaders(),
      signal,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed (${response.status}): ${text}`);
    }
    const payload = await response.json();
    return normalizeBuckets(payload.buckets);
  }

  async function refreshServerInsights() {
    const requestId = ++state.insightsRequestId;
    if (state.insightsAbortController) {
      state.insightsAbortController.abort();
    }
    const controller = new AbortController();
    state.insightsAbortController = controller;
    const scope = buildInsightsScope();
    const errorScope = { ...scope };
    if (!safeText(errorScope.level).trim()) {
      errorScope.level = "ERROR";
    }

    try {
      const [levelDistribution, topEvents, topComponents, errorCorrelations] = await Promise.all([
        fetchAggregateBuckets(scope, { groupBy: "level", limit: 12 }, controller.signal),
        fetchAggregateBuckets(scope, { groupBy: "event", limit: 10 }, controller.signal),
        fetchAggregateBuckets(
          scope,
          { groupBy: "field", groupField: "component", limit: 10 },
          controller.signal,
        ),
        fetchAggregateBuckets(errorScope, { groupBy: "correlation", limit: 10 }, controller.signal),
      ]);

      if (requestId !== state.insightsRequestId) return;

      state.serverInsights = {
        errorCorrelations,
        levelDistribution,
        topComponents,
        topEvents,
      };
      renderLevelDistribution();
      renderSummary();
    } catch (error) {
      if (isAbortError(error)) return;
      if (requestId !== state.insightsRequestId) return;
      resetServerInsights();
      renderLevelDistribution();
      renderSummary();
    } finally {
      if (requestId === state.insightsRequestId) {
        state.insightsAbortController = null;
      }
    }
  }

  async function refreshWebhookHealth(options = {}) {
    const notify = Boolean(options.notify);
    const requestId = ++state.healthRequestId;
    if (state.healthAbortController) {
      state.healthAbortController.abort();
    }
    const controller = new AbortController();
    state.healthAbortController = controller;
    state.webhookHealth.loading = true;
    if (!state.webhookHealth.loadedAt) {
      renderWebhookHealth();
    }

    try {
      const response = await fetch(toApiUrl("/health"), {
        cache: "no-store",
        headers: authHeaders(),
        signal: controller.signal,
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed (${response.status})${text ? `: ${text}` : ""}`);
      }
      const payload = await response.json();
      if (requestId !== state.healthRequestId) return;

      state.webhookHealth = {
        alerting:
          payload?.alerting && typeof payload.alerting === "object" ? payload.alerting : null,
        alertPolicy:
          payload?.alertPolicy && typeof payload.alertPolicy === "object"
            ? payload.alertPolicy
            : null,
        error: "",
        loadedAt: Date.now(),
        loading: false,
      };
      renderWebhookHealth();
      if (notify) {
        setStatus("Refreshed alert webhook status.");
      }
    } catch (error) {
      if (isAbortError(error)) return;
      if (requestId !== state.healthRequestId) return;
      state.webhookHealth.loading = false;
      state.webhookHealth.error = safeText(error).trim() || "Unknown error";
      renderWebhookHealth();
      if (notify) {
        setStatus("Could not refresh alert webhook status.");
      }
    } finally {
      if (requestId === state.healthRequestId) {
        state.healthAbortController = null;
      }
    }
  }

  async function fetchLogs() {
    const startedAt = performance.now();
    const { requestId, signal } = beginLogsRequest();
    state.insightsRequestId += 1;
    if (state.insightsAbortController) {
      state.insightsAbortController.abort();
      state.insightsAbortController = null;
    }
    setStatus("Loading logs...");
    const query = buildQueryString();
    syncQueryToUrl();
    const url = query ? toApiUrl(`/api/logs?${query}`) : toApiUrl("/api/logs");
    try {
      const response = await fetch(url, { headers: authHeaders(), signal });
      if (requestId !== state.logsRequestId) return false;
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed (${response.status}): ${text}`);
      }
      const payload = await response.json();
      if (requestId !== state.logsRequestId) return false;
      state.logs = Array.isArray(payload.entries) ? payload.entries : [];
      state.hasMoreLogs = Boolean(payload.hasMore);
      state.nextCursor = typeof payload.nextCursor === "string" ? payload.nextCursor : "";
      state.expanded.clear();
      resetServerInsights();
      updateLoadMoreButton();
      updateFieldControls();
      applyLocalView({ commitScope: true, reason: "server query" });
      void refreshServerInsights();
      const durationMs = Math.max(1, Math.round(performance.now() - startedAt));
      setStatus(
        state.hasMoreLogs
          ? `Loaded ${state.logs.length} log entries (more available) in ${durationMs}ms.`
          : `Loaded ${state.logs.length} log entries in ${durationMs}ms.`,
      );
      return true;
    } catch (error) {
      if (isAbortError(error)) return false;
      throw error;
    } finally {
      if (requestId === state.logsRequestId) {
        state.logsAbortController = null;
        setRunQueryButtonState("idle");
      }
    }
  }

  async function fetchMoreLogs() {
    if (!state.nextCursor) return false;
    const startedAt = performance.now();
    const { requestId, signal } = beginLogsRequest();
    setStatus("Loading more logs...");
    const params = queryObjectToSearchParams(getServerQueryFromControls());
    params.set("cursor", state.nextCursor);
    const url = toApiUrl(`/api/logs?${params.toString()}`);
    try {
      const response = await fetch(url, { headers: authHeaders(), signal });
      if (requestId !== state.logsRequestId) return false;
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed (${response.status}): ${text}`);
      }

      const payload = await response.json();
      if (requestId !== state.logsRequestId) return false;
      const nextEntries = Array.isArray(payload.entries) ? payload.entries : [];
      const existingIds = new Set(state.logs.map((entry) => entry.id));
      const deduped = nextEntries.filter((entry) => !existingIds.has(entry.id));
      if (deduped.length > 0) {
        state.logs = state.logs.concat(deduped);
      }
      state.hasMoreLogs = Boolean(payload.hasMore);
      state.nextCursor = typeof payload.nextCursor === "string" ? payload.nextCursor : "";
      updateLoadMoreButton();
      updateFieldControls();
      applyLocalView({ commitScope: true, reason: "server query (load more)" });
      const durationMs = Math.max(1, Math.round(performance.now() - startedAt));
      setStatus(
        state.hasMoreLogs
          ? `Loaded ${state.logs.length} log entries (more available) in ${durationMs}ms.`
          : `Loaded ${state.logs.length} log entries in ${durationMs}ms.`,
      );
      return true;
    } catch (error) {
      if (isAbortError(error)) return false;
      throw error;
    } finally {
      if (requestId === state.logsRequestId) {
        state.logsAbortController = null;
        setRunQueryButtonState("idle");
      }
    }
  }

  function setActiveView(viewName) {
    state.activeView = viewName;
    for (const tab of elements.viewTabs) {
      tab.classList.toggle("is-active", tab.dataset.viewTarget === viewName);
    }
    for (const pane of elements.viewPanes) {
      pane.classList.toggle("is-active", pane.id === `view-${viewName}`);
    }
    if (viewName === "timeline") {
      window.requestAnimationFrame(() => {
        renderTimeline();
      });
    }
  }

  function drilldownCorrelation(field, value) {
    if (!field || !value) return;
    if (field === "trace") {
      const traceField = resolveTraceField("auto", value);
      setServerFilter(traceField, value);
    } else {
      setServerFilter(field, value);
    }
    state.timelineFilter = null;
    setActiveView("stream");
    void fetchLogs().catch((error) => {
      setStatus(String(error));
    });
  }

  function onPrimaryServerFilterChanged(reason) {
    maybeClearCorrelationFilter(reason);
    state.timelineFilter = null;
    applyLocalView();
  }

  function applyTraceNavigation() {
    const traceValue = elements.traceValue.value.trim();
    if (!traceValue) {
      clearTraceNavigation();
      return;
    }

    const traceField = resolveTraceField(elements.traceField.value, traceValue);
    setServerFilter(traceField, traceValue, { syncTrace: false });
    state.timelineFilter = null;
    setActiveView("stream");
    void fetchLogs().catch((error) => {
      setStatus(String(error));
    });
  }

  function clearTraceNavigation() {
    setServerFilter("", "");
    elements.traceField.value = "auto";
    elements.traceValue.value = "";
    state.timelineFilter = null;
    void fetchLogs().catch((error) => {
      setStatus(String(error));
    });
  }

  function clearStreamScope() {
    clearRange();
    elements.queryLevel.value = "";
    elements.queryAudit.value = "";
    setServerFilter("", "");
    elements.traceField.value = "auto";
    elements.traceValue.value = "";
    state.timelineFilter = null;
    syncQueryToUrl();
    void fetchLogs().catch((error) => {
      setStatus(String(error));
    });
  }

  function sortSavedQueries() {
    state.savedQueries.sort((left, right) => {
      if (right.updatedAt !== left.updatedAt) return right.updatedAt - left.updatedAt;
      return left.name.localeCompare(right.name);
    });
  }

  function renderSavedQueries(preferredName = "") {
    if (!elements.savedQuerySelect) return;
    const selectedName = preferredName || elements.savedQuerySelect.value;
    elements.savedQuerySelect.innerHTML = '<option value="">Select...</option>';
    for (const entry of state.savedQueries) {
      const option = document.createElement("option");
      option.value = entry.name;
      option.textContent = entry.name;
      elements.savedQuerySelect.appendChild(option);
    }
    if (selectedName && state.savedQueries.some((entry) => entry.name === selectedName)) {
      elements.savedQuerySelect.value = selectedName;
    } else {
      elements.savedQuerySelect.value = "";
    }
  }

  function persistSavedQueries() {
    if (!writeStorageItem(STORAGE_KEY_SAVED_QUERIES, JSON.stringify(state.savedQueries))) {
      setStatus("Could not persist saved queries in localStorage.");
    }
  }

  function loadSavedQueries() {
    try {
      const raw = readStorageItem(STORAGE_KEY_SAVED_QUERIES);
      if (!raw) {
        state.savedQueries = [];
        renderSavedQueries();
        updateSaveQueryButtonState();
        return;
      }

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        state.savedQueries = [];
        renderSavedQueries();
        updateSaveQueryButtonState();
        return;
      }

      state.savedQueries = parsed
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          const name = safeText(entry.name).trim();
          if (!name) return null;
          const updatedAt = Number.parseInt(safeText(entry.updatedAt), 10);
          return {
            name,
            query: normalizeQueryObject(entry.query),
            updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
          };
        })
        .filter((entry) => Boolean(entry));
      sortSavedQueries();
      renderSavedQueries();
      updateSaveQueryButtonState();
    } catch {
      state.savedQueries = [];
      renderSavedQueries();
      updateSaveQueryButtonState();
    }
  }

  function saveCurrentQuery() {
    const queryName =
      safeText(elements.savedQueryName?.value).trim() ||
      safeText(elements.savedQuerySelect?.value).trim();
    if (!queryName) {
      showErrorAlert("Provide a query name before saving.");
      if (elements.savedQueryName) {
        elements.savedQueryName.focus();
      }
      updateSaveQueryButtonState();
      return;
    }

    const nextEntry = {
      name: queryName,
      query: getServerQueryFromControls(),
      updatedAt: Date.now(),
    };
    const existingIndex = state.savedQueries.findIndex((entry) => entry.name === queryName);
    const isUpdate = existingIndex > -1;
    if (isUpdate) {
      state.savedQueries.splice(existingIndex, 1, nextEntry);
    } else {
      state.savedQueries.push(nextEntry);
    }

    sortSavedQueries();
    persistSavedQueries();
    renderSavedQueries(queryName);
    if (elements.savedQueryName) {
      elements.savedQueryName.value = queryName;
    }
    updateSaveQueryButtonState();
    setStatus(isUpdate ? `Updated saved query "${queryName}".` : `Saved query "${queryName}".`);
  }

  function runSavedQuery(name) {
    const queryName = safeText(name).trim();
    if (!queryName) {
      setStatus("Select a saved query to run.");
      return;
    }

    const entry = state.savedQueries.find((saved) => saved.name === queryName);
    if (!entry) {
      setStatus(`Saved query "${queryName}" was not found.`);
      renderSavedQueries();
      return;
    }

    applyServerQueryToControls(entry.query);
    state.timelineFilter = null;
    setActiveView("stream");
    void fetchLogs().catch((error) => {
      setStatus(String(error));
    });
  }

  function deleteSavedQuery(name) {
    const queryName = safeText(name).trim();
    if (!queryName) {
      setStatus("Select a saved query to delete.");
      return;
    }

    const index = state.savedQueries.findIndex((entry) => entry.name === queryName);
    if (index === -1) {
      setStatus(`Saved query "${queryName}" was not found.`);
      renderSavedQueries();
      return;
    }

    state.savedQueries.splice(index, 1);
    persistSavedQueries();
    renderSavedQueries();
    if (elements.savedQueryName && safeText(elements.savedQueryName.value).trim() === queryName) {
      elements.savedQueryName.value = "";
    }
    updateSaveQueryButtonState();
    setStatus(`Deleted saved query "${queryName}".`);
  }

  function showTimelineTooltip(cell, event) {
    if (!elements.timelineTooltip) return;
    const count = Number.parseInt(cell.dataset.count || "", 10);
    if (!Number.isFinite(count)) return;
    const fromMs = Number.parseInt(cell.dataset.fromMs || "", 10);
    const toMs = Number.parseInt(cell.dataset.toMs || "", 10);
    let label = safeText(cell.dataset.label).trim();
    if (!label && Number.isFinite(fromMs) && Number.isFinite(toMs) && toMs > fromMs) {
      label = buildTimelineBucketLabel(fromMs, toMs, Math.max(1, toMs - fromMs));
    }
    if (!label) return;

    elements.timelineTooltip.innerHTML = `
      <div class="timeline-tooltip-title">${escapeHtml(label)}</div>
      <div class="timeline-tooltip-meta">${count} logs</div>
    `;
    elements.timelineTooltip.hidden = false;

    const offset = 12;
    let left = event.clientX + offset;
    let top = event.clientY + offset;
    const rect = elements.timelineTooltip.getBoundingClientRect();
    if (left + rect.width + 8 > window.innerWidth) {
      left = Math.max(8, event.clientX - rect.width - offset);
    }
    if (top + rect.height + 8 > window.innerHeight) {
      top = Math.max(8, event.clientY - rect.height - offset);
    }
    elements.timelineTooltip.style.left = `${left}px`;
    elements.timelineTooltip.style.top = `${top}px`;
  }

  function hideTimelineTooltip() {
    if (!elements.timelineTooltip) return;
    elements.timelineTooltip.hidden = true;
  }

  async function copyText(value) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(value);
      return;
    }

    const probe = document.createElement("textarea");
    probe.value = value;
    probe.setAttribute("readonly", "true");
    probe.style.position = "fixed";
    probe.style.top = "-9999px";
    document.body.appendChild(probe);
    probe.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(probe);
    if (!copied) {
      throw new Error("Copy command failed");
    }
  }

  function flashCopyState(button, copied) {
    const original = button.dataset.originalLabel || button.textContent || "Copy JSON";
    button.dataset.originalLabel = original;
    button.classList.remove("is-copied", "is-copy-failed");
    button.classList.add(copied ? "is-copied" : "is-copy-failed");
    button.textContent = copied ? "Copied" : "Copy failed";

    window.setTimeout(() => {
      button.classList.remove("is-copied", "is-copy-failed");
      button.textContent = original;
    }, 1200);
  }

  function runEmptyStateAction(action) {
    if (!action) return;

    if (action === "run-errors-24h") {
      runPinnedPresetQuery("errors24h");
      return;
    }
    if (action === "clear-local-filter") {
      clearLocalFilter();
      setStatus("Cleared local filter.");
      return;
    }
    if (action === "clear-timeline-drilldown") {
      state.timelineFilter = null;
      applyLocalView({ commitScope: true, reason: "timeline drilldown cleared" });
      setStatus("Cleared timeline drilldown.");
      return;
    }
    if (action === "clear-range") {
      state.timelineFilter = null;
      clearRange();
      syncQueryToUrl();
      void fetchLogs().catch((error) => {
        setStatus(String(error));
      });
      return;
    }
    if (action === "clear-server-filters") {
      state.timelineFilter = null;
      elements.queryLevel.value = "";
      elements.queryAudit.value = "";
      setServerFilter("", "");
      syncQueryToUrl();
      void fetchLogs().catch((error) => {
        setStatus(String(error));
      });
      return;
    }
    if (action === "clear-trace-scope") {
      clearTraceNavigation();
      return;
    }
    if (action === "reset-baseline") {
      resetToBaselineQuery();
    }
  }

  function handleTableClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const emptyActionButton = target.closest("button[data-empty-action]");
    if (emptyActionButton instanceof HTMLButtonElement) {
      runEmptyStateAction(safeText(emptyActionButton.dataset.emptyAction).trim());
      return;
    }

    const detailTab = target.closest("button[data-detail-view]");
    if (detailTab) {
      const detailId = detailTab.getAttribute("data-detail-id");
      const nextView = detailTab.getAttribute("data-detail-view");
      const detailRoot = detailTab.closest(".log-detail");
      if (!detailId || !nextView || !detailRoot) return;

      detailRoot
        .querySelectorAll(`.log-detail-tab[data-detail-id="${detailId}"]`)
        .forEach((node) => {
          node.classList.remove("is-active");
        });
      detailRoot
        .querySelectorAll(`.log-detail-panel[data-detail-id="${detailId}"]`)
        .forEach((node) => {
          node.classList.remove("is-active");
        });

      detailTab.classList.add("is-active");
      const panel = detailRoot.querySelector(
        `.log-detail-panel[data-detail-id="${detailId}"][data-detail-content="${nextView}"]`,
      );
      if (panel) panel.classList.add("is-active");
      return;
    }

    const copyButton = target.closest("button[data-copy-json-id]");
    if (copyButton) {
      const detailId = copyButton.getAttribute("data-copy-json-id");
      const detailEntry = detailId ? state.detailEntriesById.get(detailId) : undefined;
      if (!detailEntry) return;
      void copyText(JSON.stringify(detailEntry.data, null, 2))
        .then(() => {
          flashCopyState(copyButton, true);
        })
        .catch(() => {
          flashCopyState(copyButton, false);
        });
      return;
    }

    const copyChainButton = target.closest("button[data-copy-chain-id]");
    if (copyChainButton) {
      const detailId = copyChainButton.getAttribute("data-copy-chain-id");
      const detailEntry = detailId ? state.detailEntriesById.get(detailId) : undefined;
      if (!detailEntry) return;
      const correlation = correlationInfo(detailEntry);
      if (!correlation.field || !correlation.value) {
        flashCopyState(copyChainButton, false);
        setStatus("Selected log does not contain a correlation or request ID.");
        return;
      }
      const chainPayload = buildCorrelationChainPayload(correlation.field, correlation.value);
      void copyText(JSON.stringify(chainPayload, null, 2))
        .then(() => {
          flashCopyState(copyChainButton, true);
          setStatus(
            `Copied chain JSON for ${correlation.value} (${chainPayload.correlation.count} logs).`,
          );
        })
        .catch(() => {
          flashCopyState(copyChainButton, false);
          setStatus("Could not copy correlation chain JSON.");
        });
      return;
    }

    const toggleId = target.getAttribute("data-toggle-id");
    if (toggleId) {
      if (state.expanded.has(toggleId)) {
        state.expanded.delete(toggleId);
      } else {
        state.expanded.add(toggleId);
      }
      renderLogs();
      return;
    }

    const correlationField = target.getAttribute("data-correlation-field");
    const correlationValue = target.getAttribute("data-correlation-value");
    if (correlationField && correlationValue) {
      drilldownCorrelation(correlationField, correlationValue);
    }
  }

  function attachEvents() {
    elements.remoteQueryForm.addEventListener("submit", (event) => {
      event.preventDefault();
      state.timelineFilter = null;
      void fetchLogs().catch((error) => {
        setStatus(String(error));
      });
    });

    elements.localFilterForm.addEventListener("input", () => {
      applyLocalView();
    });
    elements.localFilterForm.addEventListener("submit", (event) => {
      event.preventDefault();
    });

    elements.clearLocalButton.addEventListener("click", () => {
      clearLocalFilter();
    });

    elements.refreshButton.addEventListener("click", () => {
      runQueryNow();
    });

    elements.resetBaselineButton?.addEventListener("click", () => {
      resetToBaselineQuery();
    });

    elements.webhookRefreshButton?.addEventListener("click", () => {
      void refreshWebhookHealth({ notify: true });
    });

    elements.webhookCrudRefreshButton?.addEventListener("click", () => {
      void refreshWebhookCrudCapabilities({ notify: true });
    });

    elements.webhookCrudForm?.addEventListener("submit", (event) => {
      event.preventDefault();
    });

    elements.webhookCrudClearButton?.addEventListener("click", () => {
      clearWebhookCrudSelection();
      renderWebhookCrudManager();
      setStatus("Reset alert webhook form.");
    });

    elements.webhookCrudCreateButton?.addEventListener("click", () => {
      void submitWebhookCrudCreate()
        .then(() => {
          setStatus("Saved alert webhook policy.");
        })
        .catch((error) => {
          setStatus(String(error));
        });
    });

    elements.webhookCrudUpdateButton?.addEventListener("click", () => {
      void submitWebhookCrudUpdate()
        .then((response) => {
          const targetUrl = safeText(response?.targetUrl).trim();
          setStatus(
            targetUrl ? `Sent webhook test event to ${targetUrl}.` : "Sent webhook test event.",
          );
        })
        .catch((error) => {
          setStatus(String(error));
        });
    });

    elements.webhookCrudDeleteButton?.addEventListener("click", () => {
      void submitWebhookCrudDelete()
        .then(() => {
          setStatus("Cleared alert webhook URL.");
        })
        .catch((error) => {
          setStatus(String(error));
        });
    });

    elements.saveQueryButton?.addEventListener("click", () => {
      saveCurrentQuery();
    });

    elements.copyViewUrlButton?.addEventListener("click", () => {
      copyCurrentViewPath(elements.copyViewUrlButton);
    });

    elements.savedQueryName?.addEventListener("input", () => {
      updateSaveQueryButtonState();
    });

    elements.savedQueryName?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      saveCurrentQuery();
    });

    elements.savedQuerySelect?.addEventListener("change", () => {
      const selectedName = safeText(elements.savedQuerySelect?.value).trim();
      if (elements.savedQueryName) {
        elements.savedQueryName.value = selectedName;
      }
      updateSaveQueryButtonState();
      if (!selectedName) return;
      runSavedQuery(selectedName);
    });

    elements.deleteSavedQueryButton?.addEventListener("click", () => {
      deleteSavedQuery(safeText(elements.savedQuerySelect?.value).trim());
    });

    elements.recentScopeSelect?.addEventListener("change", () => {
      updateRecentScopeRestoreButtonState();
    });

    elements.applyRecentScopeButton?.addEventListener("click", () => {
      applySelectedRecentScope();
    });

    elements.scopeBackButton?.addEventListener("click", () => {
      restorePreviousScope();
    });

    elements.rangeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const hours = Number.parseInt(button.dataset.rangeHours || "", 10);
        if (!Number.isFinite(hours) || hours <= 0) return;
        onPrimaryServerFilterChanged("range change");
        setRangeHours(hours);
        void fetchLogs().catch((error) => {
          setStatus(String(error));
        });
      });
    });

    elements.rangeAllButtons.forEach((button) => {
      button.addEventListener("click", () => {
        onPrimaryServerFilterChanged("range change");
        clearRange();
        void fetchLogs().catch((error) => {
          setStatus(String(error));
        });
      });
    });

    elements.presetButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const preset = button.dataset.preset;
        if (!preset) return;
        runPinnedPresetQuery(preset);
      });
    });

    elements.queryLevel.addEventListener("change", () => {
      onPrimaryServerFilterChanged("level changed");
      syncQueryToUrl();
    });
    elements.queryAudit.addEventListener("change", () => {
      onPrimaryServerFilterChanged("audit changed");
      syncQueryToUrl();
    });
    elements.queryFrom.addEventListener("input", () => {
      syncTimeControlFromDateTime(elements.queryFrom, elements.queryFromTime);
      syncQueryToUrl();
    });
    elements.queryTo.addEventListener("input", () => {
      syncTimeControlFromDateTime(elements.queryTo, elements.queryToTime);
      syncQueryToUrl();
    });
    elements.queryFromTime?.addEventListener("input", () => {
      syncDateTimeControlFromTime(elements.queryFrom, elements.queryFromTime);
      syncQueryToUrl();
    });
    elements.queryToTime?.addEventListener("input", () => {
      syncDateTimeControlFromTime(elements.queryTo, elements.queryToTime);
      syncQueryToUrl();
    });
    elements.queryFrom.addEventListener("change", () => {
      syncTimeControlFromDateTime(elements.queryFrom, elements.queryFromTime);
      onPrimaryServerFilterChanged("from/to changed");
      syncQueryToUrl();
    });
    elements.queryTo.addEventListener("change", () => {
      syncTimeControlFromDateTime(elements.queryTo, elements.queryToTime);
      onPrimaryServerFilterChanged("from/to changed");
      syncQueryToUrl();
    });
    elements.queryFromTime?.addEventListener("change", () => {
      syncDateTimeControlFromTime(elements.queryFrom, elements.queryFromTime);
      onPrimaryServerFilterChanged("from/to changed");
      syncQueryToUrl();
    });
    elements.queryToTime?.addEventListener("change", () => {
      syncDateTimeControlFromTime(elements.queryTo, elements.queryToTime);
      onPrimaryServerFilterChanged("from/to changed");
      syncQueryToUrl();
    });
    elements.queryLimit.addEventListener("change", () => {
      const normalized = normalizeLimitValue(elements.queryLimit.value);
      elements.queryLimit.value = normalized || String(DEFAULT_QUERY_LIMIT);
      renderQueryChips();
      syncQueryToUrl();
    });
    elements.traceClearButton.addEventListener("click", () => clearTraceNavigation());
    elements.traceGoButton.addEventListener("click", () => applyTraceNavigation());
    elements.traceValue.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        applyTraceNavigation();
      }
    });

    elements.timelineBucketSize?.addEventListener("change", () => {
      const selected = safeText(elements.timelineBucketSize.value).trim();
      if (selected === "auto") {
        state.timelineBucketMsOverride = null;
        state.timelineFilter = null;
        applyLocalView({ commitScope: true, reason: "timeline bucket" });
        setStatus("Timeline bucket size set to auto-fit.");
        return;
      }
      const parsed = Number.parseInt(selected, 10);
      if (!Number.isFinite(parsed) || parsed < 1) {
        state.timelineBucketMsOverride = null;
        elements.timelineBucketSize.value = "auto";
        state.timelineFilter = null;
        applyLocalView({ commitScope: true, reason: "timeline bucket" });
        setStatus("Timeline bucket size set to auto-fit.");
        return;
      }
      state.timelineBucketMsOverride = parsed;
      state.timelineFilter = null;
      applyLocalView({ commitScope: true, reason: "timeline bucket" });
      setStatus(`Timeline bucket size set to ${formatBucketSize(parsed)}.`);
    });

    elements.viewTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const target = tab.dataset.viewTarget;
        if (target) setActiveView(target);
      });
    });

    elements.logsTbody.addEventListener("click", handleTableClick);
    elements.logsModalTbody.addEventListener("click", handleTableClick);

    elements.errorCorrelations.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const source = target.closest("[data-correlation-field][data-correlation-value]");
      if (!(source instanceof HTMLElement)) return;
      const correlationField = source.getAttribute("data-correlation-field");
      const correlationValue = source.getAttribute("data-correlation-value");
      if (correlationField && correlationValue) {
        drilldownCorrelation(correlationField, correlationValue);
      }
    });

    elements.correlationGroups.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const copySource = target.closest("[data-copy-correlation-id]");
      if (copySource instanceof HTMLButtonElement) {
        const correlationId = safeText(copySource.dataset.copyCorrelationId).trim();
        if (!correlationId) return;
        void copyText(correlationId)
          .then(() => {
            flashCopyState(copySource, true);
            setStatus(`Copied correlation ID ${correlationId}.`);
          })
          .catch(() => {
            flashCopyState(copySource, false);
            setStatus("Could not copy correlation ID.");
          });
        return;
      }
      const source = target.closest("[data-correlation-field][data-correlation-value]");
      if (!(source instanceof HTMLElement)) return;
      const correlationField = source.getAttribute("data-correlation-field");
      const correlationValue = source.getAttribute("data-correlation-value");
      if (correlationField && correlationValue) {
        drilldownCorrelation(correlationField, correlationValue);
      }
    });

    elements.traceList.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const source = target.closest("[data-correlation-field][data-correlation-value]");
      if (!(source instanceof HTMLElement)) return;
      const correlationField = source.getAttribute("data-correlation-field");
      const correlationValue = source.getAttribute("data-correlation-value");
      if (correlationField && correlationValue) {
        drilldownCorrelation(correlationField, correlationValue);
      }
    });

    elements.activeQueryChips.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const action = target.getAttribute("data-chip-action");
      if (!action) return;

      let requiresServerFetch = true;
      if (action === "clear-from") elements.queryFrom.value = "";
      if (action === "clear-to") elements.queryTo.value = "";
      if (action === "clear-from" && elements.queryFromTime) elements.queryFromTime.value = "";
      if (action === "clear-to" && elements.queryToTime) elements.queryToTime.value = "";
      if (action === "clear-level") elements.queryLevel.value = "";
      if (action === "clear-audit") elements.queryAudit.value = "";
      if (action === "clear-field-value") {
        setServerFilter("", "");
      }
      if (action === "clear-timeline") {
        state.timelineFilter = null;
        requiresServerFetch = false;
      }

      if (requiresServerFetch) {
        state.timelineFilter = null;
        void fetchLogs().catch((error) => {
          setStatus(String(error));
        });
      } else {
        applyLocalView({ commitScope: true, reason: "timeline drilldown cleared" });
      }
    });

    elements.timeline.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      const index = getTimelineBarIndexFromEvent(event);
      if (index === null) return;
      state.timelineSelectionEndIndex = index;
      state.timelineSelectionPointerId = event.pointerId;
      state.timelineSelectionStartIndex = index;
      state.timelineSelectionSuppressClick = false;
      hideTimelineTooltip();
      renderTimelineSelectionPreview(index, index);
      if (typeof elements.timeline.setPointerCapture === "function") {
        elements.timeline.setPointerCapture(event.pointerId);
      }
      event.preventDefault();
    });

    elements.timeline.addEventListener("pointerup", (event) => {
      if (
        state.timelineSelectionStartIndex === null ||
        state.timelineSelectionPointerId !== event.pointerId
      ) {
        return;
      }
      const startIndex = state.timelineSelectionStartIndex;
      const endIndex =
        getTimelineBarIndexFromEvent(event) ?? state.timelineSelectionEndIndex ?? startIndex;
      const selectedSingleBucket = startIndex === endIndex;
      const selectedBar =
        getTimelineBarFromEvent(event) ||
        elements.timeline.querySelector(`.timeline-bar[data-index="${startIndex}"]`);
      clearTimelineSelectionPreview();
      if (typeof elements.timeline.releasePointerCapture === "function") {
        elements.timeline.releasePointerCapture(event.pointerId);
      }
      state.timelineSelectionSuppressClick = true;
      if (selectedSingleBucket) {
        if (selectedBar instanceof HTMLElement) applyTimelineBarFilter(selectedBar);
      } else {
        applyTimelineRangeFilter(startIndex, endIndex);
      }
      event.preventDefault();
    });

    elements.timeline.addEventListener("pointercancel", () => {
      clearTimelineSelectionPreview();
    });

    elements.timeline.addEventListener("click", (event) => {
      if (state.timelineSelectionSuppressClick) {
        state.timelineSelectionSuppressClick = false;
        return;
      }
      const bar = getTimelineBarFromEvent(event);
      if (bar) applyTimelineBarFilter(bar);
    });

    elements.timeline.addEventListener("pointerover", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.classList.contains("timeline-bar")) return;
      showTimelineTooltip(target, event);
    });

    elements.timeline.addEventListener("pointermove", (event) => {
      if (
        state.timelineSelectionStartIndex !== null &&
        state.timelineSelectionPointerId === event.pointerId
      ) {
        const index = getTimelineBarIndexFromEvent(event);
        if (index !== null) {
          state.timelineSelectionEndIndex = index;
          renderTimelineSelectionPreview(state.timelineSelectionStartIndex, index);
        }
        return;
      }
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.classList.contains("timeline-bar")) {
        hideTimelineTooltip();
        return;
      }
      showTimelineTooltip(target, event);
    });

    elements.timeline.addEventListener("pointerleave", () => {
      hideTimelineTooltip();
    });

    elements.scopeTrail?.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const source = target.closest("[data-scope-history-index]");
      if (!(source instanceof HTMLElement)) return;
      restoreScopeByHistoryIndex(source.dataset.scopeHistoryIndex);
    });

    elements.themeToggle.addEventListener("click", () => {
      toggleThemeNow();
    });

    themeMediaQuery.addEventListener("change", (event) => {
      const hasManualTheme = Boolean(readStorageItem(STORAGE_KEY_THEME));
      if (hasManualTheme) return;
      applyTheme(event.matches ? "dark" : "light");
    });

    window.addEventListener("resize", () => {
      if (state.activeView !== "timeline") return;
      renderTimeline();
    });

    if (typeof window.ResizeObserver === "function") {
      const timelineResizeObserver = new window.ResizeObserver(() => {
        if (state.activeView !== "timeline") return;
        renderTimeline();
      });
      timelineResizeObserver.observe(elements.timeline);
    }

    window.addEventListener("keydown", handleGlobalShortcuts);

    elements.commandPaletteButton?.addEventListener("click", () => {
      toggleCommandPalette();
    });

    elements.webhookConfigButton?.addEventListener("click", () => {
      toggleWebhookConfigModal();
    });

    elements.commandPaletteInput?.addEventListener("input", () => {
      state.commandPaletteQuery = elements.commandPaletteInput?.value || "";
      state.commandPaletteActiveIndex = 0;
      renderCommandPalette();
    });

    elements.commandPaletteInput?.addEventListener("search", () => {
      state.commandPaletteQuery = elements.commandPaletteInput?.value || "";
      state.commandPaletteActiveIndex = 0;
      renderCommandPalette();
    });

    elements.commandPaletteInput?.addEventListener("keydown", (event) => {
      const actions = getFilteredCommandPaletteActions();
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (actions.length === 0) return;
        state.commandPaletteActiveIndex = Math.min(
          actions.length - 1,
          state.commandPaletteActiveIndex + 1,
        );
        renderCommandPalette();
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (actions.length === 0) return;
        state.commandPaletteActiveIndex = Math.max(0, state.commandPaletteActiveIndex - 1);
        renderCommandPalette();
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        runCommandPaletteSelection(state.commandPaletteActiveIndex);
      }
    });

    elements.commandPaletteList?.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const source = target.closest("[data-command-index]");
      if (!(source instanceof HTMLElement)) return;
      const index = Number.parseInt(source.dataset.commandIndex || "", 10);
      if (!Number.isFinite(index)) return;
      runCommandPaletteSelection(index);
    });

    elements.commandPaletteModal?.addEventListener("cancel", () => {
      elements.commandPaletteModal?.close();
    });

    elements.shortcutsHelpButton?.addEventListener("click", () => {
      toggleShortcutsModal();
    });

    elements.shortcutsModalClose?.addEventListener("click", () => {
      elements.shortcutsModal?.close();
    });

    elements.shortcutsModal?.addEventListener("cancel", () => {
      elements.shortcutsModal?.close();
    });

    elements.webhookConfigModalClose?.addEventListener("click", () => {
      elements.webhookConfigModal?.close();
    });

    elements.webhookConfigModal?.addEventListener("cancel", () => {
      elements.webhookConfigModal?.close();
    });

    elements.streamExpandButton.addEventListener("click", () => {
      toggleStreamModal();
    });

    elements.streamClearButton.addEventListener("click", () => {
      clearStreamScope();
    });

    elements.streamLoadMoreButton?.addEventListener("click", () => {
      void fetchMoreLogs().catch((error) => {
        setStatus(String(error));
      });
    });

    elements.streamModalClearButton.addEventListener("click", () => {
      clearStreamScope();
    });

    elements.streamModalClose.addEventListener("click", () => {
      if (elements.streamModal.open) {
        elements.streamModal.close();
      }
    });

    elements.streamModal.addEventListener("cancel", () => {
      elements.streamModal.close();
    });
  }

  async function init() {
    elements.queryLimit.setAttribute("max", String(MAX_QUERY_LIMIT));
    elements.queryLimit.value =
      normalizeLimitValue(elements.queryLimit.value) || String(DEFAULT_QUERY_LIMIT);
    applyTheme(resolveInitialTheme());
    loadSavedQueries();
    loadRecentScopes();
    updateSaveQueryButtonState();
    const hasUrlQuery = hydrateQueryFromUrl();
    if (!hasUrlQuery) {
      ensureDefaultRange();
    }
    syncDateTimeControlPairs();
    attachEvents();
    updateFieldControls();
    setActiveView("stream");
    renderQueryChips();
    renderScopeContinuity();
    renderWebhookHealth();
    renderWebhookCrudManager();
    const config = await loadClientConfig();
    state.apiOrigin = config.apiOrigin;
    state.apiToken = config.apiToken;
    setStatus(`Ready. API: ${state.apiOrigin}`);
    void refreshWebhookHealth();
    void refreshWebhookCrudCapabilities();
    void fetchLogs().catch((error) => {
      setStatus(String(error));
    });
  }

  void init();
})();
