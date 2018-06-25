package de.unibi.citec.clf.bonsai.engine.model;

import de.unibi.citec.clf.bonsai.engine.SkillConfigurator;

public class ExitToken {

    private ExitStatus status;

    /**
     * Loop to start of skills execute
     *
     * @param time in ms
     * @return
     */
    public static ExitToken loop(long time) {
        return new ExitToken(ExitStatus.LOOP(time));
    }

    public static ExitToken loop() {
        return new ExitToken(ExitStatus.LOOP());
    }

    public static ExitToken fatal() {
        return new ExitToken(ExitStatus.FATAL());
    }

    private ExitToken(ExitStatus status) {
        this.status = status;
    }

    public static ExitToken createToken(ExitStatus status,
                                        SkillConfigurator skillConfigurator) {
        ExitToken t = new ExitToken(status);
        skillConfigurator.registerExitToken(t);
        return t;
    }

    public ExitStatus getExitStatus() {
        return status;
    }

    @Override
    public String toString() {
        return "ExitToken:" + status;
    }
}
