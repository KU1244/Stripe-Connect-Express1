// Safe helpers to store arbitrary objects into Prisma JSON fields
// without using `any`. These stringify->parse to guarantee JsonValue.

import { Prisma } from "@prisma/client";

/** Cast any serializable value to Prisma.InputJsonValue */
export const toJson = <T,>(v: T): Prisma.InputJsonValue =>
    JSON.parse(JSON.stringify(v)) as unknown as Prisma.InputJsonValue;

/** Like toJson, but pass through undefined/null */
export const toJsonOrUndefined = <T,>(
    v: T | undefined | null
): Prisma.InputJsonValue | undefined =>
    v == null ? undefined : (JSON.parse(JSON.stringify(v)) as unknown as Prisma.InputJsonValue);

