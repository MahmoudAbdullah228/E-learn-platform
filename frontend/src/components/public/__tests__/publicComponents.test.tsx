import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import {
  AuthShell,
  CategoryTag,
  CategoryTile,
  CourseCard,
  FilterChip,
  InstructorCard,
  PublicButton,
  PublicCheckbox,
  PublicCurriculumOutline,
  PublicEmptyStateCard,
  PublicErrorStateCard,
  PublicInput,
  PublicModal,
  PublicSearchField,
  PublicSegmentedFilter,
  PurchaseCard,
} from '@/components/public';

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('Public UI Kit', () => {
  it('renders button variants and loading/disabled states', () => {
    const onClick = vi.fn();
    render(
      <div>
        <PublicButton variant="primary" onClick={onClick}>
          Explore Courses
        </PublicButton>
        <PublicButton variant="primary-lg" loading>
          Purchase Course
        </PublicButton>
        <PublicButton variant="secondary">Start Learning</PublicButton>
        <PublicButton variant="outline">Review Course</PublicButton>
        <PublicButton variant="link-action">View Details</PublicButton>
      </div>,
    );

    const primary = screen.getByRole('button', { name: 'Explore Courses' });
    fireEvent.click(primary);
    expect(onClick).toHaveBeenCalledTimes(1);

    const loadingBtn = screen.getByRole('button', { name: 'Purchase Course' });
    expect(loadingBtn).toBeDisabled();
  });

  it('renders input invalid state, password toggle, search field, and checkbox', () => {
    const onCheck = vi.fn();
    const onClear = vi.fn();
    render(
      <div>
        <PublicInput
          label="Password"
          type="password"
          error="Password must be at least 8 characters"
        />
        <PublicSearchField value="react" onChange={() => {}} onClear={onClear} />
        <PublicCheckbox checked={false} onCheckedChange={onCheck} label="Remember me" />
      </div>,
    );

    const passwordInput = screen.getByLabelText('Password');
    expect(passwordInput).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Password must be at least 8 characters',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(passwordInput).toHaveAttribute('type', 'text');

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(onClear).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Remember me' }));
    expect(onCheck).toHaveBeenCalledWith(true);
  });

  it('renders course card, category tile, tags, chips, and segmented filter', () => {
    const onRemove = vi.fn();
    const onSegmentChange = vi.fn();
    renderWithRouter(
      <div>
        <CategoryTile name="Web Development" to="/courses?categoryId=1" />
        <CourseCard
          slug="react-basics"
          title="React Basics"
          instructorName="Sara Ali"
          categoryName="Frontend"
          priceMinor={129900}
        />
        <CategoryTag>Frontend</CategoryTag>
        <FilterChip label="Paid" onRemove={onRemove} />
        <PublicSegmentedFilter
          value="all"
          onChange={onSegmentChange}
          options={[
            { label: 'All', value: 'all' },
            { label: 'Free', value: 'free' },
          ]}
        />
      </div>,
    );

    expect(screen.getByText('React Basics')).toBeInTheDocument();
    expect(screen.getByText('By Sara Ali')).toBeInTheDocument();
    expect(screen.getByText('EGP 1,299')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove Paid filter' }));
    expect(onRemove).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('tab', { name: 'Free' }));
    expect(onSegmentChange).toHaveBeenCalledWith('free');
  });

  it('renders purchase card, instructor card, auth shell, curriculum outline, and feedback', () => {
    const onCta = vi.fn();
    const onPreview = vi.fn();
    renderWithRouter(
      <div>
        <PurchaseCard
          priceMinor={0}
          courseTitle="Intro to Python"
          ctaLabel="Enroll for Free"
          onCtaClick={onCta}
          hasPreview
          onPreviewClick={onPreview}
        />
        <InstructorCard
          instructorId="inst-1"
          name="Omar Hassan"
          expertise="Senior Backend Engineer"
          bio="10 years of distributed systems."
        />
        <AuthShell panelHeadline="Welcome back">
          <div>Login Form</div>
        </AuthShell>
        <PublicCurriculumOutline
          sections={[
            {
              id: 'sec-1',
              title: 'Getting Started',
              lessons: [
                { id: 'les-1', title: 'Welcome', durationSeconds: 90, isPreview: true },
              ],
            },
          ]}
          onPreviewLesson={onPreview}
        />
        <PublicEmptyStateCard title="No courses found" />
        <PublicErrorStateCard message="Failed to load" onRetry={onCta} />
      </div>,
    );

    expect(screen.getByText('Free')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enroll for Free' }));
    expect(onCta).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(onPreview).toHaveBeenCalled();

    expect(screen.getByText('Omar Hassan')).toBeInTheDocument();
    expect(screen.getByText('Welcome back')).toBeInTheDocument();
    expect(screen.getByText('Getting Started')).toBeInTheDocument();
    expect(screen.getByText('1 Lesson • 1m 30s')).toBeInTheDocument();
    expect(screen.getByText('No courses found')).toBeInTheDocument();
  });

  it('renders modal dialog', () => {
    render(
      <PublicModal open onOpenChange={() => {}} title="Preview Video">
        <div>Video Content</div>
      </PublicModal>,
    );

    expect(screen.getByRole('dialog', { name: 'Preview Video' })).toBeInTheDocument();
    expect(screen.getByText('Video Content')).toBeInTheDocument();
  });
});
