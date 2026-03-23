/**
 * Build-time flag injected by esbuild's `define` option.
 * When `true`, the external plugin system is enabled.
 * When `false`, the secure build is produced with a stricter CSP.
 */
declare global {
  const __ENABLE_EXTERNAL_PLUGINS__: boolean;
  var __tg_external_modules__: Record<string, unknown> | undefined;
}

export {};
