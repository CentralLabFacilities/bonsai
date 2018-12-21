package de.unibi.citec.clf.bonsai.core.time;

import java.util.Date;

public final class Time {

    private static TimeProvider timeProvider;

    static {
        timeProvider = new SystemTime();
    }

    public static Date now() {
        return timeProvider.getCurrentTime();
    }

    public static long currentTimeMillis() {
        return timeProvider.currentTimeMillies();
    }

}