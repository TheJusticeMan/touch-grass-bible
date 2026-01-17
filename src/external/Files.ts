/**
 * Represents an item in a file system, such as a file or folder.
 * Provides basic properties and methods for managing its name, parent folder, and path.
 *
 * @remarks
 * This is an abstract class and should be extended by concrete file or folder implementations.
 *
 * @property parent - The parent folder of this item, or null if it is a root item.
 * @property vault - The vault (container) managing this file system item.
 * @property name - The name of the item. Setting this property will trigger a rename operation in the vault.
 * @property path - The path of the item relative to its parent.
 * @property fullPath - The full path of the item from the root.
 *
 * @method setName - Abstract method to set the name of the item.
 * @method setParent - Abstract method to set the parent folder of the item.
 */
export abstract class FileSystemItem {
  constructor(public parent: Folder | null = null, public vault: Files) {}
  // File or folder of Files
  _name: string = "Untitled";
  public get name(): string {
    return this._name;
  }
  public set name(value: string) {
    this._name = value;
    this.vault.rename(this);
  }

  get path(): string {
    return this.parent?.fullPath || "";
  }
  get fullPath(): string {
    return this.parent ? `${this.parent.fullPath}/${this.name}` : this.name;
  }
  abstract setName(name: string): void;
  abstract setParent(parent: Folder): void;
}

/**
 * Represents a file within the file system, providing methods to read, write, rename, and reparent the file.
 *
 * @extends FileSystemItem
 *
 * @property {string | Promise<string>} data - Gets or sets the file's contents. Reading returns the file data as a string or a promise resolving to a string. Writing updates the file's contents.
 * @method setName - Renames the file and updates its name in the vault.
 * @method setParent - Sets the parent folder of the file.
 */
export class File extends FileSystemItem {
  public get data(): string | Promise<string> {
    return this.vault.readFile(this.fullPath);
  }
  public set data(value: string) {
    this.vault.writeFile(this.fullPath, value);
  }
  setName(name: string): void {
    this._name = name;
    this.vault.rename(this);
  }
  setParent(parent: Folder): void {
    this.parent = parent;
  }
}

/**
 * Represents a folder within a file system structure.
 * Extends {@link FileSystemItem} and contains child items, which can be files or other folders.
 *
 * @remarks
 * Provides methods to create new files, rename the folder, and set its parent folder.
 *
 * @property {FileSystemItem[]} children - The list of child items contained in the folder.
 *
 * @method newFile - Creates a new file within the folder.
 * @param name - The name of the new file.
 * @returns {File} The newly created file.
 *
 * @method setName - Renames the folder.
 * @param name - The new name for the folder.
 *
 * @method setParent - Sets the parent folder for this folder.
 * @param parent - The parent folder.
 */
export class Folder extends FileSystemItem {
  private _children: FileSystemItem[] = [];
  get children(): FileSystemItem[] {
    return this._children;
  }
  newFile(name: string): File {
    const file = new File(this, this.vault);
    file._name = name;
    this._children.push(file);
    this.vault.writeFile(file.fullPath, "");
    return file;
  }
  newFolder(name: string): Folder {
    const folder = new Folder(this, this.vault);
    folder._name = name;
    this._children.push(folder);
    this.vault.createFolder(folder.fullPath);
    return folder;
  }
  setName(name: string): void {
    this._name = name;
    this.vault.rename(this);
  }
  setParent(parent: Folder): void {
    this.vault.moveItem(this, parent);
    this.parent = parent;
  }
}

/**
 * Abstract class representing a file system interface.
 * Provides methods for reading, writing, and managing files and folders.
 *
 * @remarks
 * Implementations of this class should provide concrete logic for interacting with a file system.
 *
 * @property root - The root folder of the file system.
 *
 * @method readFile - Reads the contents of a file at the specified path.
 * @param path - The path to the file.
 * @returns A promise that resolves to the file contents as a string.
 *
 * @method writeFile - Writes data to a file at the specified path.
 * @param path - The path to the file.
 * @param data - The data to write to the file.
 * @returns A promise that resolves when the write is complete.
 *
 * @method fileExists - Checks if a file exists at the specified path.
 * @param path - The path to the file.
 * @returns A promise that resolves to true if the file exists, false otherwise.
 *
 * @method rename - Renames a file or folder.
 * @param path - The file system item to rename.
 * @returns A promise that resolves when the rename is complete.
 *
 * @method delete - Deletes a file or folder at the specified path.
 * @param path - The path to the file or folder.
 * @returns A promise that resolves when the deletion is complete.
 *
 * @method createFolder - Creates a new folder at the specified path.
 * @param path - The path where the folder should be created.
 * @returns A promise that resolves when the folder is created.
 */
export interface Files {
  root: Folder;
  readFile(path: string): Promise<string>;
  writeFile(path: string, data: string): Promise<void>;
  moveItem(item: FileSystemItem, newParent: Folder): Promise<void>;
  fileExists(path: string): Promise<boolean>;
  rename(path: FileSystemItem): Promise<void>;
  delete(path: string): Promise<void>;
  createFolder(path: string): Promise<void>;
}

/**
 * Provides a file system abstraction backed by browser `localStorage`.
 *
 * This class extends `Files` and manages files and folders using a hierarchical structure,
 * with metadata stored in localStorage under the key `:FILE_LIST:`. Each file's content is
 * stored in localStorage with its path as the key.
 *
 * - Files and folders are reconstructed from the `:FILE_LIST:` entry on initialization.
 * - Supports reading, writing, checking existence, and deleting files.
 * - Folder creation is a no-op, as folders are virtual and only tracked in memory.
 * - Renaming files is supported; renaming folders is not supported and will reject the operation.
 *
 * @remarks
 * - All operations are asynchronous and return Promises.
 * - This implementation is suitable for small-scale storage and testing purposes.
 * - Folder renaming is not supported due to localStorage limitations.
 */
export class FilesFromLocalStorage implements Files {
  root: Folder = new Folder(null, this);
  constructor() {
    const listoffiles = Array.from(new Set(localStorage.getItem(":FILE_LIST:")?.split("\n") || []));
    listoffiles.forEach(file => {
      const parts = file.split("/");
      let currentFolder: Folder = this.root;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        let existing = currentFolder.children.find(child => child.name === part);
        if (!existing) {
          if (i === parts.length - 1) {
            // it's a file
            existing = currentFolder.newFile(part);
          } else {
            // it's a folder
            const newFolder = new Folder(currentFolder, this);
            newFolder._name = part;
            currentFolder.children.push(newFolder);
            existing = newFolder;
          }
        }
        if (existing instanceof Folder) {
          currentFolder = existing;
        }
      }
    });
  }

  async moveItem(item: FileSystemItem, newParent: Folder): Promise<void> {
    // Remove item from old parent's children
    if (item.parent) {
      const idx = item.parent.children.indexOf(item);
      if (idx !== -1) item.parent.children.splice(idx, 1);
    }
    // Add to new parent's children
    newParent.children.push(item);
    item.parent = newParent;

    // For files, update localStorage key and :FILE_LIST:
    if (item instanceof File) {
      const oldPath = item.fullPath;
      item.parent = newParent;
      const newPath = item.fullPath;
      const data = localStorage.getItem(oldPath);
      if (data !== null) {
        localStorage.removeItem(oldPath);
        localStorage.setItem(newPath, data);
      }
      let listoffiles = Array.from(new Set(localStorage.getItem(":FILE_LIST:")?.split("\n") || []));
      listoffiles = listoffiles.map(f => (f === oldPath ? newPath : f));
      localStorage.setItem(":FILE_LIST:", listoffiles.join("\n"));
    }
    // For folders, moving is only tracked in memory (no localStorage update needed)
    return Promise.resolve();
  }

  readFile(path: string): Promise<string> {
    return Promise.resolve(localStorage.getItem(path) || "");
  }
  writeFile(path: string, data: string): Promise<void> {
    return Promise.resolve(localStorage.setItem(path, data));
  }
  fileExists(path: string): Promise<boolean> {
    return Promise.resolve(localStorage.getItem(path) !== null);
  }
  rename(path: FileSystemItem): Promise<void> {
    if (path instanceof File) {
      const data = localStorage.getItem(path.fullPath);
      if (data !== null) {
        localStorage.removeItem(path.fullPath);
        localStorage.setItem(path.fullPath, data);
      }
      return Promise.resolve();
    } else {
      const listoffiles = Array.from(new Set(localStorage.getItem(":FILE_LIST:")?.split("\n") || []));
      listoffiles.forEach(file => {
        if (file.startsWith(path.fullPath)) {
          const data = localStorage.getItem(file);
          if (data !== null) {
            localStorage.removeItem(file);
            const newFileName = file.replace(path.fullPath, path.name);
            localStorage.setItem(newFileName, data);
            file = newFileName;
          }
        }
      });
      localStorage.setItem(":FILE_LIST:", listoffiles.join("\n"));
      return Promise.reject("Renaming folders is not supported in LocalStorage");
    }
  }
  delete(path: string): Promise<void> {
    localStorage.removeItem(path);
    return Promise.resolve();
  }
  createFolder(path: string): Promise<void> {
    path;
    return Promise.resolve();
  }
}

/**
 * Represents a virtual file vault that delegates file operations to an underlying adapter.
 *
 * The `Vault` class extends `Files` and provides methods for reading, writing, renaming,
 * deleting files, and creating folders. All operations are proxied to the provided adapter,
 * which must implement the same interface as `Files`.
 *
 * @example
 * ```typescript
 * const vault = new Vault(adapter);
 * await vault.writeFile('example.txt', 'Hello, world!');
 * ```
 *
 * @extends Files
 */
export class Vault implements Files {
  root: Folder = new Folder(null, this);
  constructor(private adapter: Files) {}
  async readFile(path: string): Promise<string> {
    return this.adapter.readFile(path);
  }

  async writeFile(path: string, data: string): Promise<void> {
    return this.adapter.writeFile(path, data);
  }

  async fileExists(path: string): Promise<boolean> {
    return this.adapter.fileExists(path);
  }

  async rename(path: FileSystemItem): Promise<void> {
    return this.adapter.rename(path);
  }

  async delete(path: string): Promise<void> {
    return this.adapter.delete(path);
  }

  async createFolder(path: string): Promise<void> {
    return this.adapter.createFolder(path);
  }

  moveItem(item: FileSystemItem, newParent: Folder): Promise<void> {
    return this.adapter.moveItem(item, newParent);
  }
}
