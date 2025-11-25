export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      // Fallback for older browsers or non-HTTPS contexts
      console.warn('Using deprecated clipboard API fallback. Modern Clipboard API is not available. This fallback may not work in future browser versions.');
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      // WARNING: document.execCommand('copy') is deprecated and may not work in future browsers.
      // This fallback is only for older browsers or non-HTTPS contexts.
      // Consider using HTTPS to enable modern Clipboard API support.
      const result = document.execCommand('copy');
      textArea.remove();
      
      if (!result) {
        console.error('Deprecated clipboard fallback failed. Please use HTTPS to enable modern clipboard support.');
      }
      
      return result;
    }
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    return false;
  }
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
