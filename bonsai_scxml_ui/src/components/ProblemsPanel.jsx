import {
    FiAlertCircle,
    FiAlertTriangle,
    FiCheckCircle,
    FiChevronRight,
} from "react-icons/fi";

const CATEGORY_ORDER = [
    "Transitions",
    "Slots",
    "Parameters",
    "Datamodel",
    "Workflow",
];

function SeverityIcon({ severity }) {
    if (severity === "warning") {
        return <FiAlertTriangle aria-hidden="true" />;
    }

    return <FiAlertCircle aria-hidden="true" />;
}

export default function ProblemsPanel({
    problems = [],
    onProblemClick,
}) {
    const errorCount = problems.filter(
        (problem) => problem.severity === "error"
    ).length;
    const warningCount = problems.filter(
        (problem) => problem.severity === "warning"
    ).length;

    if (problems.length === 0) {
        return (
            <div className="problems-panel">
                <div className="problems-panel-header">
                    <div>
                        <div className="problems-panel-title">
                            Problems
                        </div>
                        <div className="problems-panel-summary">
                            Workflow validation
                        </div>
                    </div>
                </div>

                <div className="problems-empty-state">
                    <FiCheckCircle
                        className="problems-empty-icon"
                        aria-hidden="true"
                    />
                    <div className="problems-empty-title">
                        No problems found
                    </div>
                    <div className="problems-empty-copy">
                        Transitions, slots, parameters and workflow
                        configuration look consistent.
                    </div>
                </div>
            </div>
        );
    }

    const grouped = new Map();
    problems.forEach((problem) => {
        if (!grouped.has(problem.category)) {
            grouped.set(problem.category, []);
        }
        grouped.get(problem.category).push(problem);
    });

    const categories = [
        ...CATEGORY_ORDER.filter((category) =>
            grouped.has(category)
        ),
        ...[...grouped.keys()].filter(
            (category) => !CATEGORY_ORDER.includes(category)
        ),
    ];

    return (
        <div className="problems-panel">
            <div className="problems-panel-header">
                <div>
                    <div className="problems-panel-title">
                        Problems
                    </div>
                    <div className="problems-panel-summary">
                        {errorCount} error
                        {errorCount === 1 ? "" : "s"}
                        {" · "}
                        {warningCount} warning
                        {warningCount === 1 ? "" : "s"}
                    </div>
                </div>
            </div>

            <div className="problems-list">
                {categories.map((category) => {
                    const categoryProblems =
                        grouped.get(category) || [];

                    return (
                        <section
                            className="problem-category"
                            key={category}
                        >
                            <div className="problem-category-header">
                                <span>{category}</span>
                                <span className="problem-category-count">
                                    {categoryProblems.length}
                                </span>
                            </div>

                            <div className="problem-category-items">
                                {categoryProblems.map((problem) => (
                                    <button
                                        type="button"
                                        className={`problem-item problem-item-${problem.severity}`}
                                        key={problem.id}
                                        onClick={() =>
                                            onProblemClick?.(problem)
                                        }
                                        title="Go to problem"
                                    >
                                        <span
                                            className={`problem-severity-icon problem-severity-${problem.severity}`}
                                        >
                                            <SeverityIcon
                                                severity={
                                                    problem.severity
                                                }
                                            />
                                        </span>

                                        <span className="problem-item-content">
                                            <span className="problem-item-title">
                                                {problem.title}
                                            </span>
                                            <span className="problem-item-message">
                                                {problem.message}
                                            </span>
                                        </span>

                                        <FiChevronRight
                                            className="problem-item-chevron"
                                            aria-hidden="true"
                                        />
                                    </button>
                                ))}
                            </div>
                        </section>
                    );
                })}
            </div>
        </div>
    );
}
