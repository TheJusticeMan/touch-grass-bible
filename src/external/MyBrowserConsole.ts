/**
 * A wrapper class for the browser's console object that allows enabling or disabling
 * logging and prefixes all log messages with a custom console name.
 *
 * @remarks
 * This class is useful for providing contextual logging in browser-based applications,
 * allowing logs to be toggled on or off and easily identified by a custom name.
 *
 * @example
 * ```typescript
 * const myConsole = new BrowserConsole(true, 'From app');
 * myConsole.log('Hello, world!');
 * // Output: From app Hello, world!
 * ```
 */
export class BrowserConsole {
  enabled: boolean;
  consoleName: string;

  /**
   * Creates an instance of the class with the specified console state and name.
   *
   * @param enable - Determines whether the console is enabled.
   * @param consoleName - The name to assign to the console instance.
   */
  constructor(enable: boolean, consoleName: string) {
    this.enabled = enable;
    this.consoleName = consoleName;
  }

  /**
   * Logs messages to the browser console if logging is enabled.
   * Prepends the console name to the log output.
   *
   * @param {...any[]} args - The items to log to the console.
   */
  log(...args: any[]): void {
    if (this.enabled) console.log(this.consoleName, ...args);
  }

  /**
   * Logs informational messages to the console if logging is enabled.
   * Prepends the console name to the output.
   *
   * @param {...any[]} args - The messages or objects to log.
   */
  info(...args: any[]): void {
    if (this.enabled) console.info(this.consoleName, ...args);
  }

  /**
   * Logs a warning message to the console with the specified console name prefix,
   * if logging is enabled. Accepts any number of arguments to be logged.
   *
   * @param args - The items to log as a warning message.
   */
  warn(...args: any[]): void {
    if (this.enabled) console.warn(this.consoleName, ...args);
  }

  /**
   * Logs error messages to the console with the specified console name prefix,
   * if logging is enabled. Accepts any number of arguments to be logged.
   *
   * @param args - The error messages or objects to log.
   */
  error(...args: any[]): void {
    if (this.enabled) console.error(this.consoleName, ...args);
  }

  header(...args: any[]): void {
    if (this.enabled) console.log("%c" + this.consoleName, ...args);
    //console.log("%cObsidian Developer Console", "color:#7f6df2; font-size:40px; font-weight:bold;");
  }
}
