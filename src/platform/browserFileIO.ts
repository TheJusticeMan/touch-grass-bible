export function pickBrowserFileText(accept: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;

    input.onchange = event => {
      const target = event.target as HTMLInputElement;
      const file = target.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }

      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => reject(reader.error ?? new Error("Failed to read selected file."));
      reader.readAsText(file);
    };

    input.click();
  });
}

export async function saveBrowserFile(
  filename: string,
  content: string,
  mimeType: string = "application/json;charset=utf-8",
): Promise<void> {
  const blob = new Blob([content], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);
  const downloadAnchorNode = document.createElement("a");
  downloadAnchorNode.setAttribute("href", objectUrl);
  downloadAnchorNode.setAttribute("download", filename);
  document.body.appendChild(downloadAnchorNode);
  downloadAnchorNode.click();
  downloadAnchorNode.remove();
  URL.revokeObjectURL(objectUrl);
}
