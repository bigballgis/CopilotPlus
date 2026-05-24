interface StatusChipProps {
  label: string;
  value: string;
  icon?: string;
}

export function StatusChip({ label, value }: StatusChipProps): JSX.Element {
  return (
    <span className="cp-chip" title={`${label}: ${value}`}>
      <span style={{ opacity: 0.7 }}>{label}</span> {value}
    </span>
  );
}
