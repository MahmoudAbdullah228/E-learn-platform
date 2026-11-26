import { SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CourseCard,
  FilterChip,
  PublicButton,
  PublicCheckbox,
  PublicEmptyStateCard,
  PublicErrorStateCard,
  PublicModal,
  PublicSearchField,
  PublicSkeleton,
} from '@/components/public';
import {
  useListCatalogCoursesQuery,
  useListPublicCategoriesQuery,
} from '@/features/catalog/catalogApi';
import { parseApiError } from '@/lib/apiError';

type PricingFilter = 'all' | 'free' | 'paid';

export function CatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const qParam = searchParams.get('q') ?? '';
  const categoryIdParam = searchParams.get('categoryId') ?? '';
  const pricingRaw = searchParams.get('pricing');
  const pricingParam: PricingFilter =
    pricingRaw === 'free' || pricingRaw === 'paid' ? pricingRaw : 'all';
  const pageRaw = Number.parseInt(searchParams.get('page') ?? '1', 10);
  const pageParam = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  const [searchDraft, setSearchDraft] = useState(qParam);

  const { data: categoriesRes } = useListPublicCategoriesQuery({ page: 1, limit: 100 });
  const categories = categoriesRes?.data?.categories ?? [];

  const {
    data: catalogRes,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useListCatalogCoursesQuery({
    q: qParam || undefined,
    categoryId: categoryIdParam || undefined,
    pricing: pricingParam,
    page: pageParam,
    limit: 12,
  });

  const courses = catalogRes?.data?.courses ?? [];
  const pagination = catalogRes?.data?.pagination;

  const updateFilters = (updates: {
    q?: string;
    categoryId?: string;
    pricing?: PricingFilter;
    page?: number;
  }) => {
    const next = new URLSearchParams(searchParams);

    if (updates.q !== undefined) {
      const trimmed = updates.q.trim();
      if (trimmed) next.set('q', trimmed);
      else next.delete('q');
    }
    if (updates.categoryId !== undefined) {
      if (updates.categoryId) next.set('categoryId', updates.categoryId);
      else next.delete('categoryId');
    }
    if (updates.pricing !== undefined) {
      if (updates.pricing !== 'all') next.set('pricing', updates.pricing);
      else next.delete('pricing');
    }
    const nextPage = updates.page ?? 1;
    if (nextPage > 1) next.set('page', String(nextPage));
    else next.delete('page');

    setSearchParams(next);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateFilters({ q: searchDraft, page: 1 });
  };

  const clearAllFilters = () => {
    setSearchDraft('');
    setSearchParams({});
  };

  const activeCategoryName =
    categories.find((c) => c.id === categoryIdParam)?.name ?? null;

  const filterSidebarContent = (
    <div className="space-y-xl">
      <div className="space-y-sm">
        <h2 className="text-[14px] font-bold uppercase tracking-[0.06em] text-ink-muted">
          Pricing
        </h2>
        <div className="space-y-xxs">
          {(['all', 'free', 'paid'] as const).map((tier) => (
            <PublicCheckbox
              key={tier}
              label={
                tier === 'all'
                  ? 'All Courses'
                  : tier === 'free'
                    ? 'Free Courses'
                    : 'Paid Courses'
              }
              checked={pricingParam === tier}
              onCheckedChange={() => updateFilters({ pricing: tier, page: 1 })}
            />
          ))}
        </div>
      </div>

      <div className="space-y-sm border-t border-hairline pt-lg">
        <h2 className="text-[14px] font-bold uppercase tracking-[0.06em] text-ink-muted">
          Categories
        </h2>
        <div className="space-y-xxs">
          <PublicCheckbox
            label="All Categories"
            checked={!categoryIdParam}
            onCheckedChange={() => updateFilters({ categoryId: '', page: 1 })}
          />
          {categories.map((cat) => (
            <PublicCheckbox
              key={cat.id}
              label={cat.name}
              checked={categoryIdParam === cat.id}
              onCheckedChange={(checked) =>
                updateFilters({ categoryId: checked ? cat.id : '', page: 1 })
              }
            />
          ))}
        </div>
      </div>
    </div>
  );

  const hasActiveFilters = Boolean(qParam || categoryIdParam || pricingParam !== 'all');

  return (
    <div className="mx-auto max-w-[1200px] px-md md:px-xxl py-xxl space-y-xl">
      {/* Page header & search */}
      <div className="bg-surface rounded-xxl p-xl md:p-xxl shadow-card border border-hairline space-y-md">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-md">
          <div>
            <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-primary">
              Course Catalog
            </span>
            <h1 className="text-[32px] font-bold leading-[1.25] text-ink mt-xxs">
              Explore Courses
            </h1>
          </div>
          <p className="text-[14px] text-ink-muted">
            {pagination
              ? `${pagination.total} ${pagination.total === 1 ? 'course' : 'courses'} found`
              : 'Browse published courses'}
          </p>
        </div>

        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-sm">
          <div className="flex-1 space-y-xxs">
            <PublicSearchField
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              onClear={() => {
                setSearchDraft('');
                if (qParam) updateFilters({ q: '', page: 1 });
              }}
              placeholder="Search by course title prefix..."
              aria-label="Search courses by title prefix"
            />
            <p className="text-[12px] text-ink-muted">
              Matches courses whose title starts with your search text.
            </p>
          </div>
          <div className="flex items-start gap-xs">
            <PublicButton type="submit" variant="primary">
              Search
            </PublicButton>
            <PublicButton
              variant="secondary"
              leftIcon={<SlidersHorizontal className="h-4 w-4" />}
              onClick={() => setMobileFiltersOpen(true)}
              className="lg:hidden"
            >
              Filters
            </PublicButton>
          </div>
        </form>

        {/* Active filter chips */}
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-xs pt-xs border-t border-hairline">
            <span className="text-[12px] text-ink-muted mr-xxs">Active filters:</span>
            {qParam && (
              <FilterChip
                label={`Title starts with "${qParam}"`}
                onRemove={() => {
                  setSearchDraft('');
                  updateFilters({ q: '', page: 1 });
                }}
              />
            )}
            {activeCategoryName && (
              <FilterChip
                label={activeCategoryName}
                onRemove={() => updateFilters({ categoryId: '', page: 1 })}
              />
            )}
            {pricingParam !== 'all' && (
              <FilterChip
                label={pricingParam === 'free' ? 'Free' : 'Paid'}
                onRemove={() => updateFilters({ pricing: 'all', page: 1 })}
              />
            )}
            <PublicButton variant="link-action" onClick={clearAllFilters} className="ml-xs text-[13px]">
              Clear all
            </PublicButton>
          </div>
        )}
      </div>

      {/* Main layout: filter sidebar (desktop) + results grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-xl items-start">
        <aside className="hidden lg:block bg-surface rounded-xl p-xl border border-hairline shadow-card">
          {filterSidebarContent}
        </aside>

        <div className="lg:col-span-3 space-y-xl">
          {isLoading || isFetching ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-lg">
              {Array.from({ length: 6 }).map((_, idx) => (
                <PublicSkeleton key={idx} className="h-72 rounded-xl" />
              ))}
            </div>
          ) : isError ? (
            <PublicErrorStateCard
              message={parseApiError(error).message}
              onRetry={() => refetch()}
            />
          ) : courses.length === 0 ? (
            <PublicEmptyStateCard
              title="No matching courses"
              description="Try adjusting your title prefix or clearing your category and pricing filters."
              actionLabel={hasActiveFilters ? 'Clear Filters' : undefined}
              onAction={hasActiveFilters ? clearAllFilters : undefined}
            />
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-lg">
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

              {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-between bg-surface rounded-lg px-lg py-md border border-hairline">
                  <span className="text-[13px] text-ink-secondary">
                    Page {pagination.page} of {pagination.totalPages}
                  </span>
                  <div className="flex items-center gap-xs">
                    <PublicButton
                      variant="secondary"
                      disabled={pagination.page <= 1}
                      onClick={() => updateFilters({ page: pagination.page - 1 })}
                    >
                      Previous
                    </PublicButton>
                    <PublicButton
                      variant="secondary"
                      disabled={pagination.page >= pagination.totalPages}
                      onClick={() => updateFilters({ page: pagination.page + 1 })}
                    >
                      Next
                    </PublicButton>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Mobile / Tablet filter modal */}
      <PublicModal
        open={mobileFiltersOpen}
        onOpenChange={setMobileFiltersOpen}
        title="Filter Courses"
      >
        <div className="space-y-lg">
          {filterSidebarContent}
          <div className="pt-sm flex justify-end">
            <PublicButton variant="primary" onClick={() => setMobileFiltersOpen(false)}>
              Apply Filters
            </PublicButton>
          </div>
        </div>
      </PublicModal>
    </div>
  );
}
