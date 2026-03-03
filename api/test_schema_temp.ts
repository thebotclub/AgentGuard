import { z } from 'zod';

const s = z.string({ error: 'test' }).min(1, 'test');
console.log(s);
