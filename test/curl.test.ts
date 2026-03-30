import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { NormalizedParam, NormalizedRequestBody } from '../src/spec/types.js';

// Side-effect import to register the adapter
import '../src/languages/curl.js';
import { getLanguageById } from '../src/languages/registry.js';
import { generate } from '../src/generator/pipeline.js';
import { loadConfig, loadConfigOrDefault } from '../src/config/loader.js';
import type { LanguageAdapter } from '../src/languages/types.js';

const PETSTORE = path.resolve(__dirname, 'fixtures', 'petstore.json');

describe('curl adapter', () => {
  let adapter: LanguageAdapter;

  beforeAll(() => {
    const a = getLanguageById('curl');
    expect(a).toBeDefined();
    adapter = a!;
  });

  describe('toMethodName', () => {
    it('converts camelCase to kebab-case', () => {
      expect(adapter.toMethodName('listPets')).toBe('list-pets');
    });

    it('converts PascalCase to kebab-case', () => {
      expect(adapter.toMethodName('GetPetById')).toBe('get-pet-by-id');
    });

    it('keeps already kebab-case as-is', () => {
      expect(adapter.toMethodName('list-pets')).toBe('list-pets');
    });
  });

  describe('toFileName', () => {
    it('returns kebab-case', () => {
      expect(adapter.toFileName('listPets')).toBe('list-pets');
      expect(adapter.toFileName('GetPetById')).toBe('get-pet-by-id');
    });
  });

  describe('toTagDirectory', () => {
    it('converts to kebab-case lowercase', () => {
      expect(adapter.toTagDirectory('Pets')).toBe('pets');
      expect(adapter.toTagDirectory('TikTok LIVE')).toBe('tik-tok-live');
      expect(adapter.toTagDirectory('MyTag')).toBe('my-tag');
    });
  });

  describe('toApiClassName', () => {
    it('returns tag as-is', () => {
      expect(adapter.toApiClassName('Pets')).toBe('Pets');
      expect(adapter.toApiClassName('Store')).toBe('Store');
      expect(adapter.toApiClassName('TikTok LIVE')).toBe('TikTok LIVE');
    });
  });

  describe('mapType', () => {
    it('returns string as-is', () => {
      expect(adapter.mapType({ type: 'string' })).toBe('string');
    });

    it('returns integer as-is', () => {
      expect(adapter.mapType({ type: 'integer' })).toBe('integer');
    });

    it('returns number as-is', () => {
      expect(adapter.mapType({ type: 'number' })).toBe('number');
    });

    it('returns boolean as-is', () => {
      expect(adapter.mapType({ type: 'boolean' })).toBe('boolean');
    });

    it('returns array as-is', () => {
      expect(adapter.mapType({ type: 'array' })).toBe('array');
    });

    it('returns object as-is', () => {
      expect(adapter.mapType({ type: 'object' })).toBe('object');
    });

    it('falls back to string for empty type', () => {
      expect(adapter.mapType({ type: '' })).toBe('string');
    });
  });

  describe('exampleValue', () => {
    it('uses param.example if present', () => {
      const param: NormalizedParam = {
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'string' },
        example: 'abc123',
      };
      expect(adapter.exampleValue(param)).toBe('abc123');
    });

    it('uses param.example for numbers', () => {
      const param: NormalizedParam = {
        name: 'limit',
        in: 'query',
        required: false,
        schema: { type: 'integer' },
        example: 42,
      };
      expect(adapter.exampleValue(param)).toBe('42');
    });

    it('uses enum first value (no quotes)', () => {
      const param: NormalizedParam = {
        name: 'status',
        in: 'query',
        required: true,
        schema: { type: 'string', enum: ['available', 'pending', 'sold'] },
      };
      expect(adapter.exampleValue(param)).toBe('available');
    });

    it('returns 2024-01-01 for date-time type', () => {
      const param: NormalizedParam = {
        name: 'from',
        in: 'query',
        required: true,
        schema: { type: 'string', format: 'date-time' },
      };
      expect(adapter.exampleValue(param)).toBe('2024-01-01');
    });

    it('returns 2024-01-01 for date type', () => {
      const param: NormalizedParam = {
        name: 'from',
        in: 'query',
        required: true,
        schema: { type: 'string', format: 'date' },
      };
      expect(adapter.exampleValue(param)).toBe('2024-01-01');
    });

    it('uses schema default', () => {
      const param: NormalizedParam = {
        name: 'limit',
        in: 'query',
        required: false,
        schema: { type: 'integer', default: 20 },
      };
      expect(adapter.exampleValue(param)).toBe('20');
    });

    it('falls back by type (string, no quotes)', () => {
      const param: NormalizedParam = {
        name: 'name',
        in: 'query',
        required: true,
        schema: { type: 'string' },
      };
      expect(adapter.exampleValue(param)).toBe('name_value');
    });

    it('falls back by type (integer)', () => {
      const param: NormalizedParam = {
        name: 'count',
        in: 'query',
        required: false,
        schema: { type: 'integer' },
      };
      expect(adapter.exampleValue(param)).toBe('0');
    });

    it('falls back by type (boolean)', () => {
      const param: NormalizedParam = {
        name: 'active',
        in: 'query',
        required: false,
        schema: { type: 'boolean' },
      };
      expect(adapter.exampleValue(param)).toBe('true');
    });
  });

  describe('buildParamDeclaration', () => {
    it('returns comment with name and value', () => {
      const param: NormalizedParam = {
        name: 'petId',
        in: 'path',
        required: true,
        schema: { type: 'string' },
      };
      // Reset state by calling buildMethodCall
      adapter.buildMethodCall({ clientVar: '', apiProperty: '', methodName: '', args: '', apiAccessPattern: '' });
      const result = adapter.buildParamDeclaration(param);
      expect(result).toBe('# petId = petId_value');
      // Clean up
      adapter.buildMethodCall({ clientVar: '', apiProperty: '', methodName: '', args: '', apiAccessPattern: '' });
    });

    it('uses valueOverride when provided', () => {
      const param: NormalizedParam = {
        name: 'petId',
        in: 'path',
        required: true,
        schema: { type: 'string' },
      };
      adapter.buildMethodCall({ clientVar: '', apiProperty: '', methodName: '', args: '', apiAccessPattern: '' });
      const result = adapter.buildParamDeclaration(param, '$petId');
      expect(result).toBe('# petId = $petId');
      adapter.buildMethodCall({ clientVar: '', apiProperty: '', methodName: '', args: '', apiAccessPattern: '' });
    });
  });

  describe('buildMethodCall', () => {
    it('builds query string from stored query params', () => {
      const param: NormalizedParam = {
        name: 'status',
        in: 'query',
        required: true,
        schema: { type: 'string', enum: ['available', 'pending', 'sold'] },
      };
      adapter.buildParamDeclaration(param);
      const result = adapter.buildMethodCall({
        clientVar: '',
        apiProperty: '',
        methodName: '',
        args: '',
        apiAccessPattern: '',
      });
      expect(result).toBe('?status=available');
    });

    it('returns empty string when no query params', () => {
      const param: NormalizedParam = {
        name: 'petId',
        in: 'path',
        required: true,
        schema: { type: 'string' },
      };
      adapter.buildParamDeclaration(param);
      const result = adapter.buildMethodCall({
        clientVar: '',
        apiProperty: '',
        methodName: '',
        args: '',
        apiAccessPattern: '',
      });
      expect(result).toBe('');
    });

    it('joins multiple query params with &', () => {
      const param1: NormalizedParam = {
        name: 'limit',
        in: 'query',
        required: true,
        schema: { type: 'integer' },
      };
      const param2: NormalizedParam = {
        name: 'offset',
        in: 'query',
        required: true,
        schema: { type: 'integer' },
      };
      adapter.buildParamDeclaration(param1);
      adapter.buildParamDeclaration(param2);
      const result = adapter.buildMethodCall({
        clientVar: '',
        apiProperty: '',
        methodName: '',
        args: '',
        apiAccessPattern: '',
      });
      expect(result).toBe('?limit=0&offset=0');
    });

    it('resets state after consuming params', () => {
      const param: NormalizedParam = {
        name: 'status',
        in: 'query',
        required: true,
        schema: { type: 'string', enum: ['available'] },
      };
      adapter.buildParamDeclaration(param);
      adapter.buildMethodCall({ clientVar: '', apiProperty: '', methodName: '', args: '', apiAccessPattern: '' });
      // Second call should have no params
      const result = adapter.buildMethodCall({
        clientVar: '',
        apiProperty: '',
        methodName: '',
        args: '',
        apiAccessPattern: '',
      });
      expect(result).toBe('');
    });
  });

  describe('buildBodyConstruction', () => {
    it('generates -d with JSON body for required properties', () => {
      const body: NormalizedRequestBody = {
        required: true,
        schemaName: 'CreatePetRequest',
        schema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            tag: { type: 'string' },
          },
          required: ['name'],
        },
      };
      const result = adapter.buildBodyConstruction(body);
      expect(result).toContain("-d '{");
      expect(result).toContain('"name": "name_value"');
      expect(result).not.toContain('"tag"');
      expect(result).toContain("}'");
    });

    it('generates proper JSON with numbers and booleans unquoted', () => {
      const body: NormalizedRequestBody = {
        required: true,
        schema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            count: { type: 'integer' },
            active: { type: 'boolean' },
          },
          required: ['name', 'count', 'active'],
        },
      };
      const result = adapter.buildBodyConstruction(body);
      expect(result).toContain('"name": "name_value"');
      expect(result).toContain('"count": 0');
      expect(result).toContain('"active": true');
    });

    it('generates nested objects', () => {
      const body: NormalizedRequestBody = {
        required: true,
        schema: {
          type: 'object',
          properties: {
            url: {
              type: 'object',
              properties: {
                host: { type: 'string' },
                port: { type: 'integer' },
              },
              required: ['host', 'port'],
            },
            name: { type: 'string' },
          },
          required: ['url', 'name'],
        },
      };
      const result = adapter.buildBodyConstruction(body);
      expect(result).toContain('"url": {');
      expect(result).toContain('"host": "host_value"');
      expect(result).toContain('"port": 0');
      expect(result).toContain('"name": "name_value"');
    });

    it('generates empty object for object without properties', () => {
      const body: NormalizedRequestBody = {
        required: true,
        schema: {
          type: 'object',
          properties: {
            metadata: { type: 'object' },
          },
          required: ['metadata'],
        },
      };
      const result = adapter.buildBodyConstruction(body);
      expect(result).toContain('"metadata": {}');
    });

    it('generates array example values', () => {
      const body: NormalizedRequestBody = {
        required: true,
        schema: {
          type: 'object',
          properties: {
            tags: { type: 'array', items: { type: 'string' } },
            ids: { type: 'array', items: { type: 'integer' } },
          },
          required: ['tags', 'ids'],
        },
      };
      const result = adapter.buildBodyConstruction(body);
      expect(result).toContain('"tags": ["item_value"]');
      expect(result).toContain('"ids": [0]');
    });

    it('wraps string overrides in quotes, leaves others raw', () => {
      const body: NormalizedRequestBody = {
        required: true,
        schema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            count: { type: 'integer' },
            tag: { type: 'string' },
          },
          required: ['name', 'count', 'tag'],
        },
      };
      const result = adapter.buildBodyConstruction(body, { name: '$name', count: '$count' });
      expect(result).toContain('"name": "$name"');
      expect(result).toContain('"count": $count');
      expect(result).toContain('"tag": "tag_value"');
    });
  });

  describe('buildResultLine', () => {
    it('always returns empty string', () => {
      expect(adapter.buildResultLine('anything', 'Pet')).toBe('');
      expect(adapter.buildResultLine('anything', undefined)).toBe('');
    });
  });

  describe('end-to-end generate (default pattern)', () => {
    let outputDir: string;

    beforeAll(() => {
      outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oage-curl-default-'));
      const config = loadConfigOrDefault();

      generate({
        inputSpec: PETSTORE,
        generator: 'curl',
        outputDir,
        config,
      });
    });

    it('writes files for all operations with kebab-case names', () => {
      const petsDir = path.join(outputDir, 'usage', 'curl', 'pets');
      const storeDir = path.join(outputDir, 'usage', 'curl', 'store');

      expect(fs.existsSync(path.join(petsDir, 'list-pets.md'))).toBe(true);
      expect(fs.existsSync(path.join(petsDir, 'create-pet.md'))).toBe(true);
      expect(fs.existsSync(path.join(petsDir, 'get-pet-by-id.md'))).toBe(true);
      expect(fs.existsSync(path.join(petsDir, 'update-pet.md'))).toBe(true);
      expect(fs.existsSync(path.join(petsDir, 'delete-pet.md'))).toBe(true);
      expect(fs.existsSync(path.join(petsDir, 'find-pets-by-status.md'))).toBe(true);
      expect(fs.existsSync(path.join(storeDir, 'get-inventory.md'))).toBe(true);
    });

    it('generates curl GET command for listPets (no required params)', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'curl', 'pets', 'list-pets.md'),
        'utf-8',
      );
      expect(content).toContain('```bash');
      expect(content).toContain('curl -X GET "/pets"');
    });

    it('generates curl GET command for getPetById (path param in URL)', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'curl', 'pets', 'get-pet-by-id.md'),
        'utf-8',
      );
      expect(content).toContain('curl -X GET "/pets/{petId}"');
    });

    it('generates curl GET with query string for findPetsByStatus', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'curl', 'pets', 'find-pets-by-status.md'),
        'utf-8',
      );
      expect(content).toContain('curl -X GET "/pets/findByStatus?status=available"');
    });

    it('generates curl POST with JSON body for createPet', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'curl', 'pets', 'create-pet.md'),
        'utf-8',
      );
      expect(content).toContain('curl -X POST "/pets"');
      expect(content).toContain('-H "Content-Type: application/json"');
      expect(content).toContain("-d '{");
      expect(content).toContain('"name": "name_value"');
    });

    it('generates curl DELETE command for deletePet', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'curl', 'pets', 'delete-pet.md'),
        'utf-8',
      );
      expect(content).toContain('curl -X DELETE "/pets/{petId}"');
      expect(content).not.toContain('-d');
    });

    it('generates curl PUT with JSON body for updatePet', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'curl', 'pets', 'update-pet.md'),
        'utf-8',
      );
      expect(content).toContain('curl -X PUT "/pets/{petId}"');
      expect(content).toContain('-H "Content-Type: application/json"');
    });

    it('does not include auth header in default pattern', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'curl', 'pets', 'list-pets.md'),
        'utf-8',
      );
      expect(content).not.toContain('X-API-Key');
    });
  });

  describe('end-to-end generate (with config)', () => {
    let outputDir: string;

    beforeAll(() => {
      outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oage-curl-config-'));
      const configPath = path.resolve(__dirname, '..', 'examples', 'curl', 'curl.config.yml');
      const config = loadConfig(configPath);

      generate({
        inputSpec: PETSTORE,
        generator: 'curl',
        outputDir,
        config,
      });
    });

    it('writes md and json files', () => {
      const petsDir = path.join(outputDir, 'usage', 'curl', 'pets');
      expect(fs.existsSync(path.join(petsDir, 'list-pets.md'))).toBe(true);
      expect(fs.existsSync(path.join(petsDir, 'list-pets.json'))).toBe(true);
    });

    it('includes base URL from config', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'curl', 'pets', 'list-pets.md'),
        'utf-8',
      );
      expect(content).toContain('https://api.example.com/pets');
    });

    it('includes auth header from config', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'curl', 'pets', 'list-pets.md'),
        'utf-8',
      );
      expect(content).toContain('-H "X-API-Key: YOUR_API_KEY"');
    });

    it('generates full curl command for getPetById', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'curl', 'pets', 'get-pet-by-id.md'),
        'utf-8',
      );
      expect(content).toContain('curl -X GET "https://api.example.com/pets/{petId}"');
      expect(content).toContain('-H "X-API-Key: YOUR_API_KEY"');
    });

    it('generates full curl POST with auth and body for createPet', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'curl', 'pets', 'create-pet.md'),
        'utf-8',
      );
      expect(content).toContain('curl -X POST "https://api.example.com/pets"');
      expect(content).toContain('-H "X-API-Key: YOUR_API_KEY"');
      expect(content).toContain('-H "Content-Type: application/json"');
      expect(content).toContain("-d '{");
      expect(content).toContain('"name": "name_value"');
    });

    it('generates query string with auth for findPetsByStatus', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'curl', 'pets', 'find-pets-by-status.md'),
        'utf-8',
      );
      expect(content).toContain('curl -X GET "https://api.example.com/pets/findByStatus?status=available"');
      expect(content).toContain('-H "X-API-Key: YOUR_API_KEY"');
    });

    it('produces valid JSON output', () => {
      const raw = fs.readFileSync(
        path.join(outputDir, 'usage', 'curl', 'pets', 'get-pet-by-id.json'),
        'utf-8',
      );
      const data = JSON.parse(raw);
      expect(data.operationId).toBe('getPetById');
      expect(data.tag).toBe('Pets');
      expect(data.httpMethod).toBe('GET');
      expect(data.codeBlockLang).toBe('bash');
      expect(data.example).toContain('curl -X GET');
    });
  });

  describe('end-to-end generate (with paramOverrides)', () => {
    let outputDir: string;

    beforeAll(() => {
      outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oage-curl-overrides-'));
      const configPath = path.resolve(__dirname, '..', 'examples', 'curl', 'curl.config.yml');
      const config = loadConfig(configPath);
      config.paramOverrides = {
        global: { petId: '$petId' },
        tags: { Pets: { status: '$status' } },
        operations: { createPet: { name: '$name' } },
      };

      generate({
        inputSpec: PETSTORE,
        generator: 'curl',
        outputDir,
        config,
      });
    });

    it('applies tag-level override to query param status', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'curl', 'pets', 'find-pets-by-status.md'),
        'utf-8',
      );
      expect(content).toContain('status=%24status');
    });

    it('applies operation-level override to body property (string, quoted)', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'curl', 'pets', 'create-pet.md'),
        'utf-8',
      );
      expect(content).toContain('"name": "$name"');
    });
  });
});
