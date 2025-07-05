# @xapi-ts/adaptor-nestjs

This package provides a NestJS adaptor for X-API data.

## Installation

```bash
# npm
npm install @xapi-ts/adaptor-nestjs

# yarn
yarn add @xapi-ts/adaptor-nestjs

# pnpm
pnpm add @xapi-ts/adaptor-nestjs

# bun
bun add @xapi-ts/adaptor-nestjs

# deno
deno add @xapi-ts/adaptor-nestjs
```

## Usage

`@xapi-ts/adaptor-nestjs` provides NestJS interceptors to automatically handle X-API request deserialization and response serialization.

### XapiRequestInterceptor

Use `XapiRequestInterceptor` to automatically parse incoming `application/xml` requests into `XapiRoot` objects.

```typescript
// app.controller.ts
import { Controller, Post, UseInterceptors, Body } from '@nestjs/common';
import { XapiRoot } from '@xapi-ts/core';
import { XapiRequestInterceptor } from '@xapi-ts/adaptor-nestjs';

@Controller('xapi')
export class AppController {
  @Post('/')
  @UseInterceptors(XapiRequestInterceptor)
  handleXapi(@Body() xapi: XapiRoot): XapiRoot {
    console.log('Received XapiRoot:', xapi.parameters.get('service')?.value);
    // Process the XapiRoot object
    const responseXapi = new XapiRoot();
    responseXapi.addParameter({ id: 'result', value: 'success' });
    return responseXapi;
  }
}
```

### XapiResponseInterceptor

Use `XapiResponseInterceptor` to automatically serialize `XapiRoot` objects returned from your NestJS controllers into `application/xml` responses.

```typescript
// app.controller.ts
import { Controller, Post, UseInterceptors, Body } from '@nestjs/common';
import { XapiRoot } from '@xapi-ts/core
import { XapiRequestInterceptor, XapiResponseInterceptor } from '@xapi-ts/adaptor-nestjs';

@Controller('xapi')
export class AppController {
  @Post('/')
  @UseInterceptors(XapiRequestInterceptor, XapiResponseInterceptor)
  handleXapi(@Body() xapi: XapiRoot): XapiRoot {
    console.log('Received XapiRoot:', xapi.parameters.get('service')?.value);
    // Process the XapiRoot object
    const responseXapi = new XapiRoot();
    responseXapi.addParameter({ id: 'result', value: 'success' });
    return responseXapi;
  }
}
```

---

# @xapi-ts/adaptor-nestjs

이 패키지는 X-API 데이터를 위한 NestJS 어댑터를 제공합니다.

## 설치

```bash
# npm
npm install @xapi-ts/adaptor-nestjs

# yarn
yarn add @xapi-ts/adaptor-nestjs

# pnpm
pnpm add @xapi-ts/adaptor-nestjs

# bun
bun add @xapi-ts/adaptor-nestjs

# deno
deno add @xapi-ts/adaptor-nestjs
```

## 사용법

`@xapi-ts/adaptor-nestjs`는 X-API 요청 역직렬화 및 응답 직렬화를 자동으로 처리하는 NestJS 인터셉터를 제공합니다.

### XapiRequestInterceptor

들어오는 `application/xml` 요청을 `XapiRoot` 객체로 자동 구문 분석하려면 `XapiRequestInterceptor`를 사용하십시오.

```typescript
// app.controller.ts
import { Controller, Post, UseInterceptors, Body } from '@nestjs/common';
import { XapiRoot } from '@xapi-ts/core';
import { XapiRequestInterceptor } from '@xapi-ts/adaptor-nestjs';

@Controller('xapi')
export class AppController {
  @Post('/')
  @UseInterceptors(XapiRequestInterceptor)
  handleXapi(@Body() xapi: XapiRoot): XapiRoot {
    console.log('Received XapiRoot:', xapi.parameters.get('service')?.value);
    // XapiRoot 객체 처리
    const responseXapi = new XapiRoot();
    responseXapi.addParameter({ id: 'result', value: 'success' });
    return responseXapi;
  }
}
```

### XapiResponseInterceptor

NestJS 컨트롤러에서 반환된 `XapiRoot` 객체를 `application/xml` 응답으로 자동 직렬화하려면 `XapiResponseInterceptor`를 사용하십시오.

```typescript
// app.controller.ts
import { Controller, Post, UseInterceptors, Body } from '@nestjs/common';
import { XapiRoot } from '@xapi-ts/core
import { XapiRequestInterceptor, XapiResponseInterceptor } from '@xapi-ts/adaptor-nestjs';

@Controller('xapi')
export class AppController {
  @Post('/')
  @UseInterceptors(XapiRequestInterceptor, XapiResponseInterceptor)
  handleXapi(@Body() xapi: XapiRoot): XapiRoot {
    console.log('Received XapiRoot:', xapi.parameters.get('service')?.value);
    // XapiRoot 객체 처리
    const responseXapi = new XapiRoot();
    responseXapi.addParameter({ id: 'result', value: 'success' });
    return responseXapi;
  }
}
```