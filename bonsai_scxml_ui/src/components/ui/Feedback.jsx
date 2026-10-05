import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { createPortal } from "react-dom";
import {
    FiAlertCircle,
    FiAlertTriangle,
    FiCheckCircle,
    FiInfo,
    FiX,
} from "react-icons/fi";
import { Button, IconButton } from "./Button.jsx";
import { FeedbackContext } from "./feedbackContext.js";

const classNames = (...values) => values.filter(Boolean).join(" ");

const DEFAULT_DURATION = {
    info: 4000,
    success: 2600,
    warning: 6500,
    danger: 8000,
};

const toneIcon = {
    info: FiInfo,
    success: FiCheckCircle,
    warning: FiAlertTriangle,
    danger: FiAlertCircle,
};

const normalizeTone = (tone) =>
    ["info", "success", "warning", "danger"].includes(tone) ? tone : "info";

function FeedbackIcon({ tone }) {
    const Icon = toneIcon[normalizeTone(tone)] || FiInfo;
    return <Icon className="ui-feedback__icon" aria-hidden="true" />;
}

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

export function InlineFeedback({
    tone = "info",
    title = "",
    compact = false,
    className = "",
    children,
    ...props
}) {
    const normalizedTone = normalizeTone(tone);
    const role = props.role || (normalizedTone === "danger" ? "alert" : "status");

    return (
        <div
            className={classNames(
                "ui-inline-feedback",
                `ui-inline-feedback--${normalizedTone}`,
                compact && "ui-inline-feedback--compact",
                className,
            )}
            role={role}
            aria-atomic="true"
            {...props}
        >
            <FeedbackIcon tone={normalizedTone} />
            <div className="ui-inline-feedback__content">
                {title && <strong className="ui-inline-feedback__title">{title}</strong>}
                <div className="ui-inline-feedback__message">{children}</div>
            </div>
        </div>
    );
}

function ToastViewport({ notifications, onDismiss }) {
    if (typeof document === "undefined" || notifications.length === 0) return null;

    return createPortal(
        <div className="ui-toast-viewport" aria-label="Editor notifications">
            {notifications.map((notification) => {
                const tone = normalizeTone(notification.tone);
                return (
                    <article
                        key={notification.id}
                        className={classNames("ui-toast", `ui-toast--${tone}`)}
                        role={tone === "danger" ? "alert" : "status"}
                        aria-atomic="true"
                    >
                        <FeedbackIcon tone={tone} />
                        <div className="ui-toast__content">
                            {notification.title && (
                                <strong className="ui-toast__title">{notification.title}</strong>
                            )}
                            {notification.message && (
                                <div className="ui-toast__message">{notification.message}</div>
                            )}
                            {notification.actionLabel && notification.onAction && (
                                <Button
                                    size="sm"
                                    className="ui-toast__action"
                                    onClick={() => {
                                        notification.onAction();
                                        onDismiss(notification.id);
                                    }}
                                >
                                    {notification.actionLabel}
                                </Button>
                            )}
                        </div>
                        <IconButton
                            size="sm"
                            variant="ghost"
                            className="ui-toast__dismiss"
                            aria-label="Dismiss notification"
                            title="Dismiss"
                            onClick={() => onDismiss(notification.id)}
                        >
                            <FiX aria-hidden="true" />
                        </IconButton>
                    </article>
                );
            })}
        </div>,
        document.body,
    );
}

export function FeedbackProvider({ children }) {
    const [notifications, setNotifications] = useState([]);
    const nextIdRef = useRef(0);
    const timersRef = useRef(new Map());

    const dismiss = useCallback((id) => {
        const entry = timersRef.current.get(id);
        if (entry) {
            window.clearTimeout(entry.timer);
            timersRef.current.delete(id);
        }
        setNotifications((current) =>
            current.some((item) => item.id === id)
                ? current.filter((item) => item.id !== id)
                : current,
        );
    }, []);

    const notify = useCallback(
        (feedback) => {
            const input = typeof feedback === "string" ? { message: feedback } : feedback || {};
            const tone = normalizeTone(input.tone);
            const id = input.id || `feedback-${++nextIdRef.current}`;
            const duration = input.persistent
                ? 0
                : Number.isFinite(input.duration)
                    ? Math.max(0, input.duration)
                    : DEFAULT_DURATION[tone];
            const notification = {
                id,
                tone,
                duration,
                title: String(input.title || "").trim(),
                message: String(input.message || "").trim(),
                actionLabel: input.actionLabel || "",
                onAction: typeof input.onAction === "function" ? input.onAction : null,
            };

            setNotifications((current) => [
                ...current.filter((item) => item.id !== id),
                notification,
            ].slice(-4));

            return id;
        },
        [],
    );

    useEffect(() => {
        if (typeof window === "undefined") return;

        const timers = timersRef.current;
        timers.forEach(({ notification, timer }, id) => {
            if (!notifications.includes(notification)) {
                window.clearTimeout(timer);
                timers.delete(id);
            }
        });

        notifications.forEach((notification) => {
            if (notification.duration <= 0 || timers.has(notification.id)) return;

            const timer = window.setTimeout(() => {
                if (timers.get(notification.id)?.notification !== notification) return;
                timers.delete(notification.id);
                setNotifications((current) =>
                    current.includes(notification)
                        ? current.filter((item) => item !== notification)
                        : current,
                );
            }, notification.duration);
            timers.set(notification.id, { notification, timer });
        });
    }, [notifications]);

    useEffect(() => {
        const timers = timersRef.current;
        return () => {
            timers.forEach(({ timer }) => window.clearTimeout(timer));
            timers.clear();
        };
    }, []);

    const value = useMemo(() => ({ notify, dismiss }), [notify, dismiss]);

    return (
        <FeedbackContext.Provider value={value}>
            {children}
            <ToastViewport notifications={notifications} onDismiss={dismiss} />
        </FeedbackContext.Provider>
    );
}
