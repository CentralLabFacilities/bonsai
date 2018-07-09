package de.unibi.citec.clf.bonsai.actuators.data;

public class SetLanguageResult {

    public SetLanguageResult(boolean valid, String oldLanguage) {
        this.valid = valid;
        this.oldLanguage = oldLanguage;
    }

    private boolean valid;
    private String oldLanguage;

    public boolean isValid() {
        return valid;
    }

    public String getOldLanguage() {
        return oldLanguage;
    }

}

