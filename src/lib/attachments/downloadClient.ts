function fileNameFromHeader(header: string | null, fallback: string) {
  if (!header) return fallback;
  const star = header.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (star?.[1]) {
    try { return decodeURIComponent(star[1]); } catch { /* keep looking */ }
  }
  const quoted = header.match(/filename\s*=\s*"([^"]+)"/i);
  if (quoted?.[1]) return quoted[1];
  const plain = header.match(/filename\s*=\s*([^;]+)/i);
  return plain?.[1]?.trim() || fallback;
}

/** Same-origin blob download so the browser saves instead of opening the PDF. */
export async function downloadLeadAttachment(id: string, fileName = 'download') {
  const res = await fetch(`/api/attachments/download?id=${encodeURIComponent(id)}&raw=1&download=1`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Download failed');
  const blob = await res.blob();
  const name = fileNameFromHeader(res.headers.get('content-disposition'), fileName);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
