export function jsonPrivate(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store", ...extra },
  });
}
export async function readJson(request: Request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") || ""))
    return { error: 415 } as const;
  const reader = request.body?.getReader();
  if (!reader) return { error: 400 } as const;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16 * 1024) {
        await reader.cancel();
        return { error: 413 } as const;
      }
      chunks.push(value);
    }
    return {
      value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))),
    };
  } catch {
    return { error: 400 } as const;
  } finally {
    reader.releaseLock();
  }
}
