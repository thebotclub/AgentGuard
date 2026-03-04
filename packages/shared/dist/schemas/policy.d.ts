/**
 * Policy Zod schemas — the core DSL types for the policy engine.
 * Extracted from sdk/core/types.ts and POLICY_ENGINE.md §9.
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
    regex?: string | undefined;
    eq?: string | number | boolean | undefined;
    not_eq?: string | number | boolean | undefined;
    in?: (string | number)[] | undefined;
    not_in?: (string | number)[] | undefined;
    contains?: string | undefined;
    contains_any?: string[] | undefined;
    pattern?: string | undefined;
    domain_not_in?: string[] | undefined;
    exists?: boolean | undefined;
    is_null?: boolean | undefined;
}, {
    regex?: string | undefined;
    eq?: string | number | boolean | undefined;
    not_eq?: string | number | boolean | undefined;
    in?: (string | number)[] | undefined;
    not_in?: (string | number)[] | undefined;
    contains?: string | undefined;
    contains_any?: string[] | undefined;
    pattern?: string | undefined;
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
    regex?: string | undefined;
    eq?: string | number | boolean | undefined;
    not_eq?: string | number | boolean | undefined;
    in?: (string | number)[] | undefined;
    not_in?: (string | number)[] | undefined;
    contains?: string | undefined;
    contains_any?: string[] | undefined;
    pattern?: string | undefined;
    domain_not_in?: string[] | undefined;
    exists?: boolean | undefined;
    is_null?: boolean | undefined;
}, {
    regex?: string | undefined;
    eq?: string | number | boolean | undefined;
    not_eq?: string | number | boolean | undefined;
    in?: (string | number)[] | undefined;
    not_in?: (string | number)[] | undefined;
    contains?: string | undefined;
    contains_any?: string[] | undefined;
    pattern?: string | undefined;
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
    regex?: string | undefined;
    in?: string[] | undefined;
    not_in?: string[] | undefined;
    matches?: string[] | undefined;
}, {
    regex?: string | undefined;
    in?: string[] | undefined;
    not_in?: string[] | undefined;
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
        regex?: string | undefined;
        in?: string[] | undefined;
        not_in?: string[] | undefined;
        matches?: string[] | undefined;
    }, {
        regex?: string | undefined;
        in?: string[] | undefined;
        not_in?: string[] | undefined;
        matches?: string[] | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    tool: {
        regex?: string | undefined;
        in?: string[] | undefined;
        not_in?: string[] | undefined;
        matches?: string[] | undefined;
    };
}, {
    tool: {
        regex?: string | undefined;
        in?: string[] | undefined;
        not_in?: string[] | undefined;
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
        regex?: string | undefined;
        eq?: string | number | boolean | undefined;
        not_eq?: string | number | boolean | undefined;
        in?: (string | number)[] | undefined;
        not_in?: (string | number)[] | undefined;
        contains?: string | undefined;
        contains_any?: string[] | undefined;
        pattern?: string | undefined;
        domain_not_in?: string[] | undefined;
        exists?: boolean | undefined;
        is_null?: boolean | undefined;
    }, {
        regex?: string | undefined;
        eq?: string | number | boolean | undefined;
        not_eq?: string | number | boolean | undefined;
        in?: (string | number)[] | undefined;
        not_in?: (string | number)[] | undefined;
        contains?: string | undefined;
        contains_any?: string[] | undefined;
        pattern?: string | undefined;
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
        regex?: string | undefined;
        eq?: string | number | boolean | undefined;
        not_eq?: string | number | boolean | undefined;
        in?: (string | number)[] | undefined;
        not_in?: (string | number)[] | undefined;
        contains?: string | undefined;
        contains_any?: string[] | undefined;
        pattern?: string | undefined;
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
        regex?: string | undefined;
        eq?: string | number | boolean | undefined;
        not_eq?: string | number | boolean | undefined;
        in?: (string | number)[] | undefined;
        not_in?: (string | number)[] | undefined;
        contains?: string | undefined;
        contains_any?: string[] | undefined;
        pattern?: string | undefined;
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
        regex?: string | undefined;
        eq?: string | number | boolean | undefined;
        not_eq?: string | number | boolean | undefined;
        in?: (string | number)[] | undefined;
        not_in?: (string | number)[] | undefined;
        contains?: string | undefined;
        contains_any?: string[] | undefined;
        pattern?: string | undefined;
        domain_not_in?: string[] | undefined;
        exists?: boolean | undefined;
        is_null?: boolean | undefined;
    }, {
        regex?: string | undefined;
        eq?: string | number | boolean | undefined;
        not_eq?: string | number | boolean | undefined;
        in?: (string | number)[] | undefined;
        not_in?: (string | number)[] | undefined;
        contains?: string | undefined;
        contains_any?: string[] | undefined;
        pattern?: string | undefined;
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
        regex?: string | undefined;
        eq?: string | number | boolean | undefined;
        not_eq?: string | number | boolean | undefined;
        in?: (string | number)[] | undefined;
        not_in?: (string | number)[] | undefined;
        contains?: string | undefined;
        contains_any?: string[] | undefined;
        pattern?: string | undefined;
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
        regex?: string | undefined;
        eq?: string | number | boolean | undefined;
        not_eq?: string | number | boolean | undefined;
        in?: (string | number)[] | undefined;
        not_in?: (string | number)[] | undefined;
        contains?: string | undefined;
        contains_any?: string[] | undefined;
        pattern?: string | undefined;
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
        regex?: string | undefined;
        eq?: string | number | boolean | undefined;
        not_eq?: string | number | boolean | undefined;
        in?: (string | number)[] | undefined;
        not_in?: (string | number)[] | undefined;
        contains?: string | undefined;
        contains_any?: string[] | undefined;
        pattern?: string | undefined;
        domain_not_in?: string[] | undefined;
        exists?: boolean | undefined;
        is_null?: boolean | undefined;
    }, {
        regex?: string | undefined;
        eq?: string | number | boolean | undefined;
        not_eq?: string | number | boolean | undefined;
        in?: (string | number)[] | undefined;
        not_in?: (string | number)[] | undefined;
        contains?: string | undefined;
        contains_any?: string[] | undefined;
        pattern?: string | undefined;
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
        regex?: string | undefined;
        eq?: string | number | boolean | undefined;
        not_eq?: string | number | boolean | undefined;
        in?: (string | number)[] | undefined;
        not_in?: (string | number)[] | undefined;
        contains?: string | undefined;
        contains_any?: string[] | undefined;
        pattern?: string | undefined;
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
        regex?: string | undefined;
        eq?: string | number | boolean | undefined;
        not_eq?: string | number | boolean | undefined;
        in?: (string | number)[] | undefined;
        not_in?: (string | number)[] | undefined;
        contains?: string | undefined;
        contains_any?: string[] | undefined;
        pattern?: string | undefined;
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
            regex?: string | undefined;
            in?: string[] | undefined;
            not_in?: string[] | undefined;
            matches?: string[] | undefined;
        }, {
            regex?: string | undefined;
            in?: string[] | undefined;
            not_in?: string[] | undefined;
            matches?: string[] | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        tool: {
            regex?: string | undefined;
            in?: string[] | undefined;
            not_in?: string[] | undefined;
            matches?: string[] | undefined;
        };
    }, {
        tool: {
            regex?: string | undefined;
            in?: string[] | undefined;
            not_in?: string[] | undefined;
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
            regex?: string | undefined;
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
            domain_not_in?: string[] | undefined;
            exists?: boolean | undefined;
            is_null?: boolean | undefined;
        }, {
            regex?: string | undefined;
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
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
            regex?: string | undefined;
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
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
            regex?: string | undefined;
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
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
            regex?: string | undefined;
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
            domain_not_in?: string[] | undefined;
            exists?: boolean | undefined;
            is_null?: boolean | undefined;
        }, {
            regex?: string | undefined;
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
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
            regex?: string | undefined;
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
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
            regex?: string | undefined;
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
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
            regex?: string | undefined;
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
            domain_not_in?: string[] | undefined;
            exists?: boolean | undefined;
            is_null?: boolean | undefined;
        }, {
            regex?: string | undefined;
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
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
            regex?: string | undefined;
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
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
            regex?: string | undefined;
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
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
    tags: string[];
    id: string;
    priority: number;
    action: "allow" | "block" | "monitor" | "require_approval";
    when: ({
        tool: {
            regex?: string | undefined;
            in?: string[] | undefined;
            not_in?: string[] | undefined;
            matches?: string[] | undefined;
        };
    } | {
        params: Record<string, {
            regex?: string | undefined;
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
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
            regex?: string | undefined;
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
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
            regex?: string | undefined;
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
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
            regex?: string | undefined;
            in?: string[] | undefined;
            not_in?: string[] | undefined;
            matches?: string[] | undefined;
        };
    } | {
        params: Record<string, {
            regex?: string | undefined;
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
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
            regex?: string | undefined;
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
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
            regex?: string | undefined;
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
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
    tags?: string[] | undefined;
    priority?: number | undefined;
    severity?: "low" | "medium" | "high" | "critical" | undefined;
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
                regex?: string | undefined;
                in?: string[] | undefined;
                not_in?: string[] | undefined;
                matches?: string[] | undefined;
            }, {
                regex?: string | undefined;
                in?: string[] | undefined;
                not_in?: string[] | undefined;
                matches?: string[] | undefined;
            }>;
        }, "strip", z.ZodTypeAny, {
            tool: {
                regex?: string | undefined;
                in?: string[] | undefined;
                not_in?: string[] | undefined;
                matches?: string[] | undefined;
            };
        }, {
            tool: {
                regex?: string | undefined;
                in?: string[] | undefined;
                not_in?: string[] | undefined;
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
                regex?: string | undefined;
                eq?: string | number | boolean | undefined;
                not_eq?: string | number | boolean | undefined;
                in?: (string | number)[] | undefined;
                not_in?: (string | number)[] | undefined;
                contains?: string | undefined;
                contains_any?: string[] | undefined;
                pattern?: string | undefined;
                domain_not_in?: string[] | undefined;
                exists?: boolean | undefined;
                is_null?: boolean | undefined;
            }, {
                regex?: string | undefined;
                eq?: string | number | boolean | undefined;
                not_eq?: string | number | boolean | undefined;
                in?: (string | number)[] | undefined;
                not_in?: (string | number)[] | undefined;
                contains?: string | undefined;
                contains_any?: string[] | undefined;
                pattern?: string | undefined;
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
                regex?: string | undefined;
                eq?: string | number | boolean | undefined;
                not_eq?: string | number | boolean | undefined;
                in?: (string | number)[] | undefined;
                not_in?: (string | number)[] | undefined;
                contains?: string | undefined;
                contains_any?: string[] | undefined;
                pattern?: string | undefined;
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
                regex?: string | undefined;
                eq?: string | number | boolean | undefined;
                not_eq?: string | number | boolean | undefined;
                in?: (string | number)[] | undefined;
                not_in?: (string | number)[] | undefined;
                contains?: string | undefined;
                contains_any?: string[] | undefined;
                pattern?: string | undefined;
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
                regex?: string | undefined;
                eq?: string | number | boolean | undefined;
                not_eq?: string | number | boolean | undefined;
                in?: (string | number)[] | undefined;
                not_in?: (string | number)[] | undefined;
                contains?: string | undefined;
                contains_any?: string[] | undefined;
                pattern?: string | undefined;
                domain_not_in?: string[] | undefined;
                exists?: boolean | undefined;
                is_null?: boolean | undefined;
            }, {
                regex?: string | undefined;
                eq?: string | number | boolean | undefined;
                not_eq?: string | number | boolean | undefined;
                in?: (string | number)[] | undefined;
                not_in?: (string | number)[] | undefined;
                contains?: string | undefined;
                contains_any?: string[] | undefined;
                pattern?: string | undefined;
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
                regex?: string | undefined;
                eq?: string | number | boolean | undefined;
                not_eq?: string | number | boolean | undefined;
                in?: (string | number)[] | undefined;
                not_in?: (string | number)[] | undefined;
                contains?: string | undefined;
                contains_any?: string[] | undefined;
                pattern?: string | undefined;
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
                regex?: string | undefined;
                eq?: string | number | boolean | undefined;
                not_eq?: string | number | boolean | undefined;
                in?: (string | number)[] | undefined;
                not_in?: (string | number)[] | undefined;
                contains?: string | undefined;
                contains_any?: string[] | undefined;
                pattern?: string | undefined;
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
                regex?: string | undefined;
                eq?: string | number | boolean | undefined;
                not_eq?: string | number | boolean | undefined;
                in?: (string | number)[] | undefined;
                not_in?: (string | number)[] | undefined;
                contains?: string | undefined;
                contains_any?: string[] | undefined;
                pattern?: string | undefined;
                domain_not_in?: string[] | undefined;
                exists?: boolean | undefined;
                is_null?: boolean | undefined;
            }, {
                regex?: string | undefined;
                eq?: string | number | boolean | undefined;
                not_eq?: string | number | boolean | undefined;
                in?: (string | number)[] | undefined;
                not_in?: (string | number)[] | undefined;
                contains?: string | undefined;
                contains_any?: string[] | undefined;
                pattern?: string | undefined;
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
                regex?: string | undefined;
                eq?: string | number | boolean | undefined;
                not_eq?: string | number | boolean | undefined;
                in?: (string | number)[] | undefined;
                not_in?: (string | number)[] | undefined;
                contains?: string | undefined;
                contains_any?: string[] | undefined;
                pattern?: string | undefined;
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
                regex?: string | undefined;
                eq?: string | number | boolean | undefined;
                not_eq?: string | number | boolean | undefined;
                in?: (string | number)[] | undefined;
                not_in?: (string | number)[] | undefined;
                contains?: string | undefined;
                contains_any?: string[] | undefined;
                pattern?: string | undefined;
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
        tags: string[];
        id: string;
        priority: number;
        action: "allow" | "block" | "monitor" | "require_approval";
        when: ({
            tool: {
                regex?: string | undefined;
                in?: string[] | undefined;
                not_in?: string[] | undefined;
                matches?: string[] | undefined;
            };
        } | {
            params: Record<string, {
                regex?: string | undefined;
                eq?: string | number | boolean | undefined;
                not_eq?: string | number | boolean | undefined;
                in?: (string | number)[] | undefined;
                not_in?: (string | number)[] | undefined;
                contains?: string | undefined;
                contains_any?: string[] | undefined;
                pattern?: string | undefined;
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
                regex?: string | undefined;
                eq?: string | number | boolean | undefined;
                not_eq?: string | number | boolean | undefined;
                in?: (string | number)[] | undefined;
                not_in?: (string | number)[] | undefined;
                contains?: string | undefined;
                contains_any?: string[] | undefined;
                pattern?: string | undefined;
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
                regex?: string | undefined;
                eq?: string | number | boolean | undefined;
                not_eq?: string | number | boolean | undefined;
                in?: (string | number)[] | undefined;
                not_in?: (string | number)[] | undefined;
                contains?: string | undefined;
                contains_any?: string[] | undefined;
                pattern?: string | undefined;
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
                regex?: string | undefined;
                in?: string[] | undefined;
                not_in?: string[] | undefined;
                matches?: string[] | undefined;
            };
        } | {
            params: Record<string, {
                regex?: string | undefined;
                eq?: string | number | boolean | undefined;
                not_eq?: string | number | boolean | undefined;
                in?: (string | number)[] | undefined;
                not_in?: (string | number)[] | undefined;
                contains?: string | undefined;
                contains_any?: string[] | undefined;
                pattern?: string | undefined;
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
                regex?: string | undefined;
                eq?: string | number | boolean | undefined;
                not_eq?: string | number | boolean | undefined;
                in?: (string | number)[] | undefined;
                not_in?: (string | number)[] | undefined;
                contains?: string | undefined;
                contains_any?: string[] | undefined;
                pattern?: string | undefined;
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
                regex?: string | undefined;
                eq?: string | number | boolean | undefined;
                not_eq?: string | number | boolean | undefined;
                in?: (string | number)[] | undefined;
                not_in?: (string | number)[] | undefined;
                contains?: string | undefined;
                contains_any?: string[] | undefined;
                pattern?: string | undefined;
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
        tags?: string[] | undefined;
        priority?: number | undefined;
        severity?: "low" | "medium" | "high" | "critical" | undefined;
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
    name: string;
    id: string;
    version: string;
    default: "allow" | "block";
    rules: {
        tags: string[];
        id: string;
        priority: number;
        action: "allow" | "block" | "monitor" | "require_approval";
        when: ({
            tool: {
                regex?: string | undefined;
                in?: string[] | undefined;
                not_in?: string[] | undefined;
                matches?: string[] | undefined;
            };
        } | {
            params: Record<string, {
                regex?: string | undefined;
                eq?: string | number | boolean | undefined;
                not_eq?: string | number | boolean | undefined;
                in?: (string | number)[] | undefined;
                not_in?: (string | number)[] | undefined;
                contains?: string | undefined;
                contains_any?: string[] | undefined;
                pattern?: string | undefined;
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
                regex?: string | undefined;
                eq?: string | number | boolean | undefined;
                not_eq?: string | number | boolean | undefined;
                in?: (string | number)[] | undefined;
                not_in?: (string | number)[] | undefined;
                contains?: string | undefined;
                contains_any?: string[] | undefined;
                pattern?: string | undefined;
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
                regex?: string | undefined;
                eq?: string | number | boolean | undefined;
                not_eq?: string | number | boolean | undefined;
                in?: (string | number)[] | undefined;
                not_in?: (string | number)[] | undefined;
                contains?: string | undefined;
                contains_any?: string[] | undefined;
                pattern?: string | undefined;
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
    name: string;
    id: string;
    version: string;
    rules: {
        id: string;
        action: "allow" | "block" | "monitor" | "require_approval";
        when: ({
            tool: {
                regex?: string | undefined;
                in?: string[] | undefined;
                not_in?: string[] | undefined;
                matches?: string[] | undefined;
            };
        } | {
            params: Record<string, {
                regex?: string | undefined;
                eq?: string | number | boolean | undefined;
                not_eq?: string | number | boolean | undefined;
                in?: (string | number)[] | undefined;
                not_in?: (string | number)[] | undefined;
                contains?: string | undefined;
                contains_any?: string[] | undefined;
                pattern?: string | undefined;
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
                regex?: string | undefined;
                eq?: string | number | boolean | undefined;
                not_eq?: string | number | boolean | undefined;
                in?: (string | number)[] | undefined;
                not_in?: (string | number)[] | undefined;
                contains?: string | undefined;
                contains_any?: string[] | undefined;
                pattern?: string | undefined;
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
                regex?: string | undefined;
                eq?: string | number | boolean | undefined;
                not_eq?: string | number | boolean | undefined;
                in?: (string | number)[] | undefined;
                not_in?: (string | number)[] | undefined;
                contains?: string | undefined;
                contains_any?: string[] | undefined;
                pattern?: string | undefined;
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
        tags?: string[] | undefined;
        priority?: number | undefined;
        severity?: "low" | "medium" | "high" | "critical" | undefined;
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
        regex?: string | undefined;
        in?: string[] | undefined;
        not_in?: string[] | undefined;
        matches?: string[] | undefined;
    }, {
        regex?: string | undefined;
        in?: string[] | undefined;
        not_in?: string[] | undefined;
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
        regex?: string | undefined;
        eq?: string | number | boolean | undefined;
        not_eq?: string | number | boolean | undefined;
        in?: (string | number)[] | undefined;
        not_in?: (string | number)[] | undefined;
        contains?: string | undefined;
        contains_any?: string[] | undefined;
        pattern?: string | undefined;
        domain_not_in?: string[] | undefined;
        exists?: boolean | undefined;
        is_null?: boolean | undefined;
    }, {
        regex?: string | undefined;
        eq?: string | number | boolean | undefined;
        not_eq?: string | number | boolean | undefined;
        in?: (string | number)[] | undefined;
        not_in?: (string | number)[] | undefined;
        contains?: string | undefined;
        contains_any?: string[] | undefined;
        pattern?: string | undefined;
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
        regex?: string | undefined;
        eq?: string | number | boolean | undefined;
        not_eq?: string | number | boolean | undefined;
        in?: (string | number)[] | undefined;
        not_in?: (string | number)[] | undefined;
        contains?: string | undefined;
        contains_any?: string[] | undefined;
        pattern?: string | undefined;
        domain_not_in?: string[] | undefined;
        exists?: boolean | undefined;
        is_null?: boolean | undefined;
    }, {
        regex?: string | undefined;
        eq?: string | number | boolean | undefined;
        not_eq?: string | number | boolean | undefined;
        in?: (string | number)[] | undefined;
        not_in?: (string | number)[] | undefined;
        contains?: string | undefined;
        contains_any?: string[] | undefined;
        pattern?: string | undefined;
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
        regex?: string | undefined;
        eq?: string | number | boolean | undefined;
        not_eq?: string | number | boolean | undefined;
        in?: (string | number)[] | undefined;
        not_in?: (string | number)[] | undefined;
        contains?: string | undefined;
        contains_any?: string[] | undefined;
        pattern?: string | undefined;
        domain_not_in?: string[] | undefined;
        exists?: boolean | undefined;
        is_null?: boolean | undefined;
    }, {
        regex?: string | undefined;
        eq?: string | number | boolean | undefined;
        not_eq?: string | number | boolean | undefined;
        in?: (string | number)[] | undefined;
        not_in?: (string | number)[] | undefined;
        contains?: string | undefined;
        contains_any?: string[] | undefined;
        pattern?: string | undefined;
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
    tags: string[];
    id: string;
    priority: number;
    action: "allow" | "block" | "monitor" | "require_approval";
    severity: string;
    riskBoost: number;
    paramConditions: Record<string, {
        regex?: string | undefined;
        eq?: string | number | boolean | undefined;
        not_eq?: string | number | boolean | undefined;
        in?: (string | number)[] | undefined;
        not_in?: (string | number)[] | undefined;
        contains?: string | undefined;
        contains_any?: string[] | undefined;
        pattern?: string | undefined;
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
        regex?: string | undefined;
        eq?: string | number | boolean | undefined;
        not_eq?: string | number | boolean | undefined;
        in?: (string | number)[] | undefined;
        not_in?: (string | number)[] | undefined;
        contains?: string | undefined;
        contains_any?: string[] | undefined;
        pattern?: string | undefined;
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
        regex?: string | undefined;
        eq?: string | number | boolean | undefined;
        not_eq?: string | number | boolean | undefined;
        in?: (string | number)[] | undefined;
        not_in?: (string | number)[] | undefined;
        contains?: string | undefined;
        contains_any?: string[] | undefined;
        pattern?: string | undefined;
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
        regex?: string | undefined;
        in?: string[] | undefined;
        not_in?: string[] | undefined;
        matches?: string[] | undefined;
    } | undefined;
}, {
    tags: string[];
    id: string;
    priority: number;
    action: "allow" | "block" | "monitor" | "require_approval";
    severity: string;
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
        regex?: string | undefined;
        in?: string[] | undefined;
        not_in?: string[] | undefined;
        matches?: string[] | undefined;
    } | undefined;
    paramConditions?: Record<string, {
        regex?: string | undefined;
        eq?: string | number | boolean | undefined;
        not_eq?: string | number | boolean | undefined;
        in?: (string | number)[] | undefined;
        not_in?: (string | number)[] | undefined;
        contains?: string | undefined;
        contains_any?: string[] | undefined;
        pattern?: string | undefined;
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
        regex?: string | undefined;
        eq?: string | number | boolean | undefined;
        not_eq?: string | number | boolean | undefined;
        in?: (string | number)[] | undefined;
        not_in?: (string | number)[] | undefined;
        contains?: string | undefined;
        contains_any?: string[] | undefined;
        pattern?: string | undefined;
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
        regex?: string | undefined;
        eq?: string | number | boolean | undefined;
        not_eq?: string | number | boolean | undefined;
        in?: (string | number)[] | undefined;
        not_in?: (string | number)[] | undefined;
        contains?: string | undefined;
        contains_any?: string[] | undefined;
        pattern?: string | undefined;
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
            regex?: string | undefined;
            in?: string[] | undefined;
            not_in?: string[] | undefined;
            matches?: string[] | undefined;
        }, {
            regex?: string | undefined;
            in?: string[] | undefined;
            not_in?: string[] | undefined;
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
            regex?: string | undefined;
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
            domain_not_in?: string[] | undefined;
            exists?: boolean | undefined;
            is_null?: boolean | undefined;
        }, {
            regex?: string | undefined;
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
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
            regex?: string | undefined;
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
            domain_not_in?: string[] | undefined;
            exists?: boolean | undefined;
            is_null?: boolean | undefined;
        }, {
            regex?: string | undefined;
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
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
            regex?: string | undefined;
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
            domain_not_in?: string[] | undefined;
            exists?: boolean | undefined;
            is_null?: boolean | undefined;
        }, {
            regex?: string | undefined;
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
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
        tags: string[];
        id: string;
        priority: number;
        action: "allow" | "block" | "monitor" | "require_approval";
        severity: string;
        riskBoost: number;
        paramConditions: Record<string, {
            regex?: string | undefined;
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
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
            regex?: string | undefined;
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
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
            regex?: string | undefined;
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
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
            regex?: string | undefined;
            in?: string[] | undefined;
            not_in?: string[] | undefined;
            matches?: string[] | undefined;
        } | undefined;
    }, {
        tags: string[];
        id: string;
        priority: number;
        action: "allow" | "block" | "monitor" | "require_approval";
        severity: string;
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
            regex?: string | undefined;
            in?: string[] | undefined;
            not_in?: string[] | undefined;
            matches?: string[] | undefined;
        } | undefined;
        paramConditions?: Record<string, {
            regex?: string | undefined;
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
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
            regex?: string | undefined;
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
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
            regex?: string | undefined;
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
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
    policyId: string;
    version: string;
    rules: {
        tags: string[];
        id: string;
        priority: number;
        action: "allow" | "block" | "monitor" | "require_approval";
        severity: string;
        riskBoost: number;
        paramConditions: Record<string, {
            regex?: string | undefined;
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
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
            regex?: string | undefined;
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
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
            regex?: string | undefined;
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
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
            regex?: string | undefined;
            in?: string[] | undefined;
            not_in?: string[] | undefined;
            matches?: string[] | undefined;
        } | undefined;
    }[];
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
    policyId: string;
    version: string;
    rules: {
        tags: string[];
        id: string;
        priority: number;
        action: "allow" | "block" | "monitor" | "require_approval";
        severity: string;
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
            regex?: string | undefined;
            in?: string[] | undefined;
            not_in?: string[] | undefined;
            matches?: string[] | undefined;
        } | undefined;
        paramConditions?: Record<string, {
            regex?: string | undefined;
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
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
            regex?: string | undefined;
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
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
            regex?: string | undefined;
            eq?: string | number | boolean | undefined;
            not_eq?: string | number | boolean | undefined;
            in?: (string | number)[] | undefined;
            not_in?: (string | number)[] | undefined;
            contains?: string | undefined;
            contains_any?: string[] | undefined;
            pattern?: string | undefined;
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
export declare const PolicyDecisionSchema: z.ZodObject<{
    result: z.ZodEnum<["allow", "block", "monitor", "require_approval"]>;
    matchedRuleId: z.ZodNullable<z.ZodString>;
    monitorRuleIds: z.ZodArray<z.ZodString, "many">;
    riskScore: z.ZodNumber;
    reason: z.ZodNullable<z.ZodString>;
    gateId: z.ZodNullable<z.ZodString>;
    gateTimeoutSec: z.ZodNullable<z.ZodNumber>;
    policyVersion: z.ZodString;
    evaluatedAt: z.ZodString;
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
export declare const CreatePolicySchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    yamlContent: z.ZodString;
    changelog: z.ZodOptional<z.ZodString>;
    activate: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    name: string;
    yamlContent: string;
    activate: boolean;
    description?: string | undefined;
    changelog?: string | undefined;
}, {
    name: string;
    yamlContent: string;
    description?: string | undefined;
    changelog?: string | undefined;
    activate?: boolean | undefined;
}>;
export type CreatePolicyInput = z.infer<typeof CreatePolicySchema>;
export declare const UpdatePolicySchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    yamlContent: z.ZodOptional<z.ZodString>;
    changelog: z.ZodOptional<z.ZodString>;
    activate: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    description?: string | null | undefined;
    yamlContent?: string | undefined;
    changelog?: string | undefined;
    activate?: boolean | undefined;
}, {
    name?: string | undefined;
    description?: string | null | undefined;
    yamlContent?: string | undefined;
    changelog?: string | undefined;
    activate?: boolean | undefined;
}>;
export type UpdatePolicyInput = z.infer<typeof UpdatePolicySchema>;
export declare const ActivatePolicyVersionSchema: z.ZodObject<{
    version: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    version?: string | undefined;
}, {
    version?: string | undefined;
}>;
export declare const TestPolicySchema: z.ZodObject<{
    tests: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        input: z.ZodObject<{
            tool: z.ZodString;
            params: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            context: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        }, "strip", z.ZodTypeAny, {
            params: Record<string, unknown>;
            tool: string;
            context: Record<string, unknown>;
        }, {
            tool: string;
            params?: Record<string, unknown> | undefined;
            context?: Record<string, unknown> | undefined;
        }>;
        expected: z.ZodObject<{
            decision: z.ZodEnum<["allow", "block", "monitor", "require_approval"]>;
            matchedRule: z.ZodOptional<z.ZodString>;
            minRiskScore: z.ZodOptional<z.ZodNumber>;
            maxRiskScore: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            decision: "allow" | "block" | "monitor" | "require_approval";
            matchedRule?: string | undefined;
            minRiskScore?: number | undefined;
            maxRiskScore?: number | undefined;
        }, {
            decision: "allow" | "block" | "monitor" | "require_approval";
            matchedRule?: string | undefined;
            minRiskScore?: number | undefined;
            maxRiskScore?: number | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        expected: {
            decision: "allow" | "block" | "monitor" | "require_approval";
            matchedRule?: string | undefined;
            minRiskScore?: number | undefined;
            maxRiskScore?: number | undefined;
        };
        input: {
            params: Record<string, unknown>;
            tool: string;
            context: Record<string, unknown>;
        };
    }, {
        name: string;
        expected: {
            decision: "allow" | "block" | "monitor" | "require_approval";
            matchedRule?: string | undefined;
            minRiskScore?: number | undefined;
            maxRiskScore?: number | undefined;
        };
        input: {
            tool: string;
            params?: Record<string, unknown> | undefined;
            context?: Record<string, unknown> | undefined;
        };
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    tests: {
        name: string;
        expected: {
            decision: "allow" | "block" | "monitor" | "require_approval";
            matchedRule?: string | undefined;
            minRiskScore?: number | undefined;
            maxRiskScore?: number | undefined;
        };
        input: {
            params: Record<string, unknown>;
            tool: string;
            context: Record<string, unknown>;
        };
    }[];
}, {
    tests: {
        name: string;
        expected: {
            decision: "allow" | "block" | "monitor" | "require_approval";
            matchedRule?: string | undefined;
            minRiskScore?: number | undefined;
            maxRiskScore?: number | undefined;
        };
        input: {
            tool: string;
            params?: Record<string, unknown> | undefined;
            context?: Record<string, unknown> | undefined;
        };
    }[];
}>;
export type TestPolicyInput = z.infer<typeof TestPolicySchema>;
//# sourceMappingURL=policy.d.ts.map