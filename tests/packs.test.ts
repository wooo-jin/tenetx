import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Philosophy } from '../src/core/types.js';

const PACKS_DIR = path.resolve(__dirname, '..', 'packs');

const PACK_FILES = ['frontend.json', 'backend.json', 'devops.json', 'security.json', 'data.json'];

describe('philosophy packs', () => {
  it('모든 팩 파일이 존재한다', () => {
    for (const file of PACK_FILES) {
      const fullPath = path.join(PACKS_DIR, file);
      expect(fs.existsSync(fullPath), `${file} should exist`).toBe(true);
    }
  });

  for (const file of PACK_FILES) {
    describe(file, () => {
      let pack: Philosophy;

      it('유효한 JSON으로 파싱된다', () => {
        const content = fs.readFileSync(path.join(PACKS_DIR, file), 'utf-8');
        pack = JSON.parse(content);
        expect(pack).toBeDefined();
      });

      it('필수 필드(name, version, principles)가 있다', () => {
        const content = fs.readFileSync(path.join(PACKS_DIR, file), 'utf-8');
        pack = JSON.parse(content);
        expect(pack.name).toBeDefined();
        expect(typeof pack.name).toBe('string');
        expect(pack.version).toBeDefined();
        expect(pack.principles).toBeDefined();
        expect(typeof pack.principles).toBe('object');
      });

      it('3~5개의 원칙을 가진다', () => {
        const content = fs.readFileSync(path.join(PACKS_DIR, file), 'utf-8');
        pack = JSON.parse(content);
        const count = Object.keys(pack.principles).length;
        expect(count).toBeGreaterThanOrEqual(3);
        expect(count).toBeLessThanOrEqual(5);
      });

      it('각 원칙에 belief와 generates가 있다', () => {
        const content = fs.readFileSync(path.join(PACKS_DIR, file), 'utf-8');
        pack = JSON.parse(content);
        for (const [name, principle] of Object.entries(pack.principles)) {
          expect(principle.belief, `${name} should have belief`).toBeDefined();
          expect(typeof principle.belief).toBe('string');
          expect(Array.isArray(principle.generates), `${name} should have generates array`).toBe(true);
          expect(principle.generates.length, `${name} generates should not be empty`).toBeGreaterThan(0);
        }
      });
    });
  }
});
