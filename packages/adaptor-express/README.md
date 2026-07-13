# @xapi-js/adaptor-express

Express middleware for raw or schema-typed X-API handlers.

## Installation

```bash
pnpm add @xapi-js/core @xapi-js/adaptor-express express
```

## Typed usage

```ts
import express from 'express';
import { xapi } from '@xapi-js/core';
import { xapiExpress } from '@xapi-js/adaptor-express';

const search = xapi.operation({
  request: xapi.root({
    datasets: {
      input: xapi.dataset({ id: xapi.int() }),
    },
  }),
  response: xapi.root({
    datasets: {
      users: xapi.dataset({
        id: xapi.int(),
        name: xapi.string({ size: 100 }),
      }),
    },
  }),
});

const app = express();
app.use(express.text({ type: 'application/xml' }));
app.post('/xapi', xapiExpress(search, request => ({
  parameters: {},
  datasets: {
    users: request.datasets.input.map(({ id }) => ({ id, name: `user-${id}` })),
  },
})));
```

The handler request and response types are inferred from the operation. The
existing `xapiExpress(handler)` overload remains available for `XapiRoot`
handlers.

---

operation schema를 넘기면 Express 핸들러가 Dataset 대신 타입이 추론된 배열과
plain object를 직접 받고 반환합니다.
