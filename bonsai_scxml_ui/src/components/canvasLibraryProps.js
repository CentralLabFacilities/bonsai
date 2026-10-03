const SKILL_LIBRARY_PROPS = [
    "searchText",
    "setSearchText",
    "activeFilter",
    "setActiveFilter",
    "packages",
    "selectedPackage",
    "setSelectedPackage",
    "searchedSkills",
    "packageSkills",
    "filteredSkills",
    "subPackages",
    "selectedSubPackage",
    "setSelectedSubPackage",
    "directSkills",
    "activeLibraryTab",
    "onLibraryTabChange",
    "onReloadSkills",
    "isReloadingSkills",
    "refreshVersion",
    "fetchSkillData",
];

export const areSkillLibraryPropsEqual = (previous, next) =>
    SKILL_LIBRARY_PROPS.every((key) => previous[key] === next[key]);

export const areBehaviorLibraryPropsEqual = (previous, next) =>
    previous.directories === next.directories &&
    previous.activeLibraryTab === next.activeLibraryTab &&
    previous.onDirectoriesChange === next.onDirectoriesChange &&
    previous.onOpenBehavior === next.onOpenBehavior &&
    previous.onLibraryTabChange === next.onLibraryTabChange;
