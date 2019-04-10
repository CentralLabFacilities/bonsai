package de.unibi.citec.clf.btl.util;

public class StoringGroceriesResult {

    public enum Result {
        SUCCESS, PICK_FAILED, PLACE_FAILED, NO_OBJECT_FOUND, NO_PLACE_LOC_FOUND, MOVE_FAILED
    }

    private final Result resultType;
    private final int errorCode;

    public StoringGroceriesResult(Result resultType, int errorCode) {
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
