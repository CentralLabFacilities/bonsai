package de.unibi.citec.clf.bonsai.skills.deprecated.personPerception.face;


import de.unibi.citec.clf.bonsai.actuators.SpeechActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.data.person.PersonAttribute;
import de.unibi.citec.clf.btl.data.person.PersonData;
import java.io.IOException;

/**
 * In this state, the robot says Information about all persons in persondatalist (MemorySlot), wich was recorded by the skill ScanFaces.
 *
 * @author climberg
 */
public class EchoFaces extends AbstractSkill {


    // used tokens
    private ExitToken tokenSuccess;
   private ExitToken tokenError;

    
    //Actuator
    private SpeechActuator speechActuator;


    //Slots
    private MemorySlot<List<PersonData>> knownFacesMemorySlot;

    List<PersonData> pIdList;

    @Override
    public void configure(ISkillConfigurator configurator) {
        knownFacesMemorySlot = configurator.getSlot(
                "PersonDataListSlot", List.getListClass(PersonData.class));

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        
        speechActuator = configurator.getActuator(
                "SpeechActuator", SpeechActuator.class);

    }

    @Override
    public boolean init() {


        // read list of known faces
        try {
            pIdList = knownFacesMemorySlot.recall();
        } catch (CommunicationException ex) {
            logger.fatal("Exception while reading from knownFacesMemorySlot");
            return false;
        }

        if (pIdList == null || pIdList.size() == 0) {
            logger.warn("no PersonDataList of known Persons in Memory found or empty");
            return false;
        }

        

        return true;
    }

    @Override
    public ExitToken execute() {
        int countFemale = 0;
        int countMale = 0;
        for(PersonData fi: pIdList) {
            if(fi.getPersonAttribute().getGender() == PersonAttribute.Gender.FEMALE) {
                ++countFemale;
            } else if(fi.getPersonAttribute().getGender() == PersonAttribute.Gender.MALE) { //male and unknown
                ++countMale;
            } else {
                ++countMale;
                logger.debug("UNKNOWN GENDER FOR PERSON "+fi.getUuid());
            }
        }
        
        say("Overall I have counted "+(countFemale+countMale)+" People: "+countFemale+" Females and "+countMale+" Males.");
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {

        return curToken;

    }
    
    /**
     * Use speech actuator to say something and catch IO exception.
     *
     * @param text Text to be said.
     */
    private void say(String text) {
        try {
            speechActuator.say(text);
        } catch (IOException ex) {
            // Not so bad. The robot just says nothing.
            logger.warn(ex.getMessage());

        }
    }

}
