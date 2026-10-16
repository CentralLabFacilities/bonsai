package de.unibi.citec.clf.bonsai.monitoring.logging;

public record RuntimeLog(
        long timestamp,
        String level,
        String logger,
        String thread,
        String message,
        String exception
) {}