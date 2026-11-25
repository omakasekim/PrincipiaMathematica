import React, { useMemo } from 'react';
import katex from 'katex';

export function Latex({ tex, display = false }: { tex: string; display?: boolean }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(tex, {
        displayMode: display,
        throwOnError: false,
        strict: false,
      });
    } catch {
      return tex;
    }
  }, [tex, display]);

  return (
    <span
      className={display ? 'katex-display-wrap' : 'katex-inline-wrap'}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
