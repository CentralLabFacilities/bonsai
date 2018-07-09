package de.unibi.citec.clf.btl.data.speechrec;

import de.unibi.citec.clf.bonsai.actuators.TranslationActuator;
import de.unibi.citec.clf.btl.Type;

/**
 * Domain class to represent recognized free speech of one of several languages. Comes with a confidence to work with.
 * @author rfeldhans
 */
public class MultiLangFreeSpeech extends Type{
    private String understood_utternace;
    private double confidence;
    private TranslationActuator.Language language;

    public String getUnderstood_utternace() {
        return understood_utternace;
    }

    public void setUnderstood_utternace(String understood_utternace) {
        this.understood_utternace = understood_utternace;
    }

    public double getConfidence() {
        return confidence;
    }

    public void setConfidence(double confidence) {
        this.confidence = confidence;
    }

    public TranslationActuator.Language getLanguage() {
        return language;
    }

    public void setLanguage(TranslationActuator.Language language) {
        this.language = language;
    }
}
