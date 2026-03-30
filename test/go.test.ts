import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { NormalizedParam, NormalizedRequestBody } from '../src/spec/types.js';

// Side-effect import to register the adapter
import '../src/languages/go.js';
import { getLanguageById } from '../src/languages/registry.js';
import { generate } from '../src/generator/pipeline.js';
import { loadConfig, loadConfigOrDefault } from '../src/config/loader.js';
import type { LanguageAdapter } from '../src/languages/types.js';

const PETSTORE = path.resolve(__dirname, 'fixtures', 'petstore.json');

describe('go adapter', () => {
  let adapter: LanguageAdapter;

  beforeAll(() => {
    const a = getLanguageById('go');
    expect(a).toBeDefined();
    adapter = a!;
  });

  describe('toMethodName', () => {
    it('converts camelCase to PascalCase', () => {
      expect(adapter.toMethodName('listPets')).toBe('ListPets');
    });

    it('keeps PascalCase as-is', () => {
      expect(adapter.toMethodName('GetPetById')).toBe('GetPetById');
    });

    it('converts kebab-case to PascalCase', () => {
      expect(adapter.toMethodName('list-pets')).toBe('ListPets');
    });
  });

  describe('toFileName', () => {
    it('converts camelCase to snake_case', () => {
      expect(adapter.toFileName('listPets')).toBe('list_pets');
    });

    it('converts PascalCase to snake_case', () => {
      expect(adapter.toFileName('GetPetById')).toBe('get_pet_by_id');
    });
  });

  describe('toTagDirectory', () => {
    it('converts to snake_case lowercase', () => {
      expect(adapter.toTagDirectory('Pets')).toBe('pets');
      expect(adapter.toTagDirectory('TikTok LIVE')).toBe('tik_tok_live');
      expect(adapter.toTagDirectory('MyTag')).toBe('my_tag');
    });
  });

  describe('toApiClassName', () => {
    it('appends API suffix to single word', () => {
      expect(adapter.toApiClassName('Pets')).toBe('PetsAPI');
    });

    it('removes spaces and appends API suffix', () => {
      expect(adapter.toApiClassName('TikTok LIVE')).toBe('TikTokLIVEAPI');
    });

    it('handles multi-word tags', () => {
      expect(adapter.toApiClassName('Alert Targets')).toBe('AlertTargetsAPI');
    });

    it('capitalizes first letter', () => {
      expect(adapter.toApiClassName('store')).toBe('StoreAPI');
    });

    it('handles Default tag', () => {
      expect(adapter.toApiClassName('Default')).toBe('DefaultAPI');
    });
  });

  describe('mapType', () => {
    it('maps string', () => {
      expect(adapter.mapType({ type: 'string' })).toBe('string');
    });

    it('maps integer to int64', () => {
      expect(adapter.mapType({ type: 'integer' })).toBe('int64');
    });

    it('maps integer with int32 format', () => {
      expect(adapter.mapType({ type: 'integer', format: 'int32' })).toBe('int32');
    });

    it('maps number to float64', () => {
      expect(adapter.mapType({ type: 'number' })).toBe('float64');
    });

    it('maps boolean to bool', () => {
      expect(adapter.mapType({ type: 'boolean' })).toBe('bool');
    });

    it('maps string with date format to time.Time', () => {
      expect(adapter.mapType({ type: 'string', format: 'date' })).toBe('time.Time');
    });

    it('maps string with date-time format to time.Time', () => {
      expect(adapter.mapType({ type: 'string', format: 'date-time' })).toBe('time.Time');
    });

    it('maps array with items', () => {
      expect(adapter.mapType({ type: 'array', items: { type: 'string' } })).toBe('[]string');
    });

    it('maps array without items', () => {
      expect(adapter.mapType({ type: 'array' })).toBe('[]interface{}');
    });

    it('maps object', () => {
      expect(adapter.mapType({ type: 'object' })).toBe('map[string]interface{}');
    });

    it('maps unknown type', () => {
      expect(adapter.mapType({ type: '' })).toBe('interface{}');
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

    it('falls back to time.Now() for date-time type', () => {
      const param: NormalizedParam = {
        name: 'from',
        in: 'query',
        required: true,
        schema: { type: 'string', format: 'date-time' },
      };
      expect(adapter.exampleValue(param)).toBe('time.Now()');
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
    it('generates := declaration without type annotation', () => {
      const param: NormalizedParam = {
        name: 'petId',
        in: 'path',
        required: true,
        schema: { type: 'string' },
      };
      expect(adapter.buildParamDeclaration(param)).toBe('petId := "petId_value"');
    });

    it('uses valueOverride as-is for non-string types', () => {
      const param: NormalizedParam = {
        name: 'account_id',
        in: 'path',
        required: true,
        schema: { type: 'integer' },
      };
      expect(adapter.buildParamDeclaration(param, '$account_id')).toBe('account_id := $account_id');
    });

    it('wraps valueOverride in quotes for string types', () => {
      const param: NormalizedParam = {
        name: 'name',
        in: 'query',
        required: true,
        schema: { type: 'string' },
      };
      expect(adapter.buildParamDeclaration(param, '$name')).toBe('name := "$name"');
    });

    it('does not quote valueOverride for date types', () => {
      const param: NormalizedParam = {
        name: 'from',
        in: 'query',
        required: true,
        schema: { type: 'string', format: 'date-time' },
      };
      expect(adapter.buildParamDeclaration(param, '$from')).toBe('from := $from');
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
    it('generates typed body with required properties', () => {
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
      expect(result).toContain('body := openapi.CreatePetRequest{');
      expect(result).toContain('Name: "name_value"');
      expect(result).toContain('}');
      expect(result).not.toContain('Tag:');
      expect(result).not.toContain('Status:');
    });

    it('uses map literal when schemaName is absent', () => {
      const body: NormalizedRequestBody = {
        required: true,
        schema: {
          type: 'object',
          properties: { foo: { type: 'string' } },
          required: ['foo'],
        },
      };
      const result = adapter.buildBodyConstruction(body);
      expect(result).toContain('body := map[string]interface{}{');
      expect(result).not.toContain('openapi.');
    });

    it('generates nested struct literals', () => {
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
      expect(result).toContain('body := openapi.CreateAlertTargetPayload{');
      expect(result).toContain('Url: {');
      expect(result).toContain('Host: "host_value",');
      expect(result).toContain('Port: 0,');
      expect(result).toContain('Name: "name_value",');
    });

    it('generates empty map for object without properties', () => {
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
      expect(result).toContain('Metadata: map[string]interface{}{},');
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
      expect(result).toContain('Tags: []string{"item_value"},');
      expect(result).toContain('Ids: []int64{0},');
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
      expect(result).toContain('Name: "$name",');
      expect(result).toContain('Count: $count,');
      expect(result).toContain('Tag: "tag_value",');
    });
  });

  describe('buildResultLine', () => {
    it('generates multiple return values when return type exists', () => {
      const result = adapter.buildResultLine('apiInstance.ListPets()', 'Pet[]');
      expect(result).toBe('resp, r, err := apiInstance.ListPets()');
    });

    it('generates multiple return values even when no return type', () => {
      const result = adapter.buildResultLine('apiInstance.DeletePet(petId)', undefined);
      expect(result).toBe('resp, r, err := apiInstance.DeletePet(petId)');
    });
  });

  describe('end-to-end generate (default pattern)', () => {
    let outputDir: string;

    beforeAll(() => {
      outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oage-go-default-'));
      const config = loadConfigOrDefault();

      generate({
        inputSpec: PETSTORE,
        generator: 'go',
        outputDir,
        config,
      });
    });

    it('writes files for all operations', () => {
      const petsDir = path.join(outputDir, 'usage', 'go', 'pets');
      const storeDir = path.join(outputDir, 'usage', 'go', 'store');

      expect(fs.existsSync(path.join(petsDir, 'list_pets.md'))).toBe(true);
      expect(fs.existsSync(path.join(petsDir, 'create_pet.md'))).toBe(true);
      expect(fs.existsSync(path.join(petsDir, 'get_pet_by_id.md'))).toBe(true);
      expect(fs.existsSync(path.join(storeDir, 'get_inventory.md'))).toBe(true);
    });

    it('generates standard openapi-generator style for getPetById', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'go', 'pets', 'get_pet_by_id.md'),
        'utf-8',
      );
      expect(content).toContain('```go');
      expect(content).toContain('openapiclient');
      expect(content).toContain('NewConfiguration');
      expect(content).toContain('NewAPIClient');
      expect(content).toContain('"./api"');
      expect(content).toContain('petId := "petId_value"');
      expect(content).toContain('resp, r, err := apiInstance.GetPetById(petId)');
    });

    it('uses direct method call pattern (no apiProperty chain)', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'go', 'pets', 'list_pets.md'),
        'utf-8',
      );
      expect(content).not.toContain('.pets.');
      expect(content).not.toContain('.Pets.');
      expect(content).toContain('apiInstance.ListPets()');
    });

    it('generates correct output for Store tag', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'go', 'store', 'get_inventory.md'),
        'utf-8',
      );
      expect(content).toContain('openapiclient');
      expect(content).toContain('NewAPIClient');
    });

    it('generates correct output for deletePet (still has multiple returns)', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'go', 'pets', 'delete_pet.md'),
        'utf-8',
      );
      expect(content).toContain('resp, r, err := apiInstance.DeletePet(petId)');
    });

    it('writes an index.md', () => {
      const indexPath = path.join(outputDir, 'usage', 'go', 'index.md');
      expect(fs.existsSync(indexPath)).toBe(true);
      const content = fs.readFileSync(indexPath, 'utf-8');
      expect(content).toContain('# Usage Examples (go)');
      expect(content).toContain('list_pets');
    });
  });

  describe('end-to-end generate (wrapper pattern)', () => {
    let outputDir: string;

    beforeAll(() => {
      outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oage-go-wrapper-'));
      const configPath = path.resolve(__dirname, '..', 'examples', 'go', 'go.config.yml');
      const config = loadConfig(configPath);

      generate({
        inputSpec: PETSTORE,
        generator: 'go',
        outputDir,
        config,
      });
    });

    it('writes files for all operations', () => {
      const petsDir = path.join(outputDir, 'usage', 'go', 'pets');
      const storeDir = path.join(outputDir, 'usage', 'go', 'store');

      expect(fs.existsSync(path.join(petsDir, 'list_pets.md'))).toBe(true);
      expect(fs.existsSync(path.join(petsDir, 'create_pet.md'))).toBe(true);
      expect(fs.existsSync(path.join(petsDir, 'get_pet_by_id.md'))).toBe(true);
      expect(fs.existsSync(path.join(petsDir, 'update_pet.md'))).toBe(true);
      expect(fs.existsSync(path.join(petsDir, 'delete_pet.md'))).toBe(true);
      expect(fs.existsSync(path.join(petsDir, 'find_pets_by_status.md'))).toBe(true);
      expect(fs.existsSync(path.join(storeDir, 'get_inventory.md'))).toBe(true);
    });

    it('generates wrapper-style Go for getPetById', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'go', 'pets', 'get_pet_by_id.md'),
        'utf-8',
      );
      expect(content).toContain('```go');
      expect(content).toContain('eulerstream "github.com/EulerStream/Euler-Api-Sdk/sdk/go"');
      expect(content).toContain('eulerstream.NewEulerStreamClient');
      expect(content).toContain('petId := "petId_value"');
      expect(content).toContain('resp, r, err := client.Pets.GetPetById(petId)');
    });

    it('generates correct Go for deletePet', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'go', 'pets', 'delete_pet.md'),
        'utf-8',
      );
      expect(content).toContain('resp, r, err := client.Pets.DeletePet(petId)');
    });

    it('generates correct Go for createPet (with body)', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'go', 'pets', 'create_pet.md'),
        'utf-8',
      );
      expect(content).toContain('body := openapi.CreatePetRequest{');
      expect(content).toContain('Name: "name_value"');
    });

    it('generates correct Go for findPetsByStatus (enum param)', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'go', 'pets', 'find_pets_by_status.md'),
        'utf-8',
      );
      expect(content).toContain('status := "available"');
    });
  });

  describe('end-to-end generate (with paramOverrides)', () => {
    let outputDir: string;

    beforeAll(() => {
      outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oage-go-overrides-'));
      const config = loadConfigOrDefault();
      config.paramOverrides = {
        global: { petId: '$petId' },
        tags: { Pets: { status: '$status' } },
        operations: { createPet: { name: '$name' } },
      };

      generate({
        inputSpec: PETSTORE,
        generator: 'go',
        outputDir,
        config,
      });
    });

    it('applies global override to petId (string type, quoted)', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'go', 'pets', 'get_pet_by_id.md'),
        'utf-8',
      );
      expect(content).toContain('petId := "$petId"');
    });

    it('applies tag-level override to status (string type, quoted)', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'go', 'pets', 'find_pets_by_status.md'),
        'utf-8',
      );
      expect(content).toContain('status := "$status"');
    });

    it('applies operation-level override to body property (string, quoted)', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'go', 'pets', 'create_pet.md'),
        'utf-8',
      );
      expect(content).toContain('Name: "$name",');
    });

    it('does not override params without matching rules', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'go', 'pets', 'list_pets.md'),
        'utf-8',
      );
      expect(content).not.toContain('$');
    });
  });

  describe('end-to-end generate (JSON output)', () => {
    let outputDir: string;

    beforeAll(() => {
      outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oage-go-json-'));
      const config = loadConfigOrDefault();
      config.outputFormats = ['json'];

      generate({
        inputSpec: PETSTORE,
        generator: 'go',
        outputDir,
        config,
      });
    });

    it('writes .json files instead of .md', () => {
      const petsDir = path.join(outputDir, 'usage', 'go', 'pets');
      expect(fs.existsSync(path.join(petsDir, 'get_pet_by_id.json'))).toBe(true);
      expect(fs.existsSync(path.join(petsDir, 'get_pet_by_id.md'))).toBe(false);
    });

    it('produces valid JSON with expected structure', () => {
      const raw = fs.readFileSync(
        path.join(outputDir, 'usage', 'go', 'pets', 'get_pet_by_id.json'),
        'utf-8',
      );
      const data = JSON.parse(raw);
      expect(data.operationId).toBe('getPetById');
      expect(data.tag).toBe('Pets');
      expect(data.httpMethod).toBe('GET');
      expect(data.path).toBe('/pets/{petId}');
      expect(data.codeBlockLang).toBe('go');
      expect(data.example).toContain('apiInstance.GetPetById(petId)');
      expect(data.parameters).toHaveLength(1);
      expect(data.parameters[0].name).toBe('petId');
      expect(data.parameters[0].type).toBe('string');
      expect(data.parameters[0].required).toBe(true);
    });

    it('includes requestBody for createPet', () => {
      const raw = fs.readFileSync(
        path.join(outputDir, 'usage', 'go', 'pets', 'create_pet.json'),
        'utf-8',
      );
      const data = JSON.parse(raw);
      expect(data.requestBody).toBeDefined();
      expect(data.requestBody.typeName).toBe('CreatePetRequest');
      expect(data.requestBody.construction).toContain('Name: "name_value"');
    });

    it('omits requestBody when absent', () => {
      const raw = fs.readFileSync(
        path.join(outputDir, 'usage', 'go', 'pets', 'list_pets.json'),
        'utf-8',
      );
      const data = JSON.parse(raw);
      expect(data.requestBody).toBeUndefined();
    });

    it('writes an index.json containing all operations', () => {
      const indexPath = path.join(outputDir, 'usage', 'go', 'index.json');
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
      outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oage-go-both-'));
      const config = loadConfigOrDefault();
      config.outputFormats = ['md', 'json'];

      generate({
        inputSpec: PETSTORE,
        generator: 'go',
        outputDir,
        config,
      });
    });

    it('writes both .md and .json files', () => {
      const petsDir = path.join(outputDir, 'usage', 'go', 'pets');
      expect(fs.existsSync(path.join(petsDir, 'get_pet_by_id.md'))).toBe(true);
      expect(fs.existsSync(path.join(petsDir, 'get_pet_by_id.json'))).toBe(true);
    });
  });
});
