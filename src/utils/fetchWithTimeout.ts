export async function fetchWithTimeout(
  url: string,
  timeoutMs = 4000,
): Promise<Response> {
  const controller = new AbortController();
  const id = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    window.clearTimeout(id);
  }
}
