package de.unibi.citec.clf.btl.data.speechrec;



import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Objects;

import de.unibi.citec.clf.btl.Type;
import de.unibi.citec.clf.btl.data.common.Timestamp;
import de.unibi.citec.clf.btl.units.TimeUnit;

/**
 * Domain class representing an utterance. An utterance consisting of a word
 * sequence and a grammar tree. The grammar tree is null if the speech
 * recognizer does not configured to provide one. Currently the grammar tree is
 * unfortunately always null if the input is simulated.
 * 
 * @author lschilli
 * @author lkettenb
 */
public class Utterance extends Type implements Iterable<UtterancePart> {

	private LinkedHashMap<Integer, UtterancePart> utterancePartMap = new LinkedHashMap<>();
	private boolean stable;
	private boolean valid;
	private Timestamp begin;
	private Timestamp end;
	private GrammarTree grammarTree;

	public Utterance() {
	}

	public GrammarTree getGrammarTree() {
		return grammarTree;
	}

	public void setGrammarTree(GrammarTree grammarTree) {
		this.grammarTree = grammarTree;
	}

	public boolean isStable() {
		return stable;
	}

	public void setStable(boolean stable) {
		this.stable = stable;
	}

	public Timestamp getBegin() { return begin; }

	public void setBegin(long timestamp, TimeUnit unit) {
		this.begin = new Timestamp(timestamp, unit);
	}

	public Timestamp getEnd() { return end; }

	public void setEnd(long timestamp, TimeUnit unit) {
		this.end = new Timestamp(timestamp, unit);
	}

	public boolean isValid() { return valid; }

	public void setValid(boolean valid) { this.valid = valid; }

	@Deprecated
	public void addUtterancePart(UtterancePart uttp) {
		utterancePartMap.put(uttp.getId(), uttp);
	}

        @Deprecated
	public UtterancePart getUtterancePartById(int refid) {
		return utterancePartMap.get(refid);
	}

        @Deprecated
	public Iterator<UtterancePart> iterator() {
		return utterancePartMap.values().iterator();
	}

        @Deprecated
	public int getUtterancePartCount() {
		return utterancePartMap.size();
	}

	public String getSimpleString() {

		StringBuilder strb = new StringBuilder();
		for (UtterancePart uttp : utterancePartMap.values()) {
			if (strb.length() != 0)
				strb.append(" ");
			strb.append(uttp.getWord());
		}

		return strb.toString();

	}

	/**
	 * {@inheritDoc}
	 */
	@Override
	public String toString() {

		StringBuilder strb = new StringBuilder();
		strb.append("(" + getTimestamp() + ")");
		for (UtterancePart uttp : utterancePartMap.values()) {
			strb.append(" ");
			strb.append(uttp.toString());
		}
		strb.append(" ;");

		return strb.toString();

	}

	@Override
	public boolean equals(Object o) {
		if (this == o) return true;
		if (!(o instanceof Utterance)) return false;
		if (!super.equals(o)) return false;
		Utterance that = (Utterance) o;
		return stable == that.stable &&
				Objects.equals(utterancePartMap, that.utterancePartMap) &&
				Objects.equals(begin, that.begin) &&
				Objects.equals(end, that.end) &&
				Objects.equals(grammarTree, that.grammarTree);
	}

	@Override
	public int hashCode() {

		return Objects.hash(super.hashCode(), utterancePartMap, valid, stable, begin, end, grammarTree);
	}

}
