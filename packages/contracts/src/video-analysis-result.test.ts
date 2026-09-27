import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  ContractValidationError,
  processVideoAnalysisJson,
  parseVideoAnalysisJson,
  validateVideoAnalysisResult,
  videoAnalysisResultSchema,
  type MindMapNode,
  type VideoAnalysisResult,
} from './video-analysis-result';

function node(overrides: Partial<MindMapNode> = {}): MindMapNode {
  return {
    id: 'root',
    parentId: null,
    title: 'Lesson',
    explanation: 'The lesson overview.',
    timestampSeconds: 0,
    type: 'root',
    directlySupported: true,
    ...overrides,
  };
}

const validResult: VideoAnalysisResult = {
  title: 'A useful lesson',
  detectedLanguage: 'en',
  summary: {
    overview: 'An overview.',
    learningObjectives: ['Understand the main concept.'],
    mainIdeas: [
      {
        title: 'Main concept',
        explanation: 'An explanation.',
        timestampSeconds: 10,
      },
    ],
    keyTakeaways: ['One useful takeaway.'],
    glossary: [{ term: 'Concept', definition: 'A general idea.' }],
  },
  mindMap: {
    nodes: [
      node(),
      node({
        id: 'topic-1',
        parentId: 'root',
        title: 'Topic',
        type: 'topic',
        timestampSeconds: 10,
      }),
    ],
  },
};

function withNodes(nodes: MindMapNode[]): VideoAnalysisResult {
  return { ...validResult, mindMap: { nodes } };
}

function expectInvalidSchema(result: VideoAnalysisResult): void {
  expect(() => validateVideoAnalysisResult(result)).toThrowError(
    expect.objectContaining<Partial<ContractValidationError>>({
      code: 'INVALID_SCHEMA',
    }),
  );
}

describe('videoAnalysisResultSchema', () => {
  it('accepts a valid result and trims strings', () => {
    const result = validateVideoAnalysisResult({ ...validResult, title: '  Lesson  ' });
    expect(result.title).toBe('Lesson');
  });

  it('rejects missing and unknown fields', () => {
    expect(() =>
      validateVideoAnalysisResult({ ...validResult, detectedLanguage: undefined }),
    ).toThrow(ContractValidationError);
    expect(() =>
      validateVideoAnalysisResult({ ...validResult, unexpected: true }),
    ).toThrow(ContractValidationError);
  });

  it('can be exported as JSON Schema for structured generation', () => {
    const schema = z.toJSONSchema(videoAnalysisResultSchema);
    expect(schema.type).toBe('object');
    expect(schema.required).toContain('mindMap');
  });
});

describe('parseVideoAnalysisJson', () => {
  it('parses valid JSON through the complete validator', () => {
    expect(parseVideoAnalysisJson(JSON.stringify(validResult))).toEqual(validResult);
  });

  it('classifies malformed JSON without exposing its contents', () => {
    const secret = 'private-provider-output';
    try {
      parseVideoAnalysisJson(`{${secret}`);
      throw new Error('Expected parsing to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(ContractValidationError);
      expect((error as ContractValidationError).code).toBe('INVALID_JSON');
      expect((error as Error).message).not.toContain(secret);
    }
  });
});

describe('mind-map graph invariants', () => {
  it('enforces the 30-node limit', () => {
    const nodes = [node()];
    for (let index = 1; index <= 30; index += 1) {
      nodes.push(
        node({
          id: `topic-${index}`,
          parentId: 'root',
          type: 'topic',
        }),
      );
    }
    expectInvalidSchema(withNodes(nodes));
  });

  it('rejects duplicate IDs', () => {
    expectInvalidSchema(
      withNodes([node(), node({ id: 'root', parentId: 'root', type: 'topic' })]),
    );
  });

  it('requires exactly one root whose parent is null', () => {
    expectInvalidSchema(withNodes([node(), node({ id: 'root-2', type: 'root' })]));
    expectInvalidSchema(withNodes([node({ parentId: 'missing' })]));
  });

  it('rejects unknown parent references', () => {
    expectInvalidSchema(
      withNodes([node(), node({ id: 'topic-1', parentId: 'missing', type: 'topic' })]),
    );
  });

  it('rejects self-references and multi-node cycles', () => {
    expectInvalidSchema(
      withNodes([node(), node({ id: 'loop', parentId: 'loop', type: 'topic' })]),
    );
    expectInvalidSchema(
      withNodes([
        node(),
        node({ id: 'a', parentId: 'b', type: 'topic' }),
        node({ id: 'b', parentId: 'a', type: 'detail' }),
      ]),
    );
  });

  it('rejects disconnected nodes', () => {
    expectInvalidSchema(
      withNodes([node(), node({ id: 'orphan', parentId: null, type: 'topic' })]),
    );
  });

  it('enforces a maximum depth of four levels', () => {
    expectInvalidSchema(
      withNodes([
        node(),
        node({ id: 'level-2', parentId: 'root', type: 'topic' }),
        node({ id: 'level-3', parentId: 'level-2', type: 'detail' }),
        node({ id: 'level-4', parentId: 'level-3', type: 'detail' }),
        node({ id: 'level-5', parentId: 'level-4', type: 'example' }),
      ]),
    );
  });

  it('allows at most six children per parent', () => {
    expectInvalidSchema(
      withNodes([
        node(),
        ...Array.from({ length: 7 }, (_, index) =>
          node({
            id: `child-${index}`,
            parentId: 'root',
            type: 'topic',
          }),
        ),
      ]),
    );
  });
});

describe('timestamp validation', () => {
  it('accepts timestamps exactly at the video duration', () => {
    const result = {
      ...validResult,
      summary: {
        ...validResult.summary,
        mainIdeas: [{ ...validResult.summary.mainIdeas[0], timestampSeconds: 60 }],
      },
      mindMap: {
        nodes: validResult.mindMap.nodes.map((item) => ({
          ...item,
          timestampSeconds: 60,
        })),
      },
    };
    expect(validateVideoAnalysisResult(result, { durationSeconds: 60 })).toEqual(result);
  });

  it('rejects out-of-range summary and map timestamps', () => {
    const result = {
      ...validResult,
      summary: {
        ...validResult.summary,
        mainIdeas: [{ ...validResult.summary.mainIdeas[0], timestampSeconds: 61 }],
      },
      mindMap: {
        nodes: validResult.mindMap.nodes.map((item, index) => ({
          ...item,
          timestampSeconds: index === 0 ? 61 : item.timestampSeconds,
        })),
      },
    };
    try {
      validateVideoAnalysisResult(result, { durationSeconds: 60 });
      throw new Error('Expected timestamp validation to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(ContractValidationError);
      expect((error as ContractValidationError).code).toBe('TIMESTAMP_OUT_OF_RANGE');
      expect((error as ContractValidationError).issues).toHaveLength(2);
    }
  });
});

describe('provider result processing', () => {
  it('nulls invalid approximate timestamps instead of rejecting useful content', () => {
    const input = {
      ...validResult,
      summary: {
        ...validResult.summary,
        mainIdeas: [{ ...validResult.summary.mainIdeas[0], timestampSeconds: -1 }],
      },
      mindMap: {
        nodes: validResult.mindMap.nodes.map((item) => ({
          ...item,
          timestampSeconds: 61,
        })),
      },
    };
    const result = processVideoAnalysisJson(JSON.stringify(input), {
      durationSeconds: 60,
    });
    expect(result.summary.mainIdeas[0]?.timestampSeconds).toBeNull();
    expect(result.mindMap.nodes.every((item) => item.timestampSeconds === null)).toBe(
      true,
    );
  });

  it('normalizes Unicode, whitespace, and line endings', () => {
    const input = {
      ...validResult,
      title: '  Cafe\u0301   lesson ',
      summary: {
        ...validResult.summary,
        overview: ' First   line \r\n\r\n\r\n Second\tline ',
      },
    };
    const result = processVideoAnalysisJson(JSON.stringify(input));
    expect(result.title).toBe('Café lesson');
    expect(result.summary.overview).toBe('First line\n\nSecond line');
  });

  it('still rejects invalid graph structure before normalization', () => {
    expect(() =>
      processVideoAnalysisJson(
        JSON.stringify(
          withNodes([node(), node({ id: 'orphan', parentId: 'missing', type: 'topic' })]),
        ),
      ),
    ).toThrowError(
      expect.objectContaining<Partial<ContractValidationError>>({
        code: 'INVALID_SCHEMA',
      }),
    );
  });
});
