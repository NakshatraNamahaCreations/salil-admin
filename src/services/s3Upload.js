import api from './api';

/**
 * Upload a PDF or audio file to S3 via the backend streaming proxy.
 * File is streamed: browser → backend → S3 (never fully buffered in memory).
 * No S3 CORS configuration needed.
 *
 * @param {File} file - The file to upload
 * @param {'pdf' | 'audio'} fileType - Type hint (unused server-side, kept for API compat)
 * @param {(percent: number) => void} [onProgress] - Optional progress callback (0–100)
 * @returns {Promise<string>} The permanent S3 URL
 */
export async function uploadFileToS3(file, fileType, onProgress) {
  const formData = new FormData();
  formData.append('file', file);

  const res = await api.post('/admin/upload/file', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: onProgress
      ? (e) => { if (e.total) onProgress(Math.round((e.loaded / e.total) * 100)); }
      : undefined,
  });

  const fileUrl = (res.data || res)?.fileUrl;
  if (!fileUrl) throw new Error('Upload succeeded but no fileUrl returned');
  return fileUrl;
}
