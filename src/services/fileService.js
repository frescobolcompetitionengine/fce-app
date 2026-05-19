import { apiRequest, isServerStorageMode, resolveApiUrl } from './apiClient';

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

async function uploadImageToServer(file) {
  const dataUrl = await readFileAsDataUrl(file);
  const response = await apiRequest('/api/uploads/images', {
    method: 'POST',
    body: {
      file_name: file.name,
      mime_type: file.type || 'application/octet-stream',
      data_url: dataUrl,
    },
  });

  const fileUrl = response?.file_url || response?.url_path || response?.path || '';
  if (!fileUrl) {
    throw new Error('Invalid upload response.');
  }

  return {
    file_url: resolveApiUrl(fileUrl),
    file_id: response?.id || null,
  };
}

export async function uploadImageFile(file) {
  if (!file) throw new Error('No file provided.');

  if (isServerStorageMode()) {
    try {
      return await uploadImageToServer(file);
    } catch (error) {
      console.warn('Server photo upload failed, falling back to local data URL:', error);
    }
  }

  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ file_url: reader.result });
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}
