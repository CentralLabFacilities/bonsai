package de.unibi.citec.clf.btl.data.speechrec;


import java.util.Objects;

/**
 * Domain class representing the grammar tree provided by the speech recognizer.
 * The GrammarTree itself is kind of a pseudo start symbol, since the real start
 * symbol might be hidden in the speech recognizers output. Furthermore the
 * GrammarTree can also include partially parsed utterances e.g. if the parser
 * had to cancel and reinitialize to parse the utterance.
 * 
 * @author lschilli
 * 
 */
@Deprecated
public class GrammarTree extends GrammarNonTerminal {

	private boolean cancel;
	private boolean fault;
	private boolean skip;

	public GrammarTree() {
		super(null);
	}
        
        /**
         * This method throws a RuntimeException. Grammar trees cannot
         * have a parent! This is the result of really bad software design!
         */
        @Override
        public void setParent(GrammarSymbol parent) {
            throw new RuntimeException("A grammar tree cannot have a parent.");
        }
        
        /**
         * This method throws a RuntimeException. Grammar trees cannot
         * have a parent! This is the result of really bad software design!
         */
        @Override
        public GrammarSymbol getParent() {
            throw new RuntimeException("A grammar tree has no parent.");
        }

	/**
	 * Indicates the parser has at least once canceled (and reinitialized)
	 * during parsing
	 * 
	 * @return
	 */
	public boolean isCancel() {
		return cancel;
	}

	public void setCancel(boolean cancel) {
		this.cancel = cancel;
	}

	/**
	 * Indicates the parser has rated at least one word as a fault (not matching
	 * to the grammar structure).
	 * 
	 * @return
	 */
	public boolean isFault() {
		return fault;
	}

	public void setFault(boolean fault) {
		this.fault = fault;
	}

	/**
	 * Indicates the parser has skipped at least one word (if allowed to).
	 * 
	 * @return
	 */
	public boolean isSkip() {
		return skip;
	}

	public void setSkip(boolean skip) {
		this.skip = skip;
	}

	@Override
	public boolean equals(Object o) {
		if (this == o) return true;
		if (!(o instanceof GrammarTree)) return false;
		if (!super.equals(o)) return false;
		GrammarTree that = (GrammarTree) o;
		return cancel == that.cancel &&
				fault == that.fault &&
				skip == that.skip;
	}

	@Override
	public int hashCode() {

		return Objects.hash(super.hashCode(), cancel, fault, skip);
	}
}
