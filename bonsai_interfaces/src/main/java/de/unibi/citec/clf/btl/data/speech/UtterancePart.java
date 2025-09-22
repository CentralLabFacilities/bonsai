package de.unibi.citec.clf.btl.data.speech;



import de.unibi.citec.clf.btl.Type;

import java.util.Objects;

/**
 * Domain class representing a word in the speech recognizers output. Each part
 * is associated with an acoustic, a language model and a combined score.
 *
 * @author lschilli
 * @author sjebbara
 * @author lkettenb
 */
@Deprecated
public class UtterancePart extends Type implements GrammarSymbol {

    private String word;
    private int id;
    private int begin;
    private int end;
    private double acousticScore;
    private double lmScore;
    private double combinedScore;
    private GrammarSymbol parent = null;

    @Override
    public void setParent(GrammarSymbol parent) {
        this.parent = parent;
    }

    @Override
    public GrammarSymbol getParent() {
        return parent;
    }
    
    @Override
    public boolean hasParent() {
        return parent != null;
    }
    
    @Override
    public boolean isTerminal() {
        return true;
    }

    public String getWord() {
        return word;
    }

    public void setWord(String word) {
        this.word = word;
    }

    public int getId() {
        return id;
    }

    public void setId(int id) {
        this.id = id;
    }

    public int getBegin() {
        return begin;
    }

    public void setBegin(int begin) {
        this.begin = begin;
    }

    public int getEnd() {
        return end;
    }

    public void setEnd(int end) {
        this.end = end;
    }

    public double getAcousticScore() {
        return acousticScore;
    }

    public void setAcousticScore(double acousticScore) {
        this.acousticScore = acousticScore;
    }

    public double getLmScore() {
        return lmScore;
    }

    public void setLmScore(double lmScore) {
        this.lmScore = lmScore;
    }

    public double getCombinedScore() {
        return combinedScore;
    }

    public void setCombinedScore(double combinedScore) {
        this.combinedScore = combinedScore;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof UtterancePart)) return false;
        if (!super.equals(o)) return false;
        UtterancePart that = (UtterancePart) o;
        return id == that.id &&
                begin == that.begin &&
                end == that.end &&
                Double.compare(that.acousticScore, acousticScore) == 0 &&
                Double.compare(that.lmScore, lmScore) == 0 &&
                Double.compare(that.combinedScore, combinedScore) == 0 &&
                Objects.equals(word, that.word) &&
                Objects.equals(parent, that.parent);
    }

    @Override
    public int hashCode() {

        return Objects.hash(super.hashCode(), word, id, begin, end, acousticScore, lmScore, combinedScore, parent);
    }

    @Override
    public String toString() {
        return "UtterancePart [word=" + word + "]";
    }
}
