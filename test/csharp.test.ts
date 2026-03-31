import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { NormalizedParam, NormalizedRequestBody } from '../src/spec/types.js';

// Side-effect import to register the adapter
import '../src/languages/csharp.js';
import { getLanguageById } from '../src/languages/registry.js';
import { generate } from '../src/generator/pipeline.js';
import { loadConfig, loadConfigOrDefault } from '../src/config/loader.js';
import type { LanguageAdapter } from '../src/languages/types.js';

const PETSTORE = path.resolve(__dirname, 'fixtures', 'petstore.json');

describe('csharp adapter', () => {
  let adapter: LanguageAdapter;

  beforeAll(() => {
    const a = getLanguageById('csharp');
    expect(a).toBeDefined();
    adapter = a!;
  });

  describe('toMethodName', () => {
    it('converts camelCase to PascalCase with Async suffix', () => {
      expect(adapter.toMethodName('listPets')).toBe('ListPetsAsync');
    });

    it('keeps PascalCase and adds Async suffix', () => {
      expect(adapter.toMethodName('GetPetById')).toBe('GetPetByIdAsync');
    });

    it('converts kebab-case to PascalCase with Async suffix', () => {
      expect(adapter.toMethodName('list-pets')).toBe('ListPetsAsync');
    });
  });

  describe('toFileName', () => {
    it('returns PascalCase', () => {
      expect(adapter.toFileName('listPets')).toBe('ListPets');
      expect(adapter.toFileName('GetPetById')).toBe('GetPetById');
    });
  });

  describe('toTagDirectory', () => {
    it('keeps single word as-is', () => {
      expect(adapter.toTagDirectory('Pets')).toBe('Pets');
    });

    it('converts multi-word tags to PascalCase', () => {
      expect(adapter.toTagDirectory('TikTok LIVE')).toBe('TikTokLive');
    });

    it('handles normal multi-word tags', () => {
      expect(adapter.toTagDirectory('Alert Targets')).toBe('AlertTargets');
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
    it('maps string', () => {
      expect(adapter.mapType({ type: 'string' })).toBe('string');
    });

    it('maps integer to int', () => {
      expect(adapter.mapType({ type: 'integer' })).toBe('int');
    });

    it('maps integer with int64 format to long', () => {
      expect(adapter.mapType({ type: 'integer', format: 'int64' })).toBe('long');
    });

    it('maps number to double', () => {
      expect(adapter.mapType({ type: 'number' })).toBe('double');
    });

    it('maps boolean to bool', () => {
      expect(adapter.mapType({ type: 'boolean' })).toBe('bool');
    });

    it('maps string with date format to DateTime', () => {
      expect(adapter.mapType({ type: 'string', format: 'date' })).toBe('DateTime');
    });

    it('maps string with date-time format to DateTime', () => {
      expect(adapter.mapType({ type: 'string', format: 'date-time' })).toBe('DateTime');
    });

    it('maps array with items', () => {
      expect(adapter.mapType({ type: 'array', items: { type: 'string' } })).toBe('List<string>');
    });

    it('maps array without items', () => {
      expect(adapter.mapType({ type: 'array' })).toBe('List<object>');
    });

    it('maps object', () => {
      expect(adapter.mapType({ type: 'object' })).toBe('object');
    });

    it('maps unknown type to object', () => {
      expect(adapter.mapType({ type: '' })).toBe('object');
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

    it('falls back to DateTime.Now for date-time type', () => {
      const param: NormalizedParam = {
        name: 'from',
        in: 'query',
        required: true,
        schema: { type: 'string', format: 'date-time' },
      };
      expect(adapter.exampleValue(param)).toBe('DateTime.Now');
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
        name: 'rate',
        in: 'query',
        required: false,
        schema: { type: 'number' },
      };
      expect(adapter.exampleValue(param)).toBe('0.0');
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
      expect(adapter.buildParamDeclaration(param)).toBe('string petId = "petId_value";');
    });

    it('uses valueOverride as-is for non-string types', () => {
      const param: NormalizedParam = {
        name: 'account_id',
        in: 'path',
        required: true,
        schema: { type: 'integer' },
      };
      expect(adapter.buildParamDeclaration(param, '$account_id')).toBe('int account_id = $account_id;');
    });

    it('wraps valueOverride in quotes for string types', () => {
      const param: NormalizedParam = {
        name: 'name',
        in: 'query',
        required: true,
        schema: { type: 'string' },
      };
      expect(adapter.buildParamDeclaration(param, '$name')).toBe('string name = "$name";');
    });

    it('does not quote valueOverride for date types', () => {
      const param: NormalizedParam = {
        name: 'from',
        in: 'query',
        required: true,
        schema: { type: 'string', format: 'date-time' },
      };
      expect(adapter.buildParamDeclaration(param, '$from')).toBe('DateTime from = $from;');
    });
  });

  describe('buildMethodCall', () => {
    it('builds direct access pattern', () => {
      const result = adapter.buildMethodCall({
        clientVar: 'apiInstance',
        apiProperty: 'pets',
        methodName: 'ListPets',
        args: '',
        apiAccessPattern: 'direct',
      });
      expect(result).toBe('apiInstance.ListPets()');
    });

    it('builds dot access pattern', () => {
      const result = adapter.buildMethodCall({
        clientVar: 'client',
        apiProperty: 'Pets',
        methodName: 'ListPets',
        args: '',
        apiAccessPattern: 'dot',
      });
      expect(result).toBe('client.Pets.ListPets()');
    });

    it('builds call access pattern', () => {
      const result = adapter.buildMethodCall({
        clientVar: 'client',
        apiProperty: 'Pets',
        methodName: 'GetPetById',
        args: 'petId',
        apiAccessPattern: 'call',
      });
      expect(result).toBe('client.Pets().GetPetById(petId)');
    });

    it('includes args', () => {
      const result = adapter.buildMethodCall({
        clientVar: 'sdk',
        apiProperty: 'Store',
        methodName: 'GetInventory',
        args: 'limit, offset',
        apiAccessPattern: 'dot',
      });
      expect(result).toBe('sdk.Store.GetInventory(limit, offset)');
    });
  });

  describe('buildBodyConstruction', () => {
    it('generates typed body with object initializer', () => {
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
      expect(result).toContain('var body = new CreatePetRequest');
      expect(result).toContain('Name = "name_value"');
      expect(result).toContain('};');
      expect(result).not.toContain('Tag =');
      expect(result).not.toContain('Status =');
    });

    it('uses anonymous object when schemaName is absent', () => {
      const body: NormalizedRequestBody = {
        required: true,
        schema: {
          type: 'object',
          properties: { foo: { type: 'string' } },
          required: ['foo'],
        },
      };
      const result = adapter.buildBodyConstruction(body);
      expect(result).toContain('var body = new\n{');
      expect(result).toContain('Foo = "foo_value"');
    });

    it('generates nested object initializers', () => {
      const body: NormalizedRequestBody = {
        required: true,
        schemaName: 'CreateAlertTargetPayload',
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
      expect(result).toContain('var body = new CreateAlertTargetPayload');
      expect(result).toContain('Url = new');
      expect(result).toContain('Host = "host_value",');
      expect(result).toContain('Port = 0,');
      expect(result).toContain('Name = "name_value",');
    });

    it('generates empty object for object without properties', () => {
      const body: NormalizedRequestBody = {
        required: true,
        schemaName: 'Payload',
        schema: {
          type: 'object',
          properties: {
            metadata: { type: 'object' },
          },
          required: ['metadata'],
        },
      };
      const result = adapter.buildBodyConstruction(body);
      expect(result).toContain('Metadata = new { },');
    });

    it('generates array example values', () => {
      const body: NormalizedRequestBody = {
        required: true,
        schemaName: 'Payload',
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
      expect(result).toContain('Tags = new List<string> { "item_value" },');
      expect(result).toContain('Ids = new List<int> { 0 },');
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
      expect(result).toContain('Name = "$name",');
      expect(result).toContain('Count = $count,');
      expect(result).toContain('Tag = "tag_value",');
    });
  });

  describe('buildResultLine', () => {
    it('generates await assignment when return type exists', () => {
      const result = adapter.buildResultLine('apiInstance.GetPetByIdAsync(petId)', 'Pet');
      expect(result).toBe('var result = await apiInstance.GetPetByIdAsync(petId);');
    });

    it('generates await call-only when no return type', () => {
      const result = adapter.buildResultLine('apiInstance.DeletePetAsync(petId)', undefined);
      expect(result).toBe('await apiInstance.DeletePetAsync(petId);');
    });
  });

  describe('end-to-end generate (default pattern)', () => {
    let outputDir: string;

    beforeAll(() => {
      outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oage-cs-default-'));
      const config = loadConfigOrDefault();

      generate({
        inputSpec: PETSTORE,
        generator: 'csharp',
        outputDir,
        config,
      });
    });

    it('writes files for all operations', () => {
      const petsDir = path.join(outputDir, 'usage', 'csharp', 'Pets');
      const storeDir = path.join(outputDir, 'usage', 'csharp', 'Store');

      expect(fs.existsSync(path.join(petsDir, 'ListPets.md'))).toBe(true);
      expect(fs.existsSync(path.join(petsDir, 'CreatePet.md'))).toBe(true);
      expect(fs.existsSync(path.join(petsDir, 'GetPetById.md'))).toBe(true);
      expect(fs.existsSync(path.join(storeDir, 'GetInventory.md'))).toBe(true);
    });

    it('generates standard openapi-generator style for getPetById', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'csharp', 'Pets', 'GetPetById.md'),
        'utf-8',
      );
      expect(content).toContain('```csharp');
      expect(content).toContain('PetsApi');
      expect(content).toContain('Configuration');
      expect(content).toContain('using ./api');
      expect(content).toContain('PetsApi apiInstance = new PetsApi(config);');
      expect(content).toContain('string petId = "petId_value";');
      expect(content).toContain('var result = await apiInstance.GetPetByIdAsync(petId);');
    });

    it('uses direct method call pattern (no apiProperty chain)', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'csharp', 'Pets', 'ListPets.md'),
        'utf-8',
      );
      expect(content).not.toContain('.pets.');
      expect(content).toContain('apiInstance.ListPetsAsync(limit, offset)');
    });

    it('generates correct output for Store tag', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'csharp', 'Store', 'GetInventory.md'),
        'utf-8',
      );
      expect(content).toContain('StoreApi');
      expect(content).toContain('StoreApi apiInstance = new StoreApi(config);');
    });

    it('generates correct output for deletePet (no return type)', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'csharp', 'Pets', 'DeletePet.md'),
        'utf-8',
      );
      expect(content).toContain('await apiInstance.DeletePetAsync(petId);');
      expect(content).not.toContain('var result =');
    });

    it('writes an index.md', () => {
      const indexPath = path.join(outputDir, 'usage', 'csharp', 'index.md');
      expect(fs.existsSync(indexPath)).toBe(true);
      const content = fs.readFileSync(indexPath, 'utf-8');
      expect(content).toContain('# Usage Examples (csharp)');
      expect(content).toContain('ListPets');
    });
  });

  describe('end-to-end generate (wrapper pattern)', () => {
    let outputDir: string;

    beforeAll(() => {
      outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oage-cs-wrapper-'));
      const configPath = path.resolve(__dirname, '..', 'examples', 'csharp', 'csharp.config.yml');
      const config = loadConfig(configPath);

      generate({
        inputSpec: PETSTORE,
        generator: 'csharp',
        outputDir,
        config,
      });
    });

    it('writes files for all operations', () => {
      const petsDir = path.join(outputDir, 'usage', 'csharp', 'Pets');
      const storeDir = path.join(outputDir, 'usage', 'csharp', 'Store');

      expect(fs.existsSync(path.join(petsDir, 'ListPets.md'))).toBe(true);
      expect(fs.existsSync(path.join(petsDir, 'CreatePet.md'))).toBe(true);
      expect(fs.existsSync(path.join(petsDir, 'GetPetById.md'))).toBe(true);
      expect(fs.existsSync(path.join(petsDir, 'UpdatePet.md'))).toBe(true);
      expect(fs.existsSync(path.join(petsDir, 'DeletePet.md'))).toBe(true);
      expect(fs.existsSync(path.join(petsDir, 'FindPetsByStatus.md'))).toBe(true);
      expect(fs.existsSync(path.join(storeDir, 'GetInventory.md'))).toBe(true);
    });

    it('generates wrapper-style C# for getPetById', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'csharp', 'Pets', 'GetPetById.md'),
        'utf-8',
      );
      expect(content).toContain('```csharp');
      expect(content).toContain('using EulerApiSdk;');
      expect(content).toContain('new EulerStreamApiClient');
      expect(content).toContain('string petId = "petId_value";');
      expect(content).toContain('var result = await client.Pets.GetPetByIdAsync(petId);');
    });

    it('generates correct C# for deletePet (no return type)', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'csharp', 'Pets', 'DeletePet.md'),
        'utf-8',
      );
      expect(content).toContain('await client.Pets.DeletePetAsync(petId);');
      expect(content).not.toContain('var result =');
    });

    it('generates correct C# for createPet (with body)', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'csharp', 'Pets', 'CreatePet.md'),
        'utf-8',
      );
      expect(content).toContain('var body = new CreatePetRequest');
      expect(content).toContain('Name = "name_value"');
    });

    it('generates correct C# for findPetsByStatus (enum param)', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'csharp', 'Pets', 'FindPetsByStatus.md'),
        'utf-8',
      );
      expect(content).toContain('string status = "available";');
    });
  });

  describe('end-to-end generate (with paramOverrides)', () => {
    let outputDir: string;

    beforeAll(() => {
      outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oage-cs-overrides-'));
      const config = loadConfigOrDefault();
      config.paramOverrides = {
        global: { petId: '$petId' },
        tags: { Pets: { status: '$status' } },
        operations: { createPet: { name: '$name' } },
      };

      generate({
        inputSpec: PETSTORE,
        generator: 'csharp',
        outputDir,
        config,
      });
    });

    it('applies global override to petId (string type, quoted)', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'csharp', 'Pets', 'GetPetById.md'),
        'utf-8',
      );
      expect(content).toContain('string petId = "$petId";');
    });

    it('applies tag-level override to status (string type, quoted)', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'csharp', 'Pets', 'FindPetsByStatus.md'),
        'utf-8',
      );
      expect(content).toContain('string status = "$status";');
    });

    it('applies operation-level override to body property (string, quoted)', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'csharp', 'Pets', 'CreatePet.md'),
        'utf-8',
      );
      expect(content).toContain('Name = "$name",');
    });

    it('does not override params without matching rules', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'csharp', 'Pets', 'ListPets.md'),
        'utf-8',
      );
      expect(content).not.toContain('$');
    });
  });

  describe('end-to-end generate (JSON output)', () => {
    let outputDir: string;

    beforeAll(() => {
      outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oage-cs-json-'));
      const config = loadConfigOrDefault();
      config.outputFormats = ['json'];

      generate({
        inputSpec: PETSTORE,
        generator: 'csharp',
        outputDir,
        config,
      });
    });

    it('writes .json files instead of .md', () => {
      const petsDir = path.join(outputDir, 'usage', 'csharp', 'Pets');
      expect(fs.existsSync(path.join(petsDir, 'GetPetById.json'))).toBe(true);
      expect(fs.existsSync(path.join(petsDir, 'GetPetById.md'))).toBe(false);
    });

    it('produces valid JSON with expected structure', () => {
      const raw = fs.readFileSync(
        path.join(outputDir, 'usage', 'csharp', 'Pets', 'GetPetById.json'),
        'utf-8',
      );
      const data = JSON.parse(raw);
      expect(data.operationId).toBe('getPetById');
      expect(data.tag).toBe('Pets');
      expect(data.httpMethod).toBe('GET');
      expect(data.path).toBe('/pets/{petId}');
      expect(data.codeBlockLang).toBe('csharp');
      expect(data.example).toContain('apiInstance.GetPetByIdAsync(petId)');
      expect(data.parameters).toHaveLength(1);
      expect(data.parameters[0].name).toBe('petId');
      expect(data.parameters[0].type).toBe('string');
      expect(data.parameters[0].required).toBe(true);
    });

    it('includes requestBody for createPet', () => {
      const raw = fs.readFileSync(
        path.join(outputDir, 'usage', 'csharp', 'Pets', 'CreatePet.json'),
        'utf-8',
      );
      const data = JSON.parse(raw);
      expect(data.requestBody).toBeDefined();
      expect(data.requestBody.typeName).toBe('CreatePetRequest');
      expect(data.requestBody.construction).toContain('Name = "name_value"');
    });

    it('omits requestBody when absent', () => {
      const raw = fs.readFileSync(
        path.join(outputDir, 'usage', 'csharp', 'Pets', 'ListPets.json'),
        'utf-8',
      );
      const data = JSON.parse(raw);
      expect(data.requestBody).toBeUndefined();
    });

    it('writes an index.json containing all operations', () => {
      const indexPath = path.join(outputDir, 'usage', 'csharp', 'index.json');
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
      outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oage-cs-both-'));
      const config = loadConfigOrDefault();
      config.outputFormats = ['md', 'json'];

      generate({
        inputSpec: PETSTORE,
        generator: 'csharp',
        outputDir,
        config,
      });
    });

    it('writes both .md and .json files', () => {
      const petsDir = path.join(outputDir, 'usage', 'csharp', 'Pets');
      expect(fs.existsSync(path.join(petsDir, 'GetPetById.md'))).toBe(true);
      expect(fs.existsSync(path.join(petsDir, 'GetPetById.json'))).toBe(true);
    });
  });
});
