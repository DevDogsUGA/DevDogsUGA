import { expectTypeOf, it } from "vitest";
import type { RpcArguments } from "./rpc";

it("omits args for both generated empty shapes and keeps optional arguments", () => {
  expectTypeOf<RpcArguments<never>>().toEqualTypeOf<[]>();
  expectTypeOf<RpcArguments<Record<PropertyKey, never>>>().toEqualTypeOf<[]>();
  expectTypeOf<RpcArguments<{ a?: string }>>().toEqualTypeOf<
    [args: { a?: string }]
  >();
  expectTypeOf<RpcArguments<{ a: string }>>().toEqualTypeOf<
    [args: { a: string }]
  >();
});
