import { ETarget } from "./Event";
import { BrowserConsole } from "./MyBrowserConsole";

export class SettingsClass<SettingsType extends { [key: string]: any }> extends ETarget<{
  settingsChange: SettingsType;
  [key: string]: any;
}> {
  private _settings: SettingsType = {} as SettingsType;
  console: BrowserConsole = new BrowserConsole(true, "Settings:");
  isemiting = false;

  private afterset(key: keyof SettingsType, value: SettingsType[keyof SettingsType]): void {
    this.console.log(`Property '${String(key)}' set to`, value);
  }

  public get settings(): { [K in keyof SettingsType]: SettingsType[K] } {
    const handler: ProxyHandler<SettingsType> = {
      get: (target, prop, receiver) => {
        return Reflect.get(target, prop, receiver);
      },
      set: (target, prop, value, receiver) => {
        const result = Reflect.set(target, prop, value, receiver);
        this.afterset(prop as keyof SettingsType, value);
        if (this.ActiveEvent !== "settingsChange") this.emit("settingsChange", this.settings);
        return result;
      },
    };
    return new Proxy(this._settings, handler);
  }

  public set settings(newSettings: Partial<SettingsType>) {
    for (const key in newSettings) {
      if (Object.prototype.hasOwnProperty.call(newSettings, key)) {
        (this._settings as any)[key] = newSettings[key];
        this.afterset(key as keyof SettingsType, newSettings[key]!);
      }
    }
    if (this.ActiveEvent !== "settingsChange") this.emit("settingsChange", this.settings);
  }
}
