import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
    FiSearch,
    FiUser,
    FiMessageCircle,
    FiTag,
    FiChevronRight,
    FiRefreshCw,
    FiPlus,
} from "react-icons/fi";
import { MdAssistantNavigation } from "react-icons/md";
import { FaHandPaper } from "react-icons/fa";
import { GoPackage } from "react-icons/go";
import { areSkillLibraryPropsEqual } from "./canvasLibraryProps.js";
import { IconButton, SegmentedButton, SegmentedControl, TextInput } from "./ui/index.js";


const SkillDescriptionTooltip = React.memo(
    forwardRef(function SkillDescriptionTooltip(
        { fetchSkillData },
        ref
    ) {
        const [tooltip, setTooltip] = useState(null);
        const descriptionCacheRef = useRef(new Map());
        const pendingRequestsRef = useRef(new Map());
        const generationRef = useRef(0);

        useEffect(() => () => {
            generationRef.current += 1;
            descriptionCacheRef.current.clear();
            pendingRequestsRef.current.clear();
        }, []);

        const requestDescription = useCallback((skill) => {
            if (descriptionCacheRef.current.has(skill)) {
                return Promise.resolve(descriptionCacheRef.current.get(skill));
            }

            if (pendingRequestsRef.current.has(skill)) {
                return pendingRequestsRef.current.get(skill);
            }

            const generation = generationRef.current;
            const request = (async () => {
                try {
                    // Keep the complete skill identifier here. fetchSkillData() and
                    // every other editor call use the full name returned by
                    // /api/skills; stripping the `skills.` prefix can point at the
                    // wrong API entry and leave the hover description empty.
                    const data = fetchSkillData
                        ? await fetchSkillData(skill)
                        : await fetch(`/api/skill/${encodeURIComponent(skill)}`).then(
                            (response) => {
                                if (!response.ok) {
                                    throw new Error(
                                        `Server returned ${response.status}`
                                    );
                                }
                                return response.json();
                            }
                        );

                    const description = String(data?.description || "").trim();
                    if (generation === generationRef.current) {
                        descriptionCacheRef.current.set(skill, description);
                    }
                    return description;
                } catch (error) {
                    console.error(
                        `Could not load description for ${skill}:`,
                        error
                    );
                    if (generation === generationRef.current) {
                        descriptionCacheRef.current.set(skill, "");
                    }
                    return "";
                } finally {
                    if (generation === generationRef.current) {
                        pendingRequestsRef.current.delete(skill);
                    }
                }
            })();

            pendingRequestsRef.current.set(skill, request);
            return request;
        }, [fetchSkillData]);

        useImperativeHandle(
            ref,
            () => ({
                show({ skill, left, top }) {
                    if (!skill) return;

                    if (descriptionCacheRef.current.has(skill)) {
                        setTooltip({
                            skill,
                            left,
                            top,
                            loading: false,
                            description: descriptionCacheRef.current.get(skill),
                        });
                        return;
                    }

                    setTooltip({
                        skill,
                        left,
                        top,
                        loading: true,
                        description: "",
                    });

                    const requestGeneration = generationRef.current;
                    requestDescription(skill).then((description) => {
                        if (requestGeneration !== generationRef.current) return;
                        setTooltip((current) => {
                            if (current?.skill !== skill) return current;
                            return {
                                ...current,
                                loading: false,
                                description,
                            };
                        });
                    });
                },
                hide(skill = null) {
                    setTooltip((current) => {
                        if (!current) return null;
                        if (skill && current.skill !== skill) return current;
                        return null;
                    });
                },
            }),
            [requestDescription]
        );

        if (!tooltip) return null;

        return createPortal(
            <div
                className="skill-description-tooltip"
                style={{
                    left: tooltip.left,
                    top: tooltip.top,
                }}
            >
                <div className="skill-tooltip-name">
                    {tooltip.skill.split(".").pop()}
                </div>
                <div className="skill-tooltip-text">
                    {tooltip.loading
                        ? "Loading description..."
                        : tooltip.description || "No description available."}
                </div>
            </div>,
            document.body
        );
    })
);

function SkillLibrary({
                          searchText,
                          setSearchText,
                          activeFilter,
                          setActiveFilter,
                          packages,
                          selectedPackage,
                          setSelectedPackage,
                          searchedSkills,
                          packageSkills,
                          filteredSkills,
                          subPackages,
                          selectedSubPackage,
                          setSelectedSubPackage,
                          directSkills,
                          fetchSkillData,
                          activeLibraryTab = "skills",
                          onLibraryTabChange,
                          onReloadSkills,
                          isReloadingSkills = false,
                          refreshVersion = 0,
                          onAddSkill,
                          canAddSkill = true,
                          skillLibraryStatus = "ready",
                          skillLibraryError = null,
                          hasLoadedSkills = false,
                          skillCount = 0,
                      }) {
    const skillTooltipRef = useRef(null);
    const pendingAddRef = useRef(false);
    const mountedRef = useRef(false);
    const [addingSkill, setAddingSkill] = useState(null);
    const [addFeedback, setAddFeedback] = useState(null);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const addSkill = async (skill) => {
        if (pendingAddRef.current || !canAddSkill || !onAddSkill) return;
        pendingAddRef.current = true;
        setAddingSkill(skill);
        setAddFeedback(null);
        handleSkillMouseLeave(skill);
        try {
            const added = await onAddSkill(skill);
            if (mountedRef.current) {
                setAddFeedback(added
                    ? { message: `Added ${skill.split(".").pop()} to canvas.`, error: false }
                    : { message: "The workflow changed before the skill could be added. Try again in the canvas view.", error: true });
            }
        } catch (error) {
            console.error(`Could not add ${skill}:`, error);
            if (mountedRef.current) {
                setAddFeedback({ message: `Could not add skill: ${error?.message || "Please try again."}`, error: true });
            }
        } finally {
            pendingAddRef.current = false;
            if (mountedRef.current) setAddingSkill(null);
        }
    };

    const handleSkillMouseEnter = (event, skill) => {
        const rect = event.currentTarget.getBoundingClientRect();

        const tooltipWidth = 280;
        const estimatedTooltipHeight = 130;
        const gap = 10;
        const viewportPadding = 8;

        const enoughSpaceRight =
            rect.right + gap + tooltipWidth <=
            window.innerWidth - viewportPadding;

        let left;

        if (enoughSpaceRight) {
            left = rect.right + gap;
        } else {
            left = Math.max(
                viewportPadding,
                rect.left - tooltipWidth - gap
            );
        }

        let top = rect.top;

        if (
            top + estimatedTooltipHeight >
            window.innerHeight - viewportPadding
        ) {
            top =
                window.innerHeight -
                estimatedTooltipHeight -
                viewportPadding;
        }

        top = Math.max(viewportPadding, top);

        skillTooltipRef.current?.show({
            skill,
            left,
            top,
        });
    };

    const handleSkillMouseLeave = (skill) => {
        skillTooltipRef.current?.hide(skill);
    };

    const visibleItemCount = activeFilter !== "Everything"
        ? filteredSkills?.length || 0
        : selectedPackage != null
            ? (packageSkills?.length || 0) + (selectedSubPackage == null ? subPackages?.length || 0 : 0)
            : searchText
                ? searchedSkills?.length || 0
                : (packages?.length || 0) + (directSkills?.length || 0);
    const hasActiveFilters = Boolean(searchText) || activeFilter !== "Everything" || selectedPackage != null;

    const renderSkill = (skill, key = skill) => (
        <li
            key={key}
            className="skill-item"
            draggable
            onDragStart={(e) => {
                e.dataTransfer.setData("skill", skill);

                const preview = document.createElement("div");

                preview.className = "skill-drag-preview";
                preview.innerText = skill.split(".").pop();

                document.body.appendChild(preview);

                const rect = preview.getBoundingClientRect();

                // Maus sitzt exakt in der Mitte der Preview
                e.dataTransfer.setDragImage(
                    preview,
                    rect.width / 2,
                    rect.height / 2
                );

                requestAnimationFrame(() => {
                    document.body.removeChild(preview);
                });
            }}
            onMouseEnter={(event) =>
                handleSkillMouseEnter(event, skill)
            }
            onMouseLeave={() =>
                handleSkillMouseLeave(skill)
            }
        >
            <span className="skill-item-name">{skill.split(".").pop()}</span>
            {onAddSkill && (
                <button
                    type="button"
                    className="skill-add-button"
                    draggable={false}
                    aria-label={`Add ${skill} to canvas`}
                    title={canAddSkill ? `Add ${skill} to canvas` : "Switch to a canvas view to add skills"}
                    disabled={!canAddSkill || addingSkill !== null}
                    onClick={() => void addSkill(skill)}
                    onDragStart={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                    }}
                    onFocus={(event) => handleSkillMouseEnter(event, skill)}
                    onBlur={() => handleSkillMouseLeave(skill)}
                >
                    <FiPlus aria-hidden="true" />
                    <span>{addingSkill === skill ? "Adding..." : "Add"}</span>
                </button>
            )}
        </li>
    );

    return (
        <>
            <aside className="skill-library" aria-busy={addingSkill !== null || isReloadingSkills || skillLibraryStatus === "loading"}>
                <SegmentedControl className="library-mode-tabs" aria-label="Library type">
                    <SegmentedButton
                        className="library-mode-tab"
                        active={activeLibraryTab === "skills"}
                        onClick={() => onLibraryTabChange?.("skills")}
                    >
                        Skills
                    </SegmentedButton>
                    <SegmentedButton
                        className="library-mode-tab"
                        active={activeLibraryTab === "behaviors"}
                        onClick={() => onLibraryTabChange?.("behaviors")}
                    >
                        Behaviors
                    </SegmentedButton>
                </SegmentedControl>

                <div className="skill-library-title-row">
                    <h3>Skill Library</h3>
                    <IconButton
                        size="sm"
                        className={`skill-library-refresh-button ${isReloadingSkills ? "is-spinning" : ""}`}
                        title="Reload skill library"
                        aria-label="Reload skill library"
                        onClick={() => onReloadSkills?.()}
                        disabled={isReloadingSkills}
                    >
                        <FiRefreshCw aria-hidden="true" />
                    </IconButton>
                </div>

                <div className="search-container">
                    <TextInput
                        className="skill-search"
                        type="text"
                        placeholder="Search skills..."
                        aria-label="Search skills"
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                    />
                    <FiSearch className="search-icon" />
                </div>

                <div className="filter-container">
                    <button
                        className={`filter-button ${
                            activeFilter === "Everything"
                                ? "active"
                                : ""
                        }`}
                        onClick={() =>
                            setActiveFilter("Everything")
                        }
                    >
                        Everything
                    </button>

                    <button
                        className={`filter-button ${
                            activeFilter === "nav"
                                ? "active"
                                : ""
                        }`}
                        onClick={() => setActiveFilter("nav")}
                    >
                        Navigation <MdAssistantNavigation />
                    </button>

                    <button
                        className={`filter-button ${
                            activeFilter === "person"
                                ? "active"
                                : ""
                        }`}
                        onClick={() =>
                            setActiveFilter("person")
                        }
                    >
                        Person <FiUser />
                    </button>

                    <button
                        className={`filter-button ${
                            activeFilter === "dialog"
                                ? "active"
                                : ""
                        }`}
                        onClick={() =>
                            setActiveFilter("dialog")
                        }
                    >
                        Dialog <FiMessageCircle />
                    </button>

                    <button
                        className={`filter-button ${
                            activeFilter === "grasping"
                                ? "active"
                                : ""
                        }`}
                        onClick={() =>
                            setActiveFilter("grasping")
                        }
                    >
                        Grasping <FaHandPaper />
                    </button>

                    <button
                        className={`filter-button ${
                            activeFilter === "slots"
                                ? "active"
                                : ""
                        }`}
                        onClick={() =>
                            setActiveFilter("slots")
                        }
                    >
                        Slots <FiTag />
                    </button>
                </div>

                {addFeedback && (
                    <p className={`skill-add-feedback${addFeedback.error ? " error" : ""}`} role={addFeedback.error ? "alert" : "status"}>
                        {addFeedback.message}
                    </p>
                )}

                {skillLibraryStatus === "loading" && (
                    <div className="library-state" role="status">Loading skill library...</div>
                )}
                {skillLibraryStatus === "error" && (
                    <div className="library-state library-state-error">
                        <div role="alert" aria-atomic="true">
                            <strong>{hasLoadedSkills ? "Skill library refresh failed" : "Skill library unavailable"}</strong>
                            <p>{skillLibraryError}</p>
                            <p>Check that the Bonsai backend is reachable, then reload.</p>
                            {hasLoadedSkills && <p>Showing the last successfully loaded skill list.</p>}
                        </div>
                        <button className="library-state-button" type="button" disabled={isReloadingSkills}
                            onClick={() => void onReloadSkills?.()}>
                            {isReloadingSkills ? "Retrying..." : "Retry loading skills"}
                        </button>
                    </div>
                )}
                {skillLibraryStatus === "ready" && visibleItemCount === 0 && (
                    <div className="library-state" role="status">
                        {skillCount === 0 ? (
                            <>
                                <strong>The skill library is empty</strong>
                                <p>The backend returned no skills. Reload after skills become available.</p>
                            </>
                        ) : (
                            <>
                                <strong>No matching skills</strong>
                                <p>Try a different search, filter, or package.</p>
                                {hasActiveFilters && (
                                    <button className="library-state-button" type="button" onClick={() => {
                                        setSearchText("");
                                        setActiveFilter("Everything");
                                        setSelectedPackage(null);
                                        setSelectedSubPackage(null);
                                    }}>Clear filters</button>
                                )}
                            </>
                        )}
                    </div>
                )}

                <div className="list-container">
                    {activeFilter === "Everything" &&
                        selectedPackage === null &&
                        searchText === "" && (
                            <ul className="skill-list">
                                {packages.length > 0 && (
                                    <li className="library-section-label">
                                        Packages
                                    </li>
                                )}

                                {packages.map((pkg) => (
                                    <li
                                        key={pkg}
                                        className="package-list-item"
                                    >
                                        <button
                                            type="button"
                                            className="package-button"
                                            onClick={() =>
                                                setSelectedPackage(
                                                    pkg
                                                )
                                            }
                                        >
                                            <span className="package-icon">
                                                <GoPackage />
                                            </span>

                                            <span className="package-name">
                                                {pkg}
                                            </span>

                                            <FiChevronRight className="package-chevron" />
                                        </button>
                                    </li>
                                ))}

                                {directSkills &&
                                    directSkills.length > 0 && (
                                        <li className="library-section-label library-section-label-skills">
                                            Skills
                                        </li>
                                    )}

                                {directSkills &&
                                    directSkills.map((skill) =>
                                        renderSkill(skill)
                                    )}
                            </ul>
                        )}

                    {activeFilter === "Everything" &&
                        selectedPackage === null &&
                        searchText !== "" && (
                            <ul className="skill-list">
                                {searchedSkills.map((skill) =>
                                    renderSkill(skill)
                                )}
                            </ul>
                        )}

                    {activeFilter === "Everything" &&
                        selectedPackage !== null && (
                            <>
                                <div className="back-button-container">
                                    <button
                                        className="back-button"
                                        onClick={() => {
                                            if (
                                                selectedSubPackage !==
                                                null
                                            ) {
                                                setSelectedSubPackage(
                                                    null
                                                );
                                            } else {
                                                setSelectedPackage(
                                                    null
                                                );
                                            }
                                        }}
                                    >
                                        <span>←</span>
                                        <span>back</span>
                                    </button>

                                    <h4>
                                        Package: {selectedPackage}
                                        {selectedSubPackage !== null &&
                                            `.${selectedSubPackage}`}
                                    </h4>
                                </div>

                                <ul className="skill-list">
                                    {selectedSubPackage ===
                                        null &&
                                        subPackages &&
                                        subPackages.length > 0 && (
                                            <li className="library-section-label">
                                                Packages
                                            </li>
                                        )}

                                    {selectedSubPackage ===
                                        null &&
                                        subPackages &&
                                        subPackages.map(
                                            (subPackage) => (
                                                <li
                                                    key={
                                                        subPackage
                                                    }
                                                    className="package-list-item"
                                                >
                                                    <button
                                                        type="button"
                                                        className="package-button"
                                                        onClick={() =>
                                                            setSelectedSubPackage(
                                                                subPackage
                                                            )
                                                        }
                                                    >
                                                        <span className="package-icon">
                                                            <GoPackage />
                                                        </span>

                                                        <span className="package-name">
                                                            {
                                                                subPackage
                                                            }
                                                        </span>

                                                        <FiChevronRight className="package-chevron" />
                                                    </button>
                                                </li>
                                            )
                                        )}

                                    {packageSkills.length >
                                        0 && (
                                            <li className="library-section-label library-section-label-skills">
                                                Skills
                                            </li>
                                        )}

                                    {packageSkills.map((skill) =>
                                        renderSkill(skill)
                                    )}
                                </ul>
                            </>
                        )}

                    {activeFilter !== "Everything" && (
                        <ul className="skill-list">
                            {filteredSkills.map((skill) =>
                                renderSkill(skill)
                            )}
                        </ul>
                    )}
                </div>
            </aside>

            <SkillDescriptionTooltip
                key={refreshVersion}
                ref={skillTooltipRef}
                fetchSkillData={fetchSkillData}
            />
        </>
    );
}

export default React.memo(SkillLibrary, areSkillLibraryPropsEqual);
