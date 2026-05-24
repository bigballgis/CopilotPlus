import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownBodyProps {
  text: string;
  className?: string;
}

export function MarkdownBody({ text, className }: MarkdownBodyProps): JSX.Element {
  return (
    <div className={`cp-markdown ${className ?? ''}`.trim()}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}
