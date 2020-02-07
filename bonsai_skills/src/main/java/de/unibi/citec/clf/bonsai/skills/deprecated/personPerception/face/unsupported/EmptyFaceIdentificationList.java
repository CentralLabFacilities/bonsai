package de.unibi.citec.clf.bonsai.skills.deprecated.personPerception.face.unsupported;


import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;

/**
 * In this state, the FaceIdentificationList is emptied.
 *
 * @author climberg
 */
public class EmptyFaceIdentificationList extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccess;

    //MemorySlots
    //private MemorySlot<FaceIdentificationList> knownFacesMemorySlot;

    
    @Override
    public void configure(ISkillConfigurator configurator) {

        //knownFacesMemorySlot = configurator.getSlot("knownFacesMemorySlot", FaceIdentificationList.class);

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
    }


    @Override
    public boolean init() {
        return true;
    }

    @Override
    public ExitToken execute() {

        //FaceIdentificationList list = new FaceIdentificationList();
        /*try {
            knownFacesMemorySlot.memorize(list);
        } catch (CommunicationException ex) {
            logger.fatal("can't empty faceidentification list");
            return ExitToken.fatal();
        }
        logger.debug("emptied face identification list");*/
        return tokenSuccess;

    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;

    }

}
