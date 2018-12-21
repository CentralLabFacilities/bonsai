package de.unibi.citec.clf.bonsai.core.time;

import java.util.Date;

public interface TimeProvider {
    Date getCurrentTime();

    long currentTimeMillies();
}
