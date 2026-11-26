import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { ChunkFallback } from '@/components/common/ChunkFallback';
import { ForgotPasswordPage } from '@/features/auth/pages/ForgotPasswordPage';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { RegisterPage } from '@/features/auth/pages/RegisterPage';
import { ResetPasswordPage } from '@/features/auth/pages/ResetPasswordPage';
import { VerifyEmailPage } from '@/features/auth/pages/VerifyEmailPage';
import { CatalogPage } from '@/features/catalog/pages/CatalogPage';
import { InstructorPublicProfilePage } from '@/features/catalog/pages/InstructorPublicProfilePage';
import { LandingPage } from '@/features/catalog/pages/LandingPage';
import { CourseDetailsPage } from '@/features/courseDetails/pages/CourseDetailsPage';
import { PublicLayout } from '@/layouts/PublicLayout';
import { NotFoundPage } from '@/pages/NotFoundPage';
import {
  RedirectIfAuthenticated,
  RequireAuth,
  RequireNonInstructor,
  RequireRole,
} from '@/routes/guards';

// Route-level code splitting: Ant Design is isolated strictly inside these lazy chunks.
const AppLayout = lazy(() => import('@/layouts/AppLayout'));
const InstructorLayout = lazy(() => import('@/layouts/InstructorLayout'));
const AdminLayout = lazy(() => import('@/layouts/AdminLayout'));
const ProfilePage = lazy(() => import('@/features/profile/pages/ProfilePage'));
const StudentDashboardPage = lazy(() => import('@/features/library/pages/StudentDashboardPage'));
const MyCoursesPage = lazy(() => import('@/features/library/pages/MyCoursesPage'));
const CourseOutlinePage = lazy(() => import('@/features/library/pages/CourseOutlinePage'));
const CoursePlayerPage = lazy(() => import('@/features/player/pages/CoursePlayerPage'));
const OrdersPage = lazy(() => import('@/features/orders/pages/OrdersPage'));
const OrderDetailPage = lazy(() => import('@/features/orders/pages/OrderDetailPage'));
const CheckoutReturnPage = lazy(() => import('@/features/checkout/pages/CheckoutReturnPage'));
const ApplyInstructorPage = lazy(
  () => import('@/features/instructorApplication/pages/ApplyInstructorPage'),
);
const ApplicationStatusPage = lazy(
  () => import('@/features/instructorApplication/pages/ApplicationStatusPage'),
);
const InstructorDashboardPage = lazy(
  () => import('@/features/instructorCourses/pages/InstructorDashboardPage'),
);
const InstructorCoursesPage = lazy(
  () => import('@/features/instructorCourses/pages/InstructorCoursesPage'),
);
const CourseEditorPage = lazy(
  () => import('@/features/instructorCourses/pages/CourseEditorPage'),
);
const CurriculumEditorPage = lazy(
  () => import('@/features/instructorCurriculum/pages/CurriculumEditorPage'),
);
const InstructorProfilePage = lazy(
  () => import('@/features/instructorCourses/pages/InstructorProfilePage'),
);
const AdminDashboardPage = lazy(
  () => import('@/features/adminUsers/pages/AdminDashboardPage'),
);
const AdminApplicationsPage = lazy(
  () => import('@/features/adminApplications/pages/AdminApplicationsPage'),
);
const AdminCoursesPage = lazy(
  () => import('@/features/adminCourses/pages/AdminCoursesPage'),
);
const AdminCourseDetailPage = lazy(
  () => import('@/features/adminCourses/pages/AdminCourseDetailPage'),
);
const AdminCourseRevisionsPage = lazy(
  () => import('@/features/adminCourses/pages/AdminCourseRevisionsPage'),
);
const AdminCategoriesPage = lazy(
  () => import('@/features/adminCategories/pages/AdminCategoriesPage'),
);
const AdminOrdersPage = lazy(
  () => import('@/features/adminOrders/pages/AdminOrdersPage'),
);
const AdminUsersPage = lazy(
  () => import('@/features/adminUsers/pages/AdminUsersPage'),
);
const InstructorFinancePage = lazy(
  () => import('@/features/instructorFinance/pages/InstructorFinancePage'),
);
const AdminFinanceAndPayoutsPage = lazy(
  () => import('@/features/adminFinance/pages/AdminFinanceAndPayoutsPage'),
);
const InstructorRevisionEditorPage = lazy(
  () => import('@/features/instructorCourses/pages/InstructorRevisionEditorPage'),
);

function withSuspense(node: ReactNode) {
  return <Suspense fallback={<ChunkFallback />}>{node}</Suspense>;
}

const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      { path: '/', element: <LandingPage /> },
      { path: '/courses', element: <CatalogPage /> },
      { path: '/courses/:slug', element: <CourseDetailsPage /> },
      { path: '/instructors/:instructorId', element: <InstructorPublicProfilePage /> },
      {
        element: <RedirectIfAuthenticated />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/register', element: <RegisterPage /> },
        ],
      },
      { path: '/verify-email', element: <VerifyEmailPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
      { path: '/reset-password', element: <ResetPasswordPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        path: '/app',
        element: withSuspense(<AppLayout />),
        children: [
          {
            path: 'dashboard',
            element: withSuspense(<StudentDashboardPage />),
          },
          {
            path: 'my-courses',
            element: withSuspense(<MyCoursesPage />),
          },
          {
            path: 'my-courses/:courseId',
            element: withSuspense(<CourseOutlinePage />),
          },
          {
            path: 'my-courses/:courseId/learn/:lessonId',
            element: withSuspense(<CoursePlayerPage />),
          },
          {
            path: 'orders',
            element: withSuspense(<OrdersPage />),
          },
          {
            path: 'orders/:orderId',
            element: withSuspense(<OrderDetailPage />),
          },
          {
            path: 'checkout/success',
            element: withSuspense(<CheckoutReturnPage mode="success" />),
          },
          {
            path: 'checkout/cancel',
            element: withSuspense(<CheckoutReturnPage mode="cancel" />),
          },
          {
            path: 'profile',
            element: withSuspense(<ProfilePage />),
          },
        ],
      },
      {
        element: <RequireNonInstructor />,
        children: [
          {
            path: '/instructor/apply',
            element: withSuspense(<AppLayout />),
            children: [
              {
                index: true,
                element: withSuspense(<ApplyInstructorPage />),
              },
            ],
          },
        ],
      },
      {
        path: '/instructor/application-status',
        element: withSuspense(<AppLayout />),
        children: [
          {
            index: true,
            element: withSuspense(<ApplicationStatusPage />),
          },
        ],
      },
      {
        element: <RequireRole requiredRole="instructor" />,
        children: [
          {
            path: '/instructor',
            element: withSuspense(<InstructorLayout />),
            children: [
              {
                path: 'dashboard',
                element: withSuspense(<InstructorDashboardPage />),
              },
              {
                path: 'courses',
                element: withSuspense(<InstructorCoursesPage />),
              },
              {
                path: 'courses/new',
                element: withSuspense(<CourseEditorPage />),
              },
              {
                path: 'courses/:courseId/edit',
                element: withSuspense(<CourseEditorPage />),
              },
              {
                path: 'courses/:courseId/curriculum',
                element: withSuspense(<CurriculumEditorPage />),
              },
              {
                path: 'courses/:courseId/revisions/:revisionId',
                element: withSuspense(<InstructorRevisionEditorPage />),
              },
              {
                path: 'finance',
                element: withSuspense(<InstructorFinancePage />),
              },
              {
                path: 'profile',
                element: withSuspense(<InstructorProfilePage />),
              },
            ],
          },
        ],
      },
      {
        element: <RequireRole requiredRole="admin" />,
        children: [
          {
            path: '/admin',
            element: withSuspense(<AdminLayout />),
            children: [
              {
                path: 'dashboard',
                element: withSuspense(<AdminDashboardPage />),
              },
              {
                path: 'instructor-applications',
                element: withSuspense(<AdminApplicationsPage />),
              },
              {
                path: 'courses',
                element: withSuspense(<AdminCoursesPage />),
              },
              {
                path: 'courses/:courseId',
                element: withSuspense(<AdminCourseDetailPage />),
              },
              {
                path: 'courses/:courseId/revisions',
                element: withSuspense(<AdminCourseRevisionsPage />),
              },
              {
                path: 'categories',
                element: withSuspense(<AdminCategoriesPage />),
              },
              {
                path: 'orders',
                element: withSuspense(<AdminOrdersPage />),
              },
              {
                path: 'users',
                element: withSuspense(<AdminUsersPage />),
              },
              {
                path: 'finance',
                element: withSuspense(<AdminFinanceAndPayoutsPage />),
              },
            ],
          },
        ],
      },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
