import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import type { IHookFunctions, IWebhookFunctions, INodeType, INodeTypeDescription, IWebhookResponseData } from 'n8n-workflow';
import { events } from '../../shared/catalog';
import { activate, unsubscribe, authenticate, verify, envelope, find, identity } from '../../shared/hooks';
import { transport } from './transport';

export class PolymorfaTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Polymorfa Trigger', name: 'polymorfaTrigger', icon: { light: 'file:polymorfa.light.svg', dark: 'file:polymorfa.dark.svg' }, group: ['trigger'], version: 1,
    subtitle: '={{$parameter["eventGroup"]}}',
    description: 'Receive authenticated project events from Polymorfa', defaults: { name: 'Polymorfa Trigger' },
    inputs: [], outputs: [NodeConnectionTypes.Main], credentials: [{ name: 'polymorfaApi', required: true }],
    webhooks: [{ name: 'default', httpMethod: 'POST', responseMode: 'onReceived', path: 'webhook' }],
    properties: [
      { displayName: 'Event', name: 'eventGroup', type: 'options', default: 'messageReceived', options: Object.entries(events).map(([value, event]) => ({ name: event.label, value, description: event.description })) },
      { displayName: 'Subscription Key', name: 'subscriptionKey', type: 'string', required: true, default: '', description: 'A unique stable label for this trigger. Keep it on reactivation; use a different value for another trigger.' },
      { displayName: 'Events are project-wide. Filtering after receipt does not limit which Numbers disclose events to n8n.', name: 'scopeNotice', type: 'notice', default: '' },
    ],
  };
  webhookMethods = { default: {
    async checkExists(this: IHookFunctions) {
      const auth = await this.getCredentials('polymorfaApi');
      const url = this.getNodeWebhookUrl('default')!, group = this.getNodeParameter('eventGroup') as string, subscriptionKey = this.getNodeParameter('subscriptionKey') as string;
      const found = await find(auth, url, group, subscriptionKey, transport(this), 'n8n');
      const data = this.getWorkflowStaticData('node');
      // A hook without a stored signing secret (saved before verification existed, or whose activation
      // failed) is reported missing so n8n calls create, which rotates and stores a fresh secret.
      if (found && typeof data.signingSecret === 'string') data.subscription = { id: found.id, url, group, subscriptionKey, markerName: identity(auth, group, subscriptionKey).name };
      return !!found && typeof data.signingSecret === 'string';
    },
    async create(this: IHookFunctions) {
      const auth = await this.getCredentials('polymorfaApi');
      const data = this.getWorkflowStaticData('node');
      // Node static data keeps this activation's creation nonce private to n8n.
      const store = { get: () => data.pendingCreation, set: (value: unknown) => { if (value) data.pendingCreation = value; else delete data.pendingCreation; } };
      const { owned: hook, secret } = await activate(auth, this.getNodeWebhookUrl('default')!, this.getNodeParameter('eventGroup') as string, this.getNodeParameter('subscriptionKey') as string, transport(this), 'n8n', store);
      data.subscription = hook; data.signingSecret = secret; return true;
    },
    async delete(this: IHookFunctions) {
      const data = this.getWorkflowStaticData('node');
      const owned = data.subscription as { id: string; url: string; group: string; subscriptionKey: string; markerName: string } | undefined;
      if (owned) {
        await unsubscribe(await this.getCredentials('polymorfaApi'), owned.id, owned.url, owned.group, owned.subscriptionKey, transport(this), 'n8n', owned.markerName);
        delete data.subscription;
      }
      delete data.signingSecret;
      delete data.pendingCreation;
      return true;
    },
  } };
  async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const group = this.getNodeParameter('eventGroup') as string;
    const auth = await this.getCredentials('polymorfaApi');
    // Verify the exact raw bytes n8n received, before any JSON parsing. No secret or no raw body fails closed.
    const secret = this.getWorkflowStaticData('node').signingSecret;
    const headers = this.getHeaderData();
    if (!authenticate(auth, group, this.getNodeParameter('subscriptionKey') as string, headers) || !verify(secret, this.getRequestObject().rawBody, headers)) {
      this.getResponseObject().status(401).end(); return { noWebhookResponse: true };
    }
    try {
      const event = envelope(this.getBodyData(), group);
      return { workflowData: [this.helpers.returnJsonArray(event)] };
    } catch (error) { throw new NodeOperationError(this.getNode(), error as Error); }
  }
}
