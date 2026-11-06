import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import type { IExecuteFunctions, ILoadOptionsFunctions, INodeExecutionData, INodeProperties, INodeType, INodeTypeDescription } from 'n8n-workflow';
import { actions, fields } from '../../shared/catalog';
import { execute, MAX_MEDIA_BYTES, IntegrationError } from '../../shared/core';
import { transport } from './transport';

type Field = { label: string; required?: boolean; help?: string; options?: Record<string, string>; default?: string; json?: boolean };
const descriptors = fields as Record<string, Field>;
const properties: INodeProperties[] = [
  { displayName: 'Operation', name: 'operation', type: 'options', noDataExpression: true, default: 'sendText', options: Object.entries(actions).map(([value, a]) => ({ name: a.label, value, description: a.description, action: a.label })) },
  ...Object.entries(descriptors).map(([name, f]): INodeProperties => ({
    displayName: f.label, name, type: f.options || name === 'session' ? 'options' : 'string', default: f.default ?? '',
    ...(name === 'session' ? { typeOptions: { loadOptionsMethod: 'getNumbers' } } : {}),
    required: f.required ?? false, description: f.help,
    ...(f.options ? { options: Object.entries({ ...f.options, ...(name === 'mediaSource' ? { binary: 'n8n Binary Input' } : {}) }).map(([value, label]) => ({ name: label, value })) } : {}),
    displayOptions: { show: { operation: Object.entries(actions).filter(([, a]) => (a.fields as readonly string[]).includes(name)).map(([key]) => key) } },
  })),
  { displayName: 'Binary Input Field', name: 'binaryProperty', type: 'string', default: 'data', required: true, displayOptions: { show: { operation: ['sendMedia'], mediaSource: ['binary'] } } },
];
// A binary input supplies media bytes directly; it does not require a second URL field.
const mediaField = properties.find(p => p.name === 'media');
if (mediaField) mediaField.displayOptions = { show: { operation: ['sendMedia'], mediaSource: ['url', 'base64'] } };

export class Polymorfa implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Polymorfa', name: 'polymorfa', icon: { light: 'file:polymorfa.light.svg', dark: 'file:polymorfa.dark.svg' }, group: ['transform'], version: 1,
    subtitle: '={{$parameter["operation"]}}', description: 'Send messages and use the Polymorfa API', defaults: { name: 'Polymorfa' },
    inputs: [NodeConnectionTypes.Main], outputs: [NodeConnectionTypes.Main], usableAsTool: true,
    credentials: [{ name: 'polymorfaApi', required: true }], properties,
  };
  methods = { loadOptions: {
    async getNumbers(this: ILoadOptionsFunctions) {
      const auth = await this.getCredentials('polymorfaApi');
      const result = await execute('listNumbers', {}, auth, transport(this), 'n8n');
      return result.data.map((n: { sessionId: string; name?: string | null }) => ({ name: n.name ? `${n.name} (${n.sessionId})` : n.sessionId, value: n.sessionId }));
    },
  } };
  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const auth = await this.getCredentials('polymorfaApi'); const result: INodeExecutionData[] = [];
    for (let i = 0; i < this.getInputData().length; i++) {
      try {
        const action = this.getNodeParameter('operation', i) as keyof typeof actions;
        const p: Record<string, unknown> = {};
        for (const name of actions[action].fields) p[name] = this.getNodeParameter(name, i, '');
        if (action === 'sendMedia' && p.mediaSource === 'binary') {
          const property = this.getNodeParameter('binaryProperty', i) as string;
          const bytes = await this.helpers.getBinaryDataBuffer(i, property);
          if (bytes.length > MAX_MEDIA_BYTES) throw new NodeOperationError(this.getNode(), 'Media exceeds the 4 MiB connector limit.', { itemIndex: i });
          p.mediaSource = 'base64'; p.media = bytes.toString('base64');
          p.mimeType ||= this.getInputData()[i].binary?.[property]?.mimeType;
        }
        const data = await execute(action, p, auth, transport(this), 'n8n');
        result.push({ json: data, pairedItem: { item: i } });
      } catch (error) {
        if (this.continueOnFail()) {
          // Machine-readable state lets a workflow branch on recovery codes. IntegrationError fields hold only sanitized values.
          const failure: Record<string, string | number> = { error: error instanceof Error ? error.message : 'Polymorfa request failed.' };
          if (error instanceof IntegrationError) {
            failure.code = error.code;
            if (error.status) failure.status = error.status;
            if (error.requestId) failure.requestId = error.requestId;
            if (error.retryAfter !== undefined) failure.retryAfter = error.retryAfter;
          }
          result.push({ json: failure, pairedItem: { item: i } });
          continue;
        }
        throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
      }
    }
    return [result];
  }
}
