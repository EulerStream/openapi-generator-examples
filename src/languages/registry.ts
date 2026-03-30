import type { LanguageAdapter } from './types.js';

const byId = new Map<string, LanguageAdapter>();
const byGenerator = new Map<string, LanguageAdapter>();

export function registerLanguage(adapter: LanguageAdapter): void {
  byId.set(adapter.id, adapter);
  for (const gen of adapter.generatorNames) {
    byGenerator.set(gen, adapter);
  }
}

export function getLanguageByGenerator(generatorName: string): LanguageAdapter | undefined {
  return byGenerator.get(generatorName);
}

export function getLanguageById(id: string): LanguageAdapter | undefined {
  return byId.get(id);
}

export function getAllLanguages(): LanguageAdapter[] {
  return [...byId.values()];
}

export function getRegisteredGeneratorNames(): string[] {
  return [...byGenerator.keys()];
}
