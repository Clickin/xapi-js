# xapi-ts

This is a monorepo for xapi-ts, a TypeScript implementation of Tobesoft's X-API for communication with Nexacro Platform and XPlatform solutions. The XML structure definition refers to [https://docs.tobesoft.com/admin_guide_xplatform_ko/677db8865945f4f9#824af6a836cea237](https://docs.tobesoft.com/admin_guide_xplatform_ko/677db8865945f4f9#824af6a836cea237) and [https://docs.tobesoft.com/admin_guide_nexacro_14_ko/9f3df243cfdca430](https://docs.tobesoft.com/admin_guide_nexacro_14_ko/9f3df243cfdca430).

## Packages

- `core`: Core utilities and types for X-API.
- `adaptor-express`: Express.js adaptor for X-API.
- `adaptor-fetch`: Fetch API adaptor for X-API.
- `adaptor-nestjs`: NestJS adaptor for X-API.

## Installation

xapi-ts can be installed using various package managers. It supports Node.js v18+, Deno, Bun, and modern browsers (excluding framework-specific adaptors).

```bash
# npm
npm install @xapi-ts/core

# yarn
yarn add @xapi-ts/core

# pnpm
pnpm add @xapi-ts/core

# bun
bun add @xapi-ts/core

# deno
deno add @xapi-ts/core
```

## Development

```bash
pnpm dev
```

## Testing

```bash
pnpm test
```

---

# xapi-ts

X-API 데이터를 TypeScript에서 다루기 위한 라이브러리 모음인 xapi-ts 모노레포입니다. 이 프로젝트는 투비소프트의 넥사크로 플랫폼 및 XPlatform 솔루션과의 통신을 위한 X-API의 타입스크립트 구현체입니다. XML 구조 정의는 [https://docs.tobesoft.com/admin_guide_xplatform_ko/677db8865945f4f9#824af6a836cea237](https://docs.tobesoft.com/admin_guide_xplatform_ko/677db8865945f4f9#824af6a836cea237) 및 [https://docs.tobesoft.com/admin_guide_nexacro_14_ko/9f3df243cfdca430](https://docs.tobesoft.com/admin_guide_nexacro_14_ko/9f3df243cfdca430)를 참조하였습니다.

## 패키지

- `core`: X-API를 위한 핵심 유틸리티 및 타입.
- `adaptor-express`: Express.js X-API 어댑터.
- `adaptor-fetch`: Fetch API X-API 어댑터.
- `adaptor-nestjs`: NestJS X-API 어댑터.

## 설치

xapi-ts는 다양한 패키지 관리자를 통해 설치할 수 있습니다. Node.js v18+, Deno, Bun, 그리고 최신 브라우저(프레임워크별 어댑터 제외)를 지원합니다.

```bash
# npm
npm install @xapi-ts/core

# yarn
yarn add @xapi-ts/core

# pnpm
pnpm add @xapi-ts/core

# bun
bun add @xapi-ts/core

# deno
deno add @xapi-ts/core
```

## 개발

```bash
pnpm dev
```

## 테스트

```bash
pnpm test
```