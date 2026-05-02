// Polyfill String.prototype.toTitleCase used by VerseRef.toString()
export {};

declare global {
  interface String {
    toTitleCase(): string;
  }
}

String.prototype.toTitleCase = function (this: string): string {
  return this.toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
};

if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  });
}
