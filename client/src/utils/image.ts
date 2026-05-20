
const blobToDataUrl = (blob: Blob): Promise<string> => (
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read thumbnail blob'));
    reader.readAsDataURL(blob);
  })
);

const loadImageFromObjectUrl = (url: string): Promise<HTMLImageElement> => (
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image for thumbnail generation'));
    img.src = url;
  })
);

const renderThumbnail = (
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  fileType: string,
  maxWidth: number,
  maxHeight: number,
): Promise<string> => {
  const canvas = document.createElement('canvas');
  let width = sourceWidth;
  let height = sourceHeight;

  const aspectRatio = width / height;
  if (width > maxWidth || height > maxHeight) {
    if (width / maxWidth > height / maxHeight) {
      width = maxWidth;
      height = maxWidth / aspectRatio;
    } else {
      height = maxHeight;
      width = maxHeight * aspectRatio;
    }
  }

  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return Promise.reject(new Error('Could not get canvas context.'));
  }

  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

  const mimeType = fileType === 'image/png' ? 'image/png' : 'image/jpeg';
  const quality = mimeType === 'image/jpeg' ? 0.78 : undefined;

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to create thumbnail blob'));
        return;
      }
      blobToDataUrl(blob).then(resolve, reject);
    }, mimeType, quality);
  });
};

export const createImageThumbnail = async (
  file: File,
  maxWidth: number,
  maxHeight: number,
): Promise<string> => {
  if (!file.type.startsWith('image/')) {
    throw new Error('File is not an image.');
  }

  const createBitmap = (window as Window & {
    createImageBitmap?: Window['createImageBitmap'];
  }).createImageBitmap;

  if (typeof createBitmap === 'function') {
    try {
      const bitmap = await createBitmap(file);
      try {
        return await renderThumbnail(bitmap, bitmap.width, bitmap.height, file.type, maxWidth, maxHeight);
      } finally {
        bitmap.close();
      }
    } catch (error) {
      console.warn('createImageBitmap failed, falling back to HTMLImageElement:', error);
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await loadImageFromObjectUrl(url);
    return await renderThumbnail(img, img.naturalWidth, img.naturalHeight, file.type, maxWidth, maxHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
};

const convertBlobToPngFallback = (blob: Blob): Promise<Blob> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(blob);

        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');

            if (!ctx) {
                URL.revokeObjectURL(url);
                reject(new Error('Could not get canvas context'));
                return;
            }

            ctx.drawImage(img, 0, 0);

            const timeoutId = setTimeout(() => {
                URL.revokeObjectURL(url);
                reject(new Error('Timeout converting image to PNG'));
            }, 5000);

            canvas.toBlob((pngBlob) => {
                clearTimeout(timeoutId);
                URL.revokeObjectURL(url);
                if (pngBlob) {
                    resolve(pngBlob);
                } else {
                    reject(new Error('Failed to convert image to PNG'));
                }
            }, 'image/png');
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load image for conversion'));
        };

        img.src = url;
    });
};

export const convertBlobToPng = async (blob: Blob): Promise<Blob> => {
    // Fallback for browsers that don't support createImageBitmap (e.g., older Safari versions)
    if (!window.createImageBitmap) {
        return convertBlobToPngFallback(blob);
    }

    try {
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
            bitmap.close();
            throw new Error('Could not get canvas context');
        }

        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();

        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error('Timeout converting image to PNG'));
            }, 5000);

            canvas.toBlob((pngBlob) => {
                clearTimeout(timeoutId);
                if (pngBlob) {
                    resolve(pngBlob);
                } else {
                    reject(new Error('Failed to convert image to PNG'));
                }
            }, 'image/png');
        });
    } catch (error) {
        console.warn('createImageBitmap failed, falling back to HTMLImageElement:', error);
        return convertBlobToPngFallback(blob);
    }
};
