export async function downloadPreviewDocument(title: string, content: string) {
  const blob = new Blob([`FTI CLIENT PREVIEW — SAMPLE, NOT A VALID COMMERCIAL DOCUMENT\n\n${title}\n\n${content}`], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `fti-sample-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.txt`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
