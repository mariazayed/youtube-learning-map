import { z } from 'zod';

export const analysisLanguageSchema = z.enum(['ar', 'en']);
export type AnalysisLanguage = z.infer<typeof analysisLanguageSchema>;

export const detectedLanguageSchema = z.enum(['ar', 'en', 'other']);
export type DetectedLanguage = z.infer<typeof detectedLanguageSchema>;

const requiredText = (maximum: number) => z.string().trim().min(1).max(maximum);
const timestampSchema = z.number().int().nonnegative().nullable();
const providerTimestampSchema = z.number().int().nullable();

const createMainIdeaSchema = (timestamp: z.ZodType<number | null>) =>
  z
    .object({
      title: requiredText(120),
      explanation: requiredText(1_000),
      timestampSeconds: timestamp,
    })
    .strict();

export const mainIdeaSchema = createMainIdeaSchema(timestampSchema);
export type MainIdea = z.infer<typeof mainIdeaSchema>;

const createMindMapNodeSchema = (timestamp: z.ZodType<number | null>) =>
  z
    .object({
      id: requiredText(50),
      parentId: requiredText(50).nullable(),
      title: requiredText(100),
      explanation: requiredText(700),
      timestampSeconds: timestamp,
      type: z.enum(['root', 'topic', 'detail', 'example']),
      directlySupported: z.boolean(),
    })
    .strict();

export const mindMapNodeSchema = createMindMapNodeSchema(timestampSchema);
export type MindMapNode = z.infer<typeof mindMapNodeSchema>;

function validateGraph(nodes: MindMapNode[], context: z.RefinementCtx): void {
  const indexById = new Map<string, number>();
  let duplicateIds = false;

  nodes.forEach((node, index) => {
    if (indexById.has(node.id)) {
      duplicateIds = true;
      context.addIssue({
        code: 'custom',
        path: ['nodes', index, 'id'],
        message: `Duplicate node ID: ${node.id}.`,
      });
    } else {
      indexById.set(node.id, index);
    }
  });

  const roots = nodes.filter((node) => node.type === 'root');
  if (roots.length !== 1) {
    context.addIssue({
      code: 'custom',
      path: ['nodes'],
      message: 'The mind map must contain exactly one root node.',
    });
  }

  const root = roots.length === 1 ? roots[0] : undefined;
  nodes.forEach((node, index) => {
    if (node.type === 'root' && node.parentId !== null) {
      context.addIssue({
        code: 'custom',
        path: ['nodes', index, 'parentId'],
        message: 'The root node must have a null parentId.',
      });
    }
    if (node.type !== 'root' && node.parentId === null) {
      context.addIssue({
        code: 'custom',
        path: ['nodes', index, 'parentId'],
        message: `Node ${node.id} is disconnected from the root.`,
      });
    }
    if (node.parentId === node.id) {
      context.addIssue({
        code: 'custom',
        path: ['nodes', index, 'parentId'],
        message: `Node ${node.id} cannot be its own parent.`,
      });
    } else if (node.parentId !== null && !indexById.has(node.parentId)) {
      context.addIssue({
        code: 'custom',
        path: ['nodes', index, 'parentId'],
        message: `Node ${node.id} references unknown parent ${node.parentId}.`,
      });
    }
  });

  const childrenPerParent = new Map<string, number>();
  nodes.forEach((node, index) => {
    if (node.parentId === null) return;
    const count = (childrenPerParent.get(node.parentId) ?? 0) + 1;
    childrenPerParent.set(node.parentId, count);
    if (count === 7) {
      context.addIssue({
        code: 'custom',
        path: ['nodes', index, 'parentId'],
        message: `Node ${node.parentId} cannot have more than six children.`,
      });
    }
  });

  if (!root || duplicateIds) return;

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const resolvedDepth = new Map<string, number>();
  const cycleIds = new Set<string>();
  const disconnectedIds = new Set<string>();

  const resolveDepth = (nodeId: string, visiting = new Set<string>()): number | null => {
    const cached = resolvedDepth.get(nodeId);
    if (cached !== undefined) return cached;
    if (visiting.has(nodeId)) {
      cycleIds.add(nodeId);
      return null;
    }

    const node = nodeById.get(nodeId);
    if (!node) return null;
    if (node.id === root.id) {
      resolvedDepth.set(nodeId, 1);
      return 1;
    }
    if (node.parentId === null || !nodeById.has(node.parentId)) {
      disconnectedIds.add(nodeId);
      return null;
    }

    const nextVisiting = new Set(visiting);
    nextVisiting.add(nodeId);
    const parentDepth = resolveDepth(node.parentId, nextVisiting);
    if (parentDepth === null) {
      if (!cycleIds.has(nodeId)) disconnectedIds.add(nodeId);
      return null;
    }
    const depth = parentDepth + 1;
    resolvedDepth.set(nodeId, depth);
    return depth;
  };

  nodes.forEach((node, index) => {
    const depth = resolveDepth(node.id);
    if (depth !== null && depth > 4) {
      context.addIssue({
        code: 'custom',
        path: ['nodes', index],
        message: `Node ${node.id} exceeds the maximum depth of four levels.`,
      });
    }
  });

  if (cycleIds.size > 0) {
    context.addIssue({
      code: 'custom',
      path: ['nodes'],
      message: 'The mind map contains a cycle.',
    });
  }
  if (disconnectedIds.size > 0) {
    context.addIssue({
      code: 'custom',
      path: ['nodes'],
      message: 'Every mind-map node must be connected to the root.',
    });
  }
}

const createMindMapSchema = (nodeSchema: z.ZodType<MindMapNode>) =>
  z
    .object({
      nodes: z.array(nodeSchema).min(1).max(30),
    })
    .strict()
    .superRefine(({ nodes }, context) => validateGraph(nodes, context));

export const mindMapSchema = createMindMapSchema(mindMapNodeSchema);
export type MindMap = z.infer<typeof mindMapSchema>;

const createAnalysisSummarySchema = (mainIdea: z.ZodType<MainIdea>) =>
  z
    .object({
      overview: requiredText(3_000),
      learningObjectives: z.array(requiredText(300)).max(8),
      mainIdeas: z.array(mainIdea).max(12),
      keyTakeaways: z.array(requiredText(400)).max(12),
      glossary: z
        .array(
          z
            .object({
              term: requiredText(100),
              definition: requiredText(500),
            })
            .strict(),
        )
        .max(15),
    })
    .strict();

export const analysisSummarySchema = createAnalysisSummarySchema(mainIdeaSchema);
export type AnalysisSummary = z.infer<typeof analysisSummarySchema>;

const createVideoAnalysisResultSchema = (
  summary: z.ZodType<AnalysisSummary>,
  mindMap: z.ZodType<MindMap>,
) =>
  z
    .object({
      title: requiredText(250),
      detectedLanguage: detectedLanguageSchema,
      summary,
      mindMap,
    })
    .strict();

export const videoAnalysisResultSchema = createVideoAnalysisResultSchema(
  analysisSummarySchema,
  mindMapSchema,
);
export type VideoAnalysisResult = z.infer<typeof videoAnalysisResultSchema>;

const providerVideoAnalysisResultSchema = createVideoAnalysisResultSchema(
  createAnalysisSummarySchema(createMainIdeaSchema(providerTimestampSchema)),
  createMindMapSchema(createMindMapNodeSchema(providerTimestampSchema)),
);

export type ContractValidationErrorCode =
  'INVALID_JSON' | 'INVALID_SCHEMA' | 'TIMESTAMP_OUT_OF_RANGE';

export class ContractValidationError extends Error {
  constructor(
    readonly code: ContractValidationErrorCode,
    message: string,
    readonly issues: readonly string[] = [],
  ) {
    super(message);
    this.name = 'ContractValidationError';
  }
}

export type AnalysisValidationOptions = {
  durationSeconds?: number | null | undefined;
};

function formatIssue(issue: z.core.$ZodIssue): string {
  const path = issue.path.length > 0 ? issue.path.join('.') : 'result';
  return `${path}: ${issue.message}`;
}

function assertTimestampRange(
  result: VideoAnalysisResult,
  durationSeconds?: number | null,
): void {
  if (durationSeconds === undefined || durationSeconds === null) return;
  if (!Number.isInteger(durationSeconds) || durationSeconds < 0) {
    throw new TypeError('durationSeconds must be a nonnegative integer.');
  }

  const issues: string[] = [];
  result.summary.mainIdeas.forEach((idea, index) => {
    if (idea.timestampSeconds !== null && idea.timestampSeconds > durationSeconds) {
      issues.push(
        `summary.mainIdeas.${index}.timestampSeconds exceeds video duration ${durationSeconds}.`,
      );
    }
  });
  result.mindMap.nodes.forEach((node, index) => {
    if (node.timestampSeconds !== null && node.timestampSeconds > durationSeconds) {
      issues.push(
        `mindMap.nodes.${index}.timestampSeconds exceeds video duration ${durationSeconds}.`,
      );
    }
  });

  if (issues.length > 0) {
    throw new ContractValidationError(
      'TIMESTAMP_OUT_OF_RANGE',
      'The analysis contains a timestamp outside the video duration.',
      issues,
    );
  }
}

export function validateVideoAnalysisResult(
  input: unknown,
  options: AnalysisValidationOptions = {},
): VideoAnalysisResult {
  const parsed = videoAnalysisResultSchema.safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(formatIssue);
    throw new ContractValidationError(
      'INVALID_SCHEMA',
      'The analysis does not match the required data contract.',
      issues,
    );
  }
  assertTimestampRange(parsed.data, options.durationSeconds);
  return parsed.data;
}

export function parseVideoAnalysisJson(
  json: string,
  options: AnalysisValidationOptions = {},
): VideoAnalysisResult {
  let input: unknown;
  try {
    input = JSON.parse(json) as unknown;
  } catch {
    throw new ContractValidationError(
      'INVALID_JSON',
      'The analysis provider returned invalid JSON.',
    );
  }
  return validateVideoAnalysisResult(input, options);
}

function normalizeInlineText(value: string): string {
  return value.normalize('NFC').replace(/\s+/gu, ' ').trim();
}

function normalizeBlockText(value: string): string {
  return value
    .normalize('NFC')
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .map((line) => line.replace(/[\t ]+/gu, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

function normalizeTimestamp(
  timestamp: number | null,
  durationSeconds?: number | null,
): number | null {
  if (timestamp === null) return null;
  if (timestamp < 0) return null;
  if (
    durationSeconds !== undefined &&
    durationSeconds !== null &&
    timestamp > durationSeconds
  ) {
    return null;
  }
  return timestamp;
}

/**
 * Converts structurally valid provider output into the canonical persisted representation.
 * Out-of-range model timestamps are intentionally discarded because they are approximate hints.
 */
export function normalizeVideoAnalysisResult(
  input: VideoAnalysisResult,
  options: AnalysisValidationOptions = {},
): VideoAnalysisResult {
  const durationSeconds = options.durationSeconds;
  if (
    durationSeconds !== undefined &&
    durationSeconds !== null &&
    (!Number.isInteger(durationSeconds) || durationSeconds < 0)
  ) {
    throw new TypeError('durationSeconds must be a nonnegative integer.');
  }

  return {
    title: normalizeInlineText(input.title),
    detectedLanguage: input.detectedLanguage,
    summary: {
      overview: normalizeBlockText(input.summary.overview),
      learningObjectives: input.summary.learningObjectives.map(normalizeInlineText),
      mainIdeas: input.summary.mainIdeas.map((idea) => ({
        title: normalizeInlineText(idea.title),
        explanation: normalizeBlockText(idea.explanation),
        timestampSeconds: normalizeTimestamp(idea.timestampSeconds, durationSeconds),
      })),
      keyTakeaways: input.summary.keyTakeaways.map(normalizeInlineText),
      glossary: input.summary.glossary.map((entry) => ({
        term: normalizeInlineText(entry.term),
        definition: normalizeBlockText(entry.definition),
      })),
    },
    mindMap: {
      nodes: input.mindMap.nodes.map((node) => ({
        ...node,
        id: normalizeInlineText(node.id),
        parentId: node.parentId === null ? null : normalizeInlineText(node.parentId),
        title: normalizeInlineText(node.title),
        explanation: normalizeBlockText(node.explanation),
        timestampSeconds: normalizeTimestamp(node.timestampSeconds, durationSeconds),
      })),
    },
  };
}

/**
 * Full provider boundary: JSON syntax -> Zod shape/graph -> timestamp cleanup -> text
 * normalization -> final canonical validation.
 */
export function processVideoAnalysisJson(
  json: string,
  options: AnalysisValidationOptions = {},
): VideoAnalysisResult {
  let input: unknown;
  try {
    input = JSON.parse(json) as unknown;
  } catch {
    throw new ContractValidationError(
      'INVALID_JSON',
      'The analysis provider returned invalid JSON.',
    );
  }

  const parsed = providerVideoAnalysisResultSchema.safeParse(input);
  if (!parsed.success) {
    throw new ContractValidationError(
      'INVALID_SCHEMA',
      'The analysis does not match the required data contract.',
      parsed.error.issues.map(formatIssue),
    );
  }

  const normalized = normalizeVideoAnalysisResult(parsed.data, options);
  return validateVideoAnalysisResult(normalized, options);
}

/** @deprecated Use validateVideoAnalysisResult for complete contract validation. */
export function validateMindMap(
  result: VideoAnalysisResult,
  durationSeconds?: number | null,
): VideoAnalysisResult {
  return validateVideoAnalysisResult(result, { durationSeconds });
}
