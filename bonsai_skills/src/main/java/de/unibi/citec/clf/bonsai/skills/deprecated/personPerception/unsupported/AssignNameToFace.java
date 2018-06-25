package de.unibi.citec.clf.bonsai.skills.deprecated.personPerception.unsupported;


import de.unibi.citec.clf.bonsai.actuators.SpeechActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import java.io.IOException;

/**
 * Set the name of a given FaceId.
 *
 * @author climberg
 */
/*
public class AssignNameToFace extends AbstractSkill {
    private SpeechActuator speechActuator;
 
    class Person {

        int age;
        FaceIdentificationList.FaceIdentification.Gender gender;
        int index;
    }
    
    //Slots
    private MemorySlot<String> nameS;
    private MemorySlot<String> faceIdS;
    private MemorySlot<FaceIdentificationList> faceListS;
    
    private String name;
    private int faceId;
    FaceIdentificationList faceList;
    
    ExitToken tokenSuccess;
    ExitToken tokenError;


    @Override
    public void configure(ISkillConfigurator configurator) {
       
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        nameS = configurator.getSlot(
                "NameToAssign", String.class);
        faceIdS = configurator.getSlot(
                "IdToAssign", String.class);
        faceListS = configurator.getSlot(
                "faceIdentificationList", FaceIdentificationList.class);
        
        
        speechActuator = configurator.getActuator(
                "SpeechActuator", SpeechActuator.class);
    }
    

    @Override
    public boolean init() {
        
        try {
            name = nameS.recall();
        } catch (CommunicationException ex) {
            logger.fatal("name not set");
            return false;
        }
        try {
            String id=faceIdS.recall();
            faceId = Integer.valueOf(id);
        } catch (Exception ex) {
            logger.fatal("faceId not set or invalid "+ex);
            return false;
        }
        try {
            faceList = faceListS.recall();
        } catch (CommunicationException ex) {
            logger.fatal("faceList not set");
            return false;
        }
        return true;
        
    }

    @Override
    public ExitToken execute() {
        boolean set = false;
        for(FaceIdentificationList.FaceIdentification face : this.faceList) {
            if(face.getClassId() == faceId) {
                Person p = new Person();
                p.age = (face.ageFrom + face.ageTo) / 2;
                p.gender = face.gender;
                face.name = name;
                String gender = "girl";
                if (p.gender == Gender.MALE){
                    gender = "boy";
                }else{
                    gender = "girl";
                }
                String message="I guess, " + face.name + ", you are a " + p.age + " years old " + gender;
                logger.debug(message);
                say( message,true);
                set = true;
                break;
            }
        }
        
        
        
        if(!set) {
            logger.debug("faceid not in list");
            return tokenError;
        }
        
        try {
            faceListS.memorize(faceList);
        } catch (CommunicationException ex) {
            logger.fatal("can't memorize faceList");
            return tokenError;
        }

        return tokenSuccess;
    }
    


    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;

    }

    private void say(String text, boolean async) {
        try {
            if (async) {
                speechActuator.sayAsync(text);
            } else {
                speechActuator.say(text);
            }
        } catch (IOException ex) {
            // Not so bad. The robot just doesn't say anything.
            logger.warn(ex.getMessage());
        }
    }
    
    
}*/
