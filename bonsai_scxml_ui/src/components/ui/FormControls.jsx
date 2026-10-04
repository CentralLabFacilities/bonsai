import { forwardRef } from "react";

const classNames = (...values) => values.filter(Boolean).join(" ");

export const TextInput = forwardRef(function TextInput(
    { className = "", invalid = false, ...props },
    ref,
) {
    return (
        <input
            ref={ref}
            className={classNames("ui-input", className)}
            aria-invalid={invalid || undefined}
            {...props}
        />
    );
});

export const Select = forwardRef(function Select(
    { className = "", invalid = false, children, ...props },
    ref,
) {
    return (
        <select
            ref={ref}
            className={classNames("ui-select", className)}
            aria-invalid={invalid || undefined}
            {...props}
        >
            {children}
        </select>
    );
});
