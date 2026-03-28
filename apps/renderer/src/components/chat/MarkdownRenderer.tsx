import React, { useState, type ComponentPropsWithoutRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Check, Copy } from 'lucide-react';
import '../../styles/markdown.css';

export interface MarkdownRendererProps {
  content: string;
  className?: string;
}

function CodeBlock({ className, children, ...props }: ComponentPropsWithoutRef<'code'>) {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className ?? '');
  const language = match ? match[1] : '';
  const isBlock = Boolean(language) || (typeof children === 'string' && children.includes('\n'));

  const handleCopy = () => {
    const text = typeof children === 'string' ? children : String(children);
    navigator.clipboard.writeText(text.replace(/\n$/, ''));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isBlock) {
    return (
      <code className="bg-black/[0.06] dark:bg-white/10 rounded px-1.5 py-0.5 text-purple-600 dark:text-[#c4b5fd] font-mono text-[13px]" {...props}>
        {children}
      </code>
    );
  }

  return (
    <div className="relative group rounded-xl bg-gray-100 dark:bg-[#0a0c10] my-4 overflow-hidden border border-black/8 dark:border-white/5">
      <div className="flex items-center justify-between px-4 py-2 bg-black/[0.03] dark:bg-white/5 border-b border-black/8 dark:border-white/5 text-xs text-slate-500 dark:text-white/50">
        <span className="font-mono">{language || 'text'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 hover:text-white transition-colors"
          type="button"
        >
          {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
          <span>{copied ? 'Copied!' : 'Copy'}</span>
        </button>
      </div>
      <div className="p-4 overflow-x-auto">
        <code className={className} {...props}>
          {children}
        </code>
      </div>
    </div>
  );
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '' }) => {
  return (
    <div className={`markdown-body ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          code: CodeBlock,
          pre: ({ children }) => <>{children}</>,
          a: (props) => <a className="text-emerald-600 dark:text-emerald-300 underline hover:text-emerald-700 dark:hover:text-emerald-200 transition-colors" target="_blank" rel="noopener noreferrer" {...props} />,
          ul: (props) => <ul className="list-disc list-outside ml-5 my-4 space-y-1 text-slate-800 dark:text-white/85 text-sm" {...props} />,
          ol: (props) => <ol className="list-decimal list-outside ml-5 my-4 space-y-1 text-slate-800 dark:text-white/85 text-sm" {...props} />,
          blockquote: (props) => <blockquote className="border-l-2 border-emerald-500/50 bg-black/[0.03] dark:bg-white/5 px-4 py-2 my-4 rounded-r-lg italic text-slate-600 dark:text-white/70" {...props} />,
          table: (props) => (
            <div className="overflow-x-auto my-4">
              <table className="min-w-full border border-black/10 dark:border-white/10 rounded-lg text-sm" {...props} />
            </div>
          ),
          th: (props) => <th className="border-b border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/5 px-4 py-2 text-left font-medium text-slate-900 dark:text-white/90" {...props} />,
          td: (props) => <td className="border-b border-black/5 dark:border-white/5 px-4 py-2 text-slate-700 dark:text-white/80" {...props} />,
          h1: (props) => <h1 className="text-2xl font-semibold mt-6 mb-4 text-slate-900 dark:text-white" {...props} />,
          h2: (props) => <h2 className="text-xl font-semibold mt-5 mb-3 text-slate-900 dark:text-white" {...props} />,
          h3: (props) => <h3 className="text-lg font-medium mt-4 mb-2 text-slate-900 dark:text-white" {...props} />,
          h4: (props) => <h4 className="text-base font-medium mt-4 mb-2 text-slate-900 dark:text-white" {...props} />,
          p: (props) => <p className="text-sm leading-relaxed text-slate-800 dark:text-white/85 my-3 last:mb-0" {...props} />,
          hr: (props) => <hr className="border-black/10 dark:border-white/10 my-6" {...props} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
