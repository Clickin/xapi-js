# @xapi-js/adaptor-hono

Hono용 타입 안전 X-API handler입니다. operation schema에서 요청·응답 타입을 추론하며, codec을 지정하면 JSON·XML·SSV·Binary wire protocol을 자동 처리합니다.

기본 codec은 Nexacro XML입니다.

## 설치

```bash
pnpm add @xapi-js/core @xapi-js/adaptor-hono hono
```

## 기본 XML 사용

```ts
import { Hono } from "hono";
import { xapi } from "@xapi-js/core";
import { xapiHono } from "@xapi-js/adaptor-hono";

const operation = xapi.operation({
  request: xapi.root({
    datasets: { input: xapi.dataset({ id: xapi.int() }) },
  }),
  response: xapi.root({
    datasets: { output: xapi.dataset({ id: xapi.int(), name: xapi.string() }) },
  }),
});

const app = new Hono();
app.post("/xapi", xapiHono(operation, request => ({
  parameters: {},
  datasets: {
    output: request.datasets.input.map(({ id }) => ({ id, name: `user-${id}` })),
  },
})));
```

codec을 생략하면 `application/xml`만 처리하고, 응답도 `application/xml`로 반환합니다.

## operation codec 선택

```ts
const operation = xapi.operation({
  codec: {
    profile: "xplatform-binary-5000",
    options: { zlib: true },
  },
  request: xapi.root({
    datasets: { input: xapi.dataset({ id: xapi.int() }) },
  }),
  response: xapi.root({
    datasets: { output: xapi.dataset({ id: xapi.int() }) },
  }),
});

app.post("/xapi", xapiHono(operation, request => ({
  parameters: {},
  datasets: { output: request.datasets.input },
})));
```

Hono 어댑터는 codec 선택 시 `Request.arrayBuffer()`로 body를 읽으므로 Binary와 zlib payload를 별도 parser 없이 처리합니다. 기본 media type은 XML `application/xml`, JSON `application/json`, SSV `application/x-ssv`, Binary `application/octet-stream`입니다.

## 어댑터 옵션

operation에 codec을 넣지 않고 handler 등록 시점에 선택할 수 있습니다.

```ts
app.post("/xapi", xapiHono(operationWithoutCodec, handler, {
  codec: {
    profile: "nexacro-json-1.0",
    contentType: "application/json",
  },
}));
```

operation에 지정한 codec은 adapter option보다 우선합니다. codec 옵션의 `zlib`, `strict`, `limits` 등은 `@xapi-js/core`의 `WireCodecOptions`와 동일합니다.

잘못된 Content-Type은 `415` 응답을 반환합니다. 서버가 기본 media type과 다른 값을 사용하면 codec 객체의 `contentType`을 지정하십시오.
