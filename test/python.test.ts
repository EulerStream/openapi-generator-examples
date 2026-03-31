import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { NormalizedParam, NormalizedRequestBody } from '../src/spec/types.js';

// Side-effect import to register the adapter
import '../src/languages/python.js';
import { getLanguageById } from '../src/languages/registry.js';
import { generate } from '../src/generator/pipeline.js';
import { loadConfig, loadConfigOrDefault } from '../src/config/loader.js';
import type { LanguageAdapter } from '../src/languages/types.js';

const PETSTORE = path.resolve(__dirname, 'fixtures', 'petstore.json');

describe('python adapter', () => {
  let adapter: LanguageAdapter;

  beforeAll(() => {
    const a = getLanguageById('python');
    expect(a).toBeDefined();
    adapter = a!;
  });

  describe('toMethodName', () => {
    it('converts camelCase to snake_case', () => {
      expect(adapter.toMethodName('listPets')).toBe('list_pets');
    });

    it('converts PascalCase to snake_case', () => {
      expect(adapter.toMethodName('GetPetById')).toBe('get_pet_by_id');
    });

    it('handles consecutive uppercase letters', () => {
      expect(adapter.toMethodName('getHTTPResponse')).toBe('get_http_response');
    });

    it('converts kebab-case to snake_case', () => {
      expect(adapter.toMethodName('list-pets')).toBe('list_pets');
    });
  });

  describe('toFileName', () => {
    it('returns snake_case', () => {
      expect(adapter.toFileName('listPets')).toBe('list_pets');
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
    it('maps string to str', () => {
      expect(adapter.mapType({ type: 'string' })).toBe('str');
    });

    it('maps integer to int', () => {
      expect(adapter.mapType({ type: 'integer' })).toBe('int');
    });

    it('maps number to float', () => {
      expect(adapter.mapType({ type: 'number' })).toBe('float');
    });

    it('maps boolean to bool', () => {
      expect(adapter.mapType({ type: 'boolean' })).toBe('bool');
    });

    it('maps string with date format to datetime', () => {
      expect(adapter.mapType({ type: 'string', format: 'date' })).toBe('datetime');
    });

    it('maps string with date-time format to datetime', () => {
      expect(adapter.mapType({ type: 'string', format: 'date-time' })).toBe('datetime');
    });

    it('maps array with items', () => {
      expect(adapter.mapType({ type: 'array', items: { type: 'string' } })).toBe('list[str]');
    });

    it('maps array without items', () => {
      expect(adapter.mapType({ type: 'array' })).toBe('list');
    });

    it('maps object to dict', () => {
      expect(adapter.mapType({ type: 'object' })).toBe('dict');
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

    it('falls back to datetime.now() for date-time type', () => {
      const param: NormalizedParam = {
        name: 'from',
        in: 'query',
        required: true,
        schema: { type: 'string', format: 'date-time' },
      };
      expect(adapter.exampleValue(param)).toBe('datetime.now()');
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

    it('falls back by type (boolean) with Python True', () => {
      const param: NormalizedParam = {
        name: 'active',
        in: 'query',
        required: false,
        schema: { type: 'boolean' },
      };
      expect(adapter.exampleValue(param)).toBe('True');
    });
  });

  describe('buildParamDeclaration', () => {
    it('generates declaration with type annotation', () => {
      const param: NormalizedParam = {
        name: 'petId',
        in: 'path',
        required: true,
        schema: { type: 'string' },
      };
      expect(adapter.buildParamDeclaration(param)).toBe('petId: str = "petId_value"');
    });

    it('uses valueOverride as-is for non-string types', () => {
      const param: NormalizedParam = {
        name: 'account_id',
        in: 'path',
        required: true,
        schema: { type: 'integer' },
      };
      expect(adapter.buildParamDeclaration(param, '$account_id')).toBe('account_id: int = $account_id');
    });

    it('wraps valueOverride in quotes for string types', () => {
      const param: NormalizedParam = {
        name: 'name',
        in: 'query',
        required: true,
        schema: { type: 'string' },
      };
      expect(adapter.buildParamDeclaration(param, '$name')).toBe('name: str = "$name"');
    });

    it('does not quote valueOverride for date types', () => {
      const param: NormalizedParam = {
        name: 'from',
        in: 'query',
        required: true,
        schema: { type: 'string', format: 'date-time' },
      };
      expect(adapter.buildParamDeclaration(param, '$from')).toBe('from: datetime = $from');
    });
  });

  describe('buildMethodCall', () => {
    it('builds direct access pattern (no apiProperty chain)', () => {
      const result = adapter.buildMethodCall({
        clientVar: 'apiInstance',
        apiProperty: 'pets',
        methodName: 'list_pets',
        args: '',
        apiAccessPattern: 'direct',
      });
      expect(result).toBe('apiInstance.list_pets()');
    });

    it('builds dot access pattern', () => {
      const result = adapter.buildMethodCall({
        clientVar: 'client',
        apiProperty: 'pets',
        methodName: 'list_pets',
        args: '',
        apiAccessPattern: 'dot',
      });
      expect(result).toBe('client.pets.list_pets()');
    });

    it('builds call access pattern', () => {
      const result = adapter.buildMethodCall({
        clientVar: 'client',
        apiProperty: 'pets',
        methodName: 'get_pet_by_id',
        args: 'petId',
        apiAccessPattern: 'call',
      });
      expect(result).toBe('client.pets().get_pet_by_id(petId)');
    });

    it('includes args', () => {
      const result = adapter.buildMethodCall({
        clientVar: 'sdk',
        apiProperty: 'store',
        methodName: 'get_inventory',
        args: 'limit, offset',
        apiAccessPattern: 'dot',
      });
      expect(result).toBe('sdk.store.get_inventory(limit, offset)');
    });
  });

  describe('buildBodyConstruction', () => {
    it('generates typed body with required properties using constructor', () => {
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
      expect(result).toContain('body = CreatePetRequest(');
      expect(result).toContain('name="name_value"');
      expect(result).toContain(')');
      expect(result).not.toContain('tag=');
      expect(result).not.toContain('status=');
    });

    it('uses dict literal when schemaName is absent', () => {
      const body: NormalizedRequestBody = {
        required: true,
        schema: {
          type: 'object',
          properties: { foo: { type: 'string' } },
          required: ['foo'],
        },
      };
      const result = adapter.buildBodyConstruction(body);
      expect(result).toContain('body = {');
      expect(result).not.toContain('Request');
    });

    it('generates nested object literals', () => {
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
      expect(result).toContain('body = CreateAlertTargetPayload(');
      expect(result).toContain('url={');
      expect(result).toContain('host="host_value",');
      expect(result).toContain('port=0,');
      expect(result).toContain('name="name_value",');
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
      expect(result).toContain('metadata={},');
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
      expect(result).toContain('tags=["item_value"],');
      expect(result).toContain('ids=[0],');
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
      expect(result).toContain('name="$name",');
      expect(result).toContain('count=$count,');
      expect(result).toContain('tag="tag_value",');
    });

    it('generates empty constructor for schema with no required properties', () => {
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
      expect(result).toBe('body = UpdatePetRequest()');
    });
  });

  describe('buildResultLine', () => {
    it('generates result assignment when return type exists', () => {
      const result = adapter.buildResultLine('apiInstance.list_pets()', 'list[Pet]');
      expect(result).toBe('result = apiInstance.list_pets()');
    });

    it('generates result assignment even when no return type', () => {
      const result = adapter.buildResultLine('apiInstance.delete_pet(petId)', undefined);
      expect(result).toBe('result = apiInstance.delete_pet(petId)');
    });
  });

  describe('end-to-end generate (default pattern)', () => {
    let outputDir: string;

    beforeAll(() => {
      outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oage-py-default-'));
      const config = loadConfigOrDefault();

      generate({
        inputSpec: PETSTORE,
        generator: 'python',
        outputDir,
        config,
      });
    });

    it('writes files for all operations', () => {
      const petsDir = path.join(outputDir, 'usage', 'python', 'pets');
      const storeDir = path.join(outputDir, 'usage', 'python', 'store');

      expect(fs.existsSync(path.join(petsDir, 'list_pets.md'))).toBe(true);
      expect(fs.existsSync(path.join(petsDir, 'create_pet.md'))).toBe(true);
      expect(fs.existsSync(path.join(petsDir, 'get_pet_by_id.md'))).toBe(true);
      expect(fs.existsSync(path.join(storeDir, 'get_inventory.md'))).toBe(true);
    });

    it('generates standard openapi-generator style for getPetById', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'python', 'pets', 'get_pet_by_id.md'),
        'utf-8',
      );
      expect(content).toContain('```python');
      expect(content).toContain('PetsApi');
      expect(content).toContain('Configuration');
      expect(content).toContain('apiInstance = PetsApi(configuration)');
      expect(content).toContain('petId: str = "petId_value"');
      expect(content).toContain('result = apiInstance.get_pet_by_id(petId)');
    });

    it('uses direct method call pattern (no apiProperty chain)', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'python', 'pets', 'list_pets.md'),
        'utf-8',
      );
      expect(content).not.toContain('.pets.');
      expect(content).toContain('apiInstance.list_pets(limit, offset)');
    });

    it('generates correct output for Store tag', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'python', 'store', 'get_inventory.md'),
        'utf-8',
      );
      expect(content).toContain('StoreApi');
      expect(content).toContain('apiInstance = StoreApi(configuration)');
    });

    it('generates correct output for deletePet (no return type)', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'python', 'pets', 'delete_pet.md'),
        'utf-8',
      );
      expect(content).toContain('result = apiInstance.delete_pet(petId)');
    });

    it('writes an index.md', () => {
      const indexPath = path.join(outputDir, 'usage', 'python', 'index.md');
      expect(fs.existsSync(indexPath)).toBe(true);
      const content = fs.readFileSync(indexPath, 'utf-8');
      expect(content).toContain('# Usage Examples (python)');
      expect(content).toContain('list_pets');
    });
  });

  describe('end-to-end generate (wrapper pattern)', () => {
    let outputDir: string;

    beforeAll(() => {
      outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oage-py-wrapper-'));
      const configPath = path.resolve(__dirname, '..', 'examples', 'python', 'python.config.yml');
      const config = loadConfig(configPath);

      generate({
        inputSpec: PETSTORE,
        generator: 'python',
        outputDir,
        config,
      });
    });

    it('writes files for all operations', () => {
      const petsDir = path.join(outputDir, 'usage', 'python', 'pets');
      const storeDir = path.join(outputDir, 'usage', 'python', 'store');

      expect(fs.existsSync(path.join(petsDir, 'list_pets.md'))).toBe(true);
      expect(fs.existsSync(path.join(petsDir, 'create_pet.md'))).toBe(true);
      expect(fs.existsSync(path.join(petsDir, 'get_pet_by_id.md'))).toBe(true);
      expect(fs.existsSync(path.join(petsDir, 'update_pet.md'))).toBe(true);
      expect(fs.existsSync(path.join(petsDir, 'delete_pet.md'))).toBe(true);
      expect(fs.existsSync(path.join(petsDir, 'find_pets_by_status.md'))).toBe(true);
      expect(fs.existsSync(path.join(storeDir, 'get_inventory.md'))).toBe(true);
    });

    it('generates wrapper-style Python for getPetById', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'python', 'pets', 'get_pet_by_id.md'),
        'utf-8',
      );
      expect(content).toContain('```python');
      expect(content).toContain('from euler_api_sdk import AuthenticatedClient');
      expect(content).toContain('client = AuthenticatedClient(');
      expect(content).toContain('petId: str = "petId_value"');
      expect(content).toContain('result = client.pets.get_pet_by_id(petId)');
    });

    it('generates correct Python for deletePet (no return type)', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'python', 'pets', 'delete_pet.md'),
        'utf-8',
      );
      expect(content).toContain('result = client.pets.delete_pet(petId)');
    });

    it('generates correct Python for createPet (with body)', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'python', 'pets', 'create_pet.md'),
        'utf-8',
      );
      expect(content).toContain('body = CreatePetRequest(');
      expect(content).toContain('name="name_value"');
    });

    it('generates correct Python for findPetsByStatus (enum param)', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'python', 'pets', 'find_pets_by_status.md'),
        'utf-8',
      );
      expect(content).toContain('status: str = "available"');
    });
  });

  describe('end-to-end generate (with paramOverrides)', () => {
    let outputDir: string;

    beforeAll(() => {
      outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oage-py-overrides-'));
      const config = loadConfigOrDefault();
      config.paramOverrides = {
        global: { petId: '$petId' },
        tags: { Pets: { status: '$status' } },
        operations: { createPet: { name: '$name' } },
      };

      generate({
        inputSpec: PETSTORE,
        generator: 'python',
        outputDir,
        config,
      });
    });

    it('applies global override to petId (string type, quoted)', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'python', 'pets', 'get_pet_by_id.md'),
        'utf-8',
      );
      expect(content).toContain('petId: str = "$petId"');
    });

    it('applies tag-level override to status (string type, quoted)', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'python', 'pets', 'find_pets_by_status.md'),
        'utf-8',
      );
      expect(content).toContain('status: str = "$status"');
    });

    it('applies operation-level override to body property (string, quoted)', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'python', 'pets', 'create_pet.md'),
        'utf-8',
      );
      expect(content).toContain('name="$name",');
    });

    it('does not override params without matching rules', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'python', 'pets', 'list_pets.md'),
        'utf-8',
      );
      expect(content).not.toContain('$');
    });
  });

  describe('end-to-end generate (JSON output)', () => {
    let outputDir: string;

    beforeAll(() => {
      outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oage-py-json-'));
      const config = loadConfigOrDefault();
      config.outputFormats = ['json'];

      generate({
        inputSpec: PETSTORE,
        generator: 'python',
        outputDir,
        config,
      });
    });

    it('writes .json files instead of .md', () => {
      const petsDir = path.join(outputDir, 'usage', 'python', 'pets');
      expect(fs.existsSync(path.join(petsDir, 'get_pet_by_id.json'))).toBe(true);
      expect(fs.existsSync(path.join(petsDir, 'get_pet_by_id.md'))).toBe(false);
    });

    it('produces valid JSON with expected structure', () => {
      const raw = fs.readFileSync(
        path.join(outputDir, 'usage', 'python', 'pets', 'get_pet_by_id.json'),
        'utf-8',
      );
      const data = JSON.parse(raw);
      expect(data.operationId).toBe('getPetById');
      expect(data.tag).toBe('Pets');
      expect(data.httpMethod).toBe('GET');
      expect(data.path).toBe('/pets/{petId}');
      expect(data.codeBlockLang).toBe('python');
      expect(data.example).toContain('apiInstance.get_pet_by_id(petId)');
      expect(data.parameters).toHaveLength(1);
      expect(data.parameters[0].name).toBe('petId');
      expect(data.parameters[0].type).toBe('str');
      expect(data.parameters[0].required).toBe(true);
    });

    it('includes requestBody for createPet', () => {
      const raw = fs.readFileSync(
        path.join(outputDir, 'usage', 'python', 'pets', 'create_pet.json'),
        'utf-8',
      );
      const data = JSON.parse(raw);
      expect(data.requestBody).toBeDefined();
      expect(data.requestBody.typeName).toBe('CreatePetRequest');
      expect(data.requestBody.construction).toContain('name="name_value"');
    });

    it('omits requestBody when absent', () => {
      const raw = fs.readFileSync(
        path.join(outputDir, 'usage', 'python', 'pets', 'list_pets.json'),
        'utf-8',
      );
      const data = JSON.parse(raw);
      expect(data.requestBody).toBeUndefined();
    });

    it('writes an index.json containing all operations', () => {
      const indexPath = path.join(outputDir, 'usage', 'python', 'index.json');
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
      outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oage-py-both-'));
      const config = loadConfigOrDefault();
      config.outputFormats = ['md', 'json'];

      generate({
        inputSpec: PETSTORE,
        generator: 'python',
        outputDir,
        config,
      });
    });

    it('writes both .md and .json files', () => {
      const petsDir = path.join(outputDir, 'usage', 'python', 'pets');
      expect(fs.existsSync(path.join(petsDir, 'get_pet_by_id.md'))).toBe(true);
      expect(fs.existsSync(path.join(petsDir, 'get_pet_by_id.json'))).toBe(true);
    });
  });
});
