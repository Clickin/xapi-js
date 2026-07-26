# @xapi-js/adaptor-express

Express용 X-API middleware입니다. operation schema를 전달하면 handler는 타입이 추론된 plain object를 받고 반환합니다.

기본 codec은 Nexacro XML이며, codec을 지정하지 않은 기존 middleware 동작은 그대로 유지됩니다.

## 설치

```bash
pnpm add @xapi-js/core @xapi-js/adaptor-express express
```

## 기본 XML 사용

```ts
import express from "express";
import { xapi } from "@xapi-js/core";
import { xapiExpress } from "@xapi-js/adaptor-express";

const operation = xapi.operation({
  request: xapi.root({
    datasets: { input: xapi.dataset({ id: xapi.int() }) },
  }),
  response: xapi.root({
    datasets: { output: xapi.dataset({ id: xapi.int(), name: xapi.string() }) },
  }),
});

const app = express();
app.use(express.text({ type: "application/xml" }));
app.post("/xapi", xapiExpress(operation, request => ({
  parameters: {},
  datasets: {
    output: request.datasets.input.map(({ id }) => ({ id, name: `user-${id}` })),
  },
})));
```

codec을 생략하면 `application/xml`이 아닌 요청은 `next()`로 전달됩니다.

## operation codec

```ts
const operation = xapi.operation({
  codec: {
    profile: "nexacro-json-1.0",
    options: { zlib: true },
  },
  request: xapi.root({
    datasets: { input: xapi.dataset({ id: xapi.int() }) },
  }),
  response: xapi.root({
    datasets: { output: xapi.dataset({ id: xapi.int() }) },
  }),
});

const app = express();
app.use(express.raw({
  type: ["application/json", "application/x-ssv", "application/octet-stream"],
}));
app.post("/xapi", xapiExpress(operation, request => ({
  parameters: {},
  datasets: { output: request.datasets.input },
})));
```

Binary와 zlib transport를 처리하려면 `express.raw()`를 사용해 body를 Buffer로 유지해야 합니다. `Buffer`는 `Uint8Array`로 처리됩니다. JSON·SSV도 raw bytes로 유지하면 codec별 처리 경로가 동일합니다.

## 어댑터 옵션으로 codec 선택

operation을 수정하지 않고 middleware에 codec을 지정할 수 있습니다.

```ts
app.post("/xapi", xapiExpress(operationWithoutCodec, handler, {
  codec: {
    profile: "xplatform-binary-5000",
    options: { zlib: true },
  },
}));
```

operation의 codec이 있으면 adapter option보다 우선합니다. codec 객체에는 다음 필드를 지정할 수 있습니다.

- `profile`: `WireProfile`
- `options`: `WireCodecOptions` (`zlib`, `strict`, `limits` 등)
- `contentType`: 기본 media type을 서버 계약에 맞게 재정의

기본 media type은 XML `application/xml`, JSON `application/json`, SSV `application/x-ssv`, Binary `application/octet-stream`입니다.

## Raw `XapiRoot` handler

```ts
app.post("/xapi", xapiExpress(async root => {
  return root;
}, { codec: "nexacro-ssv" }));
```

raw handler에서도 codec을 지정하면 handler 전후의 `XapiRoot`와 wire body 변환은 middleware가 처리합니다.
