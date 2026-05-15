import DOMPurify from 'isomorphic-dompurify';
import { useMemo } from 'react';

export function ProblemContent({ html }: { html: string | null | undefined }) {
  const safe = useMemo(() => {
    if (!html) return '';
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        'p',
        'pre',
        'code',
        'strong',
        'em',
        'ul',
        'ol',
        'li',
        'sup',
        'sub',
        'br',
        'hr',
        'span',
        'div',
        'table',
        'thead',
        'tbody',
        'tr',
        'td',
        'th',
        'img',
        'var',
        'b',
        'i',
        'small',
        'blockquote',
        'a',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
      ],
      ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'target', 'rel'],
    });
  }, [html]);
  return (
    <article
      className="prose prose-sm max-w-none overflow-hidden [&_pre]:bg-secondary [&_pre]:p-3 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_code]:font-mono [&_img]:rounded [&_img]:my-2"
      ref={(el) => {
        if (!el) return;
        el.querySelectorAll('img').forEach((img) => {
          img.onerror = () => { img.style.display = 'none'; };
        });
      }}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}
