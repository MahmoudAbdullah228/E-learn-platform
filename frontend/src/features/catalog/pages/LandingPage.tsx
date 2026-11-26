import { ArrowRight, BookOpen, Code2, Globe, Layers, LineChart, Palette } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAppSelector } from '@/app/hooks';
import {
  CategoryTile,
  CourseCard,
  PublicButton,
  PublicEmptyStateCard,
  PublicErrorStateCard,
  PublicSkeleton,
} from '@/components/public';
import {
  useListCatalogCoursesQuery,
  useListPublicCategoriesQuery,
} from '@/features/catalog/catalogApi';
import { parseApiError } from '@/lib/apiError';

const CATEGORY_ICONS = [Code2, Palette, LineChart, Globe, Layers, BookOpen];

export function LandingPage() {
  const user = useAppSelector((state) => state.auth.user);

  const {
    data: categoriesRes,
    isLoading: isCategoriesLoading,
    isError: isCategoriesError,
    error: categoriesError,
    refetch: refetchCategories,
  } = useListPublicCategoriesQuery({ page: 1, limit: 6 });

  const {
    data: coursesRes,
    isLoading: isCoursesLoading,
    isError: isCoursesError,
    error: coursesError,
    refetch: refetchCourses,
  } = useListCatalogCoursesQuery({ page: 1, limit: 8, pricing: 'all' });

  const categories = categoriesRes?.data?.categories ?? [];
  const courses = coursesRes?.data?.courses ?? [];

  return (
    <div>
      {/* 1. Hero section — white band */}
      <section className="bg-surface border-b border-hairline">
        <div className="mx-auto max-w-[1200px] px-md md:px-xxl py-section grid grid-cols-1 lg:grid-cols-2 gap-xxl items-center">
          <div className="space-y-lg">
            <span className="inline-block text-[12px] font-bold uppercase tracking-[0.06em] text-primary">
              Egyptian E-Learning Marketplace
            </span>
            <h1 className="text-[36px] md:text-[44px] font-bold leading-[1.15] text-ink">
              Learn New Skills.
              <br />
              <span className="text-primary">Build Your Future.</span>
            </h1>
            <p className="text-[16px] leading-[1.6] text-ink-secondary max-w-[520px]">
              Discover practical courses taught by vetted Egyptian instructors in Arabic and English. Track your progress lesson by lesson and learn at your own pace.
            </p>
            <div className="flex flex-wrap items-center gap-md pt-xs">
              <PublicButton variant="primary" rightIcon={<ArrowRight className="h-4 w-4" />} asChild>
                <Link to="/courses">Explore Courses</Link>
              </PublicButton>
              <PublicButton variant="secondary" asChild>
                <Link to={user ? '/app/my-courses' : '/register'}>
                  {user ? 'My Courses' : 'Start Learning'}
                </Link>
              </PublicButton>
            </div>
          </div>

          <div className="bg-canvas rounded-xxl p-xxl border border-hairline">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
              <div className="bg-surface rounded-lg p-md shadow-card space-y-xs">
                <div className="h-10 w-10 rounded-full bg-primary-tint text-primary flex items-center justify-center">
                  <BookOpen className="h-5 w-5" />
                </div>
                <p className="text-[16px] font-semibold text-ink">Structured Curricula</p>
                <p className="text-[13px] text-ink-secondary">
                  Organized sections, video lessons, and downloadable PDF resources.
                </p>
              </div>
              <div className="bg-surface rounded-lg p-md shadow-card space-y-xs">
                <div className="h-10 w-10 rounded-full bg-primary-tint text-primary flex items-center justify-center">
                  <Code2 className="h-5 w-5" />
                </div>
                <p className="text-[16px] font-semibold text-ink">Verified Instructors</p>
                <p className="text-[13px] text-ink-secondary">
                  Every instructor and published course is reviewed for clarity and quality.
                </p>
              </div>
              <div className="sm:col-span-2 bg-surface rounded-lg p-md shadow-card flex items-center justify-between gap-md">
                <div>
                  <p className="text-[14px] font-semibold text-ink">Ready to explore?</p>
                  <p className="text-[13px] text-ink-muted">
                    Browse free and paid courses with transparent EGP pricing.
                  </p>
                </div>
                <Link
                  to="/courses"
                  className="text-[14px] font-semibold text-primary hover:text-primary-light shrink-0"
                >
                  Browse Catalog →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Popular Categories — canvas band */}
      <section className="py-section bg-canvas">
        <div className="mx-auto max-w-[1200px] px-md md:px-xxl space-y-xl">
          <div className="flex items-center justify-between gap-md">
            <div>
              <h2 className="text-[24px] font-bold leading-[1.3] text-ink">
                Popular Categories
              </h2>
              <p className="text-[14px] text-ink-secondary mt-xxs">
                Explore subjects tailored for your next career step.
              </p>
            </div>
            <Link
              to="/courses"
              className="text-[14px] font-semibold text-primary hover:text-primary-light"
            >
              View All →
            </Link>
          </div>

          {isCategoriesLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-md">
              {Array.from({ length: 6 }).map((_, idx) => (
                <PublicSkeleton key={idx} className="h-32 rounded-md" />
              ))}
            </div>
          ) : isCategoriesError ? (
            <PublicErrorStateCard
              message={parseApiError(categoriesError).message}
              onRetry={() => refetchCategories()}
            />
          ) : categories.length === 0 ? (
            <PublicEmptyStateCard
              title="No categories available yet"
              description="Categories will appear here once published."
            />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-md">
              {categories.map((category, idx) => {
                const Icon = CATEGORY_ICONS[idx % CATEGORY_ICONS.length];
                return (
                  <CategoryTile
                    key={category.id}
                    name={category.name}
                    to={`/courses?categoryId=${encodeURIComponent(category.id)}`}
                    icon={<Icon className="h-5 w-5" />}
                  />
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* 3. Popular Courses — white band */}
      <section className="py-section bg-surface border-y border-hairline">
        <div className="mx-auto max-w-[1200px] px-md md:px-xxl space-y-xl">
          <div className="flex items-center justify-between gap-md">
            <div>
              <h2 className="text-[24px] font-bold leading-[1.3] text-ink">
                Popular Courses
              </h2>
              <p className="text-[14px] text-ink-secondary mt-xxs">
                Recently published courses ready to start today.
              </p>
            </div>
            <Link
              to="/courses"
              className="text-[14px] font-semibold text-primary hover:text-primary-light"
            >
              View All →
            </Link>
          </div>

          {isCoursesLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-lg">
              {Array.from({ length: 4 }).map((_, idx) => (
                <PublicSkeleton key={idx} className="h-72 rounded-xl" />
              ))}
            </div>
          ) : isCoursesError ? (
            <PublicErrorStateCard
              message={parseApiError(coursesError).message}
              onRetry={() => refetchCourses()}
            />
          ) : courses.length === 0 ? (
            <PublicEmptyStateCard
              title="No courses published yet"
              description="Check back soon as instructors publish their first courses."
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-lg">
              {courses.map((course) => (
                <CourseCard
                  key={course.id}
                  slug={course.slug}
                  title={course.title}
                  instructorName={course.instructor?.name ?? 'Pathly Instructor'}
                  categoryName={course.category?.name}
                  priceMinor={course.priceMinor}
                  coverUrl={course.coverUrl}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 4. Instructor Invitation — canvas band */}
      <section className="py-section bg-canvas">
        <div className="mx-auto max-w-[1200px] px-md md:px-xxl">
          <div className="bg-surface rounded-xxl p-xxxl shadow-raised border border-hairline flex flex-col md:flex-row items-center justify-between gap-xl">
            <div className="space-y-sm max-w-[600px]">
              <span className="inline-block text-[12px] font-bold uppercase tracking-[0.06em] text-primary">
                Teach on Pathly
              </span>
              <h2 className="text-[24px] font-bold leading-[1.3] text-ink">
                Share Your Expertise with Thousands of Learners
              </h2>
              <p className="text-[16px] leading-[1.6] text-ink-secondary">
                Build structured video courses, attach study resources, and earn 80% of every sale with transparent settlement tracking.
              </p>
            </div>
            <PublicButton
              variant="primary"
              rightIcon={<ArrowRight className="h-4 w-4" />}
              asChild
              className="shrink-0"
            >
              <Link to={user?.roles.includes('instructor') ? '/instructor/dashboard' : '/instructor/apply'}>
                {user?.roles.includes('instructor')
                  ? 'Go to Instructor Studio'
                  : 'Become an Instructor'}
              </Link>
            </PublicButton>
          </div>
        </div>
      </section>
    </div>
  );
}
