import TouchGrassBibleApp, {
  CommandCategory,
  UnifiedCommandPalette,
} from "./main";

export default class Plugin {
  constructor(public app: TouchGrassBibleApp) {}
  addPalettes(
    ...categories: (new (
      app: TouchGrassBibleApp,
      palette: UnifiedCommandPalette<TouchGrassBibleApp, any>,
    ) => CommandCategory<any, TouchGrassBibleApp>)[]
  ) {
    this.app.commandPalette.addPalettes(...categories);
  }
  addSidebar() {}
}
