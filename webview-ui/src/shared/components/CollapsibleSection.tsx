import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

interface CollapsibleSectionProps {
  sectionId: string;
  title: string;
  ariaLabel: string;
  expandLabel: string;
  collapseLabel: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

interface SectionUiState {
  sections?: Record<string, boolean>;
}

function readSectionOpen(sectionId: string, defaultOpen: boolean): boolean {
  try {
    const stored = window.acquireVsCodeApi?.()?.getState?.() as SectionUiState | undefined;
    if (stored?.sections && typeof stored.sections[sectionId] === 'boolean') {
      return stored.sections[sectionId];
    }
  } catch {
    /* ignore */
  }
  return defaultOpen;
}

function persistSectionOpen(sectionId: string, open: boolean): void {
  try {
    const api = window.acquireVsCodeApi?.();
    if (!api) {
      return;
    }
    const prev = (api.getState() as SectionUiState | undefined) ?? {};
    api.setState({ ...prev, sections: { ...prev.sections, [sectionId]: open } });
  } catch {
    /* ignore */
  }
}

export function CollapsibleSection({
  sectionId,
  title,
  ariaLabel,
  expandLabel,
  collapseLabel,
  defaultOpen = true,
  children,
}: CollapsibleSectionProps): JSX.Element {
  const contentId = useId();
  const [open, setOpen] = useState(() => readSectionOpen(sectionId, defaultOpen));

  useEffect(() => {
    persistSectionOpen(sectionId, open);
  }, [sectionId, open]);

  const toggle = useCallback(() => {
    setOpen((value) => !value);
  }, []);

  const toggleAria = (open ? collapseLabel : expandLabel).replace('{0}', title);

  return (
    <section className="cp-console-section" aria-label={ariaLabel}>
      <button
        type="button"
        className="cp-console-section__toggle"
        aria-expanded={open}
        aria-controls={contentId}
        aria-label={toggleAria}
        onClick={toggle}
      >
        <Icon name={open ? 'chevron-down' : 'chevron-right'} />
        <span className="cp-console-section__title">{title}</span>
      </button>
      {open ? (
        <div id={contentId} className="cp-console-section__body">
          {children}
        </div>
      ) : null}
    </section>
  );
}
