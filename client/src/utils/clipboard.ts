export const copyToClipboard = (text: string): Promise<void> => {
  // The modern API is preferred
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }

  // Fallback for older browsers or non-HTTPS contexts
  console.warn('Using deprecated clipboard API fallback...');
  return new Promise((resolve, reject) => {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
      const result = document.execCommand('copy');
      textArea.remove();
      if (result) {
        resolve();
      } else {
        const error = new Error('Copy command was unsuccessful');
        console.error('Deprecated clipboard fallback failed.', error);
        reject(error);
      }
    } catch (error) {
      textArea.remove();
      console.error('Failed to copy to clipboard via fallback:', error);
      reject(error);
    }
  });
};

export const downloadFile = (dataUrl: string, filename: string): void => {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const getClipboardData = async (): Promise<ClipboardItems | null> => {
  try {
    if (navigator.clipboard && navigator.clipboard.read) {
      return await navigator.clipboard.read();
    }
  } catch (error) {
    console.error('Failed to read clipboard:', error);
  }
  return null;
};

export const getFileExtension = (filename: string | undefined) => {
    if (!filename) return '';
    return filename.split('.').pop()?.toLowerCase() || '';
};
  
export const truncateFilename = (filename: string | undefined, length: number = 15) => {
    if (!filename) return '';
    if (filename.length <= length) return filename;
    return filename.substring(0, length) + '...';
};
