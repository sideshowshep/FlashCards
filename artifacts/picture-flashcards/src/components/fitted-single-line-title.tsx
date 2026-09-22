import { useLayoutEffect, useRef, useState } from 'react';

type FittedSingleLineTitleProps = {
  text: string;
  className?: string;
  maxFontSize: number;
  minFontSize: number;
  level?: 1 | 2 | 3;
  testId?: string;
};

export function FittedSingleLineTitle({
  text,
  className = '',
  maxFontSize,
  minFontSize,
  level = 2,
  testId,
}: FittedSingleLineTitleProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [fontSize, setFontSize] = useState(maxFontSize);

  useLayoutEffect(() => {
    const title = titleRef.current;
    if (!title) return;

    const fitTitle = () => {
      const availableWidth = title.clientWidth;
      if (availableWidth < 1) return;

      title.style.whiteSpace = 'nowrap';
      title.style.overflow = 'visible';
      title.style.textOverflow = 'clip';
      let nextFontSize = maxFontSize;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        title.style.fontSize = `${nextFontSize}px`;
        if (title.scrollWidth <= availableWidth || nextFontSize <= minFontSize) break;
        nextFontSize = Math.max(
          minFontSize,
          nextFontSize * (availableWidth / title.scrollWidth),
        );
      }
      title.style.whiteSpace = 'normal';
      title.style.fontSize = `${nextFontSize}px`;
      setFontSize(nextFontSize);
    };

    fitTitle();
    const frameId = typeof window === 'undefined'
      ? undefined
      : window.requestAnimationFrame(fitTitle);
    const observer = typeof ResizeObserver === 'undefined'
      ? undefined
      : new ResizeObserver(fitTitle);
    observer?.observe(title.parentElement ?? title);
    return () => {
      if (frameId !== undefined) window.cancelAnimationFrame(frameId);
      observer?.disconnect();
    };
  }, [maxFontSize, minFontSize, text]);

  const Tag = level === 1 ? 'h1' : level === 3 ? 'h3' : 'h2';

  return (
    <Tag
      ref={titleRef}
      className={`${className} break-words overflow-visible whitespace-normal`}
      style={{ fontSize }}
      data-testid={testId}
    >
      {text}
    </Tag>
  );
}