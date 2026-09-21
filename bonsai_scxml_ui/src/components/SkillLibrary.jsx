import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
    FiSearch,
    FiUser,
    FiMessageCircle,
    FiTag,
    FiChevronRight,
    FiRefreshCw,
} from "react-icons/fi";
import { MdAssistantNavigation } from "react-icons/md";
import { FaHandPaper } from "react-icons/fa";
import { GoPackage } from "react-icons/go";

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
                      }) {
    const [skillDescriptions, setSkillDescriptions] = useState({});
    const [loadingDescription, setLoadingDescription] = useState(null);
    const [skillTooltip, setSkillTooltip] = useState(null);

    useEffect(() => {
        setSkillDescriptions({});
        setSkillTooltip(null);
        setLoadingDescription(null);
    }, [refreshVersion]);

    const getApiSkillName = (skill) => {
        if (!skill) return "";
        return skill.includes("skills.")
            ? skill.split("skills.")[1]
            : skill;
    };

    const loadSkillDescription = async (skill) => {
        if (
            !skill ||
            Object.prototype.hasOwnProperty.call(skillDescriptions, skill)
        ) {
            return;
        }

        setLoadingDescription(skill);

        try {
            const apiName = getApiSkillName(skill);

            const data = fetchSkillData
                ? await fetchSkillData(apiName)
                : await fetch(`/api/skill/${apiName}`).then((response) => {
                    if (!response.ok) {
                        throw new Error(
                            `Server returned ${response.status}`
                        );
                    }
                    return response.json();
                });

            setSkillDescriptions((previous) => ({
                ...previous,
                [skill]: data?.description?.trim() || "",
            }));
        } catch (error) {
            console.error(
                `Could not load description for ${skill}:`,
                error
            );

            setSkillDescriptions((previous) => ({
                ...previous,
                [skill]: "",
            }));
        } finally {
            setLoadingDescription((current) =>
                current === skill ? null : current
            );
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

        setSkillTooltip({
            skill,
            left,
            top,
        });

        loadSkillDescription(skill);
    };

    const handleSkillMouseLeave = (skill) => {
        setSkillTooltip((current) =>
            current?.skill === skill ? null : current
        );
    };

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
            {skill.split(".").pop()}
        </li>
    );

    return (
        <>
            <aside className="skill-library">
                <div className="library-mode-tabs">
                    <button
                        type="button"
                        className={`library-mode-tab ${
                            activeLibraryTab === "skills"
                                ? "active"
                                : ""
                        }`}
                        onClick={() =>
                            onLibraryTabChange?.("skills")
                        }
                    >
                        Skills
                    </button>
                    <button
                        type="button"
                        className={`library-mode-tab ${
                            activeLibraryTab === "behaviors"
                                ? "active"
                                : ""
                        }`}
                        onClick={() =>
                            onLibraryTabChange?.("behaviors")
                        }
                    >
                        Behaviors
                    </button>
                </div>

                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                        marginBottom: 8,
                    }}
                >
                    <h3 style={{ margin: 0 }}>Skill Library</h3>
                    <button
                        type="button"
                        title="Reload skill library"
                        aria-label="Reload skill library"
                        onClick={() => onReloadSkills?.()}
                        disabled={isReloadingSkills}
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 30,
                            height: 30,
                            padding: 0,
                            border: "1px solid var(--border)",
                            borderRadius: 7,
                            background: "transparent",
                            color: "inherit",
                            cursor: isReloadingSkills ? "default" : "pointer",
                            opacity: isReloadingSkills ? 0.6 : 1,
                        }}
                    >
                        <FiRefreshCw
                            style={{
                                animation: isReloadingSkills
                                    ? "skill-library-refresh-spin 0.8s linear infinite"
                                    : "none",
                            }}
                        />
                    </button>
                </div>

                <style>{`
                    @keyframes skill-library-refresh-spin {
                        from { transform: rotate(0deg); }
                        to { transform: rotate(360deg); }
                    }
                `}</style>

                <div className="search-container">
                    <input
                        className="skill-search"
                        type="text"
                        placeholder="Search skills..."
                        value={searchText}
                        onChange={(e) =>
                            setSearchText(e.target.value)
                        }
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

            {skillTooltip &&
                createPortal(
                    <div
                        className="skill-description-tooltip"
                        style={{
                            left: skillTooltip.left,
                            top: skillTooltip.top,
                        }}
                    >
                        <div className="skill-tooltip-name">
                            {skillTooltip.skill
                                .split(".")
                                .pop()}
                        </div>

                        <div className="skill-tooltip-text">
                            {loadingDescription ===
                            skillTooltip.skill
                                ? "Loading description..."
                                : skillDescriptions[
                                    skillTooltip.skill
                                    ] ||
                                "No description available."}
                        </div>
                    </div>,
                    document.body
                )}
        </>
    );
}

export default SkillLibrary;
