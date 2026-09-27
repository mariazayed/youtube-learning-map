import type { MindMapNode } from '@learnmap/contracts';
import { describe, expect, it } from 'vitest';
import {
  ancestorIds,
  formatTimestamp,
  matchingMindMapNodes,
  mindMapEdges,
  visibleMindMapNodes,
} from './mind-map-model';

const nodes: MindMapNode[] = [
  {
    id: 'root',
    parentId: null,
    title: 'Course',
    explanation: 'Course overview',
    timestampSeconds: null,
    type: 'root',
    directlySupported: true,
  },
  {
    id: 'topic',
    parentId: 'root',
    title: 'Neural networks',
    explanation: 'A technical topic',
    timestampSeconds: 65,
    type: 'topic',
    directlySupported: true,
  },
  {
    id: 'detail',
    parentId: 'topic',
    title: 'Weights',
    explanation: 'Model parameters',
    timestampSeconds: 3_661,
    type: 'detail',
    directlySupported: true,
  },
];

describe('mind-map model', () => {
  it('converts parent IDs into deterministic edges', () => {
    expect(mindMapEdges(nodes)).toEqual([
      { id: 'root-topic', source: 'root', target: 'topic' },
      { id: 'topic-detail', source: 'topic', target: 'detail' },
    ]);
  });

  it('resolves all ancestors without including the node itself', () => {
    expect(ancestorIds(nodes, 'detail')).toEqual(['topic', 'root']);
  });

  it('hides descendants of collapsed nodes', () => {
    expect(visibleMindMapNodes(nodes, new Set(['topic'])).map((node) => node.id)).toEqual(
      ['root', 'topic'],
    );
  });

  it('searches titles and explanations case-insensitively', () => {
    expect(matchingMindMapNodes(nodes, 'PARAMETERS').map((node) => node.id)).toEqual([
      'detail',
    ]);
    expect(matchingMindMapNodes(nodes, '  ')).toEqual([]);
  });

  it.each([
    [65, '1:05'],
    [3_661, '1:01:01'],
    [-10, '0:00'],
  ])('formats timestamp %s as %s', (seconds, expected) => {
    expect(formatTimestamp(seconds)).toBe(expected);
  });
});
