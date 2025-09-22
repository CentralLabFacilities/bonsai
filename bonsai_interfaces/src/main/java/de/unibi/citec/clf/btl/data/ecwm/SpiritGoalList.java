package de.unibi.citec.clf.btl.data.ecwm;

import de.unibi.citec.clf.btl.List;

import java.util.stream.Collectors;

public class SpiritGoalList extends List<SpiritGoal> {

    /**
     * Default constructor.
     */
    public SpiritGoalList() {
        super(SpiritGoal.class);
    }

    /**
     * {@inheritDoc}
     */
    @Override
    public String toString() {
        return "SpiritGoals: " + elements.stream().map(SpiritGoal::toString).collect(Collectors.joining(", "));
    }
}

