import { MarkdownBody } from './MarkdownBody';

interface MessageBubbleProps {
  kind: 'user' | 'assistant' | 'meta' | 'streaming';
  label?: string;
  text: string;
  markdown?: boolean;
}

export function MessageBubble({ kind, label, text, markdown = false }: MessageBubbleProps): JSX.Element {
  const className =
    kind === 'user'
      ? 'cp-message cp-message--user'
      : kind === 'assistant'
        ? 'cp-message cp-message--assistant'
        : kind === 'streaming'
          ? 'cp-message cp-message--streaming'
          : 'cp-message cp-message--meta';

  return (
    <div className={className}>
      {label ? <span className="cp-message-label">{label}</span> : null}
      {markdown && kind !== 'meta' ? <MarkdownBody text={text} /> : text}
    </div>
  );
}
