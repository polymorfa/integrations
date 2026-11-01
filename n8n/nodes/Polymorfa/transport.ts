import type { IExecuteFunctions, IHookFunctions, IWebhookFunctions, ILoadOptionsFunctions, IHttpRequestOptions } from 'n8n-workflow';

export function transport(context: IExecuteFunctions | IHookFunctions | IWebhookFunctions | ILoadOptionsFunctions) {
  return async (r: { method: string; url: string; headers: Record<string, string>; query?: Record<string, unknown>; body?: unknown }) => {
    const response = await context.helpers.httpRequest({
      method: r.method as IHttpRequestOptions['method'], url: r.url, headers: r.headers,
      qs: r.query as IHttpRequestOptions['qs'], body: r.body as IHttpRequestOptions['body'], json: true,
      returnFullResponse: true, ignoreHttpStatusErrors: true, disableFollowRedirect: true, timeout: 25000,
    });
    return { status: response.statusCode, headers: response.headers, body: response.body };
  };
}
