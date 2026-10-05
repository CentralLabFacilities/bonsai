import { useCallback, useEffect, useRef, useState } from "react";

const normalizeSkillApiParamValue = (value) => {
    if (typeof value !== "string") return value;

    const trimmed = value.trim();
    if (trimmed.length < 2) return trimmed;

    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first !== "\"" && first !== "'") || last !== first) {
        return trimmed;
    }

    const inner = trimmed.slice(1, -1);
    return inner.replace(/\\([\\'"])/g, "$1");
};

const normalizeSkillApiParams = (params) => {
    if (!params || typeof params !== "object") return {};

    return Object.fromEntries(
        Object.entries(params)
            .filter(([, value]) => value !== undefined && value !== null)
            .map(([key, value]) => [key, normalizeSkillApiParamValue(value)])
    );
};

export function useSkillDefinitions({ pollIntervalMs = 10000 } = {}) {
    const [skills, setSkills] = useState({ skills: [] });
    const [skillLibraryState, setSkillLibraryState] = useState({
        status: "loading", error: null, hasLoadedSkills: false,
    });
    const [isReloadingSkills, setIsReloadingSkills] = useState(false);
    const [skillLibraryRefreshVersion, setSkillLibraryRefreshVersion] = useState(0);
    const skillLibraryStateRef = useRef(null);
    const skillLibrarySignatureRef = useRef("");
    const skillDataCacheRef = useRef(new Map());
    const skillLibraryRequestRef = useRef(0);
    const skillDataGenerationRef = useRef(0);
    const manualReloadCountRef = useRef(0);

    const loadSkills = useCallback(async () => {
        const requestId = ++skillLibraryRequestRef.current;
        try {
            const response = await fetch("/api/skills", { cache: "no-store" });
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}`);
            }

            const data = await response.json();
            if (requestId !== skillLibraryRequestRef.current) return false;
            if (!Array.isArray(data?.skills)) {
                throw new Error("Invalid skill library response: expected a skills array.");
            }
            if (!data.skills.every((skill) => typeof skill === "string" && skill.trim())) {
                throw new Error("Invalid skill library response: identifiers must be non-empty strings.");
            }
            const normalizedSkills = [...data.skills].sort();
            const signature = JSON.stringify(normalizedSkills);
            const changed = signature !== skillLibrarySignatureRef.current;

            // An individual skill definition may change without changing the
            // library's list of names. Refreshing the library therefore also
            // invalidates parameterized/base definition cache entries.
            skillDataGenerationRef.current += 1;
            skillDataCacheRef.current.clear();

            if (changed) {
                skillLibrarySignatureRef.current = signature;
                setSkills(data);
                setSkillLibraryRefreshVersion((version) => version + 1);
            }
            if (skillLibraryStateRef.current?.status !== "ready") {
                const nextState = { status: "ready", error: null, hasLoadedSkills: true };
                skillLibraryStateRef.current = nextState;
                setSkillLibraryState(nextState);
            }

            return changed;
        } catch (error) {
            if (requestId !== skillLibraryRequestRef.current) return false;
            console.error("Error loading skills:", error);
            const message = (typeof error === "string" ? error : error?.message);
            const conciseMessage = typeof message === "string" && message.trim()
                ? message.trim().replace(/\s+/g, " ")
                : "Unable to load skills.";
            // Polling the same failure must not rerender or reannounce its alert.
            if (skillLibraryStateRef.current?.error !== conciseMessage) {
                const nextState = {
                    status: "error",
                    error: conciseMessage,
                    hasLoadedSkills: skillLibraryStateRef.current?.hasLoadedSkills ?? false,
                };
                skillLibraryStateRef.current = nextState;
                setSkillLibraryState(nextState);
            }
            return false;
        }
    }, []);

    const fetchSkills = useCallback(async ({ manual = false } = {}) => {
        if (!manual) return loadSkills();

        manualReloadCountRef.current += 1;
        setIsReloadingSkills(true);
        try {
            return await loadSkills();
        } finally {
            manualReloadCountRef.current -= 1;
            if (manualReloadCountRef.current === 0) setIsReloadingSkills(false);
        }
    }, [loadSkills]);

    useEffect(() => {
        void loadSkills();

        const intervalId = window.setInterval(() => {
            if (document.visibilityState === "visible") {
                void loadSkills();
            }
        }, pollIntervalMs);

        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                void loadSkills();
            }
        };
        const handleWindowFocus = () => void loadSkills();

        document.addEventListener("visibilitychange", handleVisibilityChange);
        window.addEventListener("focus", handleWindowFocus);

        return () => {
            window.clearInterval(intervalId);
            skillLibraryRequestRef.current += 1;
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            window.removeEventListener("focus", handleWindowFocus);
        };
    }, [loadSkills, pollIntervalMs]);

    const fetchSkillData = useCallback(async function fetchDefinition(fullSkillName, params = null) {
        const apiParams = normalizeSkillApiParams(params);
        const hasParams = Object.keys(apiParams).length > 0;
        const normalizedParamEntries = Object.entries(apiParams).sort(
            ([left], [right]) => left.localeCompare(right)
        );
        const cacheKey = `${fullSkillName}\u0001${JSON.stringify(normalizedParamEntries)}`;

        if (skillDataCacheRef.current.has(cacheKey)) {
            return skillDataCacheRef.current.get(cacheKey);
        }

        const generation = skillDataGenerationRef.current;
        const cacheData = (data) => {
            // A library refresh invalidates both resolved and pending entries.
            // Old replies may satisfy their callers, but cannot refill the cache.
            if (data && generation === skillDataGenerationRef.current) {
                skillDataCacheRef.current.set(cacheKey, data);
            }
            return data;
        };
        const request = (async () => {
            try {
                const response = await fetch(`/api/skill/${fullSkillName}`, {
                    ...(hasParams
                        ? {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ params: apiParams }),
                        }
                        : { cache: "no-store" }),
                });

                if (response.ok) return cacheData(await response.json());
                if (!hasParams) throw new Error(`Server returned ${response.status}`);
                console.warn(
                    `Parameterized skill configuration failed for ${fullSkillName} (${response.status}); falling back to the base skill definition.`
                );
            } catch (error) {
                if (!hasParams) {
                    console.error(`Error loading skill ${fullSkillName}:`, error);
                    return null;
                }
                console.warn(
                    `Parameterized skill configuration failed for ${fullSkillName}; falling back to the base skill definition.`,
                    error
                );
            }

            return cacheData(await fetchDefinition(fullSkillName));
        })();
        // Store the promise before another same-key request can start. The
        // successful response replaces it with data; failed requests are retryable.
        skillDataCacheRef.current.set(cacheKey, request);
        try {
            return await request;
        } finally {
            if (skillDataCacheRef.current.get(cacheKey) === request) {
                skillDataCacheRef.current.delete(cacheKey);
            }
        }
    }, []);

    return {
        skills,
        skillLibraryStatus: skillLibraryState.status,
        skillLibraryError: skillLibraryState.error,
        hasLoadedSkills: skillLibraryState.hasLoadedSkills,
        isReloadingSkills,
        skillLibraryRefreshVersion,
        fetchSkills,
        fetchSkillData,
    };
}
