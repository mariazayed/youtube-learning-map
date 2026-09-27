import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { AnalysesController } from './analyses.controller';

const skipMetadata = (target: object, profile: string) =>
  Reflect.getMetadata(`THROTTLER:SKIP${profile}`, target) as boolean | undefined;
const controllerMethod = (name: keyof AnalysesController): object => {
  const value: unknown = Object.getOwnPropertyDescriptor(
    AnalysesController.prototype,
    name,
  )?.value;
  if (typeof value !== 'function') throw new Error(`Missing controller method: ${name}`);
  return value;
};

describe('analysis route limit profiles', () => {
  it('keeps strict and moderate profiles disabled by default', () => {
    expect(skipMetadata(AnalysesController, 'strict')).toBe(true);
    expect(skipMetadata(AnalysesController, 'moderate')).toBe(true);
  });

  it('enables strict limits for create and retry only', () => {
    expect(skipMetadata(controllerMethod('create'), 'strict')).toBe(false);
    expect(skipMetadata(controllerMethod('retry'), 'strict')).toBe(false);
    expect(skipMetadata(controllerMethod('list'), 'strict')).toBeUndefined();
  });

  it('enables the moderate profile for status polling', () => {
    expect(skipMetadata(controllerMethod('status'), 'moderate')).toBe(false);
    expect(skipMetadata(controllerMethod('get'), 'moderate')).toBeUndefined();
  });
});
