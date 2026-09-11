import React from "react";
import { FiSearch, FiUser, FiMessageCircle, FiTag, FiChevronRight } from "react-icons/fi";
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
    directSkills
}) {
    return (
        <aside className="skill-library">
            <h3>Skill Library</h3>
            <div className="search-container">
                <input
                    className="skill-search"
                    type="text"
                    placeholder="Search skills..."
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                />
                <FiSearch className="search-icon" />
            </div>

            {/* Filter-Buttons */}
            <div className="filter-container">
                <button
                    className={`filter-button ${activeFilter === "Everything" ? "active" : ""}`}
                    onClick={() => setActiveFilter("Everything")}
                    aria-pressed={activeFilter === "Everything"}
                >
                    Everything
                </button>

                <button
                    className={`filter-button ${activeFilter === "nav" ? "active" : ""}`}
                    onClick={() => setActiveFilter("nav")}
                    aria-pressed={activeFilter === "nav"}
                >
                    Navigation <MdAssistantNavigation />
                </button>

                <button
                    className={`filter-button ${activeFilter === "person" ? "active" : ""}`}
                    onClick={() => setActiveFilter("person")}
                    aria-pressed={activeFilter === "person"}
                >
                    Person <FiUser />
                </button>

                <button
                    className={`filter-button ${activeFilter === "dialog" ? "active" : ""}`}
                    onClick={() => setActiveFilter("dialog")}
                    aria-pressed={activeFilter === "dialog"}
                >
                    Dialog <FiMessageCircle />
                </button>

                <button
                    className={`filter-button ${activeFilter === "grasping" ? "active" : ""}`}
                    onClick={() => setActiveFilter("grasping")}
                    aria-pressed={activeFilter === "grasping"}
                >
                    Grasping <FaHandPaper />
                </button>

                <button
                    className={`filter-button ${activeFilter === "slots" ? "active" : ""}`}
                    onClick={() => setActiveFilter("slots")}
                    aria-pressed={activeFilter === "slots"}
                >
                    Slots <FiTag />
                </button>
            </div>

            <div className="list-container">
                {/* 1. Hauptübersicht: Zeigt Hauptpakete & direkte Skills */}
                {activeFilter === "Everything" && selectedPackage === null && searchText === "" && (
                    <ul className="skill-list">
                        {packages.length > 0 && (
                            <li className="library-section-label">Packages</li>
                        )}
                        {packages.map((pkg) => (
                            <li key={pkg} className="package-list-item">
                                <button
                                    type="button"
                                    className="package-button"
                                    onClick={() => setSelectedPackage(pkg)}
                                >
                                    <span className="package-icon"><GoPackage /></span>
                                    <span className="package-name">{pkg}</span>
                                    <FiChevronRight className="package-chevron" />
                                </button>
                            </li>
                        ))}
                        {directSkills && directSkills.length > 0 && (
                            <li className="library-section-label library-section-label-skills">Skills</li>
                        )}
                        {directSkills && directSkills.map((skill) => (
                            <li
                                key={skill}
                                className="skill-item"
                                draggable
                                onDragStart={(e) => e.dataTransfer.setData("skill", skill)}
                            >
                                <span className="skill-name">{skill.split(".").pop()}</span>
                            </li>
                        ))}
                    </ul>
                )}

                {/* 2. Suchergebnisse (wenn gesucht wird) */}
                {activeFilter === "Everything" && selectedPackage === null && searchText !== "" && (
                    <ul className="skill-list">
                        {searchedSkills.map((skill, index) => (
                            <li
                                key={index}
                                className="skill-item"
                                draggable
                                onDragStart={(e) => e.dataTransfer.setData("skill", skill)}
                            >
                                <span className="skill-name">{skill.split(".").pop()}</span>
                            </li>
                        ))}
                    </ul>
                )}

                {/* 3. Paket-Inhalt: Zeigt Unterpakete (Subpackages) & Skills des Pakets */}
                {activeFilter === "Everything" && selectedPackage !== null && (
                    <>
                        <div className="back-button-container">
                            <button className="back-button" onClick={() => {
                                if (selectedSubPackage !== null) {
                                    setSelectedSubPackage(null); // Eine Ebene zurück zum Hauptpaket
                                } else {
                                    setSelectedPackage(null); // Zurück zur Gesamtübersicht
                                }
                            }}>
                                <span>←</span>
                                <span>back</span>
                            </button>
                            <h4>
                                Package: {selectedPackage}
                                {selectedSubPackage !== null && `.${selectedSubPackage}`}
                            </h4>
                        </div>
                        <ul className="skill-list">
                            {/* Unterpakete auflisten */}
                            {selectedSubPackage === null && subPackages && subPackages.length > 0 && (
                                <li className="library-section-label">Packages</li>
                            )}
                            {selectedSubPackage === null && subPackages &&
                                subPackages.map((subPackage) => (
                                    <li key={subPackage} className="package-list-item">
                                        <button
                                            type="button"
                                            className="package-button"
                                            onClick={() => setSelectedSubPackage(subPackage)}
                                        >
                                            <span className="package-icon">
                                                <GoPackage />
                                            </span>
                                            <span className="package-name">{subPackage}</span>
                                            <FiChevronRight className="package-chevron" />
                                        </button>
                                    </li>
                                ))
                            }
                            {/* Skills auflisten */}
                            {packageSkills.length > 0 && (
                                <li className="library-section-label library-section-label-skills">Skills</li>
                            )}
                            {packageSkills.map((skill, index) => (
                                <li
                                    key={index}
                                    className="skill-item"
                                    draggable
                                    onDragStart={(e) => e.dataTransfer.setData("skill", skill)}
                                >
                                    <span className="skill-name">{skill.split(".").pop()}</span>
                                </li>
                            ))}
                        </ul>
                    </>
                )}

                {/* 4. Gefilterte Ansicht über die Tags (Navigation, Person, etc.) */}
                {activeFilter !== "Everything" && (
                    <ul className="skill-list">
                        {filteredSkills.map((skill, index) => (
                            <li
                                key={index}
                                className="skill-item"
                                draggable
                                onDragStart={(e) => e.dataTransfer.setData("skill", skill)}
                            >
                                <span className="skill-name">{skill.split(".").pop()}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </aside>
    );
}

export default SkillLibrary;