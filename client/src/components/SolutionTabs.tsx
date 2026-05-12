import type { ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useT } from '@/contexts/LangContext';
import { CodeBlock } from './CodeBlock';
import { Streamdown } from 'streamdown';

export type CodeSnippet = { lang: string; langSlug: string; code: string };

export function SolutionTabs(props: {
  officialZhMarkdown?: string | null;
  codeSnippets?: CodeSnippet[] | null;
}) {
  const t = useT();
  const py = props.codeSnippets?.find(
    (s) => s.langSlug === 'python3' || s.langSlug === 'python',
  );
  const java = props.codeSnippets?.find((s) => s.langSlug === 'java');
  const cpp = props.codeSnippets?.find((s) => s.langSlug === 'cpp');

  const tabs: Array<{ value: string; label: string; render: () => ReactNode }> = [];
  if (props.officialZhMarkdown) {
    tabs.push({
      value: 'officialZh',
      label: t('problem.officialZh'),
      render: () => (
        <div className="prose prose-sm max-w-none">
          <Streamdown>{props.officialZhMarkdown!}</Streamdown>
        </div>
      ),
    });
  }
  if (py)
    tabs.push({
      value: 'python',
      label: t('problem.code.python'),
      render: () => <CodeBlock language="python" code={py.code} />,
    });
  if (java)
    tabs.push({
      value: 'java',
      label: t('problem.code.java'),
      render: () => <CodeBlock language="java" code={java.code} />,
    });
  if (cpp)
    tabs.push({
      value: 'cpp',
      label: t('problem.code.cpp'),
      render: () => <CodeBlock language="cpp" code={cpp.code} />,
    });

  if (tabs.length === 0) {
    return <p className="text-ink-soft text-sm">{t('empty')}</p>;
  }

  return (
    <Tabs defaultValue={tabs[0].value} className="w-full">
      <TabsList>
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value} className="mt-4">
          {tab.render()}
        </TabsContent>
      ))}
    </Tabs>
  );
}
