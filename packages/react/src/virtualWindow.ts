export interface VirtualWindowItem {
  index: number;
  start: number;
  size: number;
}

export interface VirtualWindowOptions {
  sizes: number[];
  scrollOffset: number;
  viewportSize: number;
  overscan: number;
  keepIndex?: number;
}

export const getVirtualWindow = ({
  sizes,
  scrollOffset,
  viewportSize,
  overscan,
  keepIndex,
}: VirtualWindowOptions): { items: VirtualWindowItem[]; totalSize: number } => {
  const starts: number[] = [];
  let totalSize = 0;
  for (const size of sizes) {
    starts.push(totalSize);
    totalSize += size;
  }

  let first = sizes.findIndex((size, index) => (starts[index] ?? 0) + size > scrollOffset);
  if (first < 0) first = Math.max(0, sizes.length - 1);

  let last = first;
  const viewportEnd = scrollOffset + Math.max(0, viewportSize);
  while (last < sizes.length - 1 && (starts[last] ?? 0) < viewportEnd) last += 1;

  const indices = new Set<number>();
  for (
    let index = Math.max(0, first - overscan);
    index <= Math.min(sizes.length - 1, last + overscan);
    index += 1
  ) {
    indices.add(index);
  }
  if (keepIndex !== undefined && keepIndex >= 0 && keepIndex < sizes.length) {
    indices.add(keepIndex);
  }

  return {
    items: [...indices]
      .sort((left, right) => left - right)
      .map((index) => ({ index, start: starts[index] ?? 0, size: sizes[index] ?? 0 })),
    totalSize,
  };
};
