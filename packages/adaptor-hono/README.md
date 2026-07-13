# @xapi-js/adaptor-hono

Schema-typed X-API handlers for Hono.

## Installation

```bash
pnpm add @xapi-js/core @xapi-js/adaptor-hono hono
```

## Usage

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
      users: xapi.dataset({ id: xapi.int(), name: xapi.string() }),
    },
  }),
});

const app = new Hono();
app.post('/xapi', xapiHono(search, request => ({
  parameters: {},
  datasets: {
    users: request.datasets.input.map(({ id }) => ({ id, name: `user-${id}` })),
  },
})));
```

The handler request and response are inferred from the operation and converted
to and from X-API XML automatically.

---

Hono 핸들러의 요청과 응답 타입은 operation schema에서 자동 추론되며 X-API
XML 변환도 어댑터가 처리합니다.
