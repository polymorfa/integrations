import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectContract } from '../scripts/sync-api-contracts.mjs';
const coverage = { operations: { listConnections: { contract: 'platform', path: '/platform/connections', method: 'GET' } } };
function fixture() { return { openapi: '3.0.0', info: { title: 'Synthetic', version: '2026-09-22' }, paths: { '/platform/connections': { get: { operationId: 'listConnections', security: [{ ApiKeyAuth: [] }], responses: { 200: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Connection' } } } } } } }, '/console/private': { get: { operationId: 'private' } } }, components: { schemas: { Connection: { type: 'object', properties: { id: { type: 'string' } } }, Private: { type: 'object' } }, securitySchemes: { ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'Authorization' } } } }; }
test('public projection retains referenced authentication without importing private operations or unreachable schemas', () => {
  const source = fixture(); const result = projectContract(source, 'platform', coverage, []);
  assert.deepEqual(result.components.securitySchemes, source.components.securitySchemes);
  assert.deepEqual(Object.keys(result.paths), ['/platform/connections']);
  assert.deepEqual(Object.keys(result.components.schemas), ['Connection']);
  assert.deepEqual(result.paths['/platform/connections'].get, source.paths['/platform/connections'].get);
});
test('unresolved security requirements refuse generation', () => {
  const source = fixture(); delete source.components.securitySchemes;
  assert.throws(() => projectContract(source, 'platform', coverage, []), /Missing public component securitySchemes\/ApiKeyAuth/);
});
