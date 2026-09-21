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
    return inner.replace(/\\([\\'\"])/g, "$1");
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
    const [isReloadingSkills, setIsReloadingSkills] = useState(false);
    const [skillLibraryRefreshVersion, setSkillLibraryRefreshVersion] = useState(0);
    const skillLibrarySignatureRef = useRef("");
    const skillDataCacheRef = useRef(new Map());

    const fetchSkills = useCallback(async ({ manual = false } = {}) => {
        if (manual) setIsReloadingSkills(true);

        try {
            const response = await fetch("/api/skills", { cache: "no-store" });
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}`);
            }

            const data = await response.json();
            const normalizedSkills = Array.isArray(data?.skills)
                ? [...data.skills].sort()
                : [];
            const signature = JSON.stringify(normalizedSkills);
            const changed = signature !== skillLibrarySignatureRef.current;

            // An individual skill definition may change without changing the
            // library's list of names. Refreshing the library therefore also
            // invalidates parameterized/base definition cache entries.
            skillDataCacheRef.current.clear();

            if (changed) {
                skillLibrarySignatureRef.current = signature;
                setSkills(data);
                setSkillLibraryRefreshVersion((version) => version + 1);
            }

            return changed;
        } catch (error) {
            console.error("Error loading skills:", error);
            return false;
        } finally {
            if (manual) setIsReloadingSkills(false);
        }
    }, []);

    useEffect(() => {
        fetchSkills();

        const intervalId = window.setInterval(() => {
            if (document.visibilityState === "visible") {
                fetchSkills();
            }
        }, pollIntervalMs);

        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                fetchSkills();
            }
        };
        const handleWindowFocus = () => fetchSkills();

        document.addEventListener("visibilitychange", handleVisibilityChange);
        window.addEventListener("focus", handleWindowFocus);

        return () => {
            window.clearInterval(intervalId);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            window.removeEventListener("focus", handleWindowFocus);
        };
    }, [fetchSkills, pollIntervalMs]);

    const fetchSkillData = useCallback(async (fullSkillName, params = null) => {
        const apiParams = normalizeSkillApiParams(params);
        const hasParams = Object.keys(apiParams).length > 0;
        const normalizedParamEntries = Object.entries(apiParams).sort(
            ([left], [right]) => left.localeCompare(right)
        );
        const cacheKey = `${fullSkillName}\u0001${JSON.stringify(normalizedParamEntries)}`;

        if (skillDataCacheRef.current.has(cacheKey)) {
            return skillDataCacheRef.current.get(cacheKey);
        }

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

            if (response.ok) {
                const data = await response.json();
                skillDataCacheRef.current.set(cacheKey, data);
                return data;
            }

            if (!hasParams) {
                throw new Error(`Server returned ${response.status}`);
            }

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

        const baseCacheKey = `${fullSkillName}\u0001[]`;
        if (skillDataCacheRef.current.has(baseCacheKey)) {
            const fallbackData = skillDataCacheRef.current.get(baseCacheKey);
            skillDataCacheRef.current.set(cacheKey, fallbackData);
            return fallbackData;
        }

        try {
            const fallbackResponse = await fetch(`/api/skill/${fullSkillName}`, {
                cache: "no-store",
            });
            if (!fallbackResponse.ok) {
                throw new Error(`Server returned ${fallbackResponse.status}`);
            }

            const fallbackData = await fallbackResponse.json();
            skillDataCacheRef.current.set(baseCacheKey, fallbackData);
            skillDataCacheRef.current.set(cacheKey, fallbackData);
            return fallbackData;
        } catch (fallbackError) {
            console.error(`Error loading skill ${fullSkillName}:`, fallbackError);
            return null;
        }
    }, []);

    return {
        skills,
        isReloadingSkills,
        skillLibraryRefreshVersion,
        fetchSkills,
        fetchSkillData,
    };
}
