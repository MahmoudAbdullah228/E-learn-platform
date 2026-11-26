import { baseApi } from '@/app/baseApi';
import type { ApiSuccessEnvelope } from '@/types/api';

export interface InstructorLessonDto {
  id: string;
  sectionId: string;
  title: string;
  description: string;
  position: number;
  isPreview: boolean;
  videoStatus: string;
  durationSeconds: number | null;
  attachments: string[];
  createdAt: string;
  updatedAt: string;
}

export interface InstructorSectionDto {
  id: string;
  courseId: string;
  title: string;
  position: number;
  lessons: InstructorLessonDto[];
  createdAt: string;
  updatedAt: string;
}

export interface MuxDirectUploadDto {
  id: string;
  url: string;
  timeoutSeconds: number;
  videoStatus: string;
}

export const instructorCurriculumApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getInstructorCurriculum: builder.query<
      ApiSuccessEnvelope<{ sections: InstructorSectionDto[] }>,
      string
    >({
      query: (courseId) =>
        `/instructor/courses/${encodeURIComponent(courseId)}/sections`,
      providesTags: (_res, _err, courseId) => [
        { type: 'Curriculum', id: courseId },
      ],
    }),
    createSection: builder.mutation<
      ApiSuccessEnvelope<{ section: InstructorSectionDto }>,
      { courseId: string; title: string }
    >({
      query: ({ courseId, title }) => ({
        url: `/instructor/courses/${encodeURIComponent(courseId)}/sections`,
        method: 'POST',
        body: { title },
      }),
      invalidatesTags: (_res, _err, { courseId }) => [
        { type: 'Curriculum', id: courseId },
      ],
    }),
    updateSection: builder.mutation<
      ApiSuccessEnvelope<{ section: InstructorSectionDto }>,
      { courseId: string; sectionId: string; title: string }
    >({
      query: ({ courseId, sectionId, title }) => ({
        url: `/instructor/courses/${encodeURIComponent(courseId)}/sections/${encodeURIComponent(sectionId)}`,
        method: 'PATCH',
        body: { title },
      }),
      invalidatesTags: (_res, _err, { courseId }) => [
        { type: 'Curriculum', id: courseId },
      ],
    }),
    deleteSection: builder.mutation<
      ApiSuccessEnvelope<{ deletedId: string }>,
      { courseId: string; sectionId: string }
    >({
      query: ({ courseId, sectionId }) => ({
        url: `/instructor/courses/${encodeURIComponent(courseId)}/sections/${encodeURIComponent(sectionId)}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_res, _err, { courseId }) => [
        { type: 'Curriculum', id: courseId },
      ],
    }),
    reorderSections: builder.mutation<
      ApiSuccessEnvelope<{ sections: InstructorSectionDto[] }>,
      { courseId: string; orderedIds: string[] }
    >({
      query: ({ courseId, orderedIds }) => ({
        url: `/instructor/courses/${encodeURIComponent(courseId)}/sections/order`,
        method: 'PUT',
        body: { orderedIds },
      }),
      invalidatesTags: (_res, _err, { courseId }) => [
        { type: 'Curriculum', id: courseId },
      ],
    }),
    createLesson: builder.mutation<
      ApiSuccessEnvelope<{ lesson: InstructorLessonDto }>,
      {
        courseId: string;
        sectionId: string;
        title: string;
        description?: string;
        isPreview?: boolean;
      }
    >({
      query: ({ sectionId, title, description, isPreview }) => ({
        url: `/instructor/sections/${encodeURIComponent(sectionId)}/lessons`,
        method: 'POST',
        body: { title, description: description ?? '', isPreview: Boolean(isPreview) },
      }),
      invalidatesTags: (_res, _err, { courseId }) => [
        { type: 'Curriculum', id: courseId },
      ],
    }),
    updateLesson: builder.mutation<
      ApiSuccessEnvelope<{ lesson: InstructorLessonDto }>,
      {
        courseId: string;
        lessonId: string;
        patch: { title?: string; description?: string; isPreview?: boolean };
      }
    >({
      query: ({ lessonId, patch }) => ({
        url: `/instructor/lessons/${encodeURIComponent(lessonId)}`,
        method: 'PATCH',
        body: patch,
      }),
      invalidatesTags: (_res, _err, { courseId }) => [
        { type: 'Curriculum', id: courseId },
      ],
    }),
    deleteLesson: builder.mutation<
      ApiSuccessEnvelope<{ deletedId: string }>,
      { courseId: string; lessonId: string }
    >({
      query: ({ lessonId }) => ({
        url: `/instructor/lessons/${encodeURIComponent(lessonId)}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_res, _err, { courseId }) => [
        { type: 'Curriculum', id: courseId },
      ],
    }),
    reorderLessons: builder.mutation<
      ApiSuccessEnvelope<{ lessons: InstructorLessonDto[] }>,
      { courseId: string; sectionId: string; orderedIds: string[] }
    >({
      query: ({ sectionId, orderedIds }) => ({
        url: `/instructor/sections/${encodeURIComponent(sectionId)}/lessons/order`,
        method: 'PUT',
        body: { orderedIds },
      }),
      invalidatesTags: (_res, _err, { courseId }) => [
        { type: 'Curriculum', id: courseId },
      ],
    }),
    requestLessonVideoUpload: builder.mutation<
      ApiSuccessEnvelope<{ upload: MuxDirectUploadDto }>,
      { courseId: string; lessonId: string }
    >({
      query: ({ lessonId }) => ({
        url: `/instructor/lessons/${encodeURIComponent(lessonId)}/video-upload`,
        method: 'POST',
      }),
      invalidatesTags: (_res, _err, { courseId }) => [
        { type: 'Curriculum', id: courseId },
      ],
    }),
  }),
});

export const {
  useGetInstructorCurriculumQuery,
  useCreateSectionMutation,
  useUpdateSectionMutation,
  useDeleteSectionMutation,
  useReorderSectionsMutation,
  useCreateLessonMutation,
  useUpdateLessonMutation,
  useDeleteLessonMutation,
  useReorderLessonsMutation,
  useRequestLessonVideoUploadMutation,
} = instructorCurriculumApi;

export function uploadVideoDirectToMux(
  uploadUrl: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', file.type || 'video/mp4');
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
        reject(new Error(`Mux upload failed with status ${xhr.status}`));
      }
    });
    xhr.addEventListener('error', () => {
      reject(new Error('Network error while uploading video'));
    });
    xhr.send(file);
  });
}
