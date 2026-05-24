import { beforeEach } from "vitest";

if (typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

if (typeof window.ResizeObserver !== "function") {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  window.ResizeObserver = ResizeObserverStub as typeof ResizeObserver;
}

if (typeof HTMLDialogElement !== "undefined") {
  if (typeof HTMLDialogElement.prototype.showModal !== "function") {
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.open = true;
    };
  }
  if (typeof HTMLDialogElement.prototype.close !== "function") {
    HTMLDialogElement.prototype.close = function close() {
      this.open = false;
    };
  }
}

let clipboardText = "";
Object.defineProperty(navigator, "clipboard", {
  configurable: true,
  value: {
    async writeText(text: string) {
      clipboardText = text;
    },
    async readText() {
      return clipboardText;
    },
  },
});

beforeEach(() => {
  clipboardText = "";
});
