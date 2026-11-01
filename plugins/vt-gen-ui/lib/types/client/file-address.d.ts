/** Build a session resource address while preserving encoded path segments. */
export declare function sessionFileAddress(sessionId: string, path: string): string;
/** Resolve workspace absolute paths to session-relative resource addresses. */
export declare function fileAddressFor(sessionId: string, cwd: string | undefined, path: string): string;
