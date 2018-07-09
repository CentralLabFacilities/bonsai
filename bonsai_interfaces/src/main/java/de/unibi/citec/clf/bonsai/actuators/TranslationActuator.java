package de.unibi.citec.clf.bonsai.actuators;

import de.unibi.citec.clf.bonsai.core.object.Actuator;
import de.unibi.citec.clf.btl.data.speechrec.MultiLangFreeSpeech;

import java.io.IOException;
import java.util.concurrent.Future;

/**
 * @author rfeldhans
 */
public interface TranslationActuator extends Actuator {
    public enum Language {
        ENGLISH(1, "english", "en-US"),
        GERMAN(2, "german", "de-DE"),
        FRENCH(3, "french", "fr-CA"),
        ITALIAN(4, "italian", "it-IT"),
        SPANISH(5, "spanish", "es-ES");

        private final int languageId;
        private final String languageName;
        private final String languageCode;//should follow BCP-47


        Language(int value, String name, String code) {
            this.languageId = value;
            this.languageName = name;
            this.languageCode = code;
        }

        public String getLanguageName() {
            return languageName;
        }
        public String getLanguageCode() {
            return languageCode;
        }

        public static TranslationActuator.Language fromString(String languageName){
            for (TranslationActuator.Language frame : TranslationActuator.Language.values()) {
                if (frame.languageName.equalsIgnoreCase(languageName)) {
                    return frame;
                }
            }
            throw new IllegalArgumentException("No Language with name " + languageName + " found!");
        }

        public static TranslationActuator.Language fromCode(String languageCode){
            for (TranslationActuator.Language frame : TranslationActuator.Language.values()) {
                if (frame.languageCode.equalsIgnoreCase(languageCode)) {
                    return frame;
                }
            }
            throw new IllegalArgumentException("No Language with code " + languageCode + " found!");
        }

    }

    Future<MultiLangFreeSpeech> translate(MultiLangFreeSpeech sentence, Language to) throws IOException;

}
