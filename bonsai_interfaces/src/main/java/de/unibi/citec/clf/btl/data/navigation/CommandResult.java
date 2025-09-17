package de.unibi.citec.clf.btl.data.navigation;



import de.unibi.citec.clf.btl.StampedType;
import de.unibi.citec.clf.btl.Type;

/**
 *
 * @author cklarhor
 */
public class CommandResult extends StampedType {
    
    /**
     * possible CommandResults see rst.navigation.CommandResult.Result
     */
    public enum Result {
        SUCCESS, SUPERSEDED, CANCELLED, EMERGENCY_STOPPED, PATH_BLOCKED, TIMEOUT, CUSTOM_ERROR, UNKNOWN_ERROR
    }
    
    /** command result description text. */
    private final String description;
    private final Result resultType;
    /** special errorCode depend on resultType.*/
    private final int errorCode;
    
    public CommandResult(String description, Result resultType, int errorCode) {
        this.description = description;
        this.resultType = resultType;
        this.errorCode = errorCode;
    }
    
    public Result getResultType() {
        return resultType;
    }

    @Override
    public String toString() {
        return "Error was: "+resultType+","+description+","+errorCode;
    }
    
    
}
