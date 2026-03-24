/**
 * Error handler middleware — maps ServiceError → HTTP response.
 * Hono uses this as the last resort error handler.
 */
import type { Context } from 'hono';
export declare function errorHandler(err: unknown, c: Context): (Response & import("hono").TypedResponse<{
    error: {
        code: string;
        message: string;
        details: ({
            code: "invalid_type";
            expected: import("zod").ZodParsedType;
            received: import("zod").ZodParsedType;
            path: (string | number)[];
            message: string;
            fatal?: boolean | undefined | undefined;
        } | {
            code: "invalid_literal";
            expected: import("hono/utils/types").JSONValue;
            received: import("hono/utils/types").JSONValue;
            path: (string | number)[];
            message: string;
            fatal?: boolean | undefined | undefined;
        } | {
            code: "unrecognized_keys";
            keys: string[];
            path: (string | number)[];
            message: string;
            fatal?: boolean | undefined | undefined;
        } | {
            code: "invalid_union";
            unionErrors: {
                issues: ({
                    code: "invalid_type";
                    expected: import("zod").ZodParsedType;
                    received: import("zod").ZodParsedType;
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "invalid_literal";
                    expected: import("hono/utils/types").JSONValue;
                    received: import("hono/utils/types").JSONValue;
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "unrecognized_keys";
                    keys: string[];
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | /*elided*/ any | {
                    code: "invalid_union_discriminator";
                    options: (string | number | boolean | null)[];
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    received: string | number;
                    code: "invalid_enum_value";
                    options: (string | number)[];
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "invalid_arguments";
                    argumentsError: /*elided*/ any;
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "invalid_return_type";
                    returnTypeError: /*elided*/ any;
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "invalid_date";
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "invalid_string";
                    validation: "base64" | "base64url" | "regex" | "url" | "date" | "email" | "emoji" | "uuid" | "nanoid" | "cuid" | "cuid2" | "ulid" | "datetime" | "time" | "duration" | "ip" | "cidr" | "jwt" | {
                        includes: string;
                        position?: number | undefined | undefined;
                    } | {
                        startsWith: string;
                    } | {
                        endsWith: string;
                    };
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "too_small";
                    minimum: number;
                    inclusive: boolean;
                    exact?: boolean | undefined;
                    type: "array" | "string" | "number" | "set" | "date" | "bigint";
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "too_big";
                    maximum: number;
                    inclusive: boolean;
                    exact?: boolean | undefined;
                    type: "array" | "string" | "number" | "set" | "date" | "bigint";
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "invalid_intersection_types";
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "not_multiple_of";
                    multipleOf: number;
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "not_finite";
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "custom";
                    params?: {
                        [x: string]: any;
                    } | undefined;
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                })[];
                readonly errors: ({
                    code: "invalid_type";
                    expected: import("zod").ZodParsedType;
                    received: import("zod").ZodParsedType;
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "invalid_literal";
                    expected: import("hono/utils/types").JSONValue;
                    received: import("hono/utils/types").JSONValue;
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "unrecognized_keys";
                    keys: string[];
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | /*elided*/ any | {
                    code: "invalid_union_discriminator";
                    options: (string | number | boolean | null)[];
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    received: string | number;
                    code: "invalid_enum_value";
                    options: (string | number)[];
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "invalid_arguments";
                    argumentsError: /*elided*/ any;
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "invalid_return_type";
                    returnTypeError: /*elided*/ any;
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "invalid_date";
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "invalid_string";
                    validation: "base64" | "base64url" | "regex" | "url" | "date" | "email" | "emoji" | "uuid" | "nanoid" | "cuid" | "cuid2" | "ulid" | "datetime" | "time" | "duration" | "ip" | "cidr" | "jwt" | {
                        includes: string;
                        position?: number | undefined | undefined;
                    } | {
                        startsWith: string;
                    } | {
                        endsWith: string;
                    };
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "too_small";
                    minimum: number;
                    inclusive: boolean;
                    exact?: boolean | undefined;
                    type: "array" | "string" | "number" | "set" | "date" | "bigint";
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "too_big";
                    maximum: number;
                    inclusive: boolean;
                    exact?: boolean | undefined;
                    type: "array" | "string" | "number" | "set" | "date" | "bigint";
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "invalid_intersection_types";
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "not_multiple_of";
                    multipleOf: number;
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "not_finite";
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "custom";
                    params?: {
                        [x: string]: any;
                    } | undefined;
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                })[];
                readonly message: string;
                readonly isEmpty: boolean;
                addIssue: never;
                addIssues: never;
                readonly formErrors: {
                    formErrors: string[];
                    fieldErrors: {
                        [x: string]: string[] | undefined;
                        [x: number]: string[] | undefined;
                    };
                };
                name: string;
                stack?: string | undefined;
                cause?: import("hono/utils/types").JSONValue | undefined;
            }[];
            path: (string | number)[];
            message: string;
            fatal?: boolean | undefined | undefined;
        } | {
            code: "invalid_union_discriminator";
            options: (string | number | boolean | null)[];
            path: (string | number)[];
            message: string;
            fatal?: boolean | undefined | undefined;
        } | {
            received: string | number;
            code: "invalid_enum_value";
            options: (string | number)[];
            path: (string | number)[];
            message: string;
            fatal?: boolean | undefined | undefined;
        } | {
            code: "invalid_arguments";
            argumentsError: {
                issues: ({
                    code: "invalid_type";
                    expected: import("zod").ZodParsedType;
                    received: import("zod").ZodParsedType;
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "invalid_literal";
                    expected: import("hono/utils/types").JSONValue;
                    received: import("hono/utils/types").JSONValue;
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "unrecognized_keys";
                    keys: string[];
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "invalid_union";
                    unionErrors: /*elided*/ any[];
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "invalid_union_discriminator";
                    options: (string | number | boolean | null)[];
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    received: string | number;
                    code: "invalid_enum_value";
                    options: (string | number)[];
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | /*elided*/ any | {
                    code: "invalid_return_type";
                    returnTypeError: /*elided*/ any;
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "invalid_date";
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "invalid_string";
                    validation: "base64" | "base64url" | "regex" | "url" | "date" | "email" | "emoji" | "uuid" | "nanoid" | "cuid" | "cuid2" | "ulid" | "datetime" | "time" | "duration" | "ip" | "cidr" | "jwt" | {
                        includes: string;
                        position?: number | undefined | undefined;
                    } | {
                        startsWith: string;
                    } | {
                        endsWith: string;
                    };
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "too_small";
                    minimum: number;
                    inclusive: boolean;
                    exact?: boolean | undefined;
                    type: "array" | "string" | "number" | "set" | "date" | "bigint";
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "too_big";
                    maximum: number;
                    inclusive: boolean;
                    exact?: boolean | undefined;
                    type: "array" | "string" | "number" | "set" | "date" | "bigint";
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "invalid_intersection_types";
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "not_multiple_of";
                    multipleOf: number;
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "not_finite";
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "custom";
                    params?: {
                        [x: string]: any;
                    } | undefined;
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                })[];
                readonly errors: ({
                    code: "invalid_type";
                    expected: import("zod").ZodParsedType;
                    received: import("zod").ZodParsedType;
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "invalid_literal";
                    expected: import("hono/utils/types").JSONValue;
                    received: import("hono/utils/types").JSONValue;
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "unrecognized_keys";
                    keys: string[];
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "invalid_union";
                    unionErrors: /*elided*/ any[];
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "invalid_union_discriminator";
                    options: (string | number | boolean | null)[];
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    received: string | number;
                    code: "invalid_enum_value";
                    options: (string | number)[];
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | /*elided*/ any | {
                    code: "invalid_return_type";
                    returnTypeError: /*elided*/ any;
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "invalid_date";
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "invalid_string";
                    validation: "base64" | "base64url" | "regex" | "url" | "date" | "email" | "emoji" | "uuid" | "nanoid" | "cuid" | "cuid2" | "ulid" | "datetime" | "time" | "duration" | "ip" | "cidr" | "jwt" | {
                        includes: string;
                        position?: number | undefined | undefined;
                    } | {
                        startsWith: string;
                    } | {
                        endsWith: string;
                    };
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "too_small";
                    minimum: number;
                    inclusive: boolean;
                    exact?: boolean | undefined;
                    type: "array" | "string" | "number" | "set" | "date" | "bigint";
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "too_big";
                    maximum: number;
                    inclusive: boolean;
                    exact?: boolean | undefined;
                    type: "array" | "string" | "number" | "set" | "date" | "bigint";
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "invalid_intersection_types";
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "not_multiple_of";
                    multipleOf: number;
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "not_finite";
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "custom";
                    params?: {
                        [x: string]: any;
                    } | undefined;
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                })[];
                readonly message: string;
                readonly isEmpty: boolean;
                addIssue: never;
                addIssues: never;
                readonly formErrors: {
                    formErrors: string[];
                    fieldErrors: {
                        [x: string]: string[] | undefined;
                        [x: number]: string[] | undefined;
                    };
                };
                name: string;
                stack?: string | undefined;
                cause?: import("hono/utils/types").JSONValue | undefined;
            };
            path: (string | number)[];
            message: string;
            fatal?: boolean | undefined | undefined;
        } | {
            code: "invalid_return_type";
            returnTypeError: {
                issues: ({
                    code: "invalid_type";
                    expected: import("zod").ZodParsedType;
                    received: import("zod").ZodParsedType;
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "invalid_literal";
                    expected: import("hono/utils/types").JSONValue;
                    received: import("hono/utils/types").JSONValue;
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "unrecognized_keys";
                    keys: string[];
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "invalid_union";
                    unionErrors: /*elided*/ any[];
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "invalid_union_discriminator";
                    options: (string | number | boolean | null)[];
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    received: string | number;
                    code: "invalid_enum_value";
                    options: (string | number)[];
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "invalid_arguments";
                    argumentsError: /*elided*/ any;
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | /*elided*/ any | {
                    code: "invalid_date";
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "invalid_string";
                    validation: "base64" | "base64url" | "regex" | "url" | "date" | "email" | "emoji" | "uuid" | "nanoid" | "cuid" | "cuid2" | "ulid" | "datetime" | "time" | "duration" | "ip" | "cidr" | "jwt" | {
                        includes: string;
                        position?: number | undefined | undefined;
                    } | {
                        startsWith: string;
                    } | {
                        endsWith: string;
                    };
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "too_small";
                    minimum: number;
                    inclusive: boolean;
                    exact?: boolean | undefined;
                    type: "array" | "string" | "number" | "set" | "date" | "bigint";
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "too_big";
                    maximum: number;
                    inclusive: boolean;
                    exact?: boolean | undefined;
                    type: "array" | "string" | "number" | "set" | "date" | "bigint";
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "invalid_intersection_types";
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "not_multiple_of";
                    multipleOf: number;
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "not_finite";
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "custom";
                    params?: {
                        [x: string]: any;
                    } | undefined;
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                })[];
                readonly errors: ({
                    code: "invalid_type";
                    expected: import("zod").ZodParsedType;
                    received: import("zod").ZodParsedType;
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "invalid_literal";
                    expected: import("hono/utils/types").JSONValue;
                    received: import("hono/utils/types").JSONValue;
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "unrecognized_keys";
                    keys: string[];
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "invalid_union";
                    unionErrors: /*elided*/ any[];
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "invalid_union_discriminator";
                    options: (string | number | boolean | null)[];
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    received: string | number;
                    code: "invalid_enum_value";
                    options: (string | number)[];
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "invalid_arguments";
                    argumentsError: /*elided*/ any;
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | /*elided*/ any | {
                    code: "invalid_date";
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "invalid_string";
                    validation: "base64" | "base64url" | "regex" | "url" | "date" | "email" | "emoji" | "uuid" | "nanoid" | "cuid" | "cuid2" | "ulid" | "datetime" | "time" | "duration" | "ip" | "cidr" | "jwt" | {
                        includes: string;
                        position?: number | undefined | undefined;
                    } | {
                        startsWith: string;
                    } | {
                        endsWith: string;
                    };
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "too_small";
                    minimum: number;
                    inclusive: boolean;
                    exact?: boolean | undefined;
                    type: "array" | "string" | "number" | "set" | "date" | "bigint";
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "too_big";
                    maximum: number;
                    inclusive: boolean;
                    exact?: boolean | undefined;
                    type: "array" | "string" | "number" | "set" | "date" | "bigint";
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "invalid_intersection_types";
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "not_multiple_of";
                    multipleOf: number;
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "not_finite";
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                } | {
                    code: "custom";
                    params?: {
                        [x: string]: any;
                    } | undefined;
                    path: (string | number)[];
                    message: string;
                    fatal?: boolean | undefined | undefined;
                })[];
                readonly message: string;
                readonly isEmpty: boolean;
                addIssue: never;
                addIssues: never;
                readonly formErrors: {
                    formErrors: string[];
                    fieldErrors: {
                        [x: string]: string[] | undefined;
                        [x: number]: string[] | undefined;
                    };
                };
                name: string;
                stack?: string | undefined;
                cause?: import("hono/utils/types").JSONValue | undefined;
            };
            path: (string | number)[];
            message: string;
            fatal?: boolean | undefined | undefined;
        } | {
            code: "invalid_date";
            path: (string | number)[];
            message: string;
            fatal?: boolean | undefined | undefined;
        } | {
            code: "invalid_string";
            validation: "base64" | "base64url" | "regex" | "url" | "date" | "email" | "emoji" | "uuid" | "nanoid" | "cuid" | "cuid2" | "ulid" | "datetime" | "time" | "duration" | "ip" | "cidr" | "jwt" | {
                includes: string;
                position?: number | undefined | undefined;
            } | {
                startsWith: string;
            } | {
                endsWith: string;
            };
            path: (string | number)[];
            message: string;
            fatal?: boolean | undefined | undefined;
        } | {
            code: "too_small";
            minimum: number;
            inclusive: boolean;
            exact?: boolean | undefined;
            type: "array" | "string" | "number" | "set" | "date" | "bigint";
            path: (string | number)[];
            message: string;
            fatal?: boolean | undefined | undefined;
        } | {
            code: "too_big";
            maximum: number;
            inclusive: boolean;
            exact?: boolean | undefined;
            type: "array" | "string" | "number" | "set" | "date" | "bigint";
            path: (string | number)[];
            message: string;
            fatal?: boolean | undefined | undefined;
        } | {
            code: "invalid_intersection_types";
            path: (string | number)[];
            message: string;
            fatal?: boolean | undefined | undefined;
        } | {
            code: "not_multiple_of";
            multipleOf: number;
            path: (string | number)[];
            message: string;
            fatal?: boolean | undefined | undefined;
        } | {
            code: "not_finite";
            path: (string | number)[];
            message: string;
            fatal?: boolean | undefined | undefined;
        } | {
            code: "custom";
            params?: {
                [x: string]: any;
            } | undefined;
            path: (string | number)[];
            message: string;
            fatal?: boolean | undefined | undefined;
        })[];
    };
}, 400, "json">) | (Response & import("hono").TypedResponse<{
    error: {
        details?: null | undefined;
        code: string;
        message: string;
    };
}, 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500, "json">) | (Response & import("hono").TypedResponse<{
    error: {
        stack?: string | undefined;
        code: string;
        message: string;
    };
}, 500, "json">);
//# sourceMappingURL=error.d.ts.map