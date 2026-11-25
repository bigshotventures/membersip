import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Renders creator/member text. Raw HTML is not allowed (react-markdown escapes it), so this is XSS-safe. */
export function Markdown({ children }: { children: string | null | undefined }) {
  if (!children) return null;
  return (
    <div className="prose-lite">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ node, ...p }) => <a {...p} target="_blank" rel="noopener noreferrer nofollow" /> }}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
