import { useState, useEffect, useRef } from "react";
import { FiX, FiPlus, FiCheck, FiArrowRight, FiAlertTriangle, FiInfo, FiChevronUp, FiChevronDown } from "react-icons/fi";

function ConditionModal({
    isOpen,
    onClose,
    onConfirm,
    globalVariables = [],
    sourceEventName,
    sourceNodeName,
    candidateTransitions = [],
    initialTargetId = null,
}) {
    const drawerRef = useRef(null);

    const usableVars = globalVariables.filter((v) => !v.id.startsWith("#"));

    const [transitionsState, setTransitionsState] = useState([]);
    const [selectedTargetId, setSelectedTargetId] = useState("");

    const [isFallbackMode, setIsFallbackMode] = useState(false);
    const [selectedVar, setSelectedVar] = useState(usableVars[0]?.id || "");
    const [isCustomVar, setIsCustomVar] = useState(false);
    const [newVarName, setNewVarName] = useState("");
    const [newVarExpr, setNewVarExpr] = useState("");
    const [operator, setOperator] = useState(">");
    const [compareValue, setCompareValue] = useState("1");
    const [enableAssign, setEnableAssign] = useState(false);
    const [assignExpr, setAssignExpr] = useState("");

    const [errorMessage, setErrorMessage] = useState("");
    const [warningNotice, setWarningNotice] = useState("");

    useEffect(() => {
        if (!isOpen) return;
        setErrorMessage("");
        setWarningNotice("");

        const initialList = candidateTransitions.map((t) => ({ ...t }));
        setTransitionsState(initialList);

        const targetToSelect = initialTargetId || initialList[0]?.target || "";
        setSelectedTargetId(targetToSelect);
        loadTargetIntoForm(targetToSelect, initialList);
    }, [isOpen, initialTargetId, candidateTransitions]);

    useEffect(() => {
        if (!isOpen) return;
        const handleOutsideClick = (event) => {
            if (
                drawerRef.current &&
                !drawerRef.current.contains(event.target)
            ) {
                onClose();
            }
        };
        document.addEventListener("mousedown", handleOutsideClick);
        return () => {
            document.removeEventListener("mousedown", handleOutsideClick);
        };
    }, [isOpen, onClose]);


    const loadTargetIntoForm = (targetId, list = transitionsState) => {
        const item = list.find((t) => t.target === targetId);
        if (!item) return;

        setErrorMessage("");
        setWarningNotice("");

        if (item.cond && item.cond.trim() !== "") {
            setIsFallbackMode(false);
            const parts = item.cond.trim().split(" ");
            if (parts.length >= 3) {
                const varName = parts[0];
                const op = parts[1];
                const val = parts.slice(2).join(" ");

                if (usableVars.some((v) => v.id === varName)) {
                    setSelectedVar(varName);
                    setIsCustomVar(false);
                } else {
                    setIsCustomVar(true);
                    setNewVarName(varName);
                }
                setOperator(op);
                setCompareValue(val);
            }
        } else {
            setIsFallbackMode(true);
            setSelectedVar(usableVars[0]?.id || "");
            setIsCustomVar(usableVars.length === 0);
            setOperator(">");
            setCompareValue("1");
        }

        if (item.assignLocation) {
            setEnableAssign(true);
            setAssignExpr(item.assignExpr || "");
        } else {
            setEnableAssign(false);
            setAssignExpr("");
        }
    };

    const handleSelectTarget = (targetId) => {
        setSelectedTargetId(targetId);
        loadTargetIntoForm(targetId);
    };

    // Reihenfolge ändern (Nach oben verschieben)
    const handleMoveUp = (index, e) => {
        e.stopPropagation();
        if (index <= 0) return;
        setTransitionsState((prev) => {
            const copy = [...prev];
            const temp = copy[index - 1];
            copy[index - 1] = copy[index];
            copy[index] = temp;
            return copy;
        });
    };

    // Reihenfolge ändern (Nach unten verschieben)
    const handleMoveDown = (index, e) => {
        e.stopPropagation();
        if (index >= transitionsState.length - 1) return;
        setTransitionsState((prev) => {
            const copy = [...prev];
            const temp = copy[index + 1];
            copy[index + 1] = copy[index];
            copy[index] = temp;
            return copy;
        });
    };

    if (!isOpen) return null;

    const activeVarName = isCustomVar ? newVarName.trim() : selectedVar;

    const handleSave = () => {
        setErrorMessage("");

        if (!selectedTargetId) {
            setErrorMessage("Please select a destination path in step 1.");
            return;
        }

        let updatedList = [...transitionsState];
        const otherTransitions = updatedList.filter((t) => t.target !== selectedTargetId);

        if (isFallbackMode) {
            updatedList = updatedList.map((t) =>
                t.target === selectedTargetId
                    ? { ...t, cond: "", assignLocation: "", assignExpr: "" }
                    : t
            );
        } else {
            if (isCustomVar && (!newVarName.trim() || !newVarExpr.trim())) {
                setErrorMessage("Please specify the name and initial value for the new variable.");
                return;
            }
            if (!activeVarName) {
                setErrorMessage("Please select a variable.");
                return;
            }
            if (!compareValue || compareValue.trim() === "") {
                setErrorMessage("Please provide a comparative value in step 3.");
                return;
            }
            if (enableAssign && (!assignExpr || assignExpr.trim() === "")) {
                setErrorMessage("If <assign> is enabled, an expression must be specified.");
                return;
            }

            const conditionString = `${activeVarName} ${operator} ${compareValue.trim()}`;
            const assignLocation = enableAssign ? activeVarName : "";
            const assignVal = enableAssign ? assignExpr.trim() : "";

            const hasOtherFallback = otherTransitions.some((t) => !t.cond || t.cond.trim() === "");

            if (!hasOtherFallback) {
                if (otherTransitions.length > 0) {
                    const fallbackTarget = otherTransitions[0];
                    updatedList = updatedList.map((t) => {
                        if (t.target === selectedTargetId) {
                            return { ...t, cond: conditionString, assignLocation, assignExpr: assignVal };
                        }
                        if (t.target === fallbackTarget.target) {
                            return { ...t, cond: "", assignLocation: "", assignExpr: "" };
                        }
                        return t;
                    });

                    setWarningNotice(
                        `Note: Since at least one transition must always remain without a condition, the condition was removed from "${fallbackTarget.targetLabel || fallbackTarget.target}".`
                    );
                } else {
                    setErrorMessage("There is only a single path from this exit. This path must remain without a condition!");
                    return;
                }
            } else {
                updatedList = updatedList.map((t) =>
                    t.target === selectedTargetId
                        ? { ...t, cond: conditionString, assignLocation, assignExpr: assignVal }
                        : t
                );
            }
        }

        // Stabile Sortierung: Alle mit Condition bleiben in ihrer relativen Reihenfolge oben, Fallbacks nach unten
        const withCond = updatedList.filter((t) => t.cond && t.cond.trim() !== "");
        const withoutCond = updatedList.filter((t) => !t.cond || t.cond.trim() === "");
        const finalSortedList = [...withCond, ...withoutCond];

        const newGlobalVar = isCustomVar && newVarName.trim()
            ? { id: newVarName.trim(), expr: newVarExpr.trim() }
            : null;

        onConfirm({
            updatedTransitions: finalSortedList,
            newGlobalVar,
        });
    };

    return (
        <div className="bottom-drawer-container" >
            <div ref={drawerRef} className="bottom-drawer-content full-width">
                {/* Header */}
                <div className="bottom-drawer-header">
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <span style={{ fontWeight: "bold", fontSize: "15px", color: "#ffffff" }}>
                            Condition Configuration: <span style={{ color: "#38bdf8" }}>{sourceNodeName} ({sourceEventName})</span>
                        </span>
                        <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                            (The order from top to bottom determines the evaluation.)
                        </span>
                    </div>
                    <button className="modal-close-button" onClick={onClose}><FiX /></button>
                </div>

                {errorMessage && (
                    <div className="drawer-error-box">
                        <FiAlertTriangle style={{ fontSize: "18px", flexShrink: 0 }} />
                        <span>{errorMessage}</span>
                    </div>
                )}

                {warningNotice && (
                    <div className="drawer-warning-box">
                        <FiInfo style={{ fontSize: "18px", flexShrink: 0 }} />
                        <span>{warningNotice}</span>
                    </div>
                )}

                {/* 4 Spalten Layout */}
                <div className="bottom-drawer-grid-layout">
                    {/* Schritt 1: Ziel-Pfad & Reordering */}
                    <div className="step-card">
                        <div className="step-card-header">
                            <span className="step-number">1</span>
                            <span className="step-title">Order & Destination Path</span>
                        </div>
                        <div className="step-card-body">
                            <div className="target-list-vertical">
                                {transitionsState.map((t, idx) => {
                                    const isSelected = t.target === selectedTargetId;
                                    const hasCond = t.cond && t.cond.trim() !== "";
                                    return (
                                        <div
                                            key={t.target}
                                            className={`target-card-full ${isSelected ? "selected" : ""}`}
                                            onClick={() => handleSelectTarget(t.target)}
                                            style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
                                        >
                                            <div style={{ display: "flex", flexDirection: "column", gap: "2px", overflow: "hidden" }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                    <span style={{ fontSize: "11px", color: "#64748b", fontWeight: "bold" }}>#{idx + 1}</span>
                                                    <FiArrowRight color={isSelected ? "#38bdf8" : "#94a3b8"} />
                                                    <span style={{ fontWeight: "bold", fontSize: "13px", whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
                                                        {t.targetLabel || t.target}
                                                    </span>
                                                </div>
                                                <span className="target-card-status">
                                                    {hasCond ? `Cond: [${t.cond}]` : "Mandatory fallback"}
                                                </span>
                                            </div>

                                            {/* Pfeiltasten zum Verschieben */}
                                            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }} onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    className="order-btn"
                                                    disabled={idx === 0}
                                                    onClick={(e) => handleMoveUp(idx, e)}
                                                    title="Increase priority (move further up)"
                                                >
                                                    <FiChevronUp />
                                                </button>
                                                <button
                                                    className="order-btn"
                                                    disabled={idx === transitionsState.length - 1}
                                                    onClick={(e) => handleMoveDown(idx, e)}
                                                    title="Lower priority (move further down)"
                                                >
                                                    <FiChevronDown />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Schritt 2: Typ & Variable */}
                    <div className="step-card">
                        <div className="step-card-header">
                            <span className="step-number">2</span>
                            <span className="step-title">Type & Variable</span>
                        </div>
                        <div className="step-card-body" style={{ gap: "10px" }}>
                            <div>
                                <label className="drawer-label" style={{ marginBottom: "4px", display: "block" }}>Status of this path:</label>
                                <select
                                    className="skill-select"
                                    value={isFallbackMode ? "fallback" : "cond"}
                                    onChange={(e) => {
                                        setIsFallbackMode(e.target.value === "fallback");
                                        setErrorMessage("");
                                    }}
                                >
                                    <option value="cond">Define condition (&lt;cond&gt;)</option>
                                    <option value="fallback">Unconditional fallback (without cond)</option>
                                </select>
                            </div>

                            {!isFallbackMode && (
                                !isCustomVar ? (
                                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                        <select
                                            className="skill-select"
                                            value={selectedVar}
                                            onChange={(e) => setSelectedVar(e.target.value)}
                                        >
                                            {usableVars.map((v) => (
                                                <option key={v.id} value={v.id}>{v.id} ({v.expr})</option>
                                            ))}
                                        </select>
                                        <button className="filter-button" style={{ margin: 0, justifyContent: "center" }} onClick={() => setIsCustomVar(true)}>
                                            <FiPlus /> New Variable
                                        </button>
                                    </div>
                                ) : (
                                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                        <input
                                            className="slot-field-edit"
                                            type="text"
                                            placeholder="Name (e.g. count)"
                                            value={newVarName}
                                            onChange={(e) => setNewVarName(e.target.value)}
                                        />
                                        <input
                                            className="slot-field-edit"
                                            type="text"
                                            placeholder="Initial value"
                                            value={newVarExpr}
                                            onChange={(e) => setNewVarExpr(e.target.value)}
                                        />
                                        <button className="back-button" style={{ margin: 0, justifyContent: "center" }} onClick={() => setIsCustomVar(false)}>
                                            Select from list
                                        </button>
                                    </div>
                                )
                            )}
                        </div>
                    </div>

                    {/* Schritt 3: Bedingung */}
                    <div className="step-card">
                        <div className="step-card-header">
                            <span className="step-number">3</span>
                            <span className="step-title">Define condition</span>
                        </div>
                        <div className="step-card-body">
                            {!isFallbackMode ? (
                                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                    <span style={{ fontWeight: "bold", color: "#38bdf8", flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
                                        {activeVarName || "Variable"}
                                    </span>
                                    <select
                                        className="skill-select"
                                        style={{ width: "70px" }}
                                        value={operator}
                                        onChange={(e) => setOperator(e.target.value)}
                                    >
                                        <option value=">">&gt;</option>
                                        <option value="<">&lt;</option>
                                        <option value="==">==</option>
                                        <option value=">=">&gt;=</option>
                                        <option value="<=">&lt;=</option>
                                        <option value="!=">!=</option>
                                    </select>
                                    <input
                                        className="slot-field-edit"
                                        type="text"
                                        style={{ width: "70px" }}
                                        placeholder="Value"
                                        value={compareValue}
                                        onChange={(e) => setCompareValue(e.target.value)}
                                    />
                                </div>
                            ) : (
                                <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                                    This path is executed if no previous condition applies.
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Schritt 4: Assign */}
                    <div className="step-card">
                        <div className="step-card-header">
                            <span className="step-number">4</span>
                            <span className="step-title">Action (&lt;assign&gt;)</span>
                        </div>
                        <div className="step-card-body">
                            {!isFallbackMode ? (
                                <>
                                    <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "13px" }}>
                                        <input
                                            type="checkbox"
                                            checked={enableAssign}
                                            onChange={(e) => setEnableAssign(e.target.checked)}
                                        />
                                        <span>Change variable</span>
                                    </label>
                                    {enableAssign ? (
                                        <input
                                            className="slot-field-edit"
                                            type="text"
                                            style={{ marginTop: "8px" }}
                                            placeholder={`z. B. ${activeVarName || "x"} - 1`}
                                            value={assignExpr}
                                            onChange={(e) => setAssignExpr(e.target.value)}
                                        />
                                    ) : (
                                        <span style={{ fontSize: "12px", color: "#64748b", marginTop: "8px" }}>
                                            No automatic change
                                        </span>
                                    )}
                                </>
                            ) : (
                                <span style={{ fontSize: "12px", color: "#64748b" }}>
                                    Promotions available subject to conditions only.
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer Toolbar */}
                <div className="bottom-drawer-footer">
                    <button className="back-button" style={{ margin: 0, height: "38px" }} onClick={onClose}>
                        Cancel
                    </button>
                    <button className="filter-button" style={{ margin: 0, height: "38px", padding: "0 24px" }} onClick={handleSave}>
                        <FiCheck /> Save & Apply
                    </button>
                </div>
            </div>
        </div>
    );
}

export default ConditionModal;