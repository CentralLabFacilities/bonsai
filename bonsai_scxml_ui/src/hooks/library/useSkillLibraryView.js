import { useMemo } from "react";

export function useSkillLibraryView({
    skills,
    selectedPackage,
    selectedSubPackage,
    searchText,
    activeFilter,
}) {
    return useMemo(() => {
        const packages = [];
        const directSkills = [];
        const allSkills = skills || [];

        allSkills.forEach((skill) => {
            const afterSkills = skill.split("skills.")[1];
            if (!afterSkills) return;
            const parts = afterSkills.split(".");

            if (parts.length === 1) {
                directSkills.push(skill);
            } else {
                const packageName = parts[0];
                if (!packages.includes(packageName)) {
                    packages.push(packageName);
                }
            }
        });

        let packageSkills = [];
        const subPackages = [];

        if (selectedPackage !== null) {
            allSkills.forEach((skill) => {
                const afterSkill = skill.split("skills.")[1];
                if (!afterSkill) return;
                const parts = afterSkill.split(".");

                if (parts[0] !== selectedPackage) return;

                if (selectedSubPackage === null) {
                    if (parts.length === 2) {
                        packageSkills.push(skill);
                    }
                    if (parts.length > 2) {
                        const subPackageName = parts[1];
                        if (!subPackages.includes(subPackageName)) {
                            subPackages.push(subPackageName);
                        }
                    }
                } else if (
                    parts[1] === selectedSubPackage &&
                    parts.length === 3
                ) {
                    packageSkills.push(skill);
                }
            });
        }

        const normalizedSearch = searchText.toLowerCase();
        packageSkills = packageSkills.filter((skill) =>
            skill.toLowerCase().includes(normalizedSearch)
        );

        return {
            packages,
            directSkills,
            packageSkills,
            subPackages,
            searchedSkills: allSkills.filter((skill) =>
                skill.toLowerCase().includes(normalizedSearch)
            ),
            filteredSkills: allSkills
                .filter((skill) =>
                    activeFilter === "Everything"
                        ? true
                        : skill.includes(activeFilter)
                )
                .filter((skill) =>
                    skill.toLowerCase().includes(normalizedSearch)
                ),
        };
    }, [
        skills,
        selectedPackage,
        selectedSubPackage,
        searchText,
        activeFilter,
    ]);
}
