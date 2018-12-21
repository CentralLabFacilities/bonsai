package de.unibi.citec.clf.bonsai.core.time;

import java.util.Date;

public class SystemTime implements TimeProvider {

    @Override
    public Date getCurrentTime() {
        return new Date();
    }

    @Override
    public long currentTimeMillies() {
        return System.currentTimeMillis();
    }
}
