import { baseApi } from '@/app/baseApi';
import type { ApiSuccessEnvelope } from '@/types/api';

export type MediaPurpose = 'avatar' | 'course_cover' | 'lesson_attachment';

export interface MediaUploadIntentResponse {
  assetId: string;
  maxBytes: number;
  upload: {
    uploadUrl: string;
    apiKey: string;
    signature: string;
    parameters: Record<string, string | number | boolean>;
    resourceType: string;
    deliveryType: string;
    expiresAt: string;
    providerUploadValidUntil: string;
  };
}

export interface ConfirmedMediaAsset {
  id: string;
  purpose: MediaPurpose;
  targetId: string;
  status: string;
  bytes: number;
  format: string;
  originalName: string | null;
  attachedAt: string;
}

export const mediaApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    createUploadIntent: builder.mutation<
      ApiSuccessEnvelope<MediaUploadIntentResponse>,
      { purpose: MediaPurpose; targetId: string }
    >({
      query: (body) => ({
        url: '/media/upload-intents',
        method: 'POST',
        body,
      }),
    }),
    confirmMediaUpload: builder.mutation<
      ApiSuccessEnvelope<{ asset: ConfirmedMediaAsset }>,
      string
    >({
      query: (assetId) => ({
        url: `/media/${assetId}/confirm`,
        method: 'POST',
        body: {},
      }),
    }),
    deleteMediaAsset: builder.mutation<void, string>({
      query: (assetId) => ({
        url: `/media/${assetId}`,
        method: 'DELETE',
      }),
    }),
  }),
});

export const {
  useCreateUploadIntentMutation,
  useConfirmMediaUploadMutation,
  useDeleteMediaAssetMutation,
} = mediaApi;

export function uploadDirectToCloudinary(
  upload: MediaUploadIntentResponse['upload'],
  file: File,
  onProgress?: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('api_key', upload.apiKey);
    formData.append('signature', upload.signature);
    for (const [key, value] of Object.entries(upload.parameters)) {
      formData.append(key, String(value));
    }
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', upload.uploadUrl);
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    });
    xhr.addEventListener('error', () => {
      reject(new Error('Network error while uploading file'));
    });
    xhr.send(formData);
  });
}
