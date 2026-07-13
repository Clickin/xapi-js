# @xapi-js/adaptor-hono

Typed X-API handlers for Hono.

```ts
import { xapi } from '@xapi-js/core';
import { xapiHono } from '@xapi-js/adaptor-hono';
import { Hono } from 'hono';

const search = xapi.operation({
  request: xapi.root({
    datasets: {
      input: xapi.dataset({ id: xapi.int() }),
    },
  }),
  response: xapi.root({
    datasets: {
      output: xapi.dataset({ id: xapi.int(), name: xapi.string() }),
    },
  }),
});

const app = new Hono();
app.post('/xapi', xapiHono(search, async request => ({
  parameters: {},
  datasets: {
    output: request.datasets.input.map(({ id }) => ({ id, name: `user-${id}` })),
  },
})));
```
