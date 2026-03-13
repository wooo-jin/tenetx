/**
 * Knowledge Map Types — 프로젝트 구조 지식 맵 타입
 */

export interface FileEntry {
  path: string;
  type: 'file';
  language: string;
  lines: number;
  exports: string[];
  imports: string[];
}

export interface DirectoryEntry {
  path: string;
  type: 'directory';
  purpose?: string;
  fileCount: number;
  children: string[];
}

export interface ProjectMap {
  version: string;
  generatedAt: string;
  projectRoot: string;
  summary: ProjectSummary;
  directories: DirectoryEntry[];
  files: FileEntry[];
  entryPoints: string[];
  dependencies: ExternalDependency[];
}

export interface ProjectSummary {
  name: string;
  totalFiles: number;
  totalLines: number;
  languages: Record<string, number>;
  framework?: string;
  packageManager?: string;
}

export interface ExternalDependency {
  name: string;
  version: string;
  type: 'production' | 'development';
}

export interface ScanOptions {
  cwd: string;
  /** 최대 스캔 파일 수 (기본: 1000) */
  maxFiles?: number;
  /** 추가 무시 패턴 */
  ignorePatterns?: string[];
  /** 출력 형식 */
  format?: 'json' | 'markdown';
}
