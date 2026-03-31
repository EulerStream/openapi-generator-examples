import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { NormalizedParam, NormalizedRequestBody } from '../src/spec/types.js';

// Side-effect import to register the adapter
import '../src/languages/java.js';
import { getLanguageById } from '../src/languages/registry.js';
import { generate } from '../src/generator/pipeline.js';
import { loadConfig, loadConfigOrDefault } from '../src/config/loader.js';
import type { LanguageAdapter } from '../src/languages/types.js';

const PETSTORE = path.resolve(__dirname, 'fixtures', 'petstore.json');

describe('java adapter', () => {
  let adapter: LanguageAdapter;

  beforeAll(() => {
    const a = getLanguageById('java');
    expect(a).toBeDefined();
    adapter = a!;
  });

  describe('toMethodName', () => {
    it('keeps camelCase as-is', () => {
      expect(adapter.toMethodName('listPets')).toBe('listPets');
    });

    it('lowercases PascalCase first char', () => {
      expect(adapter.toMethodName('GetPetById')).toBe('getPetById');
    });

    it('converts kebab-case', () => {
      expect(adapter.toMethodName('list-pets')).toBe('listPets');
    });
  });

  describe('toFileName', () => {
    it('returns camelCase', () => {
      expect(adapter.toFileName('listPets')).toBe('listPets');
      expect(adapter.toFileName('GetPetById')).toBe('getPetById');
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
    it('appends Api suffix to single word', () => {
      expect(adapter.toApiClassName('Pets')).toBe('PetsApi');
    });

    it('removes spaces and appends Api suffix', () => {
      expect(adapter.toApiClassName('TikTok LIVE')).toBe('TikTokLIVEApi');
    });

    it('handles multi-word tags', () => {
      expect(adapter.toApiClassName('Alert Targets')).toBe('AlertTargetsApi');
    });

    it('capitalizes first letter', () => {
      expect(adapter.toApiClassName('store')).toBe('StoreApi');
    });

    it('handles Default tag', () => {
      expect(adapter.toApiClassName('Default')).toBe('DefaultApi');
    });
  });

  describe('mapType', () => {
    it('maps string to String', () => {
      expect(adapter.mapType({ type: 'string' })).toBe('String');
    });

    it('maps integer to Integer', () => {
      expect(adapter.mapType({ type: 'integer' })).toBe('Integer');
    });

    it('maps integer int64 to Long', () => {
      expect(adapter.mapType({ type: 'integer', format: 'int64' })).toBe('Long');
    });

    it('maps number to Double', () => {
      expect(adapter.mapType({ type: 'number' })).toBe('Double');
    });

    it('maps boolean to Boolean', () => {
      expect(adapter.mapType({ type: 'boolean' })).toBe('Boolean');
    });

    it('maps string with date format to LocalDate', () => {
      expect(adapter.mapType({ type: 'string', format: 'date' })).toBe('LocalDate');
    });

    it('maps string with date-time format to OffsetDateTime', () => {
      expect(adapter.mapType({ type: 'string', format: 'date-time' })).toBe('OffsetDateTime');
    });

    it('maps array with items', () => {
      expect(adapter.mapType({ type: 'array', items: { type: 'string' } })).toBe('List<String>');
    });

    it('maps array without items', () => {
      expect(adapter.mapType({ type: 'array' })).toBe('List<Object>');
    });

    it('maps object', () => {
      expect(adapter.mapType({ type: 'object' })).toBe('Object');
    });

    it('maps unknown type', () => {
      expect(adapter.mapType({ type: '' })).toBe('Object');
    });
  });

  describe('exampleValue', () => {
    it('uses param.example if present (string)', () => {
      const param: NormalizedParam = {
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'string' },
        example: 'abc123',
      };
      expect(adapter.exampleValue(param)).toBe('"abc123"');
    });

    it('uses param.example if present (number)', () => {
      const param: NormalizedParam = {
        name: 'limit',
        in: 'query',
        required: false,
        schema: { type: 'integer' },
        example: 42,
      };
      expect(adapter.exampleValue(param)).toBe('42');
    });

    it('uses enum first value', () => {
      const param: NormalizedParam = {
        name: 'status',
        in: 'query',
        required: true,
        schema: { type: 'string', enum: ['available', 'pending', 'sold'] },
      };
      expect(adapter.exampleValue(param)).toBe('"available"');
    });

    it('falls back to OffsetDateTime.now() for date-time type', () => {
      const param: NormalizedParam = {
        name: 'from',
        in: 'query',
        required: true,
        schema: { type: 'string', format: 'date-time' },
      };
      expect(adapter.exampleValue(param)).toBe('OffsetDateTime.now()');
    });

    it('falls back to LocalDate.now() for date type', () => {
      const param: NormalizedParam = {
        name: 'date',
        in: 'query',
        required: true,
        schema: { type: 'string', format: 'date' },
      };
      expect(adapter.exampleValue(param)).toBe('LocalDate.now()');
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

    it('falls back by type (string)', () => {
      const param: NormalizedParam = {
        name: 'name',
        in: 'query',
        required: true,
        schema: { type: 'string' },
      };
      expect(adapter.exampleValue(param)).toBe('"name_value"');
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

    it('falls back by type (number/double)', () => {
      const param: NormalizedParam = {
        name: 'price',
        in: 'query',
        required: false,
        schema: { type: 'number' },
      };
      expect(adapter.exampleValue(param)).toBe('0D');
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
    it('generates typed declaration', () => {
      const param: NormalizedParam = {
        name: 'petId',
        in: 'path',
        required: true,
        schema: { type: 'string' },
      };
      expect(adapter.buildParamDeclaration(param)).toBe('String petId = "petId_value";');
    });

    it('uses valueOverride as-is for non-string types', () => {
      const param: NormalizedParam = {
        name: 'account_id',
        in: 'path',
        required: true,
        schema: { type: 'integer' },
      };
      expect(adapter.buildParamDeclaration(param, '$account_id')).toBe('Integer account_id = $account_id;');
    });

    it('wraps valueOverride in quotes for string types', () => {
      const param: NormalizedParam = {
        name: 'name',
        in: 'query',
        required: true,
        schema: { type: 'string' },
      };
      expect(adapter.buildParamDeclaration(param, '$name')).toBe('String name = "$name";');
    });

    it('does not quote valueOverride for date types', () => {
      const param: NormalizedParam = {
        name: 'from',
        in: 'query',
        required: true,
        schema: { type: 'string', format: 'date-time' },
      };
      expect(adapter.buildParamDeclaration(param, '$from')).toBe('OffsetDateTime from = $from;');
    });
  });

  describe('buildMethodCall', () => {
    it('builds direct access pattern', () => {
      const result = adapter.buildMethodCall({
        clientVar: 'apiInstance',
        apiProperty: 'pets',
        methodName: 'listPets',
        args: '',
        apiAccessPattern: 'direct',
      });
      expect(result).toBe('apiInstance.listPets()');
    });

    it('builds dot access pattern', () => {
      const result = adapter.buildMethodCall({
        clientVar: 'client',
        apiProperty: 'pets',
        methodName: 'listPets',
        args: '',
        apiAccessPattern: 'dot',
      });
      expect(result).toBe('client.pets.listPets()');
    });

    it('builds call access pattern', () => {
      const result = adapter.buildMethodCall({
        clientVar: 'client',
        apiProperty: 'pets',
        methodName: 'getPetById',
        args: 'petId',
        apiAccessPattern: 'call',
      });
      expect(result).toBe('client.pets().getPetById(petId)');
    });

    it('includes args', () => {
      const result = adapter.buildMethodCall({
        clientVar: 'sdk',
        apiProperty: 'store',
        methodName: 'getInventory',
        args: 'limit, offset',
        apiAccessPattern: 'dot',
      });
      expect(result).toBe('sdk.store.getInventory(limit, offset)');
    });
  });

  describe('buildBodyConstruction', () => {
    it('generates setter-based body with required properties', () => {
      const body: NormalizedRequestBody = {
        required: true,
        schemaName: 'CreatePetRequest',
        schema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            tag: { type: 'string' },
            status: { type: 'string', enum: ['available', 'pending', 'sold'], default: 'available' },
          },
          required: ['name'],
        },
      };
      const result = adapter.buildBodyConstruction(body);
      expect(result).toContain('CreatePetRequest body = new CreatePetRequest();');
      expect(result).toContain('body.setName("name_value");');
      expect(result).not.toContain('setTag');
      expect(result).not.toContain('setStatus');
    });

    it('uses Object when schemaName is absent', () => {
      const body: NormalizedRequestBody = {
        required: true,
        schema: {
          type: 'object',
          properties: { foo: { type: 'string' } },
          required: ['foo'],
        },
      };
      const result = adapter.buildBodyConstruction(body);
      expect(result).toContain('Object body = new Object();');
      expect(result).toContain('body.setFoo("foo_value");');
    });

    it('wraps string overrides in quotes, leaves others raw', () => {
      const body: NormalizedRequestBody = {
        required: true,
        schemaName: 'CreatePetRequest',
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
      expect(result).toContain('body.setName("$name");');
      expect(result).toContain('body.setCount($count);');
      expect(result).toContain('body.setTag("tag_value");');
    });

    it('handles body with no required properties', () => {
      const body: NormalizedRequestBody = {
        required: true,
        schemaName: 'UpdatePetRequest',
        schema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            tag: { type: 'string' },
          },
        },
      };
      const result = adapter.buildBodyConstruction(body);
      expect(result).toBe('UpdatePetRequest body = new UpdatePetRequest();');
    });
  });

  describe('buildResultLine', () => {
    it('generates typed assignment when return type exists', () => {
      const result = adapter.buildResultLine('apiInstance.listPets()', 'Pet[]');
      expect(result).toBe('Pet[] result = apiInstance.listPets();');
    });

    it('generates call-only when no return type', () => {
      const result = adapter.buildResultLine('apiInstance.deletePet(petId)', undefined);
      expect(result).toBe('apiInstance.deletePet(petId);');
    });
  });

  describe('end-to-end generate (default pattern)', () => {
    let outputDir: string;

    beforeAll(() => {
      outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oage-java-default-'));
      const config = loadConfigOrDefault();

      generate({
        inputSpec: PETSTORE,
        generator: 'java',
        outputDir,
        config,
      });
    });

    it('writes files for all operations', () => {
      const petsDir = path.join(outputDir, 'usage', 'java', 'pets');
      const storeDir = path.join(outputDir, 'usage', 'java', 'store');

      expect(fs.existsSync(path.join(petsDir, 'listPets.md'))).toBe(true);
      expect(fs.existsSync(path.join(petsDir, 'createPet.md'))).toBe(true);
      expect(fs.existsSync(path.join(petsDir, 'getPetById.md'))).toBe(true);
      expect(fs.existsSync(path.join(storeDir, 'getInventory.md'))).toBe(true);
    });

    it('generates standard openapi-generator style for getPetById', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'java', 'pets', 'getPetById.md'),
        'utf-8',
      );
      expect(content).toContain('```java');
      expect(content).toContain('PetsApi');
      expect(content).toContain('Configuration');
      expect(content).toContain('ApiClient');
      expect(content).toContain("import ./api.PetsApi");
      expect(content).toContain('PetsApi apiInstance = new PetsApi(defaultClient);');
      expect(content).toContain('String petId = "petId_value";');
      expect(content).toContain('Pet result = apiInstance.getPetById(petId);');
    });

    it('uses direct method call pattern (no apiProperty chain)', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'java', 'pets', 'listPets.md'),
        'utf-8',
      );
      expect(content).not.toContain('.pets.');
      expect(content).toContain('apiInstance.listPets(limit, offset)');
    });

    it('generates correct output for Store tag', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'java', 'store', 'getInventory.md'),
        'utf-8',
      );
      expect(content).toContain('StoreApi');
      expect(content).toContain('StoreApi apiInstance = new StoreApi(defaultClient);');
    });

    it('generates correct output for deletePet (no return type)', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'java', 'pets', 'deletePet.md'),
        'utf-8',
      );
      expect(content).toContain('apiInstance.deletePet(petId);');
      expect(content).not.toContain('result =');
    });

    it('writes an index.md', () => {
      const indexPath = path.join(outputDir, 'usage', 'java', 'index.md');
      expect(fs.existsSync(indexPath)).toBe(true);
      const content = fs.readFileSync(indexPath, 'utf-8');
      expect(content).toContain('# Usage Examples (java)');
      expect(content).toContain('listPets');
    });
  });

  describe('end-to-end generate (wrapper pattern)', () => {
    let outputDir: string;

    beforeAll(() => {
      outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oage-java-wrapper-'));
      const configPath = path.resolve(__dirname, '..', 'examples', 'java', 'java.config.yml');
      const config = loadConfig(configPath);

      generate({
        inputSpec: PETSTORE,
        generator: 'java',
        outputDir,
        config,
      });
    });

    it('writes files for all operations', () => {
      const petsDir = path.join(outputDir, 'usage', 'java', 'pets');
      const storeDir = path.join(outputDir, 'usage', 'java', 'store');

      expect(fs.existsSync(path.join(petsDir, 'listPets.md'))).toBe(true);
      expect(fs.existsSync(path.join(petsDir, 'createPet.md'))).toBe(true);
      expect(fs.existsSync(path.join(petsDir, 'getPetById.md'))).toBe(true);
      expect(fs.existsSync(path.join(petsDir, 'updatePet.md'))).toBe(true);
      expect(fs.existsSync(path.join(petsDir, 'deletePet.md'))).toBe(true);
      expect(fs.existsSync(path.join(petsDir, 'findPetsByStatus.md'))).toBe(true);
      expect(fs.existsSync(path.join(storeDir, 'getInventory.md'))).toBe(true);
    });

    it('generates wrapper-style Java for getPetById', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'java', 'pets', 'getPetById.md'),
        'utf-8',
      );
      expect(content).toContain('```java');
      expect(content).toContain('import io.github.isaackogan.EulerStreamApiClient;');
      expect(content).toContain('EulerStreamApiClient client = EulerStreamApiClient.builder()');
      expect(content).toContain('String petId = "petId_value";');
      expect(content).toContain('Pet result = client.pets().getPetById(petId);');
    });

    it('generates correct Java for deletePet (no return type)', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'java', 'pets', 'deletePet.md'),
        'utf-8',
      );
      expect(content).toContain('client.pets().deletePet(petId);');
      expect(content).not.toContain('result =');
    });

    it('generates correct Java for createPet (with body)', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'java', 'pets', 'createPet.md'),
        'utf-8',
      );
      expect(content).toContain('CreatePetRequest body = new CreatePetRequest();');
      expect(content).toContain('body.setName("name_value");');
    });

    it('generates correct Java for findPetsByStatus (enum param)', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'java', 'pets', 'findPetsByStatus.md'),
        'utf-8',
      );
      expect(content).toContain('String status = "available";');
    });
  });

  describe('end-to-end generate (with paramOverrides)', () => {
    let outputDir: string;

    beforeAll(() => {
      outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oage-java-overrides-'));
      const config = loadConfigOrDefault();
      config.paramOverrides = {
        global: { petId: '$petId' },
        tags: { Pets: { status: '$status' } },
        operations: { createPet: { name: '$name' } },
      };

      generate({
        inputSpec: PETSTORE,
        generator: 'java',
        outputDir,
        config,
      });
    });

    it('applies global override to petId (string type, quoted)', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'java', 'pets', 'getPetById.md'),
        'utf-8',
      );
      expect(content).toContain('String petId = "$petId";');
    });

    it('applies tag-level override to status (string type, quoted)', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'java', 'pets', 'findPetsByStatus.md'),
        'utf-8',
      );
      expect(content).toContain('String status = "$status";');
    });

    it('applies operation-level override to body property (string, quoted)', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'java', 'pets', 'createPet.md'),
        'utf-8',
      );
      expect(content).toContain('body.setName("$name");');
    });

    it('does not override params without matching rules', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'java', 'pets', 'listPets.md'),
        'utf-8',
      );
      expect(content).not.toContain('$');
    });
  });

  describe('end-to-end generate (JSON output)', () => {
    let outputDir: string;

    beforeAll(() => {
      outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oage-java-json-'));
      const config = loadConfigOrDefault();
      config.outputFormats = ['json'];

      generate({
        inputSpec: PETSTORE,
        generator: 'java',
        outputDir,
        config,
      });
    });

    it('writes .json files instead of .md', () => {
      const petsDir = path.join(outputDir, 'usage', 'java', 'pets');
      expect(fs.existsSync(path.join(petsDir, 'getPetById.json'))).toBe(true);
      expect(fs.existsSync(path.join(petsDir, 'getPetById.md'))).toBe(false);
    });

    it('produces valid JSON with expected structure', () => {
      const raw = fs.readFileSync(
        path.join(outputDir, 'usage', 'java', 'pets', 'getPetById.json'),
        'utf-8',
      );
      const data = JSON.parse(raw);
      expect(data.operationId).toBe('getPetById');
      expect(data.tag).toBe('Pets');
      expect(data.httpMethod).toBe('GET');
      expect(data.path).toBe('/pets/{petId}');
      expect(data.codeBlockLang).toBe('java');
      expect(data.example).toContain('apiInstance.getPetById(petId)');
      expect(data.parameters).toHaveLength(1);
      expect(data.parameters[0].name).toBe('petId');
      expect(data.parameters[0].type).toBe('String');
      expect(data.parameters[0].required).toBe(true);
    });

    it('includes requestBody for createPet', () => {
      const raw = fs.readFileSync(
        path.join(outputDir, 'usage', 'java', 'pets', 'createPet.json'),
        'utf-8',
      );
      const data = JSON.parse(raw);
      expect(data.requestBody).toBeDefined();
      expect(data.requestBody.typeName).toBe('CreatePetRequest');
      expect(data.requestBody.construction).toContain('body.setName("name_value")');
    });

    it('omits requestBody when absent', () => {
      const raw = fs.readFileSync(
        path.join(outputDir, 'usage', 'java', 'pets', 'listPets.json'),
        'utf-8',
      );
      const data = JSON.parse(raw);
      expect(data.requestBody).toBeUndefined();
    });

    it('writes an index.json containing all operations', () => {
      const indexPath = path.join(outputDir, 'usage', 'java', 'index.json');
      expect(fs.existsSync(indexPath)).toBe(true);
      const data = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      expect(data).toHaveLength(7);
      const ids = data.map((e: { operationId: string }) => e.operationId);
      expect(ids).toContain('getPetById');
      expect(ids).toContain('listPets');
      expect(ids).toContain('getInventory');
    });
  });

  describe('end-to-end generate (both formats)', () => {
    let outputDir: string;

    beforeAll(() => {
      outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oage-java-both-'));
      const config = loadConfigOrDefault();
      config.outputFormats = ['md', 'json'];

      generate({
        inputSpec: PETSTORE,
        generator: 'java',
        outputDir,
        config,
      });
    });

    it('writes both .md and .json files', () => {
      const petsDir = path.join(outputDir, 'usage', 'java', 'pets');
      expect(fs.existsSync(path.join(petsDir, 'getPetById.md'))).toBe(true);
      expect(fs.existsSync(path.join(petsDir, 'getPetById.json'))).toBe(true);
    });
  });
});
