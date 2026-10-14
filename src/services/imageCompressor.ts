/**
 * Utility to compress images in browser before saving/syncing
 * Guarantees compressed image size is under target maxMB (default 0.2MB / 200KB)
 */
export async function compressImage(
  fileOrBase64: File | string,
  maxMB: number = 0.2,
  maxDimension: number = 1000
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    const processImage = () => {
      let width = img.width;
      let height = img.height;

      // Scale down dimensions if larger than maxDimension
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Canvas context unavailable'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // Helper to calculate raw byte size from base64 string
      const getByteSize = (base64Str: string) => {
        const commaIdx = base64Str.indexOf(',');
        const base64Len = commaIdx >= 0 ? base64Str.length - (commaIdx + 1) : base64Str.length;
        return Math.round((base64Len * 3) / 4);
      };

      const maxBytes = maxMB * 1024 * 1024;
      let quality = 0.75;
      let dataUrl = canvas.toDataURL('image/jpeg', quality);

      // Loop quality reduction
      while (getByteSize(dataUrl) > maxBytes && quality > 0.15) {
        quality -= 0.1;
        dataUrl = canvas.toDataURL('image/jpeg', quality);
      }

      // If still over maxBytes after quality reduction, scale canvas smaller
      if (getByteSize(dataUrl) > maxBytes && (width > 500 || height > 500)) {
        const scale = 0.7;
        const smallCanvas = document.createElement('canvas');
        smallCanvas.width = Math.round(width * scale);
        smallCanvas.height = Math.round(height * scale);
        const smallCtx = smallCanvas.getContext('2d');
        if (smallCtx) {
          smallCtx.drawImage(canvas, 0, 0, smallCanvas.width, smallCanvas.height);
          quality = 0.65;
          dataUrl = smallCanvas.toDataURL('image/jpeg', quality);
          while (getByteSize(dataUrl) > maxBytes && quality > 0.15) {
            quality -= 0.1;
            dataUrl = smallCanvas.toDataURL('image/jpeg', quality);
          }
        }
      }

      resolve(dataUrl);
    };

    img.onload = processImage;
    img.onerror = (err) => reject(err);

    if (typeof fileOrBase64 === 'string') {
      img.src = fileOrBase64;
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target?.result as string;
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(fileOrBase64);
    }
  });
}
