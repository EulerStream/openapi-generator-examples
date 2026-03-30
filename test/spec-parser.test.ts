import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { parseSpec } from '../src/spec/parser.js';

const PETSTORE = path.resolve(__dirname, 'fixtures', 'petstore.json');

describe('spec parser', () => {
  it('parses all operations from petstore spec', () => {
    const ops = parseSpec(PETSTORE);
    const ids = ops.map((o) => o.operationId);

    expect(ids).toContain('listPets');
    expect(ids).toContain('createPet');
    expect(ids).toContain('getPetById');
    expect(ids).toContain('updatePet');
    expect(ids).toContain('deletePet');
    expect(ids).toContain('getInventory');
    expect(ids).toContain('findPetsByStatus');
    expect(ops).toHaveLength(7);
  });

  it('extracts parameters correctly', () => {
    const ops = parseSpec(PETSTORE);
    const listPets = ops.find((o) => o.operationId === 'listPets')!;

    expect(listPets.parameters).toHaveLength(2);
    expect(listPets.parameters[0].name).toBe('limit');
    expect(listPets.parameters[0].required).toBe(false);
    expect(listPets.parameters[0].schema.type).toBe('integer');
    expect(listPets.parameters[0].schema.default).toBe(20);
  });

  it('extracts path parameters', () => {
    const ops = parseSpec(PETSTORE);
    const getPet = ops.find((o) => o.operationId === 'getPetById')!;

    expect(getPet.parameters).toHaveLength(1);
    expect(getPet.parameters[0].name).toBe('petId');
    expect(getPet.parameters[0].in).toBe('path');
    expect(getPet.parameters[0].required).toBe(true);
  });

  it('extracts request body with $ref resolution', () => {
    const ops = parseSpec(PETSTORE);
    const createPet = ops.find((o) => o.operationId === 'createPet')!;

    expect(createPet.requestBody).toBeDefined();
    expect(createPet.requestBody!.schemaName).toBe('CreatePetRequest');
    expect(createPet.requestBody!.required).toBe(true);
    expect(createPet.requestBody!.schema.properties).toBeDefined();
    expect(createPet.requestBody!.schema.properties!.name.type).toBe('string');
  });

  it('extracts response type', () => {
    const ops = parseSpec(PETSTORE);
    const getPet = ops.find((o) => o.operationId === 'getPetById')!;
    expect(getPet.responseType).toBe('Pet');
  });

  it('extracts enum parameters', () => {
    const ops = parseSpec(PETSTORE);
    const findByStatus = ops.find((o) => o.operationId === 'findPetsByStatus')!;

    expect(findByStatus.parameters[0].schema.enum).toEqual(['available', 'pending', 'sold']);
  });

  it('extracts tags', () => {
    const ops = parseSpec(PETSTORE);
    const inventory = ops.find((o) => o.operationId === 'getInventory')!;
    expect(inventory.tag).toBe('Store');
  });

  it('extracts security schemes', () => {
    const ops = parseSpec(PETSTORE);
    expect(ops[0].security).toContain('api_key');
  });

  it('extracts HTTP method and path', () => {
    const ops = parseSpec(PETSTORE);
    const createPet = ops.find((o) => o.operationId === 'createPet')!;
    expect(createPet.httpMethod).toBe('POST');
    expect(createPet.path).toBe('/pets');
  });
});
