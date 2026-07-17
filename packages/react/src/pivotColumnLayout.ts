import type { ColumnPinningState } from '@lynellf/tablekit-core';
import type { PivotColumnNode, PivotLeafColumn } from '@lynellf/tablekit-pivot';

export type PivotPinnedSide = 'left' | 'right' | false;

interface PivotLeafGroup<TRow> {
  label: string;
  leaves: Array<PivotLeafColumn<TRow>>;
  originalIndex: number;
  pinned: PivotPinnedSide;
  pinIndex: number;
}

export interface PivotColumnRegions<TRow> {
  left: Array<PivotLeafColumn<TRow>>;
  center: Array<PivotLeafColumn<TRow>>;
  right: Array<PivotLeafColumn<TRow>>;
  ordered: Array<PivotLeafColumn<TRow>>;
}

const groupKeyOf = <TRow>(leaf: PivotLeafColumn<TRow>): string =>
  leaf.isTotal
    ? 'total'
    : leaf.path.length === 0
      ? 'root'
      : `value:${JSON.stringify([leaf.path[0]])}`;

const groupLabelOf = <TRow>(leaf: PivotLeafColumn<TRow>): string =>
  leaf.isTotal ? '[grand total]' : JSON.stringify(leaf.path.slice(0, 1));

const pinIndexOf = (leaves: Array<PivotLeafColumn>, pinnedIds: string[]): number => {
  const ids = new Set(leaves.map((leaf) => leaf.id));
  const index = pinnedIds.findIndex((id) => ids.has(id));
  return index < 0 ? Number.POSITIVE_INFINITY : index;
};

export const createPivotColumnRegions = <TRow>(
  leaves: Array<PivotLeafColumn<TRow>>,
  pinning: ColumnPinningState,
): PivotColumnRegions<TRow> => {
  const groupsByKey = new Map<string, PivotLeafGroup<TRow>>();
  for (const leaf of leaves) {
    const key = groupKeyOf(leaf);
    const group = groupsByKey.get(key);
    if (group) group.leaves.push(leaf);
    else {
      groupsByKey.set(key, {
        label: groupLabelOf(leaf),
        leaves: [leaf],
        originalIndex: groupsByKey.size,
        pinned: false,
        pinIndex: Number.POSITIVE_INFINITY,
      });
    }
  }

  const leftIds = new Set(pinning.left);
  const rightIds = new Set(pinning.right);
  const groups = [...groupsByKey.values()];
  for (const group of groups) {
    const explicitlyLeft = group.leaves.some((leaf) => leftIds.has(leaf.id));
    const explicitlyRight = group.leaves.some((leaf) => rightIds.has(leaf.id));
    if (explicitlyLeft && explicitlyRight) {
      throw new Error(
        `PivotGrid column group ${group.label} cannot be pinned to both left and right.`,
      );
    }

    if (explicitlyLeft) {
      group.pinned = 'left';
      group.pinIndex = pinIndexOf(group.leaves, pinning.left);
    } else if (explicitlyRight) {
      group.pinned = 'right';
      group.pinIndex = pinIndexOf(group.leaves, pinning.right);
    } else {
      const defaultSides = new Set(
        group.leaves.flatMap((leaf) => (leaf.pinned ? [leaf.pinned] : [])),
      );
      if (defaultSides.size > 1) {
        throw new Error(
          `PivotGrid column group ${group.label} cannot be pinned to both left and right.`,
        );
      }
      group.pinned = defaultSides.values().next().value ?? false;
    }
  }

  const sortPinnedGroups = (a: PivotLeafGroup<TRow>, b: PivotLeafGroup<TRow>) =>
    a.pinIndex - b.pinIndex || a.originalIndex - b.originalIndex;
  const leftGroups = groups.filter((group) => group.pinned === 'left').sort(sortPinnedGroups);
  const centerGroups = groups.filter((group) => group.pinned === false);
  const rightGroups = groups.filter((group) => group.pinned === 'right').sort(sortPinnedGroups);
  const flatten = (
    regionGroups: Array<PivotLeafGroup<TRow>>,
    pinned: PivotPinnedSide,
  ): Array<PivotLeafColumn<TRow>> =>
    regionGroups.flatMap((group) =>
      group.leaves.map((leaf) => {
        const resolved: PivotLeafColumn<TRow> = {
          id: leaf.id,
          path: leaf.path,
          measureId: leaf.measureId,
          isTotal: leaf.isTotal,
          size: leaf.size,
          header: leaf.header,
        };
        return pinned === false ? resolved : { ...resolved, pinned };
      }),
    );

  const left = flatten(leftGroups, 'left');
  const center = flatten(centerGroups, false);
  const right = flatten(rightGroups, 'right');
  return { left, center, right, ordered: [...left, ...center, ...right] };
};

export const getPivotNodeLeafIds = (node: PivotColumnNode | PivotLeafColumn): string[] => {
  if ('measureId' in node) return [node.id];
  if (node.leaves) return node.leaves.map((leaf) => leaf.id);
  return node.children?.flatMap(getPivotNodeLeafIds) ?? [];
};
