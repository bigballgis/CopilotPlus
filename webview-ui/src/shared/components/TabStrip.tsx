interface TabStripItem<T extends string> {
  id: T;
  label: string;
}

interface TabStripProps<T extends string> {
  items: TabStripItem<T>[];
  activeId: T;
  ariaLabel: string;
  tabAriaTemplate: string;
  onSelect: (id: T) => void;
  numbered?: boolean;
}

export function TabStrip<T extends string>({
  items,
  activeId,
  ariaLabel,
  tabAriaTemplate,
  onSelect,
  numbered = false,
}: TabStripProps<T>): JSX.Element {
  return (
    <div role="tablist" aria-label={ariaLabel} className="cp-tab-list">
      {items.map((item, index) => (
        <button
          key={item.id}
          role="tab"
          type="button"
          id={`tab-${item.id}`}
          className="cp-tab-button"
          aria-selected={item.id === activeId}
          aria-label={tabAriaTemplate.replace('{0}', item.label)}
          onClick={() => onSelect(item.id)}
        >
          {numbered ? `${index + 1}. ${item.label}` : item.label}
        </button>
      ))}
    </div>
  );
}
