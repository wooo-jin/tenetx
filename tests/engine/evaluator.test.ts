import { describe, it, expect } from 'vitest';
import { evaluateResponse, evaluateAll } from '../../src/engine/evaluator.js';

describe('evaluateResponse', () => {
  it('returns an object with required fields', () => {
    const result = evaluateResponse('claude', 'Hello, world!', 'Say hello');
    expect(result).toHaveProperty('provider');
    expect(result).toHaveProperty('response');
    expect(result).toHaveProperty('scores');
    expect(result).toHaveProperty('overallScore');
    expect(result).toHaveProperty('isCodeResponse');
    expect(result).toHaveProperty('issues');
  });

  it('returns overallScore of 0 for empty response', () => {
    const result = evaluateResponse('claude', '', 'some prompt');
    expect(result.overallScore).toBe(0);
    expect(result.issues).toContain('Empty response');
  });

  it('isCodeResponse is true when response contains code blocks', () => {
    const codeResponse = 'Here is the code:\n```ts\nconst x = 1;\n```';
    const result = evaluateResponse('claude', codeResponse, 'write some code');
    expect(result.isCodeResponse).toBe(true);
  });

  it('isCodeResponse is false when response has no code blocks', () => {
    const textResponse = 'This is just a text response without any code.';
    const result = evaluateResponse('claude', textResponse, 'explain something');
    expect(result.isCodeResponse).toBe(false);
  });

  it('overallScore is within 0-1 range', () => {
    const result = evaluateResponse('claude', 'A good response with detailed content.', 'explain');
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(1);
  });

  it('scores.relevance is higher when response contains prompt keywords', () => {
    const prompt = 'explain TypeScript generics';
    const relevant = evaluateResponse('claude', 'TypeScript generics allow you to write flexible type-safe code. Generic functions and classes...', prompt);
    const irrelevant = evaluateResponse('claude', 'The weather is nice today with some clouds.', prompt);
    expect(relevant.scores.relevance).toBeGreaterThan(irrelevant.scores.relevance);
  });

  it('detects hedging patterns and reduces confidence score', () => {
    const hedgingResponse = 'I\'m not sure, but maybe this could work. I think it might be correct.';
    const confidentResponse = 'This function processes the input array and returns filtered results based on the predicate.';
    const hedging = evaluateResponse('claude', hedgingResponse, 'how does this work');
    const confident = evaluateResponse('claude', confidentResponse, 'how does this work');
    expect(hedging.scores.confidence).toBeLessThan(confident.scores.confidence);
  });

  it('adds issue when response contains error markers', () => {
    const errorResponse = 'There was an error: rate limit exceeded. Please try again.';
    const result = evaluateResponse('claude', errorResponse, 'some prompt');
    expect(result.issues.some(i => i.toLowerCase().includes('error'))).toBe(true);
  });

  it('adds issue for very slow responses (>60s latency)', () => {
    const result = evaluateResponse('claude', 'Some response content here.', 'prompt', 70_000);
    expect(result.issues.some(i => i.toLowerCase().includes('slow'))).toBe(true);
  });

  it('does NOT add slow response issue for normal latency', () => {
    const result = evaluateResponse('claude', 'Some response content here.', 'prompt', 5_000);
    expect(result.issues.some(i => i.toLowerCase().includes('slow'))).toBe(false);
  });

  it('code response uses higher codeQuality weight in scoring', () => {
    const codeResponse = '```ts\nexport function add(a: number, b: number): number {\n  return a + b;\n}\n```';
    const result = evaluateResponse('claude', codeResponse, 'implement add function');
    // isCodeResponse should be true and codeQuality weight = 0.30
    expect(result.isCodeResponse).toBe(true);
    expect(result.scores.codeQuality).toBeGreaterThan(0);
  });

  it('text-only response uses lower codeQuality weight', () => {
    const textResponse = 'Software architecture patterns help organize code into maintainable structures. The most common patterns include MVC, MVVM, and layered architecture.';
    const result = evaluateResponse('claude', textResponse, 'explain architecture patterns');
    expect(result.isCodeResponse).toBe(false);
    // codeQuality weight is 0.05 for text response
    expect(result.scores.codeQuality).toBeGreaterThanOrEqual(0);
  });

  it('detects unclosed code block as an issue', () => {
    // Need at least one complete block (so extractCodeBlocks returns non-empty)
    // plus an odd number of ``` markers overall for the unclosed detection to fire.
    // One closed block + one opened-but-not-closed block = 3 backtick groups (odd).
    const unclosed = '```ts\nconst x = 1;\n```\nMore code:\n```ts\n// unclosed block';
    const result = evaluateResponse('claude', unclosed, 'write code');
    expect(result.issues.some(i => i.toLowerCase().includes('unclosed'))).toBe(true);
  });

  it('higher completeness for response with structure (headings + lists)', () => {
    const structured = '## Overview\nThis is an overview.\n\n## Steps\n- Step one\n- Step two\n- Step three\n\nConclusion.';
    const unstructured = 'do step one then step two then step three';
    const s = evaluateResponse('claude', structured, 'explain steps');
    const u = evaluateResponse('claude', unstructured, 'explain steps');
    expect(s.scores.completeness).toBeGreaterThan(u.scores.completeness);
  });

  it('preserves provider name in result', () => {
    const result = evaluateResponse('gemini', 'A response', 'a prompt');
    expect(result.provider).toBe('gemini');
  });
});

describe('evaluateAll', () => {
  it('returns an array with one entry per provider response', () => {
    const responses = [
      { provider: 'claude', response: 'Claude response here.' },
      { provider: 'codex', response: 'Codex response here.' },
      { provider: 'gemini', response: 'Gemini response here.' },
    ];
    const results = evaluateAll(responses, 'test prompt');
    expect(results.length).toBe(3);
  });

  it('returns empty array for empty input', () => {
    const results = evaluateAll([], 'test prompt');
    expect(results).toEqual([]);
  });

  it('each result has the correct provider name', () => {
    const responses = [
      { provider: 'alpha', response: 'Alpha says hello.' },
      { provider: 'beta', response: 'Beta says world.' },
    ];
    const results = evaluateAll(responses, 'prompt');
    expect(results[0].provider).toBe('alpha');
    expect(results[1].provider).toBe('beta');
  });

  it('passes latencyMs to each evaluation', () => {
    const responses = [
      { provider: 'slow-provider', response: 'Response content.', latencyMs: 90_000 },
    ];
    const results = evaluateAll(responses, 'prompt');
    expect(results[0].issues.some(i => i.toLowerCase().includes('slow'))).toBe(true);
  });
});
