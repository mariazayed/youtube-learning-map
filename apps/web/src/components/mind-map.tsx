'use client';

import type { MindMapNode } from '@learnmap/contracts';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Panel,
  Position,
  ReactFlow,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react';
import ELK from 'elkjs/lib/elk.bundled.js';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Focus,
  Search,
  X,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ancestorIds,
  formatTimestamp,
  matchingMindMapNodes,
  mindMapEdges,
  visibleMindMapNodes,
} from '@/lib/mind-map-model';
import { directionForLanguage, mapDirectionForOutput } from '@/lib/text-direction';
import { BidiText, TimestampText } from './bidi-text';

const elk = new ELK();
const nodeWidth = 230;
const nodeHeight = 94;

type MapNodeData = {
  item: MindMapNode;
  contentLanguage: 'ar' | 'en';
  selected: boolean;
  matched: boolean;
  collapsed: boolean;
  hasChildren: boolean;
  onOpen: (node: MindMapNode) => void;
  onToggle: (nodeId: string) => void;
};

type MapFlowNode = Node<MapNodeData, 'mind-map-node'>;

function MindMapNodeCard({ data }: NodeProps<MapFlowNode>) {
  const t = useTranslations('MindMap');
  const locale = useLocale();
  const sourcePosition = data.contentLanguage === 'ar' ? Position.Left : Position.Right;
  const targetPosition = data.contentLanguage === 'ar' ? Position.Right : Position.Left;
  return (
    <div
      className={`mapNodeCard mapNode-${data.item.type}${data.selected ? ' selected' : ''}${data.matched ? ' matched' : ''}`}
    >
      <Handle className="mapHandle" type="target" position={targetPosition} />
      <button
        className="mapNodeButton nodrag"
        dir={directionForLanguage(data.contentLanguage)}
        type="button"
        onClick={() => data.onOpen(data.item)}
        onDoubleClick={(event) => {
          event.preventDefault();
          if (data.hasChildren) data.onToggle(data.item.id);
        }}
        aria-label={`${data.item.title}. ${t('openExplanation')}`}
      >
        <span className="mapNodeType" dir={directionForLanguage(locale)}>
          {t(`types.${data.item.type}`)}
        </span>
        <strong>
          <BidiText language={data.contentLanguage}>{data.item.title}</BidiText>
        </strong>
      </button>
      {data.hasChildren && (
        <button
          className="collapseButton nodrag"
          type="button"
          onClick={() => data.onToggle(data.item.id)}
          aria-label={data.collapsed ? t('expandBranch') : t('collapseBranch')}
        >
          {data.collapsed ? (
            data.contentLanguage === 'ar' ? (
              <ChevronLeft size={15} />
            ) : (
              <ChevronRight size={15} />
            )
          ) : (
            <ChevronDown size={15} />
          )}
        </button>
      )}
      <Handle className="mapHandle" type="source" position={sourcePosition} />
    </div>
  );
}

const nodeTypes: NodeTypes = { 'mind-map-node': MindMapNodeCard };

function FitViewButton() {
  const { fitView } = useReactFlow();
  const t = useTranslations('MindMap');
  return (
    <button
      className="mapToolButton"
      type="button"
      onClick={() => void fitView({ padding: 0.16, duration: 300 })}
      title={t('fitTitle')}
    >
      <Focus size={17} />
      <span>{t('fit')}</span>
    </button>
  );
}

export function MindMap({
  nodes,
  contentLanguage,
  onTimestamp,
}: {
  nodes: MindMapNode[];
  contentLanguage: 'ar' | 'en';
  onTimestamp: (seconds: number) => void;
}) {
  const t = useTranslations('MindMap');
  const [flowNodes, setFlowNodes] = useState<MapFlowNode[]>([]);
  const [selected, setSelected] = useState<MindMapNode | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState('');
  const matches = useMemo(() => matchingMindMapNodes(nodes, search), [nodes, search]);
  const matchIds = useMemo(() => new Set(matches.map((node) => node.id)), [matches]);
  const visibleNodes = useMemo(
    () => visibleMindMapNodes(nodes, collapsedIds),
    [collapsedIds, nodes],
  );
  const visibleIds = useMemo(
    () => new Set(visibleNodes.map((node) => node.id)),
    [visibleNodes],
  );
  const edges = useMemo<Edge[]>(
    () =>
      mindMapEdges(nodes)
        .filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target))
        .map((edge) => ({
          ...edge,
          markerEnd: { type: MarkerType.ArrowClosed, color: '#8a94a5' },
          style: { stroke: '#8a94a5', strokeWidth: 1.5 },
        })),
    [nodes, visibleIds],
  );
  const childrenByParent = useMemo(() => {
    const parentIds = new Set<string>();
    nodes.forEach((node) => node.parentId && parentIds.add(node.parentId));
    return parentIds;
  }, [nodes]);

  const openNode = useCallback((node: MindMapNode) => setSelected(node), []);
  const toggleNode = useCallback((nodeId: string) => {
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  const openSearchResult = useCallback(
    (node: MindMapNode) => {
      const ancestors = new Set(ancestorIds(nodes, node.id));
      setCollapsedIds((current) => {
        const next = new Set(current);
        ancestors.forEach((id) => next.delete(id));
        return next;
      });
      setSelected(node);
    },
    [nodes],
  );

  useEffect(() => {
    let active = true;
    void elk
      .layout({
        id: 'root',
        layoutOptions: {
          'elk.algorithm': 'layered',
          'elk.direction': mapDirectionForOutput(contentLanguage),
          'elk.spacing.nodeNode': '50',
          'elk.layered.spacing.nodeNodeBetweenLayers': '100',
        },
        children: visibleNodes.map((node) => ({
          id: node.id,
          width: nodeWidth,
          height: nodeHeight,
        })),
        edges: edges.map((edge) => ({
          id: edge.id,
          sources: [edge.source],
          targets: [edge.target],
        })),
      })
      .then((layout) => {
        if (!active) return;
        const positions = new Map(
          layout.children?.map((child) => [child.id, child]) ?? [],
        );
        setFlowNodes(
          visibleNodes.map((node) => {
            const positioned = positions.get(node.id);
            return {
              id: node.id,
              type: 'mind-map-node',
              position: { x: positioned?.x ?? 0, y: positioned?.y ?? 0 },
              data: {
                item: node,
                contentLanguage,
                selected: selected?.id === node.id,
                matched: matchIds.has(node.id),
                collapsed: collapsedIds.has(node.id),
                hasChildren: childrenByParent.has(node.id),
                onOpen: openNode,
                onToggle: toggleNode,
              },
              draggable: false,
              selectable: false,
              style: { width: nodeWidth, height: nodeHeight },
              ariaLabel: node.title,
            };
          }),
        );
      });
    return () => {
      active = false;
    };
  }, [
    childrenByParent,
    collapsedIds,
    edges,
    contentLanguage,
    matchIds,
    openNode,
    selected?.id,
    toggleNode,
    visibleNodes,
  ]);

  return (
    <div className="mapWorkspace">
      <ReactFlow
        nodes={flowNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.16 }}
        minZoom={0.25}
        maxZoom={1.8}
        nodesDraggable={false}
        nodesConnectable={false}
        aria-label={t('interactiveLabel')}
      >
        <Background color="#d5dbe5" gap={24} size={1} />
        <Controls showInteractive={false} />
        <Panel className="mapToolbar" position="top-left">
          <div className="mapSearch">
            <Search size={17} />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && matches[0]) openSearchResult(matches[0]);
              }}
              placeholder={t('searchPlaceholder')}
              aria-label={t('searchLabel')}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label={t('clearSearch')}
              >
                <X size={15} />
              </button>
            )}
          </div>
          <FitViewButton />
          {search && (
            <div className="searchResults" role="listbox">
              {matches.length === 0 ? (
                <span>{t('noMatches')}</span>
              ) : (
                matches.slice(0, 6).map((node) => (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => openSearchResult(node)}
                    role="option"
                    aria-selected={selected?.id === node.id}
                  >
                    <BidiText language={contentLanguage}>{node.title}</BidiText>
                  </button>
                ))
              )}
            </div>
          )}
        </Panel>
      </ReactFlow>
      {selected && (
        <aside className="nodeDrawer" aria-live="polite">
          <button
            className="closeButton"
            type="button"
            onClick={() => setSelected(null)}
            aria-label={t('closeExplanation')}
          >
            <X size={18} />
          </button>
          <span className={`nodeTypeLabel nodeType-${selected.type}`}>
            {t(`types.${selected.type}`)}
          </span>
          <h3 dir={directionForLanguage(contentLanguage)}>
            <BidiText language={contentLanguage}>{selected.title}</BidiText>
          </h3>
          <p dir={directionForLanguage(contentLanguage)}>
            <BidiText language={contentLanguage}>{selected.explanation}</BidiText>
          </p>
          {!selected.directlySupported && <small>{t('interpreted')}</small>}
          {selected.timestampSeconds !== null && (
            <button
              className="timestampButton"
              type="button"
              onClick={() => onTimestamp(selected.timestampSeconds!)}
            >
              <Clock3 size={16} />
              {t('watchFromLabel')}{' '}
              <TimestampText>{formatTimestamp(selected.timestampSeconds)}</TimestampText>
            </button>
          )}
        </aside>
      )}
    </div>
  );
}
