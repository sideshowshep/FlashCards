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
      title.style.fontSize = `${maxFontSize}px`;
      const availableWidth = title.clientWidth;
      const naturalWidth = title.scrollWidth;
      const nextFontSize = naturalWidth > availableWidth
        ? Math.max(minFontSize, maxFontSize * (availableWidth / naturalWidth))
        : maxFontSize;
      title.style.fontSize = `${nextFontSize}px`;
      setFontSize(nextFontSize);
    };

    fitTitle();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(fitTitle);
    observer.observe(title.parentElement ?? title);
    return () => observer.disconnect();
  }, [maxFontSize, minFontSize, text]);

  const Tag = level === 1 ? 'h1' : level === 3 ? 'h3' : 'h2';

  return (
    <Tag
      ref={titleRef}
      className={`${className} overflow-hidden text-ellipsis whitespace-nowrap`}
      style={{ fontSize }}
      data-testid={testId}
    >
      {text}
    </Tag>
  );
}