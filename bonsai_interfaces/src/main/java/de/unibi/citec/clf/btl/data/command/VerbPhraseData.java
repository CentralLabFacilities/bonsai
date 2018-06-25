package de.unibi.citec.clf.btl.data.command;


import de.unibi.citec.clf.btl.Type;
import java.util.ArrayList;
import java.util.List;

/**
 *
 * @author skoester
 */
public class VerbPhraseData extends Type {

    private String verbPhraseType;
    private String verbType;
    private String verb;
    private List<String> nominalPhrasesType;
    private List<String> nominalPhrases;
    private List<String> prepositions;

    public VerbPhraseData() {
        nominalPhrasesType = new ArrayList<>();
        nominalPhrases = new ArrayList<>();
        prepositions = new ArrayList<>();
    }

    public VerbPhraseData(String verbPhraseType, String verbType, String verb, List<String> nominalPhrasesType, List<String> nominalPhrases, List<String> prepositions) {
        this.verbPhraseType = verbPhraseType;
        this.verbType = verbType;
        this.verb = verb;
        this.nominalPhrasesType = nominalPhrasesType;
        this.nominalPhrases = nominalPhrases;
        this.prepositions = prepositions;
    }

    /**
     * @return the verbPhraseType
     */
    public String getVerbPhraseType() {
        return verbPhraseType;
    }

    /**
     * @param verbPhraseType the verbPhraseType to set
     */
    public void setVerbPhraseType(String verbPhraseType) {
        this.verbPhraseType = verbPhraseType;
    }

    /**
     * @return the verbType
     */
    public String getVerbType() {
        return verbType;
    }

    /**
     * @param verbType the verbType to set
     */
    public void setVerbType(String verbType) {
        this.verbType = verbType;
    }

    /**
     * @return the verb
     */
    public String getVerb() {
        return verb;
    }

    /**
     * @param verb the verb to set
     */
    public void setVerb(String verb) {
        this.verb = verb;
    }

    /**
     * @return the nominalPhrasesType
     */
    public List<String> getNominalPhrasesType() {
        return nominalPhrasesType;
    }

    /**
     * @param nominalPhrasesType the nominalPhrasesType to set
     */
    public void setNominalPhrasesType(List<String> nominalPhrasesType) {
        this.nominalPhrasesType = nominalPhrasesType;
    }

    /**
     * @return the nominalPhrases
     */
    public List<String> getNominalPhrases() {
        return nominalPhrases;
    }

    /**
     * @param nominalPhrases the nominalPhrases to set
     */
    public void setNominalPhrases(List<String> nominalPhrases) {
        this.nominalPhrases = nominalPhrases;
    }

    /**
     * @return the prepositions
     */
    public List<String> getPrepositions() {
        return prepositions;
    }

    /**
     * @param prepositions the prepositions to set
     */
    public void setPrepositions(List<String> prepositions) {
        this.prepositions = prepositions;
    }

}
