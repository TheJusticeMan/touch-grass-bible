function createHiddenFileInput(accept: string): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = accept;
  input.style.display = "none";
  return input;
}

export async function pickBrowserFileText(accept: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = createHiddenFileInput(accept);

    input.onchange = async () => {
      const file = input.files?.[0] ?? null;
      input.remove();
      if (!file) {
        resolve(null);
        return;
      }

      try {
        resolve(await file.text());
      } catch (error) {
        reject(error);
      }
    };

    input.oncancel = () => {
      input.remove();
      resolve(null);
    };

    document.body.appendChild(input);
    input.click();
  });
}

export async function saveBrowserFile(
  filename: string,
  content: string,
  mimeType = "text/plain;charset=utf-8",
): Promise<void> {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
