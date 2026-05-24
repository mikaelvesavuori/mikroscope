// @vitest-environment happy-dom
import "./setup.js";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { loadFixture, startConfigServer, startFixtureApiServer } from "./fixture-servers.js";
import {
  dispatchShortcut,
  mountAppShell,
  waitForCondition,
  waitForLoadedStatus,
} from "./harness.js";

type FixtureApiServer = Awaited<ReturnType<typeof startFixtureApiServer>>;

describe.sequential("MikroScope Console Integration", () => {
  let apiServer: FixtureApiServer;
  let configServer: { close: () => Promise<void>; origin: string };

  async function waitForApiQuiet(idleMs = 160, timeoutMs = 4000) {
    const startedAt = Date.now();
    let lastCount = apiServer.requests.length;
    let idleStartedAt = Date.now();
    while (Date.now() - startedAt <= timeoutMs) {
      await new Promise((resolveDelay) => {
        window.setTimeout(resolveDelay, 30);
      });
      const currentCount = apiServer.requests.length;
      if (currentCount !== lastCount) {
        lastCount = currentCount;
        idleStartedAt = Date.now();
        continue;
      }
      if (Date.now() - idleStartedAt >= idleMs) {
        return;
      }
    }
  }

  async function resetToBaseline() {
    const resetButton = document.getElementById("reset-baseline-button");
    expect(resetButton).toBeInstanceOf(HTMLButtonElement);
    (resetButton as HTMLButtonElement).click();
    await waitForLoadedStatus();
    await waitForApiQuiet();
  }

  function getStatusText() {
    const status = document.getElementById("status-line");
    return status instanceof HTMLElement ? status.textContent || "" : "";
  }

  function getLatestLogsRequest(withoutCursor = true) {
    const list = [...apiServer.requests].reverse();
    return list.find(
      (item) =>
        item.pathname === "/api/logs" && (withoutCursor ? !item.searchParams.has("cursor") : true),
    );
  }

  beforeAll(async () => {
    const fixture = await loadFixture();
    apiServer = await startFixtureApiServer(fixture);
    configServer = await startConfigServer(apiServer.origin);
    mountAppShell(configServer.origin);
    await import("../../app/app.js");
    await waitForLoadedStatus();
    await waitForApiQuiet();
  });

  afterAll(async () => {
    await new Promise((resolveDelay) => {
      window.setTimeout(resolveDelay, 300);
    });
    const happyDOM = (window as Window & { happyDOM?: { abort?: () => void } }).happyDOM;
    if (typeof happyDOM?.abort === "function") {
      happyDOM.abort();
    }
    await Promise.all([apiServer.close(), configServer.close()]);
  });

  test("boots with data and date/time controls", () => {
    const from = document.getElementById("query-from");
    const fromTime = document.getElementById("query-from-time");
    const to = document.getElementById("query-to");
    const toTime = document.getElementById("query-to-time");
    const metricLoaded = document.getElementById("metric-loaded");
    const rows = document.querySelectorAll("#logs-tbody tr.row-main");

    expect(from).toBeInstanceOf(HTMLInputElement);
    expect((from as HTMLInputElement).type).toBe("date");
    expect(fromTime).toBeInstanceOf(HTMLInputElement);
    expect((fromTime as HTMLInputElement).type).toBe("time");
    expect(to).toBeInstanceOf(HTMLInputElement);
    expect((to as HTMLInputElement).type).toBe("date");
    expect(toTime).toBeInstanceOf(HTMLInputElement);
    expect((toTime as HTMLInputElement).type).toBe("time");

    expect(metricLoaded).toBeInstanceOf(HTMLElement);
    expect(Number.parseInt((metricLoaded as HTMLElement).textContent || "0", 10)).toBeGreaterThan(
      0,
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(getStatusText()).toMatch(/Loaded \d+ log entries/);
  });

  test("loads alert webhook status from /health", async () => {
    await waitForCondition(
      () => (document.getElementById("webhook-alert-enabled")?.textContent || "").trim() !== "-",
      { timeoutMs: 10_000, message: "Expected alert webhook health to load." },
    );

    const alertEnabled = document.getElementById("webhook-alert-enabled") as HTMLElement;
    const webhookConfigured = document.getElementById("webhook-configured") as HTMLElement;
    const loopRunning = document.getElementById("webhook-loop-running") as HTMLElement;
    const timeoutRetry = document.getElementById("webhook-timeout-retry") as HTMLElement;
    const statusNote = document.getElementById("webhook-status-note") as HTMLElement;

    expect(alertEnabled.textContent).toBe("Enabled");
    expect(webhookConfigured.textContent).toBe("Configured");
    expect(loopRunning.textContent).toBe("Running");
    expect(timeoutRetry.textContent).toContain("ms");
    expect(statusNote.textContent?.length || 0).toBeGreaterThan(0);
    expect(apiServer.requests.some((item) => item.pathname === "/health")).toBe(true);
  });

  test("opens alert webhook config modal from topbar button", async () => {
    const openButton = document.getElementById("webhook-config-button") as HTMLButtonElement;
    const closeButton = document.getElementById("webhook-config-modal-close") as HTMLButtonElement;
    const modal = document.getElementById("webhook-config-modal") as HTMLDialogElement;

    expect(modal.open).toBe(false);
    openButton.click();
    await waitForCondition(() => modal.open, {
      timeoutMs: 5000,
      message: "Expected alert webhook config modal to open.",
    });

    closeButton.click();
    await waitForCondition(() => !modal.open, {
      timeoutMs: 5000,
      message: "Expected alert webhook config modal to close.",
    });
  });

  test("shows alert config as unavailable when OpenAPI has no alert config paths", async () => {
    await waitForCondition(
      () => (document.getElementById("webhook-crud-note")?.textContent || "").length > 0,
      { timeoutMs: 10_000, message: "Expected alert config note to render." },
    );

    const note = document.getElementById("webhook-crud-note") as HTMLElement;
    const createButton = document.getElementById("webhook-crud-create-button") as HTMLButtonElement;
    const updateButton = document.getElementById("webhook-crud-update-button") as HTMLButtonElement;
    const deleteButton = document.getElementById("webhook-crud-delete-button") as HTMLButtonElement;

    expect(note.textContent?.toLowerCase() || "").toContain("not detected");
    expect(createButton.disabled).toBe(true);
    expect(updateButton.disabled).toBe(true);
    expect(deleteButton.disabled).toBe(true);
    expect(apiServer.requests.some((item) => item.pathname === "/openapi.json")).toBe(true);
  });

  test("discovers alert config endpoints and supports save/test/clear", async () => {
    apiServer.setWebhookCrudEnabled(true);
    const refreshEndpoints = document.getElementById(
      "webhook-crud-refresh-button",
    ) as HTMLButtonElement;
    const saveButton = document.getElementById("webhook-crud-create-button") as HTMLButtonElement;
    const testButton = document.getElementById("webhook-crud-update-button") as HTMLButtonElement;
    const clearUrlButton = document.getElementById(
      "webhook-crud-delete-button",
    ) as HTMLButtonElement;
    const urlInput = document.getElementById("webhook-crud-url") as HTMLInputElement;
    const enabledInput = document.getElementById("webhook-crud-enabled") as HTMLInputElement;
    const intervalInput = document.getElementById("webhook-crud-interval-ms") as HTMLInputElement;

    refreshEndpoints.click();
    await waitForCondition(
      () =>
        (document.getElementById("webhook-crud-note")?.textContent || "").includes(
          "/api/alerts/config",
        ),
      { timeoutMs: 10_000, message: "Expected alert config endpoints to be discovered." },
    );
    expect(saveButton.disabled).toBe(false);

    urlInput.value = "https://hooks.example.test/alerts/pagerduty-v2";
    urlInput.dispatchEvent(new Event("input", { bubbles: true }));
    enabledInput.checked = true;
    enabledInput.dispatchEvent(new Event("change", { bubbles: true }));
    intervalInput.value = "45000";
    intervalInput.dispatchEvent(new Event("input", { bubbles: true }));
    saveButton.click();

    await waitForCondition(() => getStatusText().includes("Saved alert webhook policy."), {
      timeoutMs: 10_000,
      message: "Expected save status.",
    });
    expect(urlInput.value).toContain("pagerduty-v2");
    expect(intervalInput.value).toBe("45000");

    testButton.click();
    await waitForCondition(() => getStatusText().includes("Sent webhook test event"), {
      timeoutMs: 10_000,
      message: "Expected test webhook status.",
    });

    clearUrlButton.click();
    await waitForCondition(() => getStatusText().includes("Cleared alert webhook URL."), {
      timeoutMs: 10_000,
      message: "Expected clear URL status.",
    });
    expect(urlInput.value).toBe("");
    expect(enabledInput.checked).toBe(false);

    expect(apiServer.requests.some((item) => item.pathname === "/api/alerts/config")).toBe(true);
    expect(apiServer.requests.some((item) => item.pathname === "/api/alerts/test-webhook")).toBe(
      true,
    );
  });

  test("serializes custom date/time into server query and URL", async () => {
    await resetToBaseline();

    const from = document.getElementById("query-from") as HTMLInputElement;
    const fromTime = document.getElementById("query-from-time") as HTMLInputElement;
    const to = document.getElementById("query-to") as HTMLInputElement;
    const toTime = document.getElementById("query-to-time") as HTMLInputElement;
    const runButton = document.getElementById("refresh-button") as HTMLButtonElement;

    from.value = "2026-02-17";
    from.dispatchEvent(new Event("change", { bubbles: true }));
    fromTime.value = "08:15:30";
    fromTime.dispatchEvent(new Event("change", { bubbles: true }));

    to.value = "2026-02-18";
    to.dispatchEvent(new Event("change", { bubbles: true }));
    toTime.value = "09:45:45";
    toTime.dispatchEvent(new Event("change", { bubbles: true }));

    runButton.click();
    await waitForLoadedStatus();
    await waitForApiQuiet();

    const logsRequest = getLatestLogsRequest(true);
    expect(logsRequest).toBeDefined();
    const fromParam = logsRequest?.searchParams.get("from") || "";
    const toParam = logsRequest?.searchParams.get("to") || "";
    expect(fromParam).toMatch(/T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
    expect(toParam).toMatch(/T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
    expect(new Date(fromParam).getUTCSeconds()).toBe(30);
    expect(new Date(toParam).getUTCSeconds()).toBe(45);

    expect(window.location.search).toContain("from=");
    expect(window.location.search).toContain("to=");
  });

  test("space toggles expanded stream modal open/close without clearing scope", async () => {
    await resetToBaseline();

    const firstCorrelation = document.querySelector("#logs-tbody .correlation-link");
    expect(firstCorrelation).toBeInstanceOf(HTMLButtonElement);
    (firstCorrelation as HTMLButtonElement).click();
    await waitForLoadedStatus();
    await waitForApiQuiet();

    const queryValue = document.getElementById("query-value") as HTMLInputElement;
    const scopedValue = queryValue.value;
    expect(scopedValue.length).toBeGreaterThan(0);

    dispatchShortcut(" ");
    const modal = document.getElementById("stream-modal") as HTMLDialogElement;
    await waitForCondition(() => modal.open, { message: "Expected stream modal to be open." });

    const clearButton = document.getElementById("stream-modal-clear-button") as HTMLButtonElement;
    clearButton.focus();
    dispatchShortcut(" ");
    await waitForCondition(() => !modal.open, { message: "Expected stream modal to close." });
    expect(queryValue.value).toBe(scopedValue);
  });

  test("copies current view path with U shortcut", async () => {
    dispatchShortcut("u");
    await waitForCondition(() => getStatusText().includes("Copied current view URL path."), {
      message: "Expected copy view URL status message.",
    });
    const copied = await navigator.clipboard.readText();
    expect(copied).toContain(window.location.pathname);
    expect(copied).toContain("field=");
    expect(copied).toContain("value=");
  });

  test("resets to baseline query with X shortcut", async () => {
    await resetToBaseline();

    const level = document.getElementById("query-level") as HTMLSelectElement;
    const audit = document.getElementById("query-audit") as HTMLSelectElement;
    const limit = document.getElementById("query-limit") as HTMLInputElement;
    const timelineTab = document.querySelector('.view-tab[data-view-target="timeline"]');
    const streamTab = document.querySelector('.view-tab[data-view-target="stream"]');

    level.value = "ERROR";
    level.dispatchEvent(new Event("change", { bubbles: true }));
    audit.value = "true";
    audit.dispatchEvent(new Event("change", { bubbles: true }));
    limit.value = "321";
    limit.dispatchEvent(new Event("change", { bubbles: true }));
    (timelineTab as HTMLButtonElement)?.click();

    dispatchShortcut("x");
    await waitForLoadedStatus();
    await waitForApiQuiet();

    expect(level.value).toBe("");
    expect(audit.value).toBe("");
    expect(limit.value).toBe("1000");
    expect((streamTab as HTMLButtonElement)?.classList.contains("is-active")).toBe(true);
  });

  test("timeline drilldown returns to stream and shows timeline scope chip", async () => {
    await resetToBaseline();

    const timelineTab = document.querySelector('.view-tab[data-view-target="timeline"]');
    expect(timelineTab).toBeInstanceOf(HTMLButtonElement);
    (timelineTab as HTMLButtonElement).click();

    await waitForCondition(
      () =>
        Boolean(
          document.querySelector(
            '#timeline .timeline-bar[data-count]:not([data-count="0"])',
          ) as HTMLButtonElement | null,
        ),
      { timeoutMs: 10_000, message: "Expected timeline bars to render." },
    );

    const drilldownTarget = document.querySelector(
      '#timeline .timeline-bar[data-count]:not([data-count="0"])',
    ) as HTMLButtonElement;
    drilldownTarget.click();

    await waitForCondition(
      () =>
        (
          document.querySelector('.view-tab[data-view-target="stream"]') as HTMLButtonElement
        ).classList.contains("is-active"),
      { message: "Expected stream tab to become active after drilldown." },
    );
    expect(
      (document.getElementById("active-query-chips")?.textContent || "").toLowerCase(),
    ).toContain("timeline:");
  });

  test("timeline drag selection filters a period range", async () => {
    await resetToBaseline();

    const timelineTab = document.querySelector('.view-tab[data-view-target="timeline"]');
    expect(timelineTab).toBeInstanceOf(HTMLButtonElement);
    (timelineTab as HTMLButtonElement).click();

    await waitForCondition(
      () =>
        document.querySelectorAll('#timeline .timeline-bar[data-count]:not([data-count="0"])')
          .length >= 2,
      { timeoutMs: 10_000, message: "Expected enough populated timeline bars to render." },
    );

    const populatedBars = Array.from(
      document.querySelectorAll('#timeline .timeline-bar[data-count]:not([data-count="0"])'),
    ) as HTMLButtonElement[];
    const startBar = populatedBars[0];
    const endBar = populatedBars[populatedBars.length - 1];

    startBar.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
    endBar.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, button: 0 }));
    endBar.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, button: 0 }));

    await waitForCondition(
      () =>
        (
          document.querySelector('.view-tab[data-view-target="stream"]') as HTMLButtonElement
        ).classList.contains("is-active"),
      { message: "Expected stream tab to become active after range selection." },
    );
    expect(getStatusText()).toContain("Selected");
    expect(
      (document.getElementById("active-query-chips")?.textContent || "").toLowerCase(),
    ).toContain("timeline:");
  });

  test("load-more appends results using cursor without mocks", async () => {
    await resetToBaseline();

    const limit = document.getElementById("query-limit") as HTMLInputElement;
    limit.value = "200";
    limit.dispatchEvent(new Event("change", { bubbles: true }));

    const runButton = document.getElementById("refresh-button") as HTMLButtonElement;
    runButton.click();
    await waitForLoadedStatus();
    await waitForApiQuiet();

    const loadMoreButton = document.getElementById("stream-load-more-button") as HTMLButtonElement;
    await waitForCondition(() => !loadMoreButton.hidden, {
      message: "Expected load more button to be visible.",
    });

    const metricLoaded = document.getElementById("metric-loaded") as HTMLElement;
    const before = Number.parseInt(metricLoaded.textContent || "0", 10);
    loadMoreButton.click();
    await waitForLoadedStatus();
    await waitForApiQuiet();

    const after = Number.parseInt(metricLoaded.textContent || "0", 10);
    expect(after).toBeGreaterThan(before);
    expect(
      apiServer.requests.some(
        (item) => item.pathname === "/api/logs" && item.searchParams.has("cursor"),
      ),
    ).toBe(true);
  });

  test("stream clear scope clears level filters that hide other severities", async () => {
    await resetToBaseline();

    const level = document.getElementById("query-level") as HTMLSelectElement;
    const clearButton = document.getElementById("stream-clear-button") as HTMLButtonElement;
    const runButton = document.getElementById("refresh-button") as HTMLButtonElement;

    level.value = "INFO";
    level.dispatchEvent(new Event("change", { bubbles: true }));
    runButton.click();
    await waitForLoadedStatus();
    await waitForApiQuiet();

    expect(clearButton.disabled).toBe(false);
    expect(
      Array.from(document.querySelectorAll("#logs-tbody .level-badge")).every(
        (node) => node.textContent === "INFO",
      ),
    ).toBe(true);

    clearButton.click();
    await waitForLoadedStatus();
    await waitForApiQuiet();

    expect(level.value).toBe("");
    expect(
      Array.from(document.querySelectorAll("#logs-tbody .level-badge")).some(
        (node) => node.textContent !== "INFO",
      ),
    ).toBe(true);
  });

  test("scope history/back + recent scope restore are available", async () => {
    await resetToBaseline();

    const errorsPreset = document.querySelector('[data-preset="errors24h"]');
    const auditPreset = document.querySelector('[data-preset="audit7d"]');
    expect(errorsPreset).toBeInstanceOf(HTMLButtonElement);
    expect(auditPreset).toBeInstanceOf(HTMLButtonElement);

    (errorsPreset as HTMLButtonElement).click();
    await waitForLoadedStatus();
    await waitForApiQuiet();
    (auditPreset as HTMLButtonElement).click();
    await waitForLoadedStatus();
    await waitForApiQuiet();

    const recentScopeSelect = document.getElementById("recent-scope-select") as HTMLSelectElement;
    const scopeBackButton = document.getElementById("scope-back-button") as HTMLButtonElement;

    expect(recentScopeSelect.options.length).toBeGreaterThan(1);
    expect(scopeBackButton.disabled).toBe(false);

    scopeBackButton.click();
    await waitForCondition(() => getStatusText().includes("Restored scope:"), {
      timeoutMs: 10_000,
      message: "Expected scope restoration status message.",
    });

    const queryLevel = document.getElementById("query-level") as HTMLSelectElement;
    const queryAudit = document.getElementById("query-audit") as HTMLSelectElement;
    expect(queryLevel.value).toBe("ERROR");
    expect(queryAudit.value).toBe("");
  });

  test("supports saved query lifecycle (save, run, delete)", async () => {
    await resetToBaseline();

    const queryLevel = document.getElementById("query-level") as HTMLSelectElement;
    queryLevel.value = "WARN";
    queryLevel.dispatchEvent(new Event("change", { bubbles: true }));

    const savedQueryName = document.getElementById("saved-query-name") as HTMLInputElement;
    const saveButton = document.getElementById("save-query-button") as HTMLButtonElement;
    const savedQuerySelect = document.getElementById("saved-query-select") as HTMLSelectElement;
    const deleteSavedQueryButton = document.getElementById(
      "delete-saved-query-button",
    ) as HTMLButtonElement;

    savedQueryName.value = "warn-check";
    savedQueryName.dispatchEvent(new Event("input", { bubbles: true }));
    saveButton.click();
    expect(getStatusText()).toContain('Saved query "warn-check".');
    expect([...savedQuerySelect.options].some((option) => option.value === "warn-check")).toBe(
      true,
    );

    queryLevel.value = "ERROR";
    queryLevel.dispatchEvent(new Event("change", { bubbles: true }));
    savedQuerySelect.value = "warn-check";
    savedQuerySelect.dispatchEvent(new Event("change", { bubbles: true }));
    await waitForLoadedStatus();
    await waitForApiQuiet();
    expect(queryLevel.value).toBe("WARN");

    deleteSavedQueryButton.click();
    expect(getStatusText()).toContain('Deleted saved query "warn-check".');
    expect([...savedQuerySelect.options].some((option) => option.value === "warn-check")).toBe(
      false,
    );
  });

  test("supports command palette action execution", async () => {
    await resetToBaseline();

    const commandOpen = new KeyboardEvent("keydown", {
      key: "k",
      ctrlKey: true,
      bubbles: true,
    });
    window.dispatchEvent(commandOpen);

    const commandModal = document.getElementById("command-palette-modal") as HTMLDialogElement;
    const commandInput = document.getElementById("command-palette-input") as HTMLInputElement;
    expect(commandModal.open).toBe(true);

    commandInput.value = "errors 24h";
    commandInput.dispatchEvent(new Event("input", { bubbles: true }));
    commandInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await waitForLoadedStatus();
    await waitForApiQuiet();

    const queryLevel = document.getElementById("query-level") as HTMLSelectElement;
    expect(queryLevel.value).toBe("ERROR");
  });

  test("copies correlation id and chain JSON payloads", async () => {
    await resetToBaseline();

    const correlationsTab = document.querySelector(
      '.view-tab[data-view-target="correlations"]',
    ) as HTMLButtonElement;
    correlationsTab.click();
    await waitForCondition(
      () => Boolean(document.querySelector("#correlation-groups [data-copy-correlation-id]")),
      { message: "Expected correlation copy button to exist." },
    );
    const copyCorrelation = document.querySelector(
      "#correlation-groups [data-copy-correlation-id]",
    ) as HTMLButtonElement;
    copyCorrelation.click();
    await waitForCondition(() => getStatusText().includes("Copied correlation ID"), {
      message: "Expected correlation copy status.",
    });
    const copiedCorrelation = await navigator.clipboard.readText();
    expect(copiedCorrelation.length).toBeGreaterThan(0);

    const streamTab = document.querySelector(
      '.view-tab[data-view-target="stream"]',
    ) as HTMLButtonElement;
    streamTab.click();
    const expand = document.querySelector("#logs-tbody .expand-button") as HTMLButtonElement;
    expand.click();
    const copyChain = document.querySelector(
      "#logs-tbody [data-copy-chain-id]",
    ) as HTMLButtonElement;
    copyChain.click();
    await waitForCondition(() => getStatusText().includes("Copied chain JSON"), {
      message: "Expected chain JSON copy status.",
    });
    const chainPayload = await navigator.clipboard.readText();
    expect(chainPayload).toContain('"correlation"');
    expect(chainPayload).toContain('"entries"');
  });

  test("shows rich empty state and recovers via action button", async () => {
    await resetToBaseline();

    const localField = document.getElementById("local-field") as HTMLInputElement;
    const localValue = document.getElementById("local-value") as HTMLInputElement;
    localField.value = "*";
    localValue.value = "value-that-does-not-exist-anywhere";
    localValue.dispatchEvent(new Event("input", { bubbles: true }));

    await waitForCondition(() => Boolean(document.querySelector("#logs-tbody .empty-state-rich")), {
      message: "Expected rich empty state to render.",
    });

    const clearLocalAction = document.querySelector(
      '#logs-tbody button[data-empty-action="clear-local-filter"]',
    ) as HTMLButtonElement;
    expect(clearLocalAction).toBeInstanceOf(HTMLButtonElement);
    clearLocalAction.click();
    await waitForCondition(() => document.querySelectorAll("#logs-tbody tr.row-main").length > 0, {
      message: "Expected rows to return after clear local filter action.",
    });
  });

  test("supports panel/help keyboard toggles", async () => {
    const queryDetails = document.querySelector(".query-details") as HTMLDetailsElement;
    const inspectDetails = document.querySelector(".inspect-panel") as HTMLDetailsElement;
    const insightsDetails = document.querySelector(".insights-details") as HTMLDetailsElement;
    const webhookConfigModal = document.getElementById("webhook-config-modal") as HTMLDialogElement;
    const shortcutsModal = document.getElementById("shortcuts-modal") as HTMLDialogElement;

    const initialQueryOpen = queryDetails.open;
    const initialInspectOpen = inspectDetails.open;
    const initialInsightsOpen = insightsDetails.open;

    dispatchShortcut("q");
    expect(queryDetails.open).toBe(!initialQueryOpen);
    dispatchShortcut("q");
    expect(queryDetails.open).toBe(initialQueryOpen);

    dispatchShortcut("i");
    expect(inspectDetails.open).toBe(!initialInspectOpen);
    dispatchShortcut("i");
    expect(inspectDetails.open).toBe(initialInspectOpen);

    dispatchShortcut("n");
    expect(insightsDetails.open).toBe(!initialInsightsOpen);
    dispatchShortcut("n");
    expect(insightsDetails.open).toBe(initialInsightsOpen);

    dispatchShortcut("w");
    expect(webhookConfigModal.open).toBe(true);
    dispatchShortcut("w");
    expect(webhookConfigModal.open).toBe(false);

    dispatchShortcut("?");
    expect(shortcutsModal.open).toBe(true);
    dispatchShortcut("?");
    expect(shortcutsModal.open).toBe(false);
  });
});
