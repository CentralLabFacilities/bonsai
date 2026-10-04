const classNames = (...values) => values.filter(Boolean).join(" ");

export function Badge({ tone = "neutral", className = "", children, ...props }) {
    return (
        <span className={classNames("ui-badge", `ui-badge--${tone}`, className)} {...props}>
            {children}
        </span>
    );
}

export function EmptyState({ compact = false, className = "", children, ...props }) {
    return (
        <div
            className={classNames("ui-empty-state", compact && "ui-empty-state--compact", className)}
            {...props}
        >
            {children}
        </div>
    );
}
