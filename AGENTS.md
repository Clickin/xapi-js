# Repository Rules

## Performance-critical iteration

This is a low-level library. Changes MUST NOT impose avoidable allocation or iteration overhead on user code.

- Array traversal MUST use an indexed `for` loop (`for (let index = 0; index < array.length; index++)`).
- `for...of`, `for...in`, iterator helpers, and generators MUST NOT be used in performance-sensitive library code.
- Array higher-order methods that allocate or invoke callbacks—such as `map`, `filter`, `reduce`, `flatMap`, `forEach`, `find`, `findIndex`, and `some`—MUST NOT be used in library code.
- A non-indexed traversal is allowed only when an indexed loop cannot implement the operation. The reason MUST be documented next to that code.
- Avoid transient lookup arrays such as `["A", "B"].includes(value)` in hot paths; use direct comparisons or `switch`.

## Stable object shapes

- Known properties of intermediate objects—including `ColumnInfo`, `Column`, `ConstColumn`, `Col`, rows, parameters, and canonical wire objects—MUST be initialized together when the object is created.
- Optional known properties MUST be initialized to `undefined` rather than added later.
- Dynamic property addition is allowed only for schema-defined record keys that cannot be known in advance.
- When dynamic object keys must be enumerated, collect the keys once and traverse that key array with an indexed `for` loop.
