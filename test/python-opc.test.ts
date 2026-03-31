import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { NormalizedParam, NormalizedRequestBody } from '../src/spec/types.js';

// Side-effect import to register the adapter
import '../src/languages/python-opc.js';
import { getLanguageById } from '../src/languages/registry.js';
import { generate } from '../src/generator/pipeline.js';
import { loadConfigOrDefault } from '../src/config/loader.js';
import type { LanguageAdapter } from '../src/languages/types.js';

const PETSTORE = path.resolve(__dirname, 'fixtures', 'petstore.json');

describe('python-opc adapter', () => {
  let adapter: LanguageAdapter;

  beforeAll(() => {
    const a = getLanguageById('python-opc');
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
  });

  describe('toFileName', () => {
    it('converts to snake_case', () => {
      expect(adapter.toFileName('listPets')).toBe('list_pets');
      expect(adapter.toFileName('GetPetById')).toBe('get_pet_by_id');
    });
  });

  describe('toTagDirectory', () => {
    it('converts to snake_case', () => {
      expect(adapter.toTagDirectory('Pets')).toBe('pets');
      expect(adapter.toTagDirectory('TikTok LIVE')).toBe('tik_tok_live');
      expect(adapter.toTagDirectory('Alert Targets')).toBe('alert_targets');
    });
  });

  describe('toApiClassName', () => {
    it('returns snake_case (module directory name)', () => {
      expect(adapter.toApiClassName('Pets')).toBe('pets');
      expect(adapter.toApiClassName('TikTok LIVE')).toBe('tik_tok_live');
      expect(adapter.toApiClassName('Alert Targets')).toBe('alert_targets');
    });
  });

  describe('buildParamDeclaration', () => {
    it('generates snake_case typed declaration', () => {
      const param: NormalizedParam = {
        name: 'petId',
        in: 'path',
        required: true,
        schema: { type: 'string' },
      };
      expect(adapter.buildParamDeclaration(param)).toBe('pet_id: str = "petId_value"');
    });

    it('uses valueOverride', () => {
      const param: NormalizedParam = {
        name: 'account_id',
        in: 'path',
        required: true,
        schema: { type: 'integer' },
      };
      expect(adapter.buildParamDeclaration(param, '$account_id')).toBe('account_id: int = $account_id');
    });
  });

  describe('buildMethodCall', () => {
    it('builds module.asyncio() with keyword args and no positional args', () => {
      const result = adapter.buildMethodCall({
        clientVar: 'client',
        apiProperty: 'pets',
        methodName: 'list_pets',
        args: '',
        apiAccessPattern: 'dot',
      });
      expect(result).toBe('await list_pets.asyncio(client=client)');
    });

    it('builds module.asyncio() with keyword args', () => {
      const result = adapter.buildMethodCall({
        clientVar: 'client',
        apiProperty: 'pets',
        methodName: 'get_pet_by_id',
        args: 'petId',
        apiAccessPattern: 'dot',
      });
      expect(result).toBe('await get_pet_by_id.asyncio(client=client, pet_id=pet_id)');
    });

    it('converts body arg to keyword', () => {
      const result = adapter.buildMethodCall({
        clientVar: 'client',
        apiProperty: 'pets',
        methodName: 'create_pet',
        args: 'body',
        apiAccessPattern: 'dot',
      });
      expect(result).toBe('await create_pet.asyncio(client=client, body=body)');
    });

    it('handles multiple args', () => {
      const result = adapter.buildMethodCall({
        clientVar: 'client',
        apiProperty: 'alerts',
        methodName: 'create_alert',
        args: 'account_id, body',
        apiAccessPattern: 'dot',
      });
      expect(result).toBe('await create_alert.asyncio(client=client, account_id=account_id, body=body)');
    });

    it('ignores apiAccessPattern (always module-based)', () => {
      const result = adapter.buildMethodCall({
        clientVar: 'client',
        apiProperty: 'pets',
        methodName: 'list_pets',
        args: '',
        apiAccessPattern: 'direct',
      });
      expect(result).toBe('await list_pets.asyncio(client=client)');
    });
  });

  describe('buildBodyConstruction', () => {
    it('generates typed body with snake_case field names', () => {
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
      expect(result).toContain('body = CreatePetRequest(');
      expect(result).toContain('name="name_value"');
      expect(result).not.toContain('tag=');
    });

    it('uses dict syntax with colons when schemaName is absent', () => {
      const body: NormalizedRequestBody = {
        required: true,
        schema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            count: { type: 'integer' },
          },
          required: ['name', 'count'],
        },
      };
      const result = adapter.buildBodyConstruction(body);
      expect(result).toContain('body = {');
      expect(result).toContain('"name": "name_value"');
      expect(result).toContain('"count": 0');
      expect(result).not.toContain('name=');
    });

    it('converts camelCase properties to snake_case', () => {
      const body: NormalizedRequestBody = {
        required: true,
        schemaName: 'SendChatRequest',
        schema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string' },
            roomId: { type: 'string' },
            content: { type: 'string' },
          },
          required: ['sessionId', 'roomId', 'content'],
        },
      };
      const result = adapter.buildBodyConstruction(body);
      expect(result).toContain('session_id="sessionId_value"');
      expect(result).toContain('room_id="roomId_value"');
      expect(result).toContain('content="content_value"');
    });
  });

  describe('buildResultLine', () => {
    it('generates result assignment', () => {
      const result = adapter.buildResultLine('await list_pets.asyncio(client=client)', 'list[Pet]');
      expect(result).toBe('result = await list_pets.asyncio(client=client)');
    });
  });

  describe('end-to-end generate (default pattern)', () => {
    let outputDir: string;

    beforeAll(() => {
      outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oage-pyopc-default-'));
      const config = loadConfigOrDefault();

      generate({
        inputSpec: PETSTORE,
        generator: 'openapi-python-client',
        outputDir,
        config,
      });
    });

    it('writes files for all operations', () => {
      const petsDir = path.join(outputDir, 'usage', 'python-opc', 'pets');
      const storeDir = path.join(outputDir, 'usage', 'python-opc', 'store');

      expect(fs.existsSync(path.join(petsDir, 'list_pets.md'))).toBe(true);
      expect(fs.existsSync(path.join(petsDir, 'create_pet.md'))).toBe(true);
      expect(fs.existsSync(path.join(petsDir, 'get_pet_by_id.md'))).toBe(true);
      expect(fs.existsSync(path.join(storeDir, 'get_inventory.md'))).toBe(true);
    });

    it('generates module-based import and sync call', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'python-opc', 'pets', 'get_pet_by_id.md'),
        'utf-8',
      );
      expect(content).toContain('```python');
      expect(content).toContain('from ./api.api.pets import get_pet_by_id');
      expect(content).toContain('AuthenticatedClient');
      expect(content).toContain('pet_id: str = "petId_value"');
      expect(content).toContain('result = await get_pet_by_id.asyncio(client=apiInstance, pet_id=pet_id)');
    });

    it('generates correct output for listPets (no params)', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'python-opc', 'pets', 'list_pets.md'),
        'utf-8',
      );
      expect(content).toContain('result = await list_pets.asyncio(client=apiInstance, limit=limit, offset=offset)');
    });

    it('generates correct output for createPet (with body)', () => {
      const content = fs.readFileSync(
        path.join(outputDir, 'usage', 'python-opc', 'pets', 'create_pet.md'),
        'utf-8',
      );
      expect(content).toContain('body = CreatePetRequest(');
      expect(content).toContain('name="name_value"');
      expect(content).toContain('result = await create_pet.asyncio(client=apiInstance, body=body)');
    });

    it('writes an index.md', () => {
      const indexPath = path.join(outputDir, 'usage', 'python-opc', 'index.md');
      expect(fs.existsSync(indexPath)).toBe(true);
      const content = fs.readFileSync(indexPath, 'utf-8');
      expect(content).toContain('# Usage Examples (python-opc)');
    });
  });

  describe('end-to-end generate (JSON output)', () => {
    let outputDir: string;

    beforeAll(() => {
      outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oage-pyopc-json-'));
      const config = loadConfigOrDefault();
      config.outputFormats = ['json'];

      generate({
        inputSpec: PETSTORE,
        generator: 'openapi-python-client',
        outputDir,
        config,
      });
    });

    it('produces valid JSON with module-based example', () => {
      const raw = fs.readFileSync(
        path.join(outputDir, 'usage', 'python-opc', 'pets', 'get_pet_by_id.json'),
        'utf-8',
      );
      const data = JSON.parse(raw);
      expect(data.operationId).toBe('getPetById');
      expect(data.codeBlockLang).toBe('python');
      expect(data.example).toContain('await get_pet_by_id.asyncio(client=apiInstance, pet_id=pet_id)');
    });
  });
});
