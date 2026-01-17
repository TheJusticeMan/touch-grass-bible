import { Directory, Filesystem } from "@capacitor/filesystem";
import { Files, FileSystemItem, Folder } from "./Files";

export class CapacitorFilesAdapter implements Files {
  root: Folder = new Folder(null, this);
  readFile(path: string): Promise<string> {
    return Filesystem.readFile({ path, directory: Directory.Documents }).then(
      (result) => {
        if (typeof result.data === "string") {
          return result.data;
        } else if (result.data instanceof Blob) {
          return result.data.text();
        } else {
          throw new Error(
            "Unknown data type returned from Filesystem.readFile",
          );
        }
      },
    );
  }
  writeFile(path: string, data: string): Promise<void> {
    return Filesystem.writeFile({
      path,
      data,
      directory: Directory.Documents,
      recursive: true,
    }).then(() => {});
  }
  moveItem(item: FileSystemItem, newParent: Folder): Promise<void> {
    if (item instanceof Folder) {
      return Filesystem.rename({
        from: item.fullPath,
        to: `${newParent.fullPath}/${item.name}`,
        directory: Directory.Documents,
      }).then(() => {});
    } else {
      return Filesystem.rename({
        from: item.fullPath,
        to: `${newParent.fullPath}/${item.name}`,
        directory: Directory.Documents,
      }).then(() => {});
    }
  }
  fileExists(path: string): Promise<boolean> {
    return Filesystem.stat({ path, directory: Directory.Documents })
      .then(() => true)
      .catch(() => false);
  }
  rename(path: FileSystemItem): Promise<void> {
    return Filesystem.rename({
      from: path.fullPath,
      to: path.fullPath,
      directory: Directory.Documents,
    }).then(() => {});
  }
  delete(path: string): Promise<void> {
    this.fileExists(path);
    throw new Error("Method not implemented.");
  }
  createFolder(path: string): Promise<void> {
    this.fileExists(path);
    throw new Error("Method not implemented.");
  }
}
