package de.unibi.citec.clf.bonsai.skills.deprecated.personPerception.face.unsupported;


import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;

/**
 * Get the name of a given FaceId.
 *
 * @author climberg
 */
public class GetNameFromFace extends AbstractSkill {
 
    //Slots
    private MemorySlot<String> nameS;
    private MemorySlot<String> faceIdS;
    // unsupported private MemorySlot<FaceIdentificationList> faceListS;
    
    private int faceId;
    // unsupported FaceIdentificationList faceList;
    
    ExitToken tokenSuccess;
    ExitToken tokenError;


    @Override
    public void configure(ISkillConfigurator configurator) {
       
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        nameS = configurator.getSlot(
                "NameSlot", String.class);
        faceIdS = configurator.getSlot(
                "FaceIdSlot", String.class);
        // unsupported faceListS = configurator.getSlot("FaceIdentificationListSlot", FaceIdentificationList.class);
    }
    

    @Override
    public boolean init() {
        
        try {
            faceId = Integer.valueOf(faceIdS.recall());
        } catch (Exception ex) {
            logger.fatal("faceId not set or invalid");
            return false;
        }
        /*
        try {
            faceList = faceListS.recall();
        } catch (CommunicationException ex) {
            logger.fatal("faceList not set");
            return false;
        }*/
        return true;
        
    }

    @Override
    public ExitToken execute() {
        boolean set = false;
        /*for(FaceIdentificationList.FaceIdentification face : this.faceList) {
            if(face.getClassId() == faceId) {
                try {
                    nameS.memorize(face.name);
                } catch (CommunicationException ex) {
                    Logger.getLogger(GetNameFromFace.class.getName()).log(Level.SEVERE, null, ex);
                }
                set = true;
            }
        }*/
        if(!set) {
            logger.debug("faceid not in list");
            return tokenError;
        }

        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;

    }


}
