package de.unibi.citec.clf.btl.data.object;


import java.util.HashSet;
import java.util.Objects;
import java.util.Set;

import de.unibi.citec.clf.btl.Type;

/**
 * Results of the object recognition. This is a very general base class.
 *
 * @author sebschne
 * @author jwienke
 */
public class ObjectData extends Type {

    public static class Hypothesis extends Type {

        public Hypothesis(Hypothesis hyp) {
            super();
            this.reliability = hyp.reliability;
            this.classLabel = hyp.classLabel;
        }

        public Hypothesis(String classLabel, double reliability) {
            this.classLabel = classLabel;
            this.reliability = reliability;
        }

        public Hypothesis() {

        }

        private double reliability;
        private String classLabel;

        public double getReliability() {
            return reliability;
        }
        public void setReliability(double reliability) {
            this.reliability = reliability;
        }

        public String getClassLabel() {
            return classLabel;
        }
        public void setClassLabel(String classLabel) {
            this.classLabel = classLabel;
        }

        @Override
        public String toString() {
            return "[HYPOTHESIS " + "label: " + getClassLabel() + "timestamp: " + getTimestamp()
                    + " reliability:  " + getReliability() + "]";

        }

        @Override
        public boolean equals(Object o) {
            if (this == o) {
                return true;
            } else if (o != null && this.getClass() == o.getClass()) {
                Hypothesis hyp = (Hypothesis) o;
                return (Objects.equals(this.getClassLabel(),hyp.getClassLabel()) && Objects.equals(this.getTimestamp(),hyp.getTimestamp()));
            } else {
                return false;
            }
        }
    }

    /**
     * All hypotheses for this object.
     */
    Set<Hypothesis> hypotheses = new HashSet<>();

    public ObjectData() {
    }

    public ObjectData(ObjectData data) {
        super(data);
        for (Hypothesis h : data.getHypotheses()) {
            addHypothesis(new Hypothesis(h));
        }
    }

    @Override
    public String toString() {
        String s = "[OBJECTDATA ";
        for (Hypothesis hyp : hypotheses) {
            s += "\n\t" + hyp + " class: " + hyp.getClassLabel();
        }
        s += "\n]";

        return s;
    }

    public Set<Hypothesis> getHypotheses() {
        return hypotheses;
    }

    public void addHypothesis(Hypothesis hypothesis) {
        this.hypotheses.add(hypothesis);
    }

    public void clearHypotheses() {
        hypotheses.clear();
    }

    public String getBestLabel() {
        Set<Hypothesis> hypos = getHypotheses();
        Hypothesis best = null;
        // iterate over all hypos from the object.
        double bestRel = 0.0;
        for (Hypothesis h : hypos) {
            if (h.getReliability() > bestRel) {
                bestRel = h.getReliability();
                best = h;
            }
        }

        if (best == null) {
            return "unknown";
        } else {
            return best.getClassLabel();
        }
    }

    public double getBestRel() {
        Set<Hypothesis> hypos = getHypotheses();
        // iterate over all hypos from the object.
        double bestRel = 0.0;
        for (Hypothesis h : hypos) {
            if (h.getReliability() > bestRel) {
                bestRel = h.getReliability();

            }
        }

        return bestRel;
    }

}
