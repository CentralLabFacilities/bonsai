package de.unibi.citec.clf.btl.data.speechrec;


/**
 * Marker class for grammar symbols
 *
 * @author lkettenb
 * @author lschilli
 *
 */
@Deprecated
public interface GrammarSymbol {

    /**
     * Set the parent symbol if available (not root).
     *
     * @param parent Parent symbol if available (not root).
     */
    void setParent(GrammarSymbol parent);

    /**
     * Get the parent symbol if available (not root).
     *
     * @return Parent symbol if available (not root) or null.
     */
    GrammarSymbol getParent();
    
    /**
     * Returns true if this instance has a parent, false otherwise.
     * 
     * @return True if this instance has a parent, false otherwise.
     */
    boolean hasParent();
    
    /**
     * Returns true if this instance is a terminal 
     * symbol, false otherwise. 
     * 
     * @return True if this instance is a terminal 
     * symbol, false otherwise. 
     */
    boolean isTerminal();
}
