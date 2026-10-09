const classNames = (...values) => values.filter(Boolean).join(" ");

export function SegmentedControl({ className = "", children, ...props }) {
    return (
        <div className={classNames("ui-segmented-control", className)} {...props}>
            {children}
        </div>
    );
}

export function SegmentedButton({ active = false, className = "", children, ...props }) {
    return (
        <button
            type="button"
            className={classNames("ui-segmented-button", active && "is-active", className)}
            aria-pressed={active}
            {...props}
        >
            {children}
        </button>
    );
}
