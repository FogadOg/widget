export async function convertBlobUrlToDataUrl(
  url: string
): Promise<string | null> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export function matchesAccept(file: File, accept: string | undefined): boolean {
  if (!accept || accept.trim() === "") {
    return true;
  }

  const patterns = accept
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return patterns.some((pattern) => {
    if (pattern.endsWith("/*")) {
      const prefix = pattern.slice(0, -1); // e.g: image/* -> image/
      return file.type.startsWith(prefix);
    }
    return file.type === pattern;
  });
}
