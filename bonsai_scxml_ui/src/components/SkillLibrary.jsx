import { FiSearch, FiMessageCircle, FiUser, FiTag } from "react-icons/fi";
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

            <div className="filter-container">
                <button className="filter-button" onClick={() => setActiveFilter("Everything")}>Everything</button>
                <button className="filter-button" onClick={() => setActiveFilter("nav")}>
                    Navigation <MdAssistantNavigation />
                </button>
                <button className="filter-button" onClick={() => setActiveFilter("person")}>
                    Person <FiUser />
                </button>
                <button className="filter-button" onClick={() => setActiveFilter("dialog")}>
                    Dialog <FiMessageCircle />
                </button>
                <button className="filter-button" onClick={() => setActiveFilter("grasping")}>
                    Grasping <FaHandPaper />
                </button>
                <button className="filter-button" onClick={() => setActiveFilter("slots")}>
                    Slots <FiTag />
                </button>
            </div>

            <div className="list-container">
                {activeFilter === "Everything" && selectedPackage === null && searchText === "" && (
                    <ul className="skill-list">
                        {packages.map((pkg) => (
                            <li key={pkg} className="package-item" onClick={() => setSelectedPackage(pkg)}>
                                <span className="package-icon"><GoPackage /></span>
                                <span className="package-name">{pkg}</span>
                            </li>
                        ))}
                    </ul>
                )}

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

                {activeFilter === "Everything" && selectedPackage !== null && (
                    <>
                        <div className="back-button-container">
                            <button className="back-button" onClick={() => setSelectedPackage(null)}>
                                <span>←</span>
                                <span>back</span>
                            </button>
                            <h4>Package: {selectedPackage}</h4>
                        </div>
                        <ul className="skill-list">
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