export const DEFAULT_PREFIX_CONFIG = {
    "${EXERCISE}": "http://localhost:8085",
};

export function resolveSrcPath(src, config = DEFAULT_PREFIX_CONFIG) {
    if (!src) return "";
    let resolved = src;
    for (const [prefix, targetPath] of Object.entries(config)) {
        if (resolved.startsWith(prefix)) {
            resolved = resolved.replace(prefix, targetPath);
            break;
        }
    }
    return resolved;
}