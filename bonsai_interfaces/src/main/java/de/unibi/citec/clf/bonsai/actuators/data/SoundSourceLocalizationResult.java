package de.unibi.citec.clf.bonsai.actuators.data;

public class SoundSourceLocalizationResult {

    public SoundSourceLocalizationResult(boolean valid, double angle) {
        this.valid = valid;
        this.angle = angle;
    }

    private boolean valid;
    private double angle;

    public boolean isValid() {
        return valid;
    }

    public double getAngle() {
        return angle;
    }

}

