import type { IAuthenticateGeneric, ICredentialTestRequest, ICredentialType, INodeProperties } from 'n8n-workflow';

export class PolymorfaApi implements ICredentialType {
  name = 'polymorfaApi';
  displayName = 'Polymorfa API';
  documentationUrl = 'https://docs.polymorfa.com';
  icon: ICredentialType['icon'] = { light: 'file:../nodes/Polymorfa/polymorfa.light.svg', dark: 'file:../nodes/Polymorfa/polymorfa.dark.svg' };
  properties: INodeProperties[] = [
    { displayName: 'Project Token', name: 'apiKey', type: 'string', typeOptions: { password: true }, default: '', required: true },
    { displayName: 'Project ID', name: 'projectId', type: 'string', default: '', required: true, description: 'The project UUID for the token. The token needs sessions:read to test the connection.' },
  ];
  authenticate: IAuthenticateGeneric = { type: 'generic', properties: { headers: { Authorization: '=Bearer {{$credentials.apiKey}}', 'Polymorfa-Version': '2026-09-22' } } };
  test: ICredentialTestRequest = { request: { baseURL: 'https://api.polymorfa.com', url: '/platform/sessions', qs: { projectId: '={{$credentials.projectId}}' } } };
}
