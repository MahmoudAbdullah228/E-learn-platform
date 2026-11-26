import {
  CheckCircleFilled,
  DownOutlined,
  FileTextOutlined,
  PlayCircleFilled,
  PlayCircleOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { formatDuration } from '@/lib/formatters';

export type LessonRowState = 'completed' | 'current' | 'future';

export interface DashboardCurriculumLesson {
  id: string;
  title: string;
  durationSeconds?: number | null;
  state: LessonRowState;
  hasAttachment?: boolean;
  isPreview?: boolean;
}

interface CurriculumSectionProps {
  title: string;
  lessons: DashboardCurriculumLesson[];
  onSelectLesson?: (lesson: DashboardCurriculumLesson) => void;
  defaultOpen?: boolean;
  className?: string;
}

export function CurriculumSection({
  title,
  lessons,
  onSelectLesson,
  defaultOpen = true,
  className,
}: CurriculumSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const hasKnownDurations = lessons.some(
    (lesson) => typeof lesson.durationSeconds === 'number' && lesson.durationSeconds > 0,
  );
  const totalSeconds = hasKnownDurations
    ? lessons.reduce((sum, lesson) => sum + (lesson.durationSeconds ?? 0), 0)
    : null;

  return (
    <div
      className={cn(
        'border border-border rounded-lg overflow-hidden bg-surface',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        className="w-full bg-surface-subtle px-lg py-md flex items-center justify-between gap-md text-left hover:bg-primary-wash transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-xs min-w-0">
          {isOpen ? (
            <DownOutlined className="text-[12px] text-ink-muted shrink-0" />
          ) : (
            <RightOutlined className="text-[12px] text-ink-muted shrink-0" />
          )}
          <span className="text-[16px] font-semibold text-ink truncate">{title}</span>
        </div>

        <span className="text-[12px] text-ink-muted shrink-0">
          {lessons.length} {lessons.length === 1 ? 'Lesson' : 'Lessons'}
          {totalSeconds !== null ? ` • ${formatDuration(totalSeconds)}` : ''}
        </span>
      </button>

      {isOpen && (
        <ul className="divide-y divide-hairline m-0 p-0 list-none">
          {lessons.map((lesson) => {
            const stateClasses: Record<LessonRowState, string> = {
              completed: 'bg-surface text-ink',
              current: 'bg-primary-wash text-primary border-l-4 border-l-primary font-medium',
              future: 'bg-surface text-ink-muted',
            };

            const icon =
              lesson.state === 'completed' ? (
                <CheckCircleFilled className="text-success text-[15px] shrink-0" />
              ) : lesson.state === 'current' ? (
                <PlayCircleFilled className="text-primary text-[15px] shrink-0" />
              ) : lesson.hasAttachment ? (
                <FileTextOutlined className="text-ink-muted text-[15px] shrink-0" />
              ) : (
                <PlayCircleOutlined className="text-ink-muted text-[15px] shrink-0" />
              );

            return (
              <li key={lesson.id}>
                <button
                  type="button"
                  onClick={() => onSelectLesson?.(lesson)}
                  disabled={!onSelectLesson}
                  className={cn(
                    'w-full px-md py-sm flex items-center justify-between gap-md text-left text-[14px] transition-colors',
                    stateClasses[lesson.state],
                    onSelectLesson ? 'hover:bg-primary-wash cursor-pointer' : 'cursor-default',
                  )}
                >
                  <div className="flex items-center gap-sm min-w-0">
                    {icon}
                    <span className="truncate">{lesson.title}</span>
                  </div>
                  <div className="flex items-center gap-sm shrink-0">
                    {lesson.isPreview && (
                      <span className="text-[11px] font-semibold text-primary">Preview</span>
                    )}
                    <span className="text-[12px] text-ink-muted">
                      {typeof lesson.durationSeconds === 'number' &&
                      lesson.durationSeconds > 0
                        ? formatDuration(lesson.durationSeconds)
                        : '—'}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
