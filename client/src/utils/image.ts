
export const createImageThumbnail = (file: File, maxWidth: number, maxHeight: number): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      return reject(new Error('File is not an image.'));
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;

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

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('Could not get canvas context.'));
        }
        ctx.drawImage(img, 0, 0, width, height);
        // Use original file type for quality if supported; otherwise, fall back to JPEG
        const supportedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        const mimeType = supportedTypes.includes(file.type) ? file.type : 'image/jpeg';
        resolve(canvas.toDataURL(mimeType));
      };
      img.onerror = () => {
        return reject(new Error('Failed to load image for thumbnail generation'));
      };
      img.src = e.target?.result as string;
    };
    reader.onerror = () => {
      return reject(new Error('Failed to read image file for thumbnail generation'));
    };
    reader.readAsDataURL(file);
  });
};
