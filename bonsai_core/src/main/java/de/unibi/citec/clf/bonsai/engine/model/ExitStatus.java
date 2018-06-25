package de.unibi.citec.clf.bonsai.engine.model;



/**
 * Defines the possible exit statuses of a state. It is also possible to add
 * a more specific extension by adding a processing status.
 * 
 * Example: <code>
 * return ExitStatus.SUCCESS().ps("myStatus");
 * </code>
 * 
 * @see ExitStatus#withProcessingStatus(java.lang.String)
 */
public class ExitStatus {

    public enum Status {

        /**
         * The state finished successfully.
         */
        SUCCESS,
        /**
         * The state is still working.
         */
        LOOP,
        /**
         * The state finished with a known error e.g., missing or not
         * initialized data.
         */
        ERROR,
        /**
         * The state finished with a unknown error (e.g., IOException,
         * NullPointerException, etc.) and no further processing is
         * possible.
         */
        FATAL;

        @Override
        public String toString() {
            return super.toString().toLowerCase();
        }
    }

    private ExitStatus.Status status;
    private String procStatus = null;
    private long loopDelay = 10;

    /**
     * Create {@link ExitStatus} with status {@link Status#SUCCESS}.
     * 
     * @return {@link ExitStatus} with status {@link Status#SUCCESS}.
     */
    public static ExitStatus SUCCESS() {
        return new ExitStatus(Status.SUCCESS);
    }

    /**
     * Create {@link ExitStatus} with status {@link Status#SUCCESS}.
     * 
     * @return {@link ExitStatus} with status {@link Status#SUCCESS}.
     */
    public static ExitStatus LOOP() {
        return new ExitStatus(Status.LOOP);
    }

    /**
     * Create {@link ExitStatus} with status {@link Status#SUCCESS}.
     * 
     * @param wait
     *            Time to wait before executing next iteration.
     * 
     * @return {@link ExitStatus} with status {@link Status#SUCCESS}.
     */
    public static ExitStatus LOOP(long wait) {
        return new ExitStatus(Status.LOOP, wait);
    }

    /**
     * Create {@link ExitStatus} with status {@link Status#SUCCESS}.
     * 
     * @return {@link ExitStatus} with status {@link Status#SUCCESS}.
     */
    public static ExitStatus ERROR() {
        return new ExitStatus(Status.ERROR);
    }

    /**
     * Create {@link ExitStatus} with status {@link Status#SUCCESS}.
     * 
     * @return {@link ExitStatus} with status {@link Status#SUCCESS}.
     */
    public static ExitStatus FATAL() {
        return new ExitStatus(Status.FATAL);
    }

    /**
     * Private constructor to create new {@link ExitStatus}.
     * 
     * @param status
     */
    private ExitStatus(ExitStatus.Status status) {
        this.status = status;
    }
    
    /**
     * Private constructor to create new {@link ExitStatus}.
     * 
     * @param status
     */
    private ExitStatus(ExitStatus.Status status, long loopDelay) {
        this.status = status;
        this.loopDelay = loopDelay;
    }

    /**
     * Returns true if current status is {@link Status#SUCCESS}.
     * 
     * @return True if current status is {@link Status#SUCCESS}, false
     *         otherwise.
     */
    public boolean isSuccess() {
        return status == Status.SUCCESS;
    }

    /**
     * Returns true if current status is {@link Status#LOOP}
     * 
     * @return True if current status is {@link Status#LOOP}, false
     *         otherwise.
     */
    public boolean looping() {
        return status == Status.LOOP;
    }
    
    public boolean isFatal() {
        return status == Status.FATAL;
    }
    
    public long getLoopDelay() {
    	return loopDelay;
    }

    /**
     * Generates a copy of this status and sets a custom processing status.
     * 
     * Use this specification to indicate a more meaningful exits/processing
     * status.
     * 
     * By initializing a processing status the full value of the exit status
     * will look like the following:
     * 
     * <code>successful.GivenProcessingStatus</code>
     * 
     * <p>
     * Be careful! You have to adapt all SCXML files that are using this
     * state, if you change this variable afterwards.
     * </p>
     * 
     * @param status
     *            An arbitrary processing status.
     * @return A copy of this object.
     */
    public ExitStatus withProcessingStatus(String status) {
        procStatus = status;
        return this;
    }

    /**
     * Convenience method to set processing status.
     * 
     * @param status
     *            An arbitrary processing status.
     * @return A copy of this object.
     * @see ExitStatus#withProcessingStatus(java.lang.String)
     */
    public ExitStatus ps(String status) {
        return withProcessingStatus(status);
    }

    /**
     * Returns true if processing status was set, false otherwise.
     * 
     * @return True if processing status was set, false otherwise.
     */
    public boolean hasProcessingStatus() {
        return procStatus != null;
    }

    /**
     * Returns processing status or null if not set.
     * 
     * @return Processing status or null if not set.
     */
    public String getProcessingStatus() {
        return procStatus;
    }

    /**
     * Get current {@link Status}.
     * 
     * @return Current {@link Status}.
     */
    public ExitStatus.Status getStatus() {
        return status;
    }

    /**
     * Get the value of a element including the processing status. For
     * example: "success.myprocessingstatus"
     * 
     * @return Full status of this {@link ExitStatus}.
     */
    public String getFullStatus() {
        if (hasProcessingStatus()) {
            return status.toString() + "." + procStatus;
        } else {
            return status.toString();
        }
    }
    
    @Override
    public String toString() {
    	return "ExitStatus:" + status.name() + ":" + procStatus;
    }
}