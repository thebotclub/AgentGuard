import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
export declare const prisma: PrismaClient<{
    adapter: PrismaPg;
    log: ({
        emit: "event";
        level: "query";
    } | {
        emit: "event";
        level: "warn";
    } | {
        emit: "event";
        level: "error";
    })[];
}, "error" | "query" | "warn", import("@prisma/client/runtime/library").DefaultArgs>;
export type { PrismaClient } from '@prisma/client';
//# sourceMappingURL=prisma.d.ts.map