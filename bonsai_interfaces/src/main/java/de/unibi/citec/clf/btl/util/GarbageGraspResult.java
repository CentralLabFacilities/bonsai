package de.unibi.citec.clf.btl.util;

import de.unibi.citec.clf.btl.data.navigation.CommandResult;

public class GarbageGraspResult {

    public enum Result {
        SUCCESS, PLAN_FAILED, GRASP_FAILED, NAV_FAILED
    }

    private final Result resultType;
    private final int errorCode;

    public GarbageGraspResult(Result resultType, int errorCode) {
        this.resultType = resultType;
        this.errorCode = errorCode;
    }

    public Result getResultType() {
        return resultType;
    }

    @Override
    public String toString() {
        return "Error: "+resultType+","+errorCode;
    }
}
