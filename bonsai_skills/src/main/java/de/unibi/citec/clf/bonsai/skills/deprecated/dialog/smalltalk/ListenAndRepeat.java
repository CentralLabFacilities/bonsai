package de.unibi.citec.clf.bonsai.skills.deprecated.dialog.smalltalk;


import de.unibi.citec.clf.bonsai.actuators.SpeechActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.helper.SimpleSpeechHelper;
import de.unibi.citec.clf.btl.data.speechrec.GrammarNonTerminal;
import de.unibi.citec.clf.btl.data.speechrec.Utterance;
import java.io.IOException;
import java.util.List;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * This skill provides the ability to repeat the sentence the way the robot heard it.
 * and store it into a memory Slot
 *
 * @author sjebbara, lkettenb
 */
public class ListenAndRepeat extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccess;

    private static final String KEY_PREFIX = "#_PREFIX";
    private static final String KEY_SENSOR = "#_SENSOR";

    //defaults
    private String prefix = "understood, ";
    private String speechSensorName = "SpeechSensorCustomListen";

    private Sensor<Utterance> speechSensor;
    private MemorySlot<GrammarNonTerminal> saveInMemorySlot;
    private SpeechActuator speechActuator;
    private SimpleSpeechHelper speechHelper;
    private String sentence;
    private GrammarNonTerminal inputTree;

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());

        prefix = configurator.requestOptionalValue(KEY_PREFIX, prefix);
        speechSensorName = configurator.requestOptionalValue(KEY_SENSOR, speechSensorName);

        logger.debug("wait for nt using speech sensor:" + speechSensorName);
        speechSensor = configurator.getSensor(speechSensorName, Utterance.class);

        speechActuator = configurator.getActuator("SpeechActuator", SpeechActuator.class);
        saveInMemorySlot = configurator.getSlot("UnderstoodTreeSlot", GrammarNonTerminal.class);
    }

    @Override
    public boolean init() {
        try {
            saveInMemorySlot.forget();
        } catch (CommunicationException ex) {
            Logger.getLogger(ListenAndRepeat.class.getName()).log(Level.SEVERE, null, ex);
        }
        speechHelper = new SimpleSpeechHelper(speechSensor, true);
        speechHelper.startListening();
        return true;
    }

    @Override
    public ExitToken execute() {
        if (!speechHelper.hasNewUnderstanding()) {
            return ExitToken.loop();
        }

        inputTree = speechHelper.getLastTree();

        List<String> words = speechHelper.getAllUnderstoodWords();
        sentence = "";
        for (int i = 0; i < words.size(); i++) {
            sentence += words.get(i);
            if (i < words.size() - 1) {
                sentence += " ";
            }
        }
        logger.info("Understood: " + sentence);

        if (prefix != null) {
            sentence = prefix + " " + sentence;
        }

        try {
            speechActuator.say(sentence.replace('_', ' '));
        } catch (IOException ex) {
            logger.error("IO Exception in speechActuator " + ex);
        }

        return tokenSuccess;

    }

    @Override
    public ExitToken end(ExitToken curToken) {
        speechHelper.removeHelper();
        if (sentence != null) {
            try {
                GrammarNonTerminal nt = new GrammarNonTerminal();
                logger.debug("setting nt Name to: " + inputTree.getName());
                nt.setName(inputTree.getName());
                logger.debug("setted nt Name to: " + nt.getSubsymbols());

                logger.debug("setting nt Subsymbols to: " + inputTree.getSubsymbols());

                nt.setSubSymbols(inputTree.getSubsymbols());
                logger.debug("setted nt Subsymbols: " + nt.getSubsymbols());

//                try {
//                    nt.setSourceDocument(inputTree.getSourceDocument());
//                } catch (Type.NoSourceDocumentException ex) {
//                    Logger.getLogger(ListenAndRepeat.class.getName()).log(Level.SEVERE, null, ex);
//                }
                saveInMemorySlot.memorize(nt);
            } catch (CommunicationException ex) {
                logger.error("Memory Exception " + ex);
            }
        }

        return curToken;
    }

}
