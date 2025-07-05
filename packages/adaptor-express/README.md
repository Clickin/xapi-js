# @xapi-ts/adaptor-express

This package provides an Express.js adaptor for X-API data.

## Installation

```bash
# npm
npm install @xapi-ts/adaptor-express

# yarn
yarn add @xapi-ts/adaptor-express

# pnpm
pnpm add @xapi-ts/adaptor-express

# bun
bun add @xapi-ts/adaptor-express

# deno
deno add @xapi-ts/adaptor-express
```

## Usage

Here's how to use `@xapi-ts/adaptor-express` with an Express application:

```typescript
import express from 'express';
import { xapiExpress } from '@xapi-ts/adaptor-express';
import { XapiRoot } from '@xapi-ts/core';

const app = express();

// Define your X-API handler function
const xapiHandler = async (xapi: XapiRoot): Promise<XapiRoot> => {
  // Process the incoming X-API request (xapi)
  // For example, you can access parameters or datasets:
  const service = xapi.parameters.get('service')?.value;
  console.log(`Service requested: ${service}`);

  // Create a response X-API object
  const responseXapi = new XapiRoot();
  responseXapi.addParameter({ id: 'result', value: 'success' });
  return responseXapi;
};

// Use the xapiExpress middleware
app.use('/xapi', xapiExpress(xapiHandler));

// Start the server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Express server listening on port ${PORT}`);
});
```

---

# @xapi-ts/adaptor-express

이 패키지는 X-API 데이터를 위한 Express.js 어댑터를 제공합니다.

## 설치

```bash
# npm
npm install @xapi-ts/adaptor-express

# yarn
yarn add @xapi-ts/adaptor-express

# pnpm
pnpm add @xapi-ts/adaptor-express

# bun
bun add @xapi-ts/adaptor-express

# deno
deno add @xapi-ts/adaptor-express
```

## 사용법

다음은 Express 애플리케이션에서 `@xapi-ts/adaptor-express`를 사용하는 방법입니다:

```typescript
import express from 'express';
import { xapiExpress } from '@xapi-ts/adaptor-express';
import { XapiRoot } from '@xapi-ts/core';

const app = express();

// X-API 핸들러 함수 정의
const xapiHandler = async (xapi: XapiRoot): Promise<XapiRoot> => {
  // 들어오는 X-API 요청(xapi) 처리
  // 예를 들어, 파라미터 또는 데이터셋에 접근할 수 있습니다:
  const service = xapi.parameters.get('service')?.value;
  console.log(`Service requested: ${service}`);

  // 응답 X-API 객체 생성
  const responseXapi = new XapiRoot();
  responseXapi.addParameter({ id: 'result', value: 'success' });
  return responseXapi;
};

// xapiExpress 미들웨어 사용
app.use('/xapi', xapiExpress(xapiHandler));

// 서버 시작
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Express server listening on port ${PORT}`);
});
```