package de.unibi.citec.clf.bonsai.strategies.drive;

import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;

public interface DriveStrategy {

    enum StrategyState {
        SUCCESS, REACHED_PARTLY, ERROR, NOT_MOVED, NOT_FINISHED, REACHED_AREA, PATH_BLOCKED
    }

    StrategyState execute();

    void reset();

    boolean init(NavigationGoalData pTargetGoal);

}
