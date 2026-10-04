import { forwardRef } from "react";

const classNames = (...values) => values.filter(Boolean).join(" ");

export const Button = forwardRef(function Button(
    {
        variant = "secondary",
        size = "md",
        className = "",
        leadingIcon = null,
        trailingIcon = null,
        children,
        type = "button",
        ...props
    },
    ref,
) {
    return (
        <button
            ref={ref}
            type={type}
            className={classNames(
                "ui-button",
                `ui-button--${variant}`,
                `ui-button--${size}`,
                className,
            )}
            {...props}
        >
            {leadingIcon && <span className="ui-button__icon" aria-hidden="true">{leadingIcon}</span>}
            {children != null && <span className="ui-button__label">{children}</span>}
            {trailingIcon && <span className="ui-button__icon" aria-hidden="true">{trailingIcon}</span>}
        </button>
    );
});

export const IconButton = forwardRef(function IconButton(
    {
        variant = "ghost",
        size = "md",
        className = "",
        children,
        type = "button",
        ...props
    },
    ref,
) {
    return (
        <button
            ref={ref}
            type={type}
            className={classNames(
                "ui-icon-button",
                `ui-icon-button--${variant}`,
                `ui-icon-button--${size}`,
                className,
            )}
            {...props}
        >
            {children}
        </button>
    );
});
