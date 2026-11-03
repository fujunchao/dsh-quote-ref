/**
 * dsh-quote-ref --- host-side half.
 *
 * Pure browser plugin: the empty apply exists only so the package appears as a row in the
 * host Loader; the browser half ships through exports["./client"] and is discovered through
 * the package.json dsh.client declaration (same shape as @deepseek-ai/dsh-client-ui-secret-mask).
 */
export function apply() {}
