import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownBodyProps {
  text: string;
  className?: string;
  onLinkClick?: (href: string) => void;
}

export function MarkdownBody({ text, className, onLinkClick }: MarkdownBodyProps): JSX.Element {
  return (
    <div className={`cp-markdown ${className ?? ''}`.trim()}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              onClick={(event) => {
                if (href && onLinkClick) {
                  event.preventDefault();
                  onLinkClick(href);
                }
              }}
            >
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
