/**
 * Auth middleware — validates JWT or API key, injects ServiceContext.
 * API key path is for agent SDK authentication.
 * JWT path is for human dashboard/CLI users.
 */
import type { Context, Next } from 'hono';
import type { ServiceContext } from '@agentguard/shared';
/**
 * Auth middleware: extracts and validates JWT or API key.
 * Injects ServiceContext into the Hono context as 'ctx'.
 */
export declare function authMiddleware(c: Context, next: Next): Promise<void>;
/** Get the ServiceContext from the current request — throws if not set. */
export declare function getContext(c: Context): ServiceContext;
//# sourceMappingURL=auth.d.ts.map