export function appendEmailSignature(htmlOrText: string, signature: string | null | undefined): string {
  const sig = (signature || '').trim();
  if (!sig) return htmlOrText;
  const sigHtml = sig.replace(/\n/g, '<br/>');
  return `${htmlOrText}<br/><br/>${sigHtml}`;
}
