import { ChevronDown, ChevronRight, FileText, PlayCircle } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { formatDuration } from '@/lib/formatters';

export interface PublicOutlineLesson {
  id: string;
  title: string;
  durationSeconds?: number | null;
  isPreview?: boolean;
  hasAttachment?: boolean;
}

export interface PublicOutlineSection {
  id: string;
  title: string;
  lessons: PublicOutlineLesson[];
}

interface PublicCurriculumOutlineProps {
  sections: PublicOutlineSection[];
  onPreviewLesson?: (lesson: PublicOutlineLesson) => void;
  defaultExpandedAll?: boolean;
}

export function PublicCurriculumOutline({
  sections,
  onPreviewLesson,
  defaultExpandedAll = true,
}: PublicCurriculumOutlineProps) {
  const [openIds, setOpenIds] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    sections.forEach((section, index) => {
      initial[section.id] = defaultExpandedAll || index === 0;
    });
    return initial;
  });

  const toggleSection = (id: string) => {
    setOpenIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-sm">
      {sections.map((section) => {
        const isOpen = Boolean(openIds[section.id]);
        const hasKnownDurations = section.lessons.some(
          (l) => typeof l.durationSeconds === 'number' && l.durationSeconds > 0,
        );
        const totalSectionSeconds = hasKnownDurations
          ? section.lessons.reduce((sum, l) => sum + (l.durationSeconds ?? 0), 0)
          : null;

        return (
          <div
            key={section.id}
            className="border border-border rounded-lg overflow-hidden bg-surface"
          >
            <button
              type="button"
              onClick={() => toggleSection(section.id)}
              aria-expanded={isOpen}
              className="w-full bg-surface-subtle px-lg py-md flex items-center justify-between gap-md text-left hover:bg-primary-wash transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-xs min-w-0">
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 text-ink-muted shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-ink-muted shrink-0" />
                )}
                <span className="text-[16px] font-semibold text-ink truncate">
                  {section.title}
                </span>
              </div>

              <span className="text-[12px] text-ink-muted shrink-0">
                {section.lessons.length} {section.lessons.length === 1 ? 'Lesson' : 'Lessons'}
                {totalSectionSeconds !== null ? ` • ${formatDuration(totalSectionSeconds)}` : ''}
              </span>
            </button>

            {isOpen && (
              <ul className="divide-y divide-hairline">
                {section.lessons.map((lesson) => {
                  const canPreview = Boolean(lesson.isPreview && onPreviewLesson);
                  return (
                    <li
                      key={lesson.id}
                      className={cn(
                        'px-md py-sm flex items-center justify-between gap-md bg-surface text-[14px]',
                      )}
                    >
                      <div className="flex items-center gap-sm min-w-0">
                        {lesson.hasAttachment ? (
                          <FileText className="h-4 w-4 text-ink-muted shrink-0" />
                        ) : (
                          <PlayCircle className="h-4 w-4 text-primary shrink-0" />
                        )}
                        <span className="text-ink truncate">{lesson.title}</span>
                      </div>

                      <div className="flex items-center gap-md shrink-0">
                        {lesson.isPreview && (
                          <button
                            type="button"
                            onClick={() => canPreview && onPreviewLesson?.(lesson)}
                            disabled={!canPreview}
                            className={cn(
                              'text-[12px] font-semibold text-primary',
                              canPreview ? 'hover:text-primary-light cursor-pointer' : '',
                            )}
                          >
                            Preview
                          </button>
                        )}
                        <span className="text-[12px] text-ink-muted">
                          {typeof lesson.durationSeconds === 'number' &&
                          lesson.durationSeconds > 0
                            ? formatDuration(lesson.durationSeconds)
                            : '—'}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
