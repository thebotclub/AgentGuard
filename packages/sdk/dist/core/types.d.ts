/**
 * AgentGuard Core Types
 *
 * All types are derived from Zod schemas so runtime validation and static
 * types stay in sync. Schemas align exactly with DATA_MODEL.md and
 * POLICY_ENGINE.md specifications.
 *
 * Import schemas when parsing untrusted input; import inferred types for
 * function signatures.
 */
import { z } from 'zod';
export declare const StringConstraintSchema: z.ZodObject<{
    eq: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
    not_eq: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
    in: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
    not_in: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
    contains: z.ZodOptional<z.ZodString>;
    contains_any: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    pattern: z.ZodOptional<z.ZodString>;
    regex: z.ZodOptional<z.ZodString>;
    domain_not_in: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    exists: z.ZodOptional<z.ZodBoolean>;
    is_null: z.ZodOptional<z.ZodBoolean>;
}, "strict", z.ZodTypeAny, {
    eq?: string | number | boolean | undefined;
    not_eq?: string | number | boolean | undefined;
    in?: (string | number)[] | undefined;
    not_in?: (string | number)[] | undefined;
    contains?: string | undefined;
    contains_any?: string[] | undefined;
    pattern?: string | undefined;
    regex?: string | undefined;
    domain_not_in?: string[] | undefined;
    exists?: boolean | undefined;
    is_null?: boolean | undefined;
}, {
    eq?: string | number | boolean | undefined;
    not_eq?: string | number | boolean | undefined;
    in?: (string | number)[] | undefined;
    not_in?: (string | number)[] | undefined;
    contains?: string | undefined;
    contains_any?: string[] | undefined;
    pattern?: string | undefined;
    regex?: string | undefined;
    domain_not_in?: string[] | undefined;
    exists?: boolean | undefined;
    is_null?: boolean | undefined;
}>;
export type StringConstraint = z.infer<typeof StringConstraintSchema>;
export declare const NumericConstraintSchema: z.ZodObject<{
    eq: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodBoolean]>>;
    not_eq: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodBoolean]>>;
    gt: z.ZodOptional<z.ZodNumber>;
    gte: z.ZodOptional<z.ZodNumber>;
    lt: z.ZodOptional<z.ZodNumber>;
    lte: z.ZodOptional<z.ZodNumber>;
    in: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
    exists: z.ZodOptional<z.ZodBoolean>;
}, "strict", z.ZodTypeAny, {
    eq?: number | boolean | undefined;
    not_eq?: number | boolean | undefined;
    in?: number[] | undefined;
    exists?: boolean | undefined;
    gt?: number | undefined;
    gte?: number | undefined;
    lt?: number | undefined;
    lte?: number | undefined;
}, {
    eq?: number | boolean | undefined;
    not_eq?: number | boolean | undefined;
    in?: number[] | undefined;
    exists?: boolean | undefined;
    gt?: number | undefined;
    gte?: number | undefined;
    lt?: number | undefined;
    lte?: number | undefined;
}>;
export type NumericConstraint = z.infer<typeof NumericConstraintSchema>;
export declare const ValueConstraintSchema: z.ZodUnion<[z.ZodObject<{
    eq: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
    not_eq: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
    in: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
    not_in: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
    contains: z.ZodOptional<z.ZodString>;
    contains_any: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    pattern: z.ZodOptional<z.ZodString>;
    regex: z.ZodOptional<z.ZodString>;
    domain_not_in: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    exists: z.ZodOptional<z.ZodBoolean>;
    is_null: z.ZodOptional<z.ZodBoolean>;
}, "strict", z.ZodTypeAny, {
    eq?: string | number | boolean | undefined;
    not_eq?: string | number | boolean | undefined;
    in?: (string | number)[] | undefined;
    not_in?: (string | number)[] | undefined;
    contains?: string | undefined;
    contains_any?: string[] | undefined;
    pattern?: string | undefined;
    regex?: string | undefined;
    domain_not_in?: string[] | undefined;
    exists?: boolean | undefined;
    is_null?: boolean | undefined;
}, {
    eq?: string | number | boolean | undefined;
    not_eq?: string | number | boolean | undefined;
    in?: (string | number)[] | undefined;
    not_in?: (string | number)[] | undefined;
    contains?: string | undefined;
    contains_any?: string[] | undefined;
    pattern?: string | undefined;
    regex?: string | undefined;
    domain_not_in?: string[] | undefined;
    exists?: boolean | undefined;
    is_null?: boolean | undefined;
}>, z.ZodObject<{
    eq: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodBoolean]>>;
    not_eq: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodBoolean]>>;
    gt: z.ZodOptional<z.ZodNumber>;
    gte: z.ZodOptional<z.ZodNumber>;
    lt: z.ZodOptional<z.ZodNumber>;
    lte: z.ZodOptional<z.ZodNumber>;
    in: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
    exists: z.ZodOptional<z.ZodBoolean>;
}, "strict", z.ZodTypeAny, {
    eq?: number | boolean | undefined;
    not_eq?: number | boolean | undefined;
    in?: number[] | undefined;
    exists?: boolean | undefined;
    gt?: number | undefined;
    gte?: number | undefined;
    lt?: number | undefined;
    lte?: number | undefined;
}, {
    eq?: number | boolean | undefined;
    not_eq?: number | boolean | undefined;
    in?: number[] | undefined;
    exists?: boolean | undefined;
    gt?: number | undefined;
    gte?: number | undefined;
    lt?: number | undefined;
    lte?: number | undefined;
}>]>;
export type ValueConstraint = z.infer<typeof ValueConstraintSchema>;
export declare const ToolConditionSchema: z.ZodObject<{
    in: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    not_in: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    matches: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    regex: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    in?: string[] | undefined;
    not_in?: string[] | undefined;
    regex?: string | undefined;
    matches?: string[] | undefined;
}, {
    in?: string[] | undefined;
    not_in?: string[] | undefined;
    regex?: string | undefined;
    matches?: string[] | undefined;
}>;
export type ToolCondition = z.infer<typeof ToolConditionSchema>;
export declare const DayOfWeekSchema: z.ZodEnum<["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]>;
export type DayOfWeek = z.infer<typeof DayOfWeekSchema>;
export declare const TimeWindowRangeSchema: z.ZodObject<{
    days: z.ZodArray<z.ZodEnum<["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]>, "many">;
    hours: z.ZodObject<{
        start: z.ZodString;
        end: z.ZodString;
        tz: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        start: string;
        end: string;
        tz: string;
    }, {
        start: string;
        end: string;
        tz: string;
    }>;
}, "strip", z.ZodTypeAny, {
    days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
    hours: {
        start: string;
        end: string;
        tz: string;
    };
}, {
    days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
    hours: {
        start: string;
        end: string;
        tz: string;
    };
}>;
export type TimeWindowRange = z.infer<typeof TimeWindowRangeSchema>;
export declare const TimeWindowSchema: z.ZodObject<{
    within: z.ZodOptional<z.ZodObject<{
        days: z.ZodArray<z.ZodEnum<["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]>, "many">;
        hours: z.ZodObject<{
            start: z.ZodString;
            end: z.ZodString;
            tz: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            start: string;
            end: string;
            tz: string;
        }, {
            start: string;
            end: string;
            tz: string;
        }>;
    }, "strip", z.ZodTypeAny, {
        days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
        hours: {
            start: string;
            end: string;
            tz: string;
        };
    }, {
        days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
        hours: {
            start: string;
            end: string;
            tz: string;
        };
    }>>;
    outside: z.ZodOptional<z.ZodObject<{
        days: z.ZodArray<z.ZodEnum<["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]>, "many">;
        hours: z.ZodObject<{
            start: z.ZodString;
            end: z.ZodString;
            tz: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            start: string;
            end: string;
            tz: string;
        }, {
            start: string;
            end: string;
            tz: string;
        }>;
    }, "strip", z.ZodTypeAny, {
        days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
        hours: {
            start: string;
            end: string;
            tz: string;
        };
    }, {
        days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
        hours: {
            start: string;
            end: string;
            tz: string;
        };
    }>>;
}, "strip", z.ZodTypeAny, {
    within?: {
        days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
        hours: {
            start: string;
            end: string;
            tz: string;
        };
    } | undefined;
    outside?: {
        days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
        hours: {
            start: string;
            end: string;
            tz: string;
        };
    } | undefined;
}, {
    within?: {
        days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
        hours: {
            start: string;
            end: string;
            tz: string;
        };
    } | undefined;
    outside?: {
        days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
        hours: {
            start: string;
            end: string;
            tz: string;
        };
    } | undefined;
}>;
export type TimeWindow = z.infer<typeof TimeWindowSchema>;
export declare const WhenConditionSchema: z.ZodUnion<[z.ZodObject<{
    tool: z.ZodObject<{
        in: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        not_in: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        matches: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        regex: z.ZodOptional<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        in?: string[] | undefined;
        not_in?: string[] | undefined;
        regex?: string | undefined;
        matches?: string[] | undefined;
    }, {
        in?: string[] | undefined;
        not_in?: string[] | undefined;
        regex?: string | undefined;
        matches?: string[] | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    tool: {
        in?: string[] | undefined;
        not_in?: string[] | undefined;
        regex?: string | undefined;
        matches?: string[] | undefined;
    };
}, {
    tool: {
        in?: string[] | undefined;
        not_in?: string[] | undefined;
        regex?: string | undefined;
        matches?: string[] | undefined;
    };
}>, z.ZodObject<{
    params: z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodObject<{
        eq: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
        not_eq: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
        in: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
        not_in: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
        contains: z.ZodOptional<z.ZodString>;
        contains_any: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        pattern: z.ZodOptional<z.ZodString>;
        regex: z.ZodOptional<z.ZodString>;
        domain_not_in: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        exists: z.ZodOptional<z.ZodBoolean>;
        is_null: z.ZodOptional<z.ZodBoolean>;
    }, "strict", z.ZodTypeAny, {
        eq?: string | number | boolean | undefined;
        not_eq?: string | number | boolean | undefined;
        in?: (string | number)[] | undefined;
        not_in?: (string | number)[] | undefined;
        contains?: string | undefined;
        contains_any?: string[] | undefined;
        pattern?: string | undefined;
        regex?: string | undefined;
        domain_not_in?: string[] | undefined;
        exists?: boolean | undefined;
        is_null?: boolean | undefined;
    }, {
        eq?: string | number | boolean | undefined;
        not_eq?: string | number | boolean | undefined;
        in?: (string | number)[] | undefined;
        not_in?: (string | number)[] | undefined;
        contains?: string | undefined;
        contains_any?: string[] | undefined;
        pattern?: string | undefined;
        regex?: string | undefined;
        domain_not_in?: string[] | undefined;
        exists?: boolean | undefined;
        is_null?: boolean | undefined;
    }>, z.ZodObject<{
        eq: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodBoolean]>>;
        not_eq: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodBoolean]>>;
        gt: z.ZodOptional<z.ZodNumber>;
        gte: z.ZodOptional<z.ZodNumber>;
        lt: z.ZodOptional<z.ZodNumber>;
        lte: z.ZodOptional<z.ZodNumber>;
        in: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
        exists: z.ZodOptional<z.ZodBoolean>;
    }, "strict", z.ZodTypeAny, {
        eq?: number | boolean | undefined;
        not_eq?: number | boolean | undefined;
        in?: number[] | undefined;
        exists?: boolean | undefined;
        gt?: number | undefined;
        gte?: number | undefined;
        lt?: number | undefined;
        lte?: number | undefined;
    }, {
        eq?: number | boolean | undefined;
        not_eq?: number | boolean | undefined;
        in?: number[] | undefined;
        exists?: boolean | undefined;
        gt?: number | undefined;
        gte?: number | undefined;
        lt?: number | undefined;
        lte?: number | undefined;
    }>]>>;
}, "strip", z.ZodTypeAny, {
    params: Record<string, {
        eq?: string | number | boolean | undefined;
        not_eq?: string | number | boolean | undefined;
        in?: (string | number)[] | undefined;
        not_in?: (string | number)[] | undefined;
        contains?: string | undefined;
        contains_any?: string[] | undefined;
        pattern?: string | undefined;
        regex?: string | undefined;
        domain_not_in?: string[] | undefined;
        exists?: boolean | undefined;
        is_null?: boolean | undefined;
    } | {
        eq?: number | boolean | undefined;
        not_eq?: number | boolean | undefined;
        in?: number[] | undefined;
        exists?: boolean | undefined;
        gt?: number | undefined;
        gte?: number | undefined;
        lt?: number | undefined;
        lte?: number | undefined;
    }>;
}, {
    params: Record<string, {
        eq?: string | number | boolean | undefined;
        not_eq?: string | number | boolean | undefined;
        in?: (string | number)[] | undefined;
        not_in?: (string | number)[] | undefined;
        contains?: string | undefined;
        contains_any?: string[] | undefined;
        pattern?: string | undefined;
        regex?: string | undefined;
        domain_not_in?: string[] | undefined;
        exists?: boolean | undefined;
        is_null?: boolean | undefined;
    } | {
        eq?: number | boolean | undefined;
        not_eq?: number | boolean | undefined;
        in?: number[] | undefined;
        exists?: boolean | undefined;
        gt?: number | undefined;
        gte?: number | undefined;
        lt?: number | undefined;
        lte?: number | undefined;
    }>;
}>, z.ZodObject<{
    context: z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodObject<{
        eq: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
        not_eq: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
        in: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
        not_in: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
        contains: z.ZodOptional<z.ZodString>;
        contains_any: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        pattern: z.ZodOptional<z.ZodString>;
        regex: z.ZodOptional<z.ZodString>;
        domain_not_in: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        exists: z.ZodOptional<z.ZodBoolean>;
        is_null: z.ZodOptional<z.ZodBoolean>;
    }, "strict", z.ZodTypeAny, {
        eq?: string | number | boolean | undefined;
        not_eq?: string | number | boolean | undefined;
        in?: (string | number)[] | undefined;
        not_in?: (string | number)[] | undefined;
        contains?: string | undefined;
        contains_any?: string[] | undefined;
        pattern?: string | undefined;
        regex?: string | undefined;
        domain_not_in?: string[] | undefined;
        exists?: boolean | undefined;
        is_null?: boolean | undefined;
    }, {
        eq?: string | number | boolean | undefined;
        not_eq?: string | number | boolean | undefined;
        in?: (string | number)[] | undefined;
        not_in?: (string | number)[] | undefined;
        contains?: string | undefined;
        contains_any?: string[] | undefined;
        pattern?: string | undefined;
        regex?: string | undefined;
        domain_not_in?: string[] | undefined;
        exists?: boolean | undefined;
        is_null?: boolean | undefined;
    }>, z.ZodObject<{
        eq: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodBoolean]>>;
        not_eq: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodBoolean]>>;
        gt: z.ZodOptional<z.ZodNumber>;
        gte: z.ZodOptional<z.ZodNumber>;
        lt: z.ZodOptional<z.ZodNumber>;
        lte: z.ZodOptional<z.ZodNumber>;
        in: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
        exists: z.ZodOptional<z.ZodBoolean>;
    }, "strict", z.ZodTypeAny, {
        eq?: number | boolean | undefined;
        not_eq?: number | boolean | undefined;
        in?: number[] | undefined;
        exists?: boolean | undefined;
        gt?: number | undefined;
        gte?: number | undefined;
        lt?: number | undefined;
        lte?: number | undefined;
    }, {
        eq?: number | boolean | undefined;
        not_eq?: number | boolean | undefined;
        in?: number[] | undefined;
        exists?: boolean | undefined;
        gt?: number | undefined;
        gte?: number | undefined;
        lt?: number | undefined;
        lte?: number | undefined;
    }>]>>;
}, "strip", z.ZodTypeAny, {
    context: Record<string, {
        eq?: string | number | boolean | undefined;
        not_eq?: string | number | boolean | undefined;
        in?: (string | number)[] | undefined;
        not_in?: (string | number)[] | undefined;
        contains?: string | undefined;
        contains_any?: string[] | undefined;
        pattern?: string | undefined;
        regex?: string | undefined;
        domain_not_in?: string[] | undefined;
        exists?: boolean | undefined;
        is_null?: boolean | undefined;
    } | {
        eq?: number | boolean | undefined;
        not_eq?: number | boolean | undefined;
        in?: number[] | undefined;
        exists?: boolean | undefined;
        gt?: number | undefined;
        gte?: number | undefined;
        lt?: number | undefined;
        lte?: number | undefined;
    }>;
}, {
    context: Record<string, {
        eq?: string | number | boolean | undefined;
        not_eq?: string | number | boolean | undefined;
        in?: (string | number)[] | undefined;
        not_in?: (string | number)[] | undefined;
        contains?: string | undefined;
        contains_any?: string[] | undefined;
        pattern?: string | undefined;
        regex?: string | undefined;
        domain_not_in?: string[] | undefined;
        exists?: boolean | undefined;
        is_null?: boolean | undefined;
    } | {
        eq?: number | boolean | undefined;
        not_eq?: number | boolean | undefined;
        in?: number[] | undefined;
        exists?: boolean | undefined;
        gt?: number | undefined;
        gte?: number | undefined;
        lt?: number | undefined;
        lte?: number | undefined;
    }>;
}>, z.ZodObject<{
    dataClass: z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodObject<{
        eq: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
        not_eq: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
        in: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
        not_in: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
        contains: z.ZodOptional<z.ZodString>;
        contains_any: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        pattern: z.ZodOptional<z.ZodString>;
        regex: z.ZodOptional<z.ZodString>;
        domain_not_in: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        exists: z.ZodOptional<z.ZodBoolean>;
        is_null: z.ZodOptional<z.ZodBoolean>;
    }, "strict", z.ZodTypeAny, {
        eq?: string | number | boolean | undefined;
        not_eq?: string | number | boolean | undefined;
        in?: (string | number)[] | undefined;
        not_in?: (string | number)[] | undefined;
        contains?: string | undefined;
        contains_any?: string[] | undefined;
        pattern?: string | undefined;
        regex?: string | undefined;
        domain_not_in?: string[] | undefined;
        exists?: boolean | undefined;
        is_null?: boolean | undefined;
    }, {
        eq?: string | number | boolean | undefined;
        not_eq?: string | number | boolean | undefined;
        in?: (string | number)[] | undefined;
        not_in?: (string | number)[] | undefined;
        contains?: string | undefined;
        contains_any?: string[] | undefined;
        pattern?: string | undefined;
        regex?: string | undefined;
        domain_not_in?: string[] | undefined;
        exists?: boolean | undefined;
        is_null?: boolean | undefined;
    }>, z.ZodObject<{
        eq: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodBoolean]>>;
        not_eq: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodBoolean]>>;
        gt: z.ZodOptional<z.ZodNumber>;
        gte: z.ZodOptional<z.ZodNumber>;
        lt: z.ZodOptional<z.ZodNumber>;
        lte: z.ZodOptional<z.ZodNumber>;
        in: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
        exists: z.ZodOptional<z.ZodBoolean>;
    }, "strict", z.ZodTypeAny, {
        eq?: number | boolean | undefined;
        not_eq?: number | boolean | undefined;
        in?: number[] | undefined;
        exists?: boolean | undefined;
        gt?: number | undefined;
        gte?: number | undefined;
        lt?: number | undefined;
        lte?: number | undefined;
    }, {
        eq?: number | boolean | undefined;
        not_eq?: number | boolean | undefined;
        in?: number[] | undefined;
        exists?: boolean | undefined;
        gt?: number | undefined;
        gte?: number | undefined;
        lt?: number | undefined;
        lte?: number | undefined;
    }>]>>;
}, "strip", z.ZodTypeAny, {
    dataClass: Record<string, {
        eq?: string | number | boolean | undefined;
        not_eq?: string | number | boolean | undefined;
        in?: (string | number)[] | undefined;
        not_in?: (string | number)[] | undefined;
        contains?: string | undefined;
        contains_any?: string[] | undefined;
        pattern?: string | undefined;
        regex?: string | undefined;
        domain_not_in?: string[] | undefined;
        exists?: boolean | undefined;
        is_null?: boolean | undefined;
    } | {
        eq?: number | boolean | undefined;
        not_eq?: number | boolean | undefined;
        in?: number[] | undefined;
        exists?: boolean | undefined;
        gt?: number | undefined;
        gte?: number | undefined;
        lt?: number | undefined;
        lte?: number | undefined;
    }>;
}, {
    dataClass: Record<string, {
        eq?: string | number | boolean | undefined;
        not_eq?: string | number | boolean | undefined;
        in?: (string | number)[] | undefined;
        not_in?: (string | number)[] | undefined;
        contains?: string | undefined;
        contains_any?: string[] | undefined;
        pattern?: string | undefined;
        regex?: string | undefined;
        domain_not_in?: string[] | undefined;
        exists?: boolean | undefined;
        is_null?: boolean | undefined;
    } | {
        eq?: number | boolean | undefined;
        not_eq?: number | boolean | undefined;
        in?: number[] | undefined;
        exists?: boolean | undefined;
        gt?: number | undefined;
        gte?: number | undefined;
        lt?: number | undefined;
        lte?: number | undefined;
    }>;
}>, z.ZodObject<{
    timeWindow: z.ZodObject<{
        within: z.ZodOptional<z.ZodObject<{
            days: z.ZodArray<z.ZodEnum<["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]>, "many">;
            hours: z.ZodObject<{
                start: z.ZodString;
                end: z.ZodString;
                tz: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                start: string;
                end: string;
                tz: string;
            }, {
                start: string;
                end: string;
                tz: string;
            }>;
        }, "strip", z.ZodTypeAny, {
            days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
            hours: {
                start: string;
                end: string;
                tz: string;
            };
        }, {
            days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
            hours: {
                start: string;
                end: string;
                tz: string;
            };
        }>>;
        outside: z.ZodOptional<z.ZodObject<{
            days: z.ZodArray<z.ZodEnum<["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]>, "many">;
            hours: z.ZodObject<{
                start: z.ZodString;
                end: z.ZodString;
                tz: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                start: string;
                end: string;
                tz: string;
            }, {
                start: string;
                end: string;
                tz: string;
            }>;
        }, "strip", z.ZodTypeAny, {
            days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
            hours: {
                start: string;
                end: string;
                tz: string;
            };
        }, {
            days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
            hours: {
                start: string;
                end: string;
                tz: string;
            };
        }>>;
    }, "strip", z.ZodTypeAny, {
        within?: {
            days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
            hours: {
                start: string;
                end: string;
                tz: string;
            };
        } | undefined;
        outside?: {
            days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
            hours: {
                start: string;
                end: string;
                tz: string;
            };
        } | undefined;
    }, {
        within?: {
            days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
            hours: {
                start: string;
                end: string;
                tz: string;
            };
        } | undefined;
        outside?: {
            days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
            hours: {
                start: string;
                end: string;
                tz: string;
            };
        } | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    timeWindow: {
        within?: {
            days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
            hours: {
                start: string;
                end: string;
                tz: string;
            };
        } | undefined;
        outside?: {
            days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
            hours: {
                start: string;
                end: string;
                tz: string;
            };
        } | undefined;
    };
}, {
    timeWindow: {
        within?: {
            days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
            hours: {
                start: string;
                end: string;
                tz: string;
            };
        } | undefined;
        outside?: {
            days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
            hours: {
                start: string;
                end: string;
                tz: string;
            };
        } | undefined;
    };
}>]>;
export type WhenCondition = z.infer<typeof WhenConditionSchema>;
export declare const PolicyActionSchema: z.ZodEnum<["allow", "block", "monitor", "require_approval"]>;
export type PolicyAction = z.infer<typeof PolicyActionSchema>;
export declare const RateLimitSchema: z.ZodObject<{
    maxCalls: z.ZodNumber;
    windowSeconds: z.ZodNumber;
    keyBy: z.ZodDefault<z.ZodEnum<["session", "agent", "tenant", "tool"]>>;
}, "strip", z.ZodTypeAny, {
    maxCalls: number;
    windowSeconds: number;
    keyBy: "tool" | "session" | "agent" | "tenant";
}, {
    maxCalls: number;
    windowSeconds: number;
    keyBy?: "tool" | "session" | "agent" | "tenant" | undefined;
}>;
export type RateLimit = z.infer<typeof RateLimitSchema>;
export declare const PolicyRuleSchema: z.ZodObject<{
    id: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    priority: z.ZodDefault<z.ZodNumber>;
    action: z.ZodEnum<["allow", "block", "monitor", "require_approval"]>;
    when: z.ZodArray<z.ZodUnion<[z.ZodObject<{
        tool: z.ZodObject<{
            in: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            not_in: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            matches: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            regex: z.ZodOptional<z.ZodString>;
        }, "strict", z.ZodTypeAny, {
            in?: string[] | undefined;
            not_in?: string[] | undefined;
            regex?: string | undefined;
            matches?: string[] | undefined;
        }, {
            in?: string[] | undefined;
            not_in?: string[] | undefined;
            regex?: string | undefined;
            matches?: string[] | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        tool: {
            in?: string[] | undefined;
            not_in?: string[] | undefined;
            regex?: string | undefined;
            matches?: string[] | undefined;
        };
    }, {
        tool: {
            in?: string[] | undefined;
            not_in?: string[] | undefined;
            regex?: string | undefined;
            matches?: string[] | undefined;
        };
    }>, z.ZodObject<{
        params: z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodObject<{
            eq: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
            not_eq: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
            in: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
            not_in: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
            contains: z.ZodOptional<z.ZodString>;
            contains_any: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            pattern: z.ZodOptional<z.ZodString>;
            regex: z.ZodOptional<z.ZodString>;
            domain_not_in: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            exists: z.ZodOptional<z.ZodBoolean>;
            is_null: z.ZodOptional<z.ZodBoolean>;
        }, "strict", z.ZodTypeAny, {
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
            regex?: string | undefined;
            domain_not_in?: string[] | undefined;
            exists?: boolean | undefined;
            is_null?: boolean | undefined;
        }, {
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
            regex?: string | undefined;
            domain_not_in?: string[] | undefined;
            exists?: boolean | undefined;
            is_null?: boolean | undefined;
        }>, z.ZodObject<{
            eq: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodBoolean]>>;
            not_eq: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodBoolean]>>;
            gt: z.ZodOptional<z.ZodNumber>;
            gte: z.ZodOptional<z.ZodNumber>;
            lt: z.ZodOptional<z.ZodNumber>;
            lte: z.ZodOptional<z.ZodNumber>;
            in: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
            exists: z.ZodOptional<z.ZodBoolean>;
        }, "strict", z.ZodTypeAny, {
            eq?: number | boolean | undefined;
            not_eq?: number | boolean | undefined;
            in?: number[] | undefined;
            exists?: boolean | undefined;
            gt?: number | undefined;
            gte?: number | undefined;
            lt?: number | undefined;
            lte?: number | undefined;
        }, {
            eq?: number | boolean | undefined;
            not_eq?: number | boolean | undefined;
            in?: number[] | undefined;
            exists?: boolean | undefined;
            gt?: number | undefined;
            gte?: number | undefined;
            lt?: number | undefined;
            lte?: number | undefined;
        }>]>>;
    }, "strip", z.ZodTypeAny, {
        params: Record<string, {
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
            regex?: string | undefined;
            domain_not_in?: string[] | undefined;
            exists?: boolean | undefined;
            is_null?: boolean | undefined;
        } | {
            eq?: number | boolean | undefined;
            not_eq?: number | boolean | undefined;
            in?: number[] | undefined;
            exists?: boolean | undefined;
            gt?: number | undefined;
            gte?: number | undefined;
            lt?: number | undefined;
            lte?: number | undefined;
        }>;
    }, {
        params: Record<string, {
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
            regex?: string | undefined;
            domain_not_in?: string[] | undefined;
            exists?: boolean | undefined;
            is_null?: boolean | undefined;
        } | {
            eq?: number | boolean | undefined;
            not_eq?: number | boolean | undefined;
            in?: number[] | undefined;
            exists?: boolean | undefined;
            gt?: number | undefined;
            gte?: number | undefined;
            lt?: number | undefined;
            lte?: number | undefined;
        }>;
    }>, z.ZodObject<{
        context: z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodObject<{
            eq: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
            not_eq: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
            in: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
            not_in: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
            contains: z.ZodOptional<z.ZodString>;
            contains_any: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            pattern: z.ZodOptional<z.ZodString>;
            regex: z.ZodOptional<z.ZodString>;
            domain_not_in: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            exists: z.ZodOptional<z.ZodBoolean>;
            is_null: z.ZodOptional<z.ZodBoolean>;
        }, "strict", z.ZodTypeAny, {
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
            regex?: string | undefined;
            domain_not_in?: string[] | undefined;
            exists?: boolean | undefined;
            is_null?: boolean | undefined;
        }, {
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
            regex?: string | undefined;
            domain_not_in?: string[] | undefined;
            exists?: boolean | undefined;
            is_null?: boolean | undefined;
        }>, z.ZodObject<{
            eq: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodBoolean]>>;
            not_eq: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodBoolean]>>;
            gt: z.ZodOptional<z.ZodNumber>;
            gte: z.ZodOptional<z.ZodNumber>;
            lt: z.ZodOptional<z.ZodNumber>;
            lte: z.ZodOptional<z.ZodNumber>;
            in: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
            exists: z.ZodOptional<z.ZodBoolean>;
        }, "strict", z.ZodTypeAny, {
            eq?: number | boolean | undefined;
            not_eq?: number | boolean | undefined;
            in?: number[] | undefined;
            exists?: boolean | undefined;
            gt?: number | undefined;
            gte?: number | undefined;
            lt?: number | undefined;
            lte?: number | undefined;
        }, {
            eq?: number | boolean | undefined;
            not_eq?: number | boolean | undefined;
            in?: number[] | undefined;
            exists?: boolean | undefined;
            gt?: number | undefined;
            gte?: number | undefined;
            lt?: number | undefined;
            lte?: number | undefined;
        }>]>>;
    }, "strip", z.ZodTypeAny, {
        context: Record<string, {
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
            regex?: string | undefined;
            domain_not_in?: string[] | undefined;
            exists?: boolean | undefined;
            is_null?: boolean | undefined;
        } | {
            eq?: number | boolean | undefined;
            not_eq?: number | boolean | undefined;
            in?: number[] | undefined;
            exists?: boolean | undefined;
            gt?: number | undefined;
            gte?: number | undefined;
            lt?: number | undefined;
            lte?: number | undefined;
        }>;
    }, {
        context: Record<string, {
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
            regex?: string | undefined;
            domain_not_in?: string[] | undefined;
            exists?: boolean | undefined;
            is_null?: boolean | undefined;
        } | {
            eq?: number | boolean | undefined;
            not_eq?: number | boolean | undefined;
            in?: number[] | undefined;
            exists?: boolean | undefined;
            gt?: number | undefined;
            gte?: number | undefined;
            lt?: number | undefined;
            lte?: number | undefined;
        }>;
    }>, z.ZodObject<{
        dataClass: z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodObject<{
            eq: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
            not_eq: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
            in: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
            not_in: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
            contains: z.ZodOptional<z.ZodString>;
            contains_any: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            pattern: z.ZodOptional<z.ZodString>;
            regex: z.ZodOptional<z.ZodString>;
            domain_not_in: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            exists: z.ZodOptional<z.ZodBoolean>;
            is_null: z.ZodOptional<z.ZodBoolean>;
        }, "strict", z.ZodTypeAny, {
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
            regex?: string | undefined;
            domain_not_in?: string[] | undefined;
            exists?: boolean | undefined;
            is_null?: boolean | undefined;
        }, {
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
            regex?: string | undefined;
            domain_not_in?: string[] | undefined;
            exists?: boolean | undefined;
            is_null?: boolean | undefined;
        }>, z.ZodObject<{
            eq: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodBoolean]>>;
            not_eq: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodBoolean]>>;
            gt: z.ZodOptional<z.ZodNumber>;
            gte: z.ZodOptional<z.ZodNumber>;
            lt: z.ZodOptional<z.ZodNumber>;
            lte: z.ZodOptional<z.ZodNumber>;
            in: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
            exists: z.ZodOptional<z.ZodBoolean>;
        }, "strict", z.ZodTypeAny, {
            eq?: number | boolean | undefined;
            not_eq?: number | boolean | undefined;
            in?: number[] | undefined;
            exists?: boolean | undefined;
            gt?: number | undefined;
            gte?: number | undefined;
            lt?: number | undefined;
            lte?: number | undefined;
        }, {
            eq?: number | boolean | undefined;
            not_eq?: number | boolean | undefined;
            in?: number[] | undefined;
            exists?: boolean | undefined;
            gt?: number | undefined;
            gte?: number | undefined;
            lt?: number | undefined;
            lte?: number | undefined;
        }>]>>;
    }, "strip", z.ZodTypeAny, {
        dataClass: Record<string, {
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
            regex?: string | undefined;
            domain_not_in?: string[] | undefined;
            exists?: boolean | undefined;
            is_null?: boolean | undefined;
        } | {
            eq?: number | boolean | undefined;
            not_eq?: number | boolean | undefined;
            in?: number[] | undefined;
            exists?: boolean | undefined;
            gt?: number | undefined;
            gte?: number | undefined;
            lt?: number | undefined;
            lte?: number | undefined;
        }>;
    }, {
        dataClass: Record<string, {
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
            regex?: string | undefined;
            domain_not_in?: string[] | undefined;
            exists?: boolean | undefined;
            is_null?: boolean | undefined;
        } | {
            eq?: number | boolean | undefined;
            not_eq?: number | boolean | undefined;
            in?: number[] | undefined;
            exists?: boolean | undefined;
            gt?: number | undefined;
            gte?: number | undefined;
            lt?: number | undefined;
            lte?: number | undefined;
        }>;
    }>, z.ZodObject<{
        timeWindow: z.ZodObject<{
            within: z.ZodOptional<z.ZodObject<{
                days: z.ZodArray<z.ZodEnum<["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]>, "many">;
                hours: z.ZodObject<{
                    start: z.ZodString;
                    end: z.ZodString;
                    tz: z.ZodString;
                }, "strip", z.ZodTypeAny, {
                    start: string;
                    end: string;
                    tz: string;
                }, {
                    start: string;
                    end: string;
                    tz: string;
                }>;
            }, "strip", z.ZodTypeAny, {
                days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
                hours: {
                    start: string;
                    end: string;
                    tz: string;
                };
            }, {
                days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
                hours: {
                    start: string;
                    end: string;
                    tz: string;
                };
            }>>;
            outside: z.ZodOptional<z.ZodObject<{
                days: z.ZodArray<z.ZodEnum<["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]>, "many">;
                hours: z.ZodObject<{
                    start: z.ZodString;
                    end: z.ZodString;
                    tz: z.ZodString;
                }, "strip", z.ZodTypeAny, {
                    start: string;
                    end: string;
                    tz: string;
                }, {
                    start: string;
                    end: string;
                    tz: string;
                }>;
            }, "strip", z.ZodTypeAny, {
                days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
                hours: {
                    start: string;
                    end: string;
                    tz: string;
                };
            }, {
                days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
                hours: {
                    start: string;
                    end: string;
                    tz: string;
                };
            }>>;
        }, "strip", z.ZodTypeAny, {
            within?: {
                days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
                hours: {
                    start: string;
                    end: string;
                    tz: string;
                };
            } | undefined;
            outside?: {
                days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
                hours: {
                    start: string;
                    end: string;
                    tz: string;
                };
            } | undefined;
        }, {
            within?: {
                days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
                hours: {
                    start: string;
                    end: string;
                    tz: string;
                };
            } | undefined;
            outside?: {
                days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
                hours: {
                    start: string;
                    end: string;
                    tz: string;
                };
            } | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        timeWindow: {
            within?: {
                days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
                hours: {
                    start: string;
                    end: string;
                    tz: string;
                };
            } | undefined;
            outside?: {
                days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
                hours: {
                    start: string;
                    end: string;
                    tz: string;
                };
            } | undefined;
        };
    }, {
        timeWindow: {
            within?: {
                days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
                hours: {
                    start: string;
                    end: string;
                    tz: string;
                };
            } | undefined;
            outside?: {
                days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
                hours: {
                    start: string;
                    end: string;
                    tz: string;
                };
            } | undefined;
        };
    }>]>, "many">;
    severity: z.ZodDefault<z.ZodEnum<["low", "medium", "high", "critical"]>>;
    tags: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    riskBoost: z.ZodDefault<z.ZodNumber>;
    rateLimit: z.ZodOptional<z.ZodObject<{
        maxCalls: z.ZodNumber;
        windowSeconds: z.ZodNumber;
        keyBy: z.ZodDefault<z.ZodEnum<["session", "agent", "tenant", "tool"]>>;
    }, "strip", z.ZodTypeAny, {
        maxCalls: number;
        windowSeconds: number;
        keyBy: "tool" | "session" | "agent" | "tenant";
    }, {
        maxCalls: number;
        windowSeconds: number;
        keyBy?: "tool" | "session" | "agent" | "tenant" | undefined;
    }>>;
    approvers: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    timeoutSec: z.ZodOptional<z.ZodNumber>;
    on_timeout: z.ZodOptional<z.ZodDefault<z.ZodEnum<["block", "allow"]>>>;
    slackChannel: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    priority: number;
    action: "allow" | "block" | "monitor" | "require_approval";
    when: ({
        tool: {
            in?: string[] | undefined;
            not_in?: string[] | undefined;
            regex?: string | undefined;
            matches?: string[] | undefined;
        };
    } | {
        params: Record<string, {
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
            regex?: string | undefined;
            domain_not_in?: string[] | undefined;
            exists?: boolean | undefined;
            is_null?: boolean | undefined;
        } | {
            eq?: number | boolean | undefined;
            not_eq?: number | boolean | undefined;
            in?: number[] | undefined;
            exists?: boolean | undefined;
            gt?: number | undefined;
            gte?: number | undefined;
            lt?: number | undefined;
            lte?: number | undefined;
        }>;
    } | {
        context: Record<string, {
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
            regex?: string | undefined;
            domain_not_in?: string[] | undefined;
            exists?: boolean | undefined;
            is_null?: boolean | undefined;
        } | {
            eq?: number | boolean | undefined;
            not_eq?: number | boolean | undefined;
            in?: number[] | undefined;
            exists?: boolean | undefined;
            gt?: number | undefined;
            gte?: number | undefined;
            lt?: number | undefined;
            lte?: number | undefined;
        }>;
    } | {
        dataClass: Record<string, {
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
            regex?: string | undefined;
            domain_not_in?: string[] | undefined;
            exists?: boolean | undefined;
            is_null?: boolean | undefined;
        } | {
            eq?: number | boolean | undefined;
            not_eq?: number | boolean | undefined;
            in?: number[] | undefined;
            exists?: boolean | undefined;
            gt?: number | undefined;
            gte?: number | undefined;
            lt?: number | undefined;
            lte?: number | undefined;
        }>;
    } | {
        timeWindow: {
            within?: {
                days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
                hours: {
                    start: string;
                    end: string;
                    tz: string;
                };
            } | undefined;
            outside?: {
                days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
                hours: {
                    start: string;
                    end: string;
                    tz: string;
                };
            } | undefined;
        };
    })[];
    severity: "low" | "medium" | "high" | "critical";
    tags: string[];
    riskBoost: number;
    description?: string | undefined;
    rateLimit?: {
        maxCalls: number;
        windowSeconds: number;
        keyBy: "tool" | "session" | "agent" | "tenant";
    } | undefined;
    approvers?: string[] | undefined;
    timeoutSec?: number | undefined;
    on_timeout?: "allow" | "block" | undefined;
    slackChannel?: string | undefined;
}, {
    id: string;
    action: "allow" | "block" | "monitor" | "require_approval";
    when: ({
        tool: {
            in?: string[] | undefined;
            not_in?: string[] | undefined;
            regex?: string | undefined;
            matches?: string[] | undefined;
        };
    } | {
        params: Record<string, {
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
            regex?: string | undefined;
            domain_not_in?: string[] | undefined;
            exists?: boolean | undefined;
            is_null?: boolean | undefined;
        } | {
            eq?: number | boolean | undefined;
            not_eq?: number | boolean | undefined;
            in?: number[] | undefined;
            exists?: boolean | undefined;
            gt?: number | undefined;
            gte?: number | undefined;
            lt?: number | undefined;
            lte?: number | undefined;
        }>;
    } | {
        context: Record<string, {
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
            regex?: string | undefined;
            domain_not_in?: string[] | undefined;
            exists?: boolean | undefined;
            is_null?: boolean | undefined;
        } | {
            eq?: number | boolean | undefined;
            not_eq?: number | boolean | undefined;
            in?: number[] | undefined;
            exists?: boolean | undefined;
            gt?: number | undefined;
            gte?: number | undefined;
            lt?: number | undefined;
            lte?: number | undefined;
        }>;
    } | {
        dataClass: Record<string, {
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
            regex?: string | undefined;
            domain_not_in?: string[] | undefined;
            exists?: boolean | undefined;
            is_null?: boolean | undefined;
        } | {
            eq?: number | boolean | undefined;
            not_eq?: number | boolean | undefined;
            in?: number[] | undefined;
            exists?: boolean | undefined;
            gt?: number | undefined;
            gte?: number | undefined;
            lt?: number | undefined;
            lte?: number | undefined;
        }>;
    } | {
        timeWindow: {
            within?: {
                days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
                hours: {
                    start: string;
                    end: string;
                    tz: string;
                };
            } | undefined;
            outside?: {
                days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
                hours: {
                    start: string;
                    end: string;
                    tz: string;
                };
            } | undefined;
        };
    })[];
    description?: string | undefined;
    priority?: number | undefined;
    severity?: "low" | "medium" | "high" | "critical" | undefined;
    tags?: string[] | undefined;
    riskBoost?: number | undefined;
    rateLimit?: {
        maxCalls: number;
        windowSeconds: number;
        keyBy?: "tool" | "session" | "agent" | "tenant" | undefined;
    } | undefined;
    approvers?: string[] | undefined;
    timeoutSec?: number | undefined;
    on_timeout?: "allow" | "block" | undefined;
    slackChannel?: string | undefined;
}>;
export type PolicyRule = z.infer<typeof PolicyRuleSchema>;
export declare const BudgetsSchema: z.ZodObject<{
    maxTokensPerSession: z.ZodOptional<z.ZodNumber>;
    maxTokensPerDay: z.ZodOptional<z.ZodNumber>;
    maxApiSpendCentsPerDay: z.ZodOptional<z.ZodNumber>;
    maxActionsPerMinute: z.ZodOptional<z.ZodNumber>;
    maxActionsPerSession: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    maxTokensPerSession?: number | undefined;
    maxTokensPerDay?: number | undefined;
    maxApiSpendCentsPerDay?: number | undefined;
    maxActionsPerMinute?: number | undefined;
    maxActionsPerSession?: number | undefined;
}, {
    maxTokensPerSession?: number | undefined;
    maxTokensPerDay?: number | undefined;
    maxApiSpendCentsPerDay?: number | undefined;
    maxActionsPerMinute?: number | undefined;
    maxActionsPerSession?: number | undefined;
}>;
export type Budgets = z.infer<typeof BudgetsSchema>;
export declare const TargetsSchema: z.ZodObject<{
    agentTags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    agentIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    agentTags?: string[] | undefined;
    agentIds?: string[] | undefined;
}, {
    agentTags?: string[] | undefined;
    agentIds?: string[] | undefined;
}>;
export type Targets = z.infer<typeof TargetsSchema>;
export declare const PolicyDocumentSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    version: z.ZodString;
    tenantId: z.ZodOptional<z.ZodString>;
    default: z.ZodDefault<z.ZodEnum<["allow", "block"]>>;
    targets: z.ZodOptional<z.ZodObject<{
        agentTags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        agentIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        agentTags?: string[] | undefined;
        agentIds?: string[] | undefined;
    }, {
        agentTags?: string[] | undefined;
        agentIds?: string[] | undefined;
    }>>;
    budgets: z.ZodOptional<z.ZodObject<{
        maxTokensPerSession: z.ZodOptional<z.ZodNumber>;
        maxTokensPerDay: z.ZodOptional<z.ZodNumber>;
        maxApiSpendCentsPerDay: z.ZodOptional<z.ZodNumber>;
        maxActionsPerMinute: z.ZodOptional<z.ZodNumber>;
        maxActionsPerSession: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        maxTokensPerSession?: number | undefined;
        maxTokensPerDay?: number | undefined;
        maxApiSpendCentsPerDay?: number | undefined;
        maxActionsPerMinute?: number | undefined;
        maxActionsPerSession?: number | undefined;
    }, {
        maxTokensPerSession?: number | undefined;
        maxTokensPerDay?: number | undefined;
        maxApiSpendCentsPerDay?: number | undefined;
        maxActionsPerMinute?: number | undefined;
        maxActionsPerSession?: number | undefined;
    }>>;
    rules: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        priority: z.ZodDefault<z.ZodNumber>;
        action: z.ZodEnum<["allow", "block", "monitor", "require_approval"]>;
        when: z.ZodArray<z.ZodUnion<[z.ZodObject<{
            tool: z.ZodObject<{
                in: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
                not_in: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
                matches: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
                regex: z.ZodOptional<z.ZodString>;
            }, "strict", z.ZodTypeAny, {
                in?: string[] | undefined;
                not_in?: string[] | undefined;
                regex?: string | undefined;
                matches?: string[] | undefined;
            }, {
                in?: string[] | undefined;
                not_in?: string[] | undefined;
                regex?: string | undefined;
                matches?: string[] | undefined;
            }>;
        }, "strip", z.ZodTypeAny, {
            tool: {
                in?: string[] | undefined;
                not_in?: string[] | undefined;
                regex?: string | undefined;
                matches?: string[] | undefined;
            };
        }, {
            tool: {
                in?: string[] | undefined;
                not_in?: string[] | undefined;
                regex?: string | undefined;
                matches?: string[] | undefined;
            };
        }>, z.ZodObject<{
            params: z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodObject<{
                eq: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
                not_eq: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
                in: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
                not_in: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
                contains: z.ZodOptional<z.ZodString>;
                contains_any: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
                pattern: z.ZodOptional<z.ZodString>;
                regex: z.ZodOptional<z.ZodString>;
                domain_not_in: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
                exists: z.ZodOptional<z.ZodBoolean>;
                is_null: z.ZodOptional<z.ZodBoolean>;
            }, "strict", z.ZodTypeAny, {
                eq?: string | number | boolean | undefined;
                not_eq?: string | number | boolean | undefined;
                in?: (string | number)[] | undefined;
                not_in?: (string | number)[] | undefined;
                contains?: string | undefined;
                contains_any?: string[] | undefined;
                pattern?: string | undefined;
                regex?: string | undefined;
                domain_not_in?: string[] | undefined;
                exists?: boolean | undefined;
                is_null?: boolean | undefined;
            }, {
                eq?: string | number | boolean | undefined;
                not_eq?: string | number | boolean | undefined;
                in?: (string | number)[] | undefined;
                not_in?: (string | number)[] | undefined;
                contains?: string | undefined;
                contains_any?: string[] | undefined;
                pattern?: string | undefined;
                regex?: string | undefined;
                domain_not_in?: string[] | undefined;
                exists?: boolean | undefined;
                is_null?: boolean | undefined;
            }>, z.ZodObject<{
                eq: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodBoolean]>>;
                not_eq: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodBoolean]>>;
                gt: z.ZodOptional<z.ZodNumber>;
                gte: z.ZodOptional<z.ZodNumber>;
                lt: z.ZodOptional<z.ZodNumber>;
                lte: z.ZodOptional<z.ZodNumber>;
                in: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
                exists: z.ZodOptional<z.ZodBoolean>;
            }, "strict", z.ZodTypeAny, {
                eq?: number | boolean | undefined;
                not_eq?: number | boolean | undefined;
                in?: number[] | undefined;
                exists?: boolean | undefined;
                gt?: number | undefined;
                gte?: number | undefined;
                lt?: number | undefined;
                lte?: number | undefined;
            }, {
                eq?: number | boolean | undefined;
                not_eq?: number | boolean | undefined;
                in?: number[] | undefined;
                exists?: boolean | undefined;
                gt?: number | undefined;
                gte?: number | undefined;
                lt?: number | undefined;
                lte?: number | undefined;
            }>]>>;
        }, "strip", z.ZodTypeAny, {
            params: Record<string, {
                eq?: string | number | boolean | undefined;
                not_eq?: string | number | boolean | undefined;
                in?: (string | number)[] | undefined;
                not_in?: (string | number)[] | undefined;
                contains?: string | undefined;
                contains_any?: string[] | undefined;
                pattern?: string | undefined;
                regex?: string | undefined;
                domain_not_in?: string[] | undefined;
                exists?: boolean | undefined;
                is_null?: boolean | undefined;
            } | {
                eq?: number | boolean | undefined;
                not_eq?: number | boolean | undefined;
                in?: number[] | undefined;
                exists?: boolean | undefined;
                gt?: number | undefined;
                gte?: number | undefined;
                lt?: number | undefined;
                lte?: number | undefined;
            }>;
        }, {
            params: Record<string, {
                eq?: string | number | boolean | undefined;
                not_eq?: string | number | boolean | undefined;
                in?: (string | number)[] | undefined;
                not_in?: (string | number)[] | undefined;
                contains?: string | undefined;
                contains_any?: string[] | undefined;
                pattern?: string | undefined;
                regex?: string | undefined;
                domain_not_in?: string[] | undefined;
                exists?: boolean | undefined;
                is_null?: boolean | undefined;
            } | {
                eq?: number | boolean | undefined;
                not_eq?: number | boolean | undefined;
                in?: number[] | undefined;
                exists?: boolean | undefined;
                gt?: number | undefined;
                gte?: number | undefined;
                lt?: number | undefined;
                lte?: number | undefined;
            }>;
        }>, z.ZodObject<{
            context: z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodObject<{
                eq: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
                not_eq: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
                in: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
                not_in: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
                contains: z.ZodOptional<z.ZodString>;
                contains_any: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
                pattern: z.ZodOptional<z.ZodString>;
                regex: z.ZodOptional<z.ZodString>;
                domain_not_in: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
                exists: z.ZodOptional<z.ZodBoolean>;
                is_null: z.ZodOptional<z.ZodBoolean>;
            }, "strict", z.ZodTypeAny, {
                eq?: string | number | boolean | undefined;
                not_eq?: string | number | boolean | undefined;
                in?: (string | number)[] | undefined;
                not_in?: (string | number)[] | undefined;
                contains?: string | undefined;
                contains_any?: string[] | undefined;
                pattern?: string | undefined;
                regex?: string | undefined;
                domain_not_in?: string[] | undefined;
                exists?: boolean | undefined;
                is_null?: boolean | undefined;
            }, {
                eq?: string | number | boolean | undefined;
                not_eq?: string | number | boolean | undefined;
                in?: (string | number)[] | undefined;
                not_in?: (string | number)[] | undefined;
                contains?: string | undefined;
                contains_any?: string[] | undefined;
                pattern?: string | undefined;
                regex?: string | undefined;
                domain_not_in?: string[] | undefined;
                exists?: boolean | undefined;
                is_null?: boolean | undefined;
            }>, z.ZodObject<{
                eq: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodBoolean]>>;
                not_eq: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodBoolean]>>;
                gt: z.ZodOptional<z.ZodNumber>;
                gte: z.ZodOptional<z.ZodNumber>;
                lt: z.ZodOptional<z.ZodNumber>;
                lte: z.ZodOptional<z.ZodNumber>;
                in: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
                exists: z.ZodOptional<z.ZodBoolean>;
            }, "strict", z.ZodTypeAny, {
                eq?: number | boolean | undefined;
                not_eq?: number | boolean | undefined;
                in?: number[] | undefined;
                exists?: boolean | undefined;
                gt?: number | undefined;
                gte?: number | undefined;
                lt?: number | undefined;
                lte?: number | undefined;
            }, {
                eq?: number | boolean | undefined;
                not_eq?: number | boolean | undefined;
                in?: number[] | undefined;
                exists?: boolean | undefined;
                gt?: number | undefined;
                gte?: number | undefined;
                lt?: number | undefined;
                lte?: number | undefined;
            }>]>>;
        }, "strip", z.ZodTypeAny, {
            context: Record<string, {
                eq?: string | number | boolean | undefined;
                not_eq?: string | number | boolean | undefined;
                in?: (string | number)[] | undefined;
                not_in?: (string | number)[] | undefined;
                contains?: string | undefined;
                contains_any?: string[] | undefined;
                pattern?: string | undefined;
                regex?: string | undefined;
                domain_not_in?: string[] | undefined;
                exists?: boolean | undefined;
                is_null?: boolean | undefined;
            } | {
                eq?: number | boolean | undefined;
                not_eq?: number | boolean | undefined;
                in?: number[] | undefined;
                exists?: boolean | undefined;
                gt?: number | undefined;
                gte?: number | undefined;
                lt?: number | undefined;
                lte?: number | undefined;
            }>;
        }, {
            context: Record<string, {
                eq?: string | number | boolean | undefined;
                not_eq?: string | number | boolean | undefined;
                in?: (string | number)[] | undefined;
                not_in?: (string | number)[] | undefined;
                contains?: string | undefined;
                contains_any?: string[] | undefined;
                pattern?: string | undefined;
                regex?: string | undefined;
                domain_not_in?: string[] | undefined;
                exists?: boolean | undefined;
                is_null?: boolean | undefined;
            } | {
                eq?: number | boolean | undefined;
                not_eq?: number | boolean | undefined;
                in?: number[] | undefined;
                exists?: boolean | undefined;
                gt?: number | undefined;
                gte?: number | undefined;
                lt?: number | undefined;
                lte?: number | undefined;
            }>;
        }>, z.ZodObject<{
            dataClass: z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodObject<{
                eq: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
                not_eq: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
                in: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
                not_in: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
                contains: z.ZodOptional<z.ZodString>;
                contains_any: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
                pattern: z.ZodOptional<z.ZodString>;
                regex: z.ZodOptional<z.ZodString>;
                domain_not_in: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
                exists: z.ZodOptional<z.ZodBoolean>;
                is_null: z.ZodOptional<z.ZodBoolean>;
            }, "strict", z.ZodTypeAny, {
                eq?: string | number | boolean | undefined;
                not_eq?: string | number | boolean | undefined;
                in?: (string | number)[] | undefined;
                not_in?: (string | number)[] | undefined;
                contains?: string | undefined;
                contains_any?: string[] | undefined;
                pattern?: string | undefined;
                regex?: string | undefined;
                domain_not_in?: string[] | undefined;
                exists?: boolean | undefined;
                is_null?: boolean | undefined;
            }, {
                eq?: string | number | boolean | undefined;
                not_eq?: string | number | boolean | undefined;
                in?: (string | number)[] | undefined;
                not_in?: (string | number)[] | undefined;
                contains?: string | undefined;
                contains_any?: string[] | undefined;
                pattern?: string | undefined;
                regex?: string | undefined;
                domain_not_in?: string[] | undefined;
                exists?: boolean | undefined;
                is_null?: boolean | undefined;
            }>, z.ZodObject<{
                eq: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodBoolean]>>;
                not_eq: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodBoolean]>>;
                gt: z.ZodOptional<z.ZodNumber>;
                gte: z.ZodOptional<z.ZodNumber>;
                lt: z.ZodOptional<z.ZodNumber>;
                lte: z.ZodOptional<z.ZodNumber>;
                in: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
                exists: z.ZodOptional<z.ZodBoolean>;
            }, "strict", z.ZodTypeAny, {
                eq?: number | boolean | undefined;
                not_eq?: number | boolean | undefined;
                in?: number[] | undefined;
                exists?: boolean | undefined;
                gt?: number | undefined;
                gte?: number | undefined;
                lt?: number | undefined;
                lte?: number | undefined;
            }, {
                eq?: number | boolean | undefined;
                not_eq?: number | boolean | undefined;
                in?: number[] | undefined;
                exists?: boolean | undefined;
                gt?: number | undefined;
                gte?: number | undefined;
                lt?: number | undefined;
                lte?: number | undefined;
            }>]>>;
        }, "strip", z.ZodTypeAny, {
            dataClass: Record<string, {
                eq?: string | number | boolean | undefined;
                not_eq?: string | number | boolean | undefined;
                in?: (string | number)[] | undefined;
                not_in?: (string | number)[] | undefined;
                contains?: string | undefined;
                contains_any?: string[] | undefined;
                pattern?: string | undefined;
                regex?: string | undefined;
                domain_not_in?: string[] | undefined;
                exists?: boolean | undefined;
                is_null?: boolean | undefined;
            } | {
                eq?: number | boolean | undefined;
                not_eq?: number | boolean | undefined;
                in?: number[] | undefined;
                exists?: boolean | undefined;
                gt?: number | undefined;
                gte?: number | undefined;
                lt?: number | undefined;
                lte?: number | undefined;
            }>;
        }, {
            dataClass: Record<string, {
                eq?: string | number | boolean | undefined;
                not_eq?: string | number | boolean | undefined;
                in?: (string | number)[] | undefined;
                not_in?: (string | number)[] | undefined;
                contains?: string | undefined;
                contains_any?: string[] | undefined;
                pattern?: string | undefined;
                regex?: string | undefined;
                domain_not_in?: string[] | undefined;
                exists?: boolean | undefined;
                is_null?: boolean | undefined;
            } | {
                eq?: number | boolean | undefined;
                not_eq?: number | boolean | undefined;
                in?: number[] | undefined;
                exists?: boolean | undefined;
                gt?: number | undefined;
                gte?: number | undefined;
                lt?: number | undefined;
                lte?: number | undefined;
            }>;
        }>, z.ZodObject<{
            timeWindow: z.ZodObject<{
                within: z.ZodOptional<z.ZodObject<{
                    days: z.ZodArray<z.ZodEnum<["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]>, "many">;
                    hours: z.ZodObject<{
                        start: z.ZodString;
                        end: z.ZodString;
                        tz: z.ZodString;
                    }, "strip", z.ZodTypeAny, {
                        start: string;
                        end: string;
                        tz: string;
                    }, {
                        start: string;
                        end: string;
                        tz: string;
                    }>;
                }, "strip", z.ZodTypeAny, {
                    days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
                    hours: {
                        start: string;
                        end: string;
                        tz: string;
                    };
                }, {
                    days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
                    hours: {
                        start: string;
                        end: string;
                        tz: string;
                    };
                }>>;
                outside: z.ZodOptional<z.ZodObject<{
                    days: z.ZodArray<z.ZodEnum<["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]>, "many">;
                    hours: z.ZodObject<{
                        start: z.ZodString;
                        end: z.ZodString;
                        tz: z.ZodString;
                    }, "strip", z.ZodTypeAny, {
                        start: string;
                        end: string;
                        tz: string;
                    }, {
                        start: string;
                        end: string;
                        tz: string;
                    }>;
                }, "strip", z.ZodTypeAny, {
                    days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
                    hours: {
                        start: string;
                        end: string;
                        tz: string;
                    };
                }, {
                    days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
                    hours: {
                        start: string;
                        end: string;
                        tz: string;
                    };
                }>>;
            }, "strip", z.ZodTypeAny, {
                within?: {
                    days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
                    hours: {
                        start: string;
                        end: string;
                        tz: string;
                    };
                } | undefined;
                outside?: {
                    days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
                    hours: {
                        start: string;
                        end: string;
                        tz: string;
                    };
                } | undefined;
            }, {
                within?: {
                    days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
                    hours: {
                        start: string;
                        end: string;
                        tz: string;
                    };
                } | undefined;
                outside?: {
                    days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
                    hours: {
                        start: string;
                        end: string;
                        tz: string;
                    };
                } | undefined;
            }>;
        }, "strip", z.ZodTypeAny, {
            timeWindow: {
                within?: {
                    days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
                    hours: {
                        start: string;
                        end: string;
                        tz: string;
                    };
                } | undefined;
                outside?: {
                    days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
                    hours: {
                        start: string;
                        end: string;
                        tz: string;
                    };
                } | undefined;
            };
        }, {
            timeWindow: {
                within?: {
                    days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
                    hours: {
                        start: string;
                        end: string;
                        tz: string;
                    };
                } | undefined;
                outside?: {
                    days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
                    hours: {
                        start: string;
                        end: string;
                        tz: string;
                    };
                } | undefined;
            };
        }>]>, "many">;
        severity: z.ZodDefault<z.ZodEnum<["low", "medium", "high", "critical"]>>;
        tags: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        riskBoost: z.ZodDefault<z.ZodNumber>;
        rateLimit: z.ZodOptional<z.ZodObject<{
            maxCalls: z.ZodNumber;
            windowSeconds: z.ZodNumber;
            keyBy: z.ZodDefault<z.ZodEnum<["session", "agent", "tenant", "tool"]>>;
        }, "strip", z.ZodTypeAny, {
            maxCalls: number;
            windowSeconds: number;
            keyBy: "tool" | "session" | "agent" | "tenant";
        }, {
            maxCalls: number;
            windowSeconds: number;
            keyBy?: "tool" | "session" | "agent" | "tenant" | undefined;
        }>>;
        approvers: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        timeoutSec: z.ZodOptional<z.ZodNumber>;
        on_timeout: z.ZodOptional<z.ZodDefault<z.ZodEnum<["block", "allow"]>>>;
        slackChannel: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        priority: number;
        action: "allow" | "block" | "monitor" | "require_approval";
        when: ({
            tool: {
                in?: string[] | undefined;
                not_in?: string[] | undefined;
                regex?: string | undefined;
                matches?: string[] | undefined;
            };
        } | {
            params: Record<string, {
                eq?: string | number | boolean | undefined;
                not_eq?: string | number | boolean | undefined;
                in?: (string | number)[] | undefined;
                not_in?: (string | number)[] | undefined;
                contains?: string | undefined;
                contains_any?: string[] | undefined;
                pattern?: string | undefined;
                regex?: string | undefined;
                domain_not_in?: string[] | undefined;
                exists?: boolean | undefined;
                is_null?: boolean | undefined;
            } | {
                eq?: number | boolean | undefined;
                not_eq?: number | boolean | undefined;
                in?: number[] | undefined;
                exists?: boolean | undefined;
                gt?: number | undefined;
                gte?: number | undefined;
                lt?: number | undefined;
                lte?: number | undefined;
            }>;
        } | {
            context: Record<string, {
                eq?: string | number | boolean | undefined;
                not_eq?: string | number | boolean | undefined;
                in?: (string | number)[] | undefined;
                not_in?: (string | number)[] | undefined;
                contains?: string | undefined;
                contains_any?: string[] | undefined;
                pattern?: string | undefined;
                regex?: string | undefined;
                domain_not_in?: string[] | undefined;
                exists?: boolean | undefined;
                is_null?: boolean | undefined;
            } | {
                eq?: number | boolean | undefined;
                not_eq?: number | boolean | undefined;
                in?: number[] | undefined;
                exists?: boolean | undefined;
                gt?: number | undefined;
                gte?: number | undefined;
                lt?: number | undefined;
                lte?: number | undefined;
            }>;
        } | {
            dataClass: Record<string, {
                eq?: string | number | boolean | undefined;
                not_eq?: string | number | boolean | undefined;
                in?: (string | number)[] | undefined;
                not_in?: (string | number)[] | undefined;
                contains?: string | undefined;
                contains_any?: string[] | undefined;
                pattern?: string | undefined;
                regex?: string | undefined;
                domain_not_in?: string[] | undefined;
                exists?: boolean | undefined;
                is_null?: boolean | undefined;
            } | {
                eq?: number | boolean | undefined;
                not_eq?: number | boolean | undefined;
                in?: number[] | undefined;
                exists?: boolean | undefined;
                gt?: number | undefined;
                gte?: number | undefined;
                lt?: number | undefined;
                lte?: number | undefined;
            }>;
        } | {
            timeWindow: {
                within?: {
                    days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
                    hours: {
                        start: string;
                        end: string;
                        tz: string;
                    };
                } | undefined;
                outside?: {
                    days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
                    hours: {
                        start: string;
                        end: string;
                        tz: string;
                    };
                } | undefined;
            };
        })[];
        severity: "low" | "medium" | "high" | "critical";
        tags: string[];
        riskBoost: number;
        description?: string | undefined;
        rateLimit?: {
            maxCalls: number;
            windowSeconds: number;
            keyBy: "tool" | "session" | "agent" | "tenant";
        } | undefined;
        approvers?: string[] | undefined;
        timeoutSec?: number | undefined;
        on_timeout?: "allow" | "block" | undefined;
        slackChannel?: string | undefined;
    }, {
        id: string;
        action: "allow" | "block" | "monitor" | "require_approval";
        when: ({
            tool: {
                in?: string[] | undefined;
                not_in?: string[] | undefined;
                regex?: string | undefined;
                matches?: string[] | undefined;
            };
        } | {
            params: Record<string, {
                eq?: string | number | boolean | undefined;
                not_eq?: string | number | boolean | undefined;
                in?: (string | number)[] | undefined;
                not_in?: (string | number)[] | undefined;
                contains?: string | undefined;
                contains_any?: string[] | undefined;
                pattern?: string | undefined;
                regex?: string | undefined;
                domain_not_in?: string[] | undefined;
                exists?: boolean | undefined;
                is_null?: boolean | undefined;
            } | {
                eq?: number | boolean | undefined;
                not_eq?: number | boolean | undefined;
                in?: number[] | undefined;
                exists?: boolean | undefined;
                gt?: number | undefined;
                gte?: number | undefined;
                lt?: number | undefined;
                lte?: number | undefined;
            }>;
        } | {
            context: Record<string, {
                eq?: string | number | boolean | undefined;
                not_eq?: string | number | boolean | undefined;
                in?: (string | number)[] | undefined;
                not_in?: (string | number)[] | undefined;
                contains?: string | undefined;
                contains_any?: string[] | undefined;
                pattern?: string | undefined;
                regex?: string | undefined;
                domain_not_in?: string[] | undefined;
                exists?: boolean | undefined;
                is_null?: boolean | undefined;
            } | {
                eq?: number | boolean | undefined;
                not_eq?: number | boolean | undefined;
                in?: number[] | undefined;
                exists?: boolean | undefined;
                gt?: number | undefined;
                gte?: number | undefined;
                lt?: number | undefined;
                lte?: number | undefined;
            }>;
        } | {
            dataClass: Record<string, {
                eq?: string | number | boolean | undefined;
                not_eq?: string | number | boolean | undefined;
                in?: (string | number)[] | undefined;
                not_in?: (string | number)[] | undefined;
                contains?: string | undefined;
                contains_any?: string[] | undefined;
                pattern?: string | undefined;
                regex?: string | undefined;
                domain_not_in?: string[] | undefined;
                exists?: boolean | undefined;
                is_null?: boolean | undefined;
            } | {
                eq?: number | boolean | undefined;
                not_eq?: number | boolean | undefined;
                in?: number[] | undefined;
                exists?: boolean | undefined;
                gt?: number | undefined;
                gte?: number | undefined;
                lt?: number | undefined;
                lte?: number | undefined;
            }>;
        } | {
            timeWindow: {
                within?: {
                    days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
                    hours: {
                        start: string;
                        end: string;
                        tz: string;
                    };
                } | undefined;
                outside?: {
                    days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
                    hours: {
                        start: string;
                        end: string;
                        tz: string;
                    };
                } | undefined;
            };
        })[];
        description?: string | undefined;
        priority?: number | undefined;
        severity?: "low" | "medium" | "high" | "critical" | undefined;
        tags?: string[] | undefined;
        riskBoost?: number | undefined;
        rateLimit?: {
            maxCalls: number;
            windowSeconds: number;
            keyBy?: "tool" | "session" | "agent" | "tenant" | undefined;
        } | undefined;
        approvers?: string[] | undefined;
        timeoutSec?: number | undefined;
        on_timeout?: "allow" | "block" | undefined;
        slackChannel?: string | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    version: string;
    default: "allow" | "block";
    rules: {
        id: string;
        priority: number;
        action: "allow" | "block" | "monitor" | "require_approval";
        when: ({
            tool: {
                in?: string[] | undefined;
                not_in?: string[] | undefined;
                regex?: string | undefined;
                matches?: string[] | undefined;
            };
        } | {
            params: Record<string, {
                eq?: string | number | boolean | undefined;
                not_eq?: string | number | boolean | undefined;
                in?: (string | number)[] | undefined;
                not_in?: (string | number)[] | undefined;
                contains?: string | undefined;
                contains_any?: string[] | undefined;
                pattern?: string | undefined;
                regex?: string | undefined;
                domain_not_in?: string[] | undefined;
                exists?: boolean | undefined;
                is_null?: boolean | undefined;
            } | {
                eq?: number | boolean | undefined;
                not_eq?: number | boolean | undefined;
                in?: number[] | undefined;
                exists?: boolean | undefined;
                gt?: number | undefined;
                gte?: number | undefined;
                lt?: number | undefined;
                lte?: number | undefined;
            }>;
        } | {
            context: Record<string, {
                eq?: string | number | boolean | undefined;
                not_eq?: string | number | boolean | undefined;
                in?: (string | number)[] | undefined;
                not_in?: (string | number)[] | undefined;
                contains?: string | undefined;
                contains_any?: string[] | undefined;
                pattern?: string | undefined;
                regex?: string | undefined;
                domain_not_in?: string[] | undefined;
                exists?: boolean | undefined;
                is_null?: boolean | undefined;
            } | {
                eq?: number | boolean | undefined;
                not_eq?: number | boolean | undefined;
                in?: number[] | undefined;
                exists?: boolean | undefined;
                gt?: number | undefined;
                gte?: number | undefined;
                lt?: number | undefined;
                lte?: number | undefined;
            }>;
        } | {
            dataClass: Record<string, {
                eq?: string | number | boolean | undefined;
                not_eq?: string | number | boolean | undefined;
                in?: (string | number)[] | undefined;
                not_in?: (string | number)[] | undefined;
                contains?: string | undefined;
                contains_any?: string[] | undefined;
                pattern?: string | undefined;
                regex?: string | undefined;
                domain_not_in?: string[] | undefined;
                exists?: boolean | undefined;
                is_null?: boolean | undefined;
            } | {
                eq?: number | boolean | undefined;
                not_eq?: number | boolean | undefined;
                in?: number[] | undefined;
                exists?: boolean | undefined;
                gt?: number | undefined;
                gte?: number | undefined;
                lt?: number | undefined;
                lte?: number | undefined;
            }>;
        } | {
            timeWindow: {
                within?: {
                    days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
                    hours: {
                        start: string;
                        end: string;
                        tz: string;
                    };
                } | undefined;
                outside?: {
                    days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
                    hours: {
                        start: string;
                        end: string;
                        tz: string;
                    };
                } | undefined;
            };
        })[];
        severity: "low" | "medium" | "high" | "critical";
        tags: string[];
        riskBoost: number;
        description?: string | undefined;
        rateLimit?: {
            maxCalls: number;
            windowSeconds: number;
            keyBy: "tool" | "session" | "agent" | "tenant";
        } | undefined;
        approvers?: string[] | undefined;
        timeoutSec?: number | undefined;
        on_timeout?: "allow" | "block" | undefined;
        slackChannel?: string | undefined;
    }[];
    description?: string | undefined;
    tenantId?: string | undefined;
    targets?: {
        agentTags?: string[] | undefined;
        agentIds?: string[] | undefined;
    } | undefined;
    budgets?: {
        maxTokensPerSession?: number | undefined;
        maxTokensPerDay?: number | undefined;
        maxApiSpendCentsPerDay?: number | undefined;
        maxActionsPerMinute?: number | undefined;
        maxActionsPerSession?: number | undefined;
    } | undefined;
}, {
    id: string;
    name: string;
    version: string;
    rules: {
        id: string;
        action: "allow" | "block" | "monitor" | "require_approval";
        when: ({
            tool: {
                in?: string[] | undefined;
                not_in?: string[] | undefined;
                regex?: string | undefined;
                matches?: string[] | undefined;
            };
        } | {
            params: Record<string, {
                eq?: string | number | boolean | undefined;
                not_eq?: string | number | boolean | undefined;
                in?: (string | number)[] | undefined;
                not_in?: (string | number)[] | undefined;
                contains?: string | undefined;
                contains_any?: string[] | undefined;
                pattern?: string | undefined;
                regex?: string | undefined;
                domain_not_in?: string[] | undefined;
                exists?: boolean | undefined;
                is_null?: boolean | undefined;
            } | {
                eq?: number | boolean | undefined;
                not_eq?: number | boolean | undefined;
                in?: number[] | undefined;
                exists?: boolean | undefined;
                gt?: number | undefined;
                gte?: number | undefined;
                lt?: number | undefined;
                lte?: number | undefined;
            }>;
        } | {
            context: Record<string, {
                eq?: string | number | boolean | undefined;
                not_eq?: string | number | boolean | undefined;
                in?: (string | number)[] | undefined;
                not_in?: (string | number)[] | undefined;
                contains?: string | undefined;
                contains_any?: string[] | undefined;
                pattern?: string | undefined;
                regex?: string | undefined;
                domain_not_in?: string[] | undefined;
                exists?: boolean | undefined;
                is_null?: boolean | undefined;
            } | {
                eq?: number | boolean | undefined;
                not_eq?: number | boolean | undefined;
                in?: number[] | undefined;
                exists?: boolean | undefined;
                gt?: number | undefined;
                gte?: number | undefined;
                lt?: number | undefined;
                lte?: number | undefined;
            }>;
        } | {
            dataClass: Record<string, {
                eq?: string | number | boolean | undefined;
                not_eq?: string | number | boolean | undefined;
                in?: (string | number)[] | undefined;
                not_in?: (string | number)[] | undefined;
                contains?: string | undefined;
                contains_any?: string[] | undefined;
                pattern?: string | undefined;
                regex?: string | undefined;
                domain_not_in?: string[] | undefined;
                exists?: boolean | undefined;
                is_null?: boolean | undefined;
            } | {
                eq?: number | boolean | undefined;
                not_eq?: number | boolean | undefined;
                in?: number[] | undefined;
                exists?: boolean | undefined;
                gt?: number | undefined;
                gte?: number | undefined;
                lt?: number | undefined;
                lte?: number | undefined;
            }>;
        } | {
            timeWindow: {
                within?: {
                    days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
                    hours: {
                        start: string;
                        end: string;
                        tz: string;
                    };
                } | undefined;
                outside?: {
                    days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
                    hours: {
                        start: string;
                        end: string;
                        tz: string;
                    };
                } | undefined;
            };
        })[];
        description?: string | undefined;
        priority?: number | undefined;
        severity?: "low" | "medium" | "high" | "critical" | undefined;
        tags?: string[] | undefined;
        riskBoost?: number | undefined;
        rateLimit?: {
            maxCalls: number;
            windowSeconds: number;
            keyBy?: "tool" | "session" | "agent" | "tenant" | undefined;
        } | undefined;
        approvers?: string[] | undefined;
        timeoutSec?: number | undefined;
        on_timeout?: "allow" | "block" | undefined;
        slackChannel?: string | undefined;
    }[];
    description?: string | undefined;
    tenantId?: string | undefined;
    default?: "allow" | "block" | undefined;
    targets?: {
        agentTags?: string[] | undefined;
        agentIds?: string[] | undefined;
    } | undefined;
    budgets?: {
        maxTokensPerSession?: number | undefined;
        maxTokensPerDay?: number | undefined;
        maxApiSpendCentsPerDay?: number | undefined;
        maxActionsPerMinute?: number | undefined;
        maxActionsPerSession?: number | undefined;
    } | undefined;
}>;
export type PolicyDocument = z.infer<typeof PolicyDocumentSchema>;
export declare const CompiledRuleSchema: z.ZodObject<{
    id: z.ZodString;
    priority: z.ZodNumber;
    action: z.ZodEnum<["allow", "block", "monitor", "require_approval"]>;
    toolCondition: z.ZodOptional<z.ZodObject<{
        in: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        not_in: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        matches: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        regex: z.ZodOptional<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        in?: string[] | undefined;
        not_in?: string[] | undefined;
        regex?: string | undefined;
        matches?: string[] | undefined;
    }, {
        in?: string[] | undefined;
        not_in?: string[] | undefined;
        regex?: string | undefined;
        matches?: string[] | undefined;
    }>>;
    paramConditions: z.ZodDefault<z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodObject<{
        eq: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
        not_eq: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
        in: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
        not_in: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
        contains: z.ZodOptional<z.ZodString>;
        contains_any: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        pattern: z.ZodOptional<z.ZodString>;
        regex: z.ZodOptional<z.ZodString>;
        domain_not_in: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        exists: z.ZodOptional<z.ZodBoolean>;
        is_null: z.ZodOptional<z.ZodBoolean>;
    }, "strict", z.ZodTypeAny, {
        eq?: string | number | boolean | undefined;
        not_eq?: string | number | boolean | undefined;
        in?: (string | number)[] | undefined;
        not_in?: (string | number)[] | undefined;
        contains?: string | undefined;
        contains_any?: string[] | undefined;
        pattern?: string | undefined;
        regex?: string | undefined;
        domain_not_in?: string[] | undefined;
        exists?: boolean | undefined;
        is_null?: boolean | undefined;
    }, {
        eq?: string | number | boolean | undefined;
        not_eq?: string | number | boolean | undefined;
        in?: (string | number)[] | undefined;
        not_in?: (string | number)[] | undefined;
        contains?: string | undefined;
        contains_any?: string[] | undefined;
        pattern?: string | undefined;
        regex?: string | undefined;
        domain_not_in?: string[] | undefined;
        exists?: boolean | undefined;
        is_null?: boolean | undefined;
    }>, z.ZodObject<{
        eq: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodBoolean]>>;
        not_eq: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodBoolean]>>;
        gt: z.ZodOptional<z.ZodNumber>;
        gte: z.ZodOptional<z.ZodNumber>;
        lt: z.ZodOptional<z.ZodNumber>;
        lte: z.ZodOptional<z.ZodNumber>;
        in: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
        exists: z.ZodOptional<z.ZodBoolean>;
    }, "strict", z.ZodTypeAny, {
        eq?: number | boolean | undefined;
        not_eq?: number | boolean | undefined;
        in?: number[] | undefined;
        exists?: boolean | undefined;
        gt?: number | undefined;
        gte?: number | undefined;
        lt?: number | undefined;
        lte?: number | undefined;
    }, {
        eq?: number | boolean | undefined;
        not_eq?: number | boolean | undefined;
        in?: number[] | undefined;
        exists?: boolean | undefined;
        gt?: number | undefined;
        gte?: number | undefined;
        lt?: number | undefined;
        lte?: number | undefined;
    }>]>>, "many">>;
    contextConditions: z.ZodDefault<z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodObject<{
        eq: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
        not_eq: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
        in: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
        not_in: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
        contains: z.ZodOptional<z.ZodString>;
        contains_any: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        pattern: z.ZodOptional<z.ZodString>;
        regex: z.ZodOptional<z.ZodString>;
        domain_not_in: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        exists: z.ZodOptional<z.ZodBoolean>;
        is_null: z.ZodOptional<z.ZodBoolean>;
    }, "strict", z.ZodTypeAny, {
        eq?: string | number | boolean | undefined;
        not_eq?: string | number | boolean | undefined;
        in?: (string | number)[] | undefined;
        not_in?: (string | number)[] | undefined;
        contains?: string | undefined;
        contains_any?: string[] | undefined;
        pattern?: string | undefined;
        regex?: string | undefined;
        domain_not_in?: string[] | undefined;
        exists?: boolean | undefined;
        is_null?: boolean | undefined;
    }, {
        eq?: string | number | boolean | undefined;
        not_eq?: string | number | boolean | undefined;
        in?: (string | number)[] | undefined;
        not_in?: (string | number)[] | undefined;
        contains?: string | undefined;
        contains_any?: string[] | undefined;
        pattern?: string | undefined;
        regex?: string | undefined;
        domain_not_in?: string[] | undefined;
        exists?: boolean | undefined;
        is_null?: boolean | undefined;
    }>, z.ZodObject<{
        eq: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodBoolean]>>;
        not_eq: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodBoolean]>>;
        gt: z.ZodOptional<z.ZodNumber>;
        gte: z.ZodOptional<z.ZodNumber>;
        lt: z.ZodOptional<z.ZodNumber>;
        lte: z.ZodOptional<z.ZodNumber>;
        in: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
        exists: z.ZodOptional<z.ZodBoolean>;
    }, "strict", z.ZodTypeAny, {
        eq?: number | boolean | undefined;
        not_eq?: number | boolean | undefined;
        in?: number[] | undefined;
        exists?: boolean | undefined;
        gt?: number | undefined;
        gte?: number | undefined;
        lt?: number | undefined;
        lte?: number | undefined;
    }, {
        eq?: number | boolean | undefined;
        not_eq?: number | boolean | undefined;
        in?: number[] | undefined;
        exists?: boolean | undefined;
        gt?: number | undefined;
        gte?: number | undefined;
        lt?: number | undefined;
        lte?: number | undefined;
    }>]>>, "many">>;
    dataClassConditions: z.ZodDefault<z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodObject<{
        eq: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
        not_eq: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
        in: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
        not_in: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
        contains: z.ZodOptional<z.ZodString>;
        contains_any: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        pattern: z.ZodOptional<z.ZodString>;
        regex: z.ZodOptional<z.ZodString>;
        domain_not_in: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        exists: z.ZodOptional<z.ZodBoolean>;
        is_null: z.ZodOptional<z.ZodBoolean>;
    }, "strict", z.ZodTypeAny, {
        eq?: string | number | boolean | undefined;
        not_eq?: string | number | boolean | undefined;
        in?: (string | number)[] | undefined;
        not_in?: (string | number)[] | undefined;
        contains?: string | undefined;
        contains_any?: string[] | undefined;
        pattern?: string | undefined;
        regex?: string | undefined;
        domain_not_in?: string[] | undefined;
        exists?: boolean | undefined;
        is_null?: boolean | undefined;
    }, {
        eq?: string | number | boolean | undefined;
        not_eq?: string | number | boolean | undefined;
        in?: (string | number)[] | undefined;
        not_in?: (string | number)[] | undefined;
        contains?: string | undefined;
        contains_any?: string[] | undefined;
        pattern?: string | undefined;
        regex?: string | undefined;
        domain_not_in?: string[] | undefined;
        exists?: boolean | undefined;
        is_null?: boolean | undefined;
    }>, z.ZodObject<{
        eq: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodBoolean]>>;
        not_eq: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodBoolean]>>;
        gt: z.ZodOptional<z.ZodNumber>;
        gte: z.ZodOptional<z.ZodNumber>;
        lt: z.ZodOptional<z.ZodNumber>;
        lte: z.ZodOptional<z.ZodNumber>;
        in: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
        exists: z.ZodOptional<z.ZodBoolean>;
    }, "strict", z.ZodTypeAny, {
        eq?: number | boolean | undefined;
        not_eq?: number | boolean | undefined;
        in?: number[] | undefined;
        exists?: boolean | undefined;
        gt?: number | undefined;
        gte?: number | undefined;
        lt?: number | undefined;
        lte?: number | undefined;
    }, {
        eq?: number | boolean | undefined;
        not_eq?: number | boolean | undefined;
        in?: number[] | undefined;
        exists?: boolean | undefined;
        gt?: number | undefined;
        gte?: number | undefined;
        lt?: number | undefined;
        lte?: number | undefined;
    }>]>>, "many">>;
    timeConditions: z.ZodDefault<z.ZodArray<z.ZodObject<{
        within: z.ZodOptional<z.ZodObject<{
            days: z.ZodArray<z.ZodEnum<["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]>, "many">;
            hours: z.ZodObject<{
                start: z.ZodString;
                end: z.ZodString;
                tz: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                start: string;
                end: string;
                tz: string;
            }, {
                start: string;
                end: string;
                tz: string;
            }>;
        }, "strip", z.ZodTypeAny, {
            days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
            hours: {
                start: string;
                end: string;
                tz: string;
            };
        }, {
            days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
            hours: {
                start: string;
                end: string;
                tz: string;
            };
        }>>;
        outside: z.ZodOptional<z.ZodObject<{
            days: z.ZodArray<z.ZodEnum<["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]>, "many">;
            hours: z.ZodObject<{
                start: z.ZodString;
                end: z.ZodString;
                tz: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                start: string;
                end: string;
                tz: string;
            }, {
                start: string;
                end: string;
                tz: string;
            }>;
        }, "strip", z.ZodTypeAny, {
            days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
            hours: {
                start: string;
                end: string;
                tz: string;
            };
        }, {
            days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
            hours: {
                start: string;
                end: string;
                tz: string;
            };
        }>>;
    }, "strip", z.ZodTypeAny, {
        within?: {
            days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
            hours: {
                start: string;
                end: string;
                tz: string;
            };
        } | undefined;
        outside?: {
            days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
            hours: {
                start: string;
                end: string;
                tz: string;
            };
        } | undefined;
    }, {
        within?: {
            days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
            hours: {
                start: string;
                end: string;
                tz: string;
            };
        } | undefined;
        outside?: {
            days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
            hours: {
                start: string;
                end: string;
                tz: string;
            };
        } | undefined;
    }>, "many">>;
    rateLimit: z.ZodOptional<z.ZodObject<{
        maxCalls: z.ZodNumber;
        windowSeconds: z.ZodNumber;
        keyBy: z.ZodDefault<z.ZodEnum<["session", "agent", "tenant", "tool"]>>;
    }, "strip", z.ZodTypeAny, {
        maxCalls: number;
        windowSeconds: number;
        keyBy: "tool" | "session" | "agent" | "tenant";
    }, {
        maxCalls: number;
        windowSeconds: number;
        keyBy?: "tool" | "session" | "agent" | "tenant" | undefined;
    }>>;
    approvers: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    timeoutSec: z.ZodOptional<z.ZodNumber>;
    on_timeout: z.ZodOptional<z.ZodEnum<["block", "allow"]>>;
    severity: z.ZodString;
    riskBoost: z.ZodNumber;
    tags: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    id: string;
    priority: number;
    action: "allow" | "block" | "monitor" | "require_approval";
    severity: string;
    tags: string[];
    riskBoost: number;
    paramConditions: Record<string, {
        eq?: string | number | boolean | undefined;
        not_eq?: string | number | boolean | undefined;
        in?: (string | number)[] | undefined;
        not_in?: (string | number)[] | undefined;
        contains?: string | undefined;
        contains_any?: string[] | undefined;
        pattern?: string | undefined;
        regex?: string | undefined;
        domain_not_in?: string[] | undefined;
        exists?: boolean | undefined;
        is_null?: boolean | undefined;
    } | {
        eq?: number | boolean | undefined;
        not_eq?: number | boolean | undefined;
        in?: number[] | undefined;
        exists?: boolean | undefined;
        gt?: number | undefined;
        gte?: number | undefined;
        lt?: number | undefined;
        lte?: number | undefined;
    }>[];
    contextConditions: Record<string, {
        eq?: string | number | boolean | undefined;
        not_eq?: string | number | boolean | undefined;
        in?: (string | number)[] | undefined;
        not_in?: (string | number)[] | undefined;
        contains?: string | undefined;
        contains_any?: string[] | undefined;
        pattern?: string | undefined;
        regex?: string | undefined;
        domain_not_in?: string[] | undefined;
        exists?: boolean | undefined;
        is_null?: boolean | undefined;
    } | {
        eq?: number | boolean | undefined;
        not_eq?: number | boolean | undefined;
        in?: number[] | undefined;
        exists?: boolean | undefined;
        gt?: number | undefined;
        gte?: number | undefined;
        lt?: number | undefined;
        lte?: number | undefined;
    }>[];
    dataClassConditions: Record<string, {
        eq?: string | number | boolean | undefined;
        not_eq?: string | number | boolean | undefined;
        in?: (string | number)[] | undefined;
        not_in?: (string | number)[] | undefined;
        contains?: string | undefined;
        contains_any?: string[] | undefined;
        pattern?: string | undefined;
        regex?: string | undefined;
        domain_not_in?: string[] | undefined;
        exists?: boolean | undefined;
        is_null?: boolean | undefined;
    } | {
        eq?: number | boolean | undefined;
        not_eq?: number | boolean | undefined;
        in?: number[] | undefined;
        exists?: boolean | undefined;
        gt?: number | undefined;
        gte?: number | undefined;
        lt?: number | undefined;
        lte?: number | undefined;
    }>[];
    timeConditions: {
        within?: {
            days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
            hours: {
                start: string;
                end: string;
                tz: string;
            };
        } | undefined;
        outside?: {
            days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
            hours: {
                start: string;
                end: string;
                tz: string;
            };
        } | undefined;
    }[];
    rateLimit?: {
        maxCalls: number;
        windowSeconds: number;
        keyBy: "tool" | "session" | "agent" | "tenant";
    } | undefined;
    approvers?: string[] | undefined;
    timeoutSec?: number | undefined;
    on_timeout?: "allow" | "block" | undefined;
    toolCondition?: {
        in?: string[] | undefined;
        not_in?: string[] | undefined;
        regex?: string | undefined;
        matches?: string[] | undefined;
    } | undefined;
}, {
    id: string;
    priority: number;
    action: "allow" | "block" | "monitor" | "require_approval";
    severity: string;
    tags: string[];
    riskBoost: number;
    rateLimit?: {
        maxCalls: number;
        windowSeconds: number;
        keyBy?: "tool" | "session" | "agent" | "tenant" | undefined;
    } | undefined;
    approvers?: string[] | undefined;
    timeoutSec?: number | undefined;
    on_timeout?: "allow" | "block" | undefined;
    toolCondition?: {
        in?: string[] | undefined;
        not_in?: string[] | undefined;
        regex?: string | undefined;
        matches?: string[] | undefined;
    } | undefined;
    paramConditions?: Record<string, {
        eq?: string | number | boolean | undefined;
        not_eq?: string | number | boolean | undefined;
        in?: (string | number)[] | undefined;
        not_in?: (string | number)[] | undefined;
        contains?: string | undefined;
        contains_any?: string[] | undefined;
        pattern?: string | undefined;
        regex?: string | undefined;
        domain_not_in?: string[] | undefined;
        exists?: boolean | undefined;
        is_null?: boolean | undefined;
    } | {
        eq?: number | boolean | undefined;
        not_eq?: number | boolean | undefined;
        in?: number[] | undefined;
        exists?: boolean | undefined;
        gt?: number | undefined;
        gte?: number | undefined;
        lt?: number | undefined;
        lte?: number | undefined;
    }>[] | undefined;
    contextConditions?: Record<string, {
        eq?: string | number | boolean | undefined;
        not_eq?: string | number | boolean | undefined;
        in?: (string | number)[] | undefined;
        not_in?: (string | number)[] | undefined;
        contains?: string | undefined;
        contains_any?: string[] | undefined;
        pattern?: string | undefined;
        regex?: string | undefined;
        domain_not_in?: string[] | undefined;
        exists?: boolean | undefined;
        is_null?: boolean | undefined;
    } | {
        eq?: number | boolean | undefined;
        not_eq?: number | boolean | undefined;
        in?: number[] | undefined;
        exists?: boolean | undefined;
        gt?: number | undefined;
        gte?: number | undefined;
        lt?: number | undefined;
        lte?: number | undefined;
    }>[] | undefined;
    dataClassConditions?: Record<string, {
        eq?: string | number | boolean | undefined;
        not_eq?: string | number | boolean | undefined;
        in?: (string | number)[] | undefined;
        not_in?: (string | number)[] | undefined;
        contains?: string | undefined;
        contains_any?: string[] | undefined;
        pattern?: string | undefined;
        regex?: string | undefined;
        domain_not_in?: string[] | undefined;
        exists?: boolean | undefined;
        is_null?: boolean | undefined;
    } | {
        eq?: number | boolean | undefined;
        not_eq?: number | boolean | undefined;
        in?: number[] | undefined;
        exists?: boolean | undefined;
        gt?: number | undefined;
        gte?: number | undefined;
        lt?: number | undefined;
        lte?: number | undefined;
    }>[] | undefined;
    timeConditions?: {
        within?: {
            days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
            hours: {
                start: string;
                end: string;
                tz: string;
            };
        } | undefined;
        outside?: {
            days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
            hours: {
                start: string;
                end: string;
                tz: string;
            };
        } | undefined;
    }[] | undefined;
}>;
export type CompiledRule = z.infer<typeof CompiledRuleSchema>;
export declare const PolicyBundleSchema: z.ZodObject<{
    policyId: z.ZodString;
    tenantId: z.ZodOptional<z.ZodString>;
    version: z.ZodString;
    compiledAt: z.ZodString;
    defaultAction: z.ZodEnum<["allow", "block"]>;
    budgets: z.ZodOptional<z.ZodObject<{
        maxTokensPerSession: z.ZodOptional<z.ZodNumber>;
        maxTokensPerDay: z.ZodOptional<z.ZodNumber>;
        maxApiSpendCentsPerDay: z.ZodOptional<z.ZodNumber>;
        maxActionsPerMinute: z.ZodOptional<z.ZodNumber>;
        maxActionsPerSession: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        maxTokensPerSession?: number | undefined;
        maxTokensPerDay?: number | undefined;
        maxApiSpendCentsPerDay?: number | undefined;
        maxActionsPerMinute?: number | undefined;
        maxActionsPerSession?: number | undefined;
    }, {
        maxTokensPerSession?: number | undefined;
        maxTokensPerDay?: number | undefined;
        maxApiSpendCentsPerDay?: number | undefined;
        maxActionsPerMinute?: number | undefined;
        maxActionsPerSession?: number | undefined;
    }>>;
    rules: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        priority: z.ZodNumber;
        action: z.ZodEnum<["allow", "block", "monitor", "require_approval"]>;
        toolCondition: z.ZodOptional<z.ZodObject<{
            in: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            not_in: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            matches: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            regex: z.ZodOptional<z.ZodString>;
        }, "strict", z.ZodTypeAny, {
            in?: string[] | undefined;
            not_in?: string[] | undefined;
            regex?: string | undefined;
            matches?: string[] | undefined;
        }, {
            in?: string[] | undefined;
            not_in?: string[] | undefined;
            regex?: string | undefined;
            matches?: string[] | undefined;
        }>>;
        paramConditions: z.ZodDefault<z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodObject<{
            eq: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
            not_eq: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
            in: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
            not_in: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
            contains: z.ZodOptional<z.ZodString>;
            contains_any: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            pattern: z.ZodOptional<z.ZodString>;
            regex: z.ZodOptional<z.ZodString>;
            domain_not_in: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            exists: z.ZodOptional<z.ZodBoolean>;
            is_null: z.ZodOptional<z.ZodBoolean>;
        }, "strict", z.ZodTypeAny, {
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
            regex?: string | undefined;
            domain_not_in?: string[] | undefined;
            exists?: boolean | undefined;
            is_null?: boolean | undefined;
        }, {
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
            regex?: string | undefined;
            domain_not_in?: string[] | undefined;
            exists?: boolean | undefined;
            is_null?: boolean | undefined;
        }>, z.ZodObject<{
            eq: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodBoolean]>>;
            not_eq: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodBoolean]>>;
            gt: z.ZodOptional<z.ZodNumber>;
            gte: z.ZodOptional<z.ZodNumber>;
            lt: z.ZodOptional<z.ZodNumber>;
            lte: z.ZodOptional<z.ZodNumber>;
            in: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
            exists: z.ZodOptional<z.ZodBoolean>;
        }, "strict", z.ZodTypeAny, {
            eq?: number | boolean | undefined;
            not_eq?: number | boolean | undefined;
            in?: number[] | undefined;
            exists?: boolean | undefined;
            gt?: number | undefined;
            gte?: number | undefined;
            lt?: number | undefined;
            lte?: number | undefined;
        }, {
            eq?: number | boolean | undefined;
            not_eq?: number | boolean | undefined;
            in?: number[] | undefined;
            exists?: boolean | undefined;
            gt?: number | undefined;
            gte?: number | undefined;
            lt?: number | undefined;
            lte?: number | undefined;
        }>]>>, "many">>;
        contextConditions: z.ZodDefault<z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodObject<{
            eq: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
            not_eq: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
            in: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
            not_in: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
            contains: z.ZodOptional<z.ZodString>;
            contains_any: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            pattern: z.ZodOptional<z.ZodString>;
            regex: z.ZodOptional<z.ZodString>;
            domain_not_in: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            exists: z.ZodOptional<z.ZodBoolean>;
            is_null: z.ZodOptional<z.ZodBoolean>;
        }, "strict", z.ZodTypeAny, {
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
            regex?: string | undefined;
            domain_not_in?: string[] | undefined;
            exists?: boolean | undefined;
            is_null?: boolean | undefined;
        }, {
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
            regex?: string | undefined;
            domain_not_in?: string[] | undefined;
            exists?: boolean | undefined;
            is_null?: boolean | undefined;
        }>, z.ZodObject<{
            eq: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodBoolean]>>;
            not_eq: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodBoolean]>>;
            gt: z.ZodOptional<z.ZodNumber>;
            gte: z.ZodOptional<z.ZodNumber>;
            lt: z.ZodOptional<z.ZodNumber>;
            lte: z.ZodOptional<z.ZodNumber>;
            in: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
            exists: z.ZodOptional<z.ZodBoolean>;
        }, "strict", z.ZodTypeAny, {
            eq?: number | boolean | undefined;
            not_eq?: number | boolean | undefined;
            in?: number[] | undefined;
            exists?: boolean | undefined;
            gt?: number | undefined;
            gte?: number | undefined;
            lt?: number | undefined;
            lte?: number | undefined;
        }, {
            eq?: number | boolean | undefined;
            not_eq?: number | boolean | undefined;
            in?: number[] | undefined;
            exists?: boolean | undefined;
            gt?: number | undefined;
            gte?: number | undefined;
            lt?: number | undefined;
            lte?: number | undefined;
        }>]>>, "many">>;
        dataClassConditions: z.ZodDefault<z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodObject<{
            eq: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
            not_eq: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
            in: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
            not_in: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
            contains: z.ZodOptional<z.ZodString>;
            contains_any: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            pattern: z.ZodOptional<z.ZodString>;
            regex: z.ZodOptional<z.ZodString>;
            domain_not_in: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            exists: z.ZodOptional<z.ZodBoolean>;
            is_null: z.ZodOptional<z.ZodBoolean>;
        }, "strict", z.ZodTypeAny, {
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
            regex?: string | undefined;
            domain_not_in?: string[] | undefined;
            exists?: boolean | undefined;
            is_null?: boolean | undefined;
        }, {
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
            regex?: string | undefined;
            domain_not_in?: string[] | undefined;
            exists?: boolean | undefined;
            is_null?: boolean | undefined;
        }>, z.ZodObject<{
            eq: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodBoolean]>>;
            not_eq: z.ZodOptional<z.ZodUnion<[z.ZodNumber, z.ZodBoolean]>>;
            gt: z.ZodOptional<z.ZodNumber>;
            gte: z.ZodOptional<z.ZodNumber>;
            lt: z.ZodOptional<z.ZodNumber>;
            lte: z.ZodOptional<z.ZodNumber>;
            in: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
            exists: z.ZodOptional<z.ZodBoolean>;
        }, "strict", z.ZodTypeAny, {
            eq?: number | boolean | undefined;
            not_eq?: number | boolean | undefined;
            in?: number[] | undefined;
            exists?: boolean | undefined;
            gt?: number | undefined;
            gte?: number | undefined;
            lt?: number | undefined;
            lte?: number | undefined;
        }, {
            eq?: number | boolean | undefined;
            not_eq?: number | boolean | undefined;
            in?: number[] | undefined;
            exists?: boolean | undefined;
            gt?: number | undefined;
            gte?: number | undefined;
            lt?: number | undefined;
            lte?: number | undefined;
        }>]>>, "many">>;
        timeConditions: z.ZodDefault<z.ZodArray<z.ZodObject<{
            within: z.ZodOptional<z.ZodObject<{
                days: z.ZodArray<z.ZodEnum<["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]>, "many">;
                hours: z.ZodObject<{
                    start: z.ZodString;
                    end: z.ZodString;
                    tz: z.ZodString;
                }, "strip", z.ZodTypeAny, {
                    start: string;
                    end: string;
                    tz: string;
                }, {
                    start: string;
                    end: string;
                    tz: string;
                }>;
            }, "strip", z.ZodTypeAny, {
                days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
                hours: {
                    start: string;
                    end: string;
                    tz: string;
                };
            }, {
                days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
                hours: {
                    start: string;
                    end: string;
                    tz: string;
                };
            }>>;
            outside: z.ZodOptional<z.ZodObject<{
                days: z.ZodArray<z.ZodEnum<["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]>, "many">;
                hours: z.ZodObject<{
                    start: z.ZodString;
                    end: z.ZodString;
                    tz: z.ZodString;
                }, "strip", z.ZodTypeAny, {
                    start: string;
                    end: string;
                    tz: string;
                }, {
                    start: string;
                    end: string;
                    tz: string;
                }>;
            }, "strip", z.ZodTypeAny, {
                days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
                hours: {
                    start: string;
                    end: string;
                    tz: string;
                };
            }, {
                days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
                hours: {
                    start: string;
                    end: string;
                    tz: string;
                };
            }>>;
        }, "strip", z.ZodTypeAny, {
            within?: {
                days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
                hours: {
                    start: string;
                    end: string;
                    tz: string;
                };
            } | undefined;
            outside?: {
                days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
                hours: {
                    start: string;
                    end: string;
                    tz: string;
                };
            } | undefined;
        }, {
            within?: {
                days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
                hours: {
                    start: string;
                    end: string;
                    tz: string;
                };
            } | undefined;
            outside?: {
                days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
                hours: {
                    start: string;
                    end: string;
                    tz: string;
                };
            } | undefined;
        }>, "many">>;
        rateLimit: z.ZodOptional<z.ZodObject<{
            maxCalls: z.ZodNumber;
            windowSeconds: z.ZodNumber;
            keyBy: z.ZodDefault<z.ZodEnum<["session", "agent", "tenant", "tool"]>>;
        }, "strip", z.ZodTypeAny, {
            maxCalls: number;
            windowSeconds: number;
            keyBy: "tool" | "session" | "agent" | "tenant";
        }, {
            maxCalls: number;
            windowSeconds: number;
            keyBy?: "tool" | "session" | "agent" | "tenant" | undefined;
        }>>;
        approvers: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        timeoutSec: z.ZodOptional<z.ZodNumber>;
        on_timeout: z.ZodOptional<z.ZodEnum<["block", "allow"]>>;
        severity: z.ZodString;
        riskBoost: z.ZodNumber;
        tags: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        id: string;
        priority: number;
        action: "allow" | "block" | "monitor" | "require_approval";
        severity: string;
        tags: string[];
        riskBoost: number;
        paramConditions: Record<string, {
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
            regex?: string | undefined;
            domain_not_in?: string[] | undefined;
            exists?: boolean | undefined;
            is_null?: boolean | undefined;
        } | {
            eq?: number | boolean | undefined;
            not_eq?: number | boolean | undefined;
            in?: number[] | undefined;
            exists?: boolean | undefined;
            gt?: number | undefined;
            gte?: number | undefined;
            lt?: number | undefined;
            lte?: number | undefined;
        }>[];
        contextConditions: Record<string, {
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
            regex?: string | undefined;
            domain_not_in?: string[] | undefined;
            exists?: boolean | undefined;
            is_null?: boolean | undefined;
        } | {
            eq?: number | boolean | undefined;
            not_eq?: number | boolean | undefined;
            in?: number[] | undefined;
            exists?: boolean | undefined;
            gt?: number | undefined;
            gte?: number | undefined;
            lt?: number | undefined;
            lte?: number | undefined;
        }>[];
        dataClassConditions: Record<string, {
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
            regex?: string | undefined;
            domain_not_in?: string[] | undefined;
            exists?: boolean | undefined;
            is_null?: boolean | undefined;
        } | {
            eq?: number | boolean | undefined;
            not_eq?: number | boolean | undefined;
            in?: number[] | undefined;
            exists?: boolean | undefined;
            gt?: number | undefined;
            gte?: number | undefined;
            lt?: number | undefined;
            lte?: number | undefined;
        }>[];
        timeConditions: {
            within?: {
                days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
                hours: {
                    start: string;
                    end: string;
                    tz: string;
                };
            } | undefined;
            outside?: {
                days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
                hours: {
                    start: string;
                    end: string;
                    tz: string;
                };
            } | undefined;
        }[];
        rateLimit?: {
            maxCalls: number;
            windowSeconds: number;
            keyBy: "tool" | "session" | "agent" | "tenant";
        } | undefined;
        approvers?: string[] | undefined;
        timeoutSec?: number | undefined;
        on_timeout?: "allow" | "block" | undefined;
        toolCondition?: {
            in?: string[] | undefined;
            not_in?: string[] | undefined;
            regex?: string | undefined;
            matches?: string[] | undefined;
        } | undefined;
    }, {
        id: string;
        priority: number;
        action: "allow" | "block" | "monitor" | "require_approval";
        severity: string;
        tags: string[];
        riskBoost: number;
        rateLimit?: {
            maxCalls: number;
            windowSeconds: number;
            keyBy?: "tool" | "session" | "agent" | "tenant" | undefined;
        } | undefined;
        approvers?: string[] | undefined;
        timeoutSec?: number | undefined;
        on_timeout?: "allow" | "block" | undefined;
        toolCondition?: {
            in?: string[] | undefined;
            not_in?: string[] | undefined;
            regex?: string | undefined;
            matches?: string[] | undefined;
        } | undefined;
        paramConditions?: Record<string, {
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
            regex?: string | undefined;
            domain_not_in?: string[] | undefined;
            exists?: boolean | undefined;
            is_null?: boolean | undefined;
        } | {
            eq?: number | boolean | undefined;
            not_eq?: number | boolean | undefined;
            in?: number[] | undefined;
            exists?: boolean | undefined;
            gt?: number | undefined;
            gte?: number | undefined;
            lt?: number | undefined;
            lte?: number | undefined;
        }>[] | undefined;
        contextConditions?: Record<string, {
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
            regex?: string | undefined;
            domain_not_in?: string[] | undefined;
            exists?: boolean | undefined;
            is_null?: boolean | undefined;
        } | {
            eq?: number | boolean | undefined;
            not_eq?: number | boolean | undefined;
            in?: number[] | undefined;
            exists?: boolean | undefined;
            gt?: number | undefined;
            gte?: number | undefined;
            lt?: number | undefined;
            lte?: number | undefined;
        }>[] | undefined;
        dataClassConditions?: Record<string, {
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
            regex?: string | undefined;
            domain_not_in?: string[] | undefined;
            exists?: boolean | undefined;
            is_null?: boolean | undefined;
        } | {
            eq?: number | boolean | undefined;
            not_eq?: number | boolean | undefined;
            in?: number[] | undefined;
            exists?: boolean | undefined;
            gt?: number | undefined;
            gte?: number | undefined;
            lt?: number | undefined;
            lte?: number | undefined;
        }>[] | undefined;
        timeConditions?: {
            within?: {
                days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
                hours: {
                    start: string;
                    end: string;
                    tz: string;
                };
            } | undefined;
            outside?: {
                days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
                hours: {
                    start: string;
                    end: string;
                    tz: string;
                };
            } | undefined;
        }[] | undefined;
    }>, "many">;
    toolIndex: z.ZodRecord<z.ZodString, z.ZodArray<z.ZodNumber, "many">>;
    checksum: z.ZodString;
    ruleCount: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    version: string;
    rules: {
        id: string;
        priority: number;
        action: "allow" | "block" | "monitor" | "require_approval";
        severity: string;
        tags: string[];
        riskBoost: number;
        paramConditions: Record<string, {
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
            regex?: string | undefined;
            domain_not_in?: string[] | undefined;
            exists?: boolean | undefined;
            is_null?: boolean | undefined;
        } | {
            eq?: number | boolean | undefined;
            not_eq?: number | boolean | undefined;
            in?: number[] | undefined;
            exists?: boolean | undefined;
            gt?: number | undefined;
            gte?: number | undefined;
            lt?: number | undefined;
            lte?: number | undefined;
        }>[];
        contextConditions: Record<string, {
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
            regex?: string | undefined;
            domain_not_in?: string[] | undefined;
            exists?: boolean | undefined;
            is_null?: boolean | undefined;
        } | {
            eq?: number | boolean | undefined;
            not_eq?: number | boolean | undefined;
            in?: number[] | undefined;
            exists?: boolean | undefined;
            gt?: number | undefined;
            gte?: number | undefined;
            lt?: number | undefined;
            lte?: number | undefined;
        }>[];
        dataClassConditions: Record<string, {
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
            regex?: string | undefined;
            domain_not_in?: string[] | undefined;
            exists?: boolean | undefined;
            is_null?: boolean | undefined;
        } | {
            eq?: number | boolean | undefined;
            not_eq?: number | boolean | undefined;
            in?: number[] | undefined;
            exists?: boolean | undefined;
            gt?: number | undefined;
            gte?: number | undefined;
            lt?: number | undefined;
            lte?: number | undefined;
        }>[];
        timeConditions: {
            within?: {
                days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
                hours: {
                    start: string;
                    end: string;
                    tz: string;
                };
            } | undefined;
            outside?: {
                days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
                hours: {
                    start: string;
                    end: string;
                    tz: string;
                };
            } | undefined;
        }[];
        rateLimit?: {
            maxCalls: number;
            windowSeconds: number;
            keyBy: "tool" | "session" | "agent" | "tenant";
        } | undefined;
        approvers?: string[] | undefined;
        timeoutSec?: number | undefined;
        on_timeout?: "allow" | "block" | undefined;
        toolCondition?: {
            in?: string[] | undefined;
            not_in?: string[] | undefined;
            regex?: string | undefined;
            matches?: string[] | undefined;
        } | undefined;
    }[];
    policyId: string;
    compiledAt: string;
    defaultAction: "allow" | "block";
    toolIndex: Record<string, number[]>;
    checksum: string;
    ruleCount: number;
    tenantId?: string | undefined;
    budgets?: {
        maxTokensPerSession?: number | undefined;
        maxTokensPerDay?: number | undefined;
        maxApiSpendCentsPerDay?: number | undefined;
        maxActionsPerMinute?: number | undefined;
        maxActionsPerSession?: number | undefined;
    } | undefined;
}, {
    version: string;
    rules: {
        id: string;
        priority: number;
        action: "allow" | "block" | "monitor" | "require_approval";
        severity: string;
        tags: string[];
        riskBoost: number;
        rateLimit?: {
            maxCalls: number;
            windowSeconds: number;
            keyBy?: "tool" | "session" | "agent" | "tenant" | undefined;
        } | undefined;
        approvers?: string[] | undefined;
        timeoutSec?: number | undefined;
        on_timeout?: "allow" | "block" | undefined;
        toolCondition?: {
            in?: string[] | undefined;
            not_in?: string[] | undefined;
            regex?: string | undefined;
            matches?: string[] | undefined;
        } | undefined;
        paramConditions?: Record<string, {
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
            regex?: string | undefined;
            domain_not_in?: string[] | undefined;
            exists?: boolean | undefined;
            is_null?: boolean | undefined;
        } | {
            eq?: number | boolean | undefined;
            not_eq?: number | boolean | undefined;
            in?: number[] | undefined;
            exists?: boolean | undefined;
            gt?: number | undefined;
            gte?: number | undefined;
            lt?: number | undefined;
            lte?: number | undefined;
        }>[] | undefined;
        contextConditions?: Record<string, {
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
            regex?: string | undefined;
            domain_not_in?: string[] | undefined;
            exists?: boolean | undefined;
            is_null?: boolean | undefined;
        } | {
            eq?: number | boolean | undefined;
            not_eq?: number | boolean | undefined;
            in?: number[] | undefined;
            exists?: boolean | undefined;
            gt?: number | undefined;
            gte?: number | undefined;
            lt?: number | undefined;
            lte?: number | undefined;
        }>[] | undefined;
        dataClassConditions?: Record<string, {
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
            regex?: string | undefined;
            domain_not_in?: string[] | undefined;
            exists?: boolean | undefined;
            is_null?: boolean | undefined;
        } | {
            eq?: number | boolean | undefined;
            not_eq?: number | boolean | undefined;
            in?: number[] | undefined;
            exists?: boolean | undefined;
            gt?: number | undefined;
            gte?: number | undefined;
            lt?: number | undefined;
            lte?: number | undefined;
        }>[] | undefined;
        timeConditions?: {
            within?: {
                days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
                hours: {
                    start: string;
                    end: string;
                    tz: string;
                };
            } | undefined;
            outside?: {
                days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
                hours: {
                    start: string;
                    end: string;
                    tz: string;
                };
            } | undefined;
        }[] | undefined;
    }[];
    policyId: string;
    compiledAt: string;
    defaultAction: "allow" | "block";
    toolIndex: Record<string, number[]>;
    checksum: string;
    ruleCount: number;
    tenantId?: string | undefined;
    budgets?: {
        maxTokensPerSession?: number | undefined;
        maxTokensPerDay?: number | undefined;
        maxApiSpendCentsPerDay?: number | undefined;
        maxActionsPerMinute?: number | undefined;
        maxActionsPerSession?: number | undefined;
    } | undefined;
}>;
export type PolicyBundle = z.infer<typeof PolicyBundleSchema>;
/**
 * Contextual identity flowing through every evaluation call.
 * Keeps evaluations traceable back to a specific agent session and policy version.
 * Aligns with ARCHITECTURE.md ServiceContext pattern (SDK-side variant).
 */
export declare const AgentContextSchema: z.ZodObject<{
    /** Stable agent identifier */
    agentId: z.ZodString;
    /** Session identifier — unique per agent invocation */
    sessionId: z.ZodString;
    /** Version of the policy active at session start */
    policyVersion: z.ZodString;
    /** Optional tenant scoping */
    tenantId: z.ZodOptional<z.ZodString>;
    /** Session-level context values (action count, token usage, flags, etc.) */
    sessionContext: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    agentId: string;
    sessionId: string;
    policyVersion: string;
    tenantId?: string | undefined;
    sessionContext?: Record<string, unknown> | undefined;
}, {
    agentId: string;
    sessionId: string;
    policyVersion: string;
    tenantId?: string | undefined;
    sessionContext?: Record<string, unknown> | undefined;
}>;
export type AgentContext = z.infer<typeof AgentContextSchema>;
export declare const ActionRequestSchema: z.ZodObject<{
    /** Unique action ID (UUID generated by caller) */
    id: z.ZodString;
    /** Agent performing the action */
    agentId: z.ZodString;
    /** Tool name being called, e.g. "send_email" or "db:read" */
    tool: z.ZodString;
    /** Raw parameters passed to the tool */
    params: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    /** Data classification labels on the input */
    inputDataLabels: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    /** ISO 8601 timestamp of when the action was initiated */
    timestamp: z.ZodString;
}, "strip", z.ZodTypeAny, {
    params: Record<string, unknown>;
    tool: string;
    id: string;
    agentId: string;
    inputDataLabels: string[];
    timestamp: string;
}, {
    tool: string;
    id: string;
    agentId: string;
    timestamp: string;
    params?: Record<string, unknown> | undefined;
    inputDataLabels?: string[] | undefined;
}>;
export type ActionRequest = z.infer<typeof ActionRequestSchema>;
export declare const PolicyDecisionSchema: z.ZodObject<{
    result: z.ZodEnum<["allow", "block", "monitor", "require_approval"]>;
    matchedRuleId: z.ZodNullable<z.ZodString>;
    /** All monitor rules that matched (accumulate; never terminate) */
    monitorRuleIds: z.ZodArray<z.ZodString, "many">;
    /** Composite risk score 0–1000 */
    riskScore: z.ZodNumber;
    reason: z.ZodNullable<z.ZodString>;
    /** Set when result === 'require_approval' */
    gateId: z.ZodNullable<z.ZodString>;
    gateTimeoutSec: z.ZodNullable<z.ZodNumber>;
    policyVersion: z.ZodString;
    evaluatedAt: z.ZodString;
    /** Evaluation latency in ms (for SLA tracking) */
    durationMs: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    policyVersion: string;
    result: "allow" | "block" | "monitor" | "require_approval";
    matchedRuleId: string | null;
    monitorRuleIds: string[];
    riskScore: number;
    reason: string | null;
    gateId: string | null;
    gateTimeoutSec: number | null;
    evaluatedAt: string;
    durationMs: number;
}, {
    policyVersion: string;
    result: "allow" | "block" | "monitor" | "require_approval";
    matchedRuleId: string | null;
    monitorRuleIds: string[];
    riskScore: number;
    reason: string | null;
    gateId: string | null;
    gateTimeoutSec: number | null;
    evaluatedAt: string;
    durationMs: number;
}>;
export type PolicyDecision = z.infer<typeof PolicyDecisionSchema>;
/**
 * Immutable audit event — append-only. Aligns with DATA_MODEL.md AuditEvent schema.
 * Hash chain ensures tamper-evidence: each event hashes the previous event's hash.
 */
export declare const AuditEventSchema: z.ZodObject<{
    /** Monotonically increasing sequence number for ordering */
    seq: z.ZodNumber;
    /** ISO 8601 timestamp */
    timestamp: z.ZodString;
    agentId: z.ZodString;
    sessionId: z.ZodString;
    tenantId: z.ZodOptional<z.ZodString>;
    policyVersion: z.ZodString;
    /** Tool/action that was attempted */
    tool: z.ZodString;
    /** Parameters (may be redacted; PII fields replaced with "[REDACTED]") */
    params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    /** Result from the POLICY_ENGINE.md evaluation algorithm */
    decision: z.ZodEnum<["allow", "block", "monitor", "require_approval"]>;
    matchedRuleId: z.ZodNullable<z.ZodString>;
    monitorRuleIds: z.ZodArray<z.ZodString, "many">;
    riskScore: z.ZodNumber;
    /** Human-readable reason for the decision */
    reason: z.ZodString;
    /** Evaluation latency in ms */
    durationMs: z.ZodNumber;
    /** Return value from the tool (if it ran successfully) */
    result: z.ZodOptional<z.ZodUnknown>;
    /** Error message if the tool threw */
    error: z.ZodOptional<z.ZodString>;
    /**
     * SHA-256 hex digest of this entry's content fields.
     * Computed over a canonical subset of fields.
     */
    eventHash: z.ZodString;
    /**
     * SHA-256 hex digest of the PREVIOUS entry's `eventHash`.
     * First entry uses GENESIS_HASH = '0'.repeat(64).
     */
    previousHash: z.ZodString;
}, "strip", z.ZodTypeAny, {
    tool: string;
    agentId: string;
    sessionId: string;
    policyVersion: string;
    timestamp: string;
    matchedRuleId: string | null;
    monitorRuleIds: string[];
    riskScore: number;
    reason: string;
    durationMs: number;
    seq: number;
    decision: "allow" | "block" | "monitor" | "require_approval";
    eventHash: string;
    previousHash: string;
    params?: Record<string, unknown> | undefined;
    tenantId?: string | undefined;
    result?: unknown;
    error?: string | undefined;
}, {
    tool: string;
    agentId: string;
    sessionId: string;
    policyVersion: string;
    timestamp: string;
    matchedRuleId: string | null;
    monitorRuleIds: string[];
    riskScore: number;
    reason: string;
    durationMs: number;
    seq: number;
    decision: "allow" | "block" | "monitor" | "require_approval";
    eventHash: string;
    previousHash: string;
    params?: Record<string, unknown> | undefined;
    tenantId?: string | undefined;
    result?: unknown;
    error?: string | undefined;
}>;
export type AuditEvent = z.infer<typeof AuditEventSchema>;
export declare const KillSwitchStateSchema: z.ZodObject<{
    /** If true, ALL agents are halted regardless of per-agent settings */
    globalHalt: z.ZodBoolean;
    /** Agent IDs that are individually halted */
    haltedAgents: z.ZodType<Set<string>>;
    /** ISO 8601 timestamp when global halt was activated */
    globalHaltAt: z.ZodOptional<z.ZodString>;
    /** Operator-supplied reason for the global halt */
    globalHaltReason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    globalHalt: boolean;
    haltedAgents: Set<string>;
    globalHaltAt?: string | undefined;
    globalHaltReason?: string | undefined;
}, {
    globalHalt: boolean;
    haltedAgents: Set<string>;
    globalHaltAt?: string | undefined;
    globalHaltReason?: string | undefined;
}>;
export type KillSwitchState = z.infer<typeof KillSwitchStateSchema>;
export declare const ApprovalStatusSchema: z.ZodEnum<["pending", "approved", "denied", "timeout"]>;
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;
export declare const ApprovalRequestSchema: z.ZodObject<{
    /** Unique approval request identifier */
    id: z.ZodString;
    /** The action awaiting human approval */
    action: z.ZodObject<{
        /** Unique action ID (UUID generated by caller) */
        id: z.ZodString;
        /** Agent performing the action */
        agentId: z.ZodString;
        /** Tool name being called, e.g. "send_email" or "db:read" */
        tool: z.ZodString;
        /** Raw parameters passed to the tool */
        params: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        /** Data classification labels on the input */
        inputDataLabels: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        /** ISO 8601 timestamp of when the action was initiated */
        timestamp: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        params: Record<string, unknown>;
        tool: string;
        id: string;
        agentId: string;
        inputDataLabels: string[];
        timestamp: string;
    }, {
        tool: string;
        id: string;
        agentId: string;
        timestamp: string;
        params?: Record<string, unknown> | undefined;
        inputDataLabels?: string[] | undefined;
    }>;
    /** Agent context */
    agentId: z.ZodString;
    sessionId: z.ZodString;
    matchedRuleId: z.ZodString;
    approvers: z.ZodArray<z.ZodString, "many">;
    /** Current lifecycle status */
    status: z.ZodEnum<["pending", "approved", "denied", "timeout"]>;
    /** ISO 8601 creation timestamp */
    createdAt: z.ZodString;
    /** ISO 8601 expiry — after this the request auto-transitions to "timeout" */
    expiresAt: z.ZodString;
    /** Identifier of the human who resolved the request */
    resolvedBy: z.ZodOptional<z.ZodString>;
    /** ISO 8601 resolution timestamp */
    resolvedAt: z.ZodOptional<z.ZodString>;
    /** Reason the human provided when approving or denying */
    resolveReason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: "pending" | "approved" | "denied" | "timeout";
    id: string;
    action: {
        params: Record<string, unknown>;
        tool: string;
        id: string;
        agentId: string;
        inputDataLabels: string[];
        timestamp: string;
    };
    approvers: string[];
    agentId: string;
    sessionId: string;
    matchedRuleId: string;
    createdAt: string;
    expiresAt: string;
    resolvedBy?: string | undefined;
    resolvedAt?: string | undefined;
    resolveReason?: string | undefined;
}, {
    status: "pending" | "approved" | "denied" | "timeout";
    id: string;
    action: {
        tool: string;
        id: string;
        agentId: string;
        timestamp: string;
        params?: Record<string, unknown> | undefined;
        inputDataLabels?: string[] | undefined;
    };
    approvers: string[];
    agentId: string;
    sessionId: string;
    matchedRuleId: string;
    createdAt: string;
    expiresAt: string;
    resolvedBy?: string | undefined;
    resolvedAt?: string | undefined;
    resolveReason?: string | undefined;
}>;
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;
export interface RateLimitBucket {
    count: number;
    windowStart: number;
}
export declare const GENESIS_HASH: string;
export declare const RISK_TIERS: {
    readonly LOW: {
        readonly min: 0;
        readonly max: 99;
    };
    readonly MEDIUM: {
        readonly min: 100;
        readonly max: 299;
    };
    readonly HIGH: {
        readonly min: 300;
        readonly max: 599;
    };
    readonly CRITICAL: {
        readonly min: 600;
        readonly max: 1000;
    };
};
export type RiskTierLabel = keyof typeof RISK_TIERS;
export declare function getRiskTier(score: number): RiskTierLabel;
export declare const BASE_RISK_SCORES: Record<PolicyAction, number>;
//# sourceMappingURL=types.d.ts.map