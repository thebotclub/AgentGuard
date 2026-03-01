/**
 * Prisma client singleton with connection pooling.
 * Aligned with ARCHITECTURE.md §5.3 connection pooling standard.
 */
import { Pool } from 'pg';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
const pool = new Pool({
    connectionString: process.env['DATABASE_URL'],
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: process.env['SERVICE_NAME'] ?? 'agentguard-api',
});
// Slow query logging — team standard: log queries > 1000ms
pool.on('connect', (client) => {
    void client.query(`SET log_min_duration_statement = 1000`);
});
const adapter = new PrismaPg(pool);
export const prisma = new PrismaClient({
    adapter,
    log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
    ],
});
prisma.$on('query', (e) => {
    if (e.duration > 1_000) {
        console.warn('[slow_query]', {
            duration: e.duration,
            query: e.query.slice(0, 200),
        });
    }
});
prisma.$on('warn', (e) => {
    console.warn('[prisma:warn]', e.message);
});
prisma.$on('error', (e) => {
    console.error('[prisma:error]', e.message);
});
//# sourceMappingURL=prisma.js.map