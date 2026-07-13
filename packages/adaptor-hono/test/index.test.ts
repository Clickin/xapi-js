import { encodeRoot, parse, write, xapi } from '@xapi-js/core';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { xapiHono } from '../src';

const operation = xapi.operation({
  request: xapi.root({
    datasets: {
      input: xapi.dataset({ id: xapi.int() }),
    },
  }),
  response: xapi.root({
    parameters: { ErrorCode: xapi.int() },
    datasets: {
      output: xapi.dataset({ id: xapi.int(), name: xapi.string() }),
    },
  }),
});

describe('xapiHono', () => {
  it('serves a typed XAPI operation', async () => {
    const app = new Hono();
    app.post('/xapi', xapiHono(operation, request => ({
      parameters: { ErrorCode: 0 },
      datasets: {
        output: request.datasets.input.map(({ id }) => ({ id, name: `user-${id}` })),
      },
    })));

    const body = write(encodeRoot(operation.request, {
      parameters: {},
      datasets: { input: [{ id: 7 }] },
    }));
    const response = await app.request('/xapi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml' },
      body,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/xml');
    const root = parse(await response.text());
    expect(root.getParameter('ErrorCode')?.value).toBe(0);
    expect(root.getDataset('output')?.getColumn(0, 'name')).toBe('user-7');
  });

  it('rejects non-XML requests', async () => {
    const app = new Hono();
    app.post('/xapi', xapiHono(operation, async () => ({
      parameters: { ErrorCode: 0 },
      datasets: { output: [] },
    })));
    const response = await app.request('/xapi', { method: 'POST', body: '{}' });
    expect(response.status).toBe(415);
  });
});
