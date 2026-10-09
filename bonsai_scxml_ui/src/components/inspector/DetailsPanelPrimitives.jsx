import { FiExternalLink } from "react-icons/fi";

function MetadataRow({ label, value }) {
    return (
        <div className="metadata-row">
            <span className="metadata-label">{label}</span>
            <span className="metadata-value">
                {value !== undefined && value !== null && value !== ""
                    ? String(value)
                    : "—"}
            </span>
        </div>
    );
}

function NodeReferenceCard({
                               nodeId,
                               name,
                               badge,
                               onNavigate,
                               onHover,
                               hoverFallbackId = null,
                               className = "slot-text-field compact-slot-card slot-access-skill-card exit-token-node-reference",
                               badgeClassName = "slot-access-badge exit-token-node-reference-badge",
                           }) {
    if (!nodeId || !name) return null;

    return (
        <div
            className={className}
            role="button"
            tabIndex={0}
            title={`Open ${name}`}
            onClick={(event) => {
                event.stopPropagation();
                onNavigate?.(nodeId);
            }}
            onMouseEnter={(event) => {
                event.stopPropagation();
                onHover?.(nodeId);
            }}
            onMouseLeave={(event) => {
                event.stopPropagation();
                onHover?.(hoverFallbackId);
            }}
            onFocus={() => onHover?.(nodeId)}
            onBlur={() => onHover?.(hoverFallbackId)}
            onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    event.stopPropagation();
                    onNavigate?.(nodeId);
                }
            }}
        >
            <div className="compact-slot-header exit-token-node-reference-header">
                <div className="compact-slot-name">{name}</div>
                <div className="compact-slot-badges">
                    {badge && (
                        <span className={badgeClassName}>
                            {badge}
                        </span>
                    )}
                    <FiExternalLink
                        className="slot-access-open-icon"
                        aria-hidden="true"
                    />
                </div>
            </div>
        </div>
    );
}



export { MetadataRow, NodeReferenceCard };
