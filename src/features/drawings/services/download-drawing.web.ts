export async function downloadDrawing(svg: string, filename: string) {
  const svgUrl = URL.createObjectURL(
    new Blob([svg], { type: 'image/svg+xml' }),
  );
  let pngUrl: string | undefined;
  try {
    const image = new globalThis.Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(new Error('Drawing image could not be prepared.'));
      image.src = svgUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = 1440;
    canvas.height = 896;
    const context = canvas.getContext('2d');
    if (!context)
      throw new Error('Image download is unavailable in this browser.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(new Error('Drawing image could not be saved.')),
        'image/png',
      );
    });
    pngUrl = URL.createObjectURL(png);
    const link = document.createElement('a');
    link.href = pngUrl;
    link.download = filename + '.png';
    document.body.appendChild(link);
    try {
      link.click();
    } finally {
      link.remove();
    }
  } finally {
    URL.revokeObjectURL(svgUrl);
    // Allow the browser to start reading the PNG before releasing its URL.
    if (pngUrl) {
      const url = pngUrl;
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
  }
}
