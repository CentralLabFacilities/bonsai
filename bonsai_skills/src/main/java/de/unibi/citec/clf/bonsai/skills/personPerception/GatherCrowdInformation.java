package de.unibi.citec.clf.bonsai.skills.personPerception;

import de.unibi.citec.clf.bonsai.actuators.DetectPeopleActuator;
import de.unibi.citec.clf.bonsai.actuators.deprecated.KBaseActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.core.time.Time;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.bonsai.skills.deprecated.personPerception.openpose.SearchForPerson;
import de.unibi.citec.clf.bonsai.util.CoordinateSystemConverter;
import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.data.knowledgebase.Arena;
import de.unibi.citec.clf.btl.data.knowledgebase.Crowd;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.data.person.PersonData;
import de.unibi.citec.clf.btl.data.person.PersonDataList;
import de.unibi.citec.clf.btl.units.LengthUnit;

import java.io.IOException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * finds people in crowd and writes them as crowd into a slot.
 * TODO: possibility to only get people in the current room
 *
 * <pre>
 * Options:
 *  #_THIS_ROOM_ONLY: [boolean] Optional (default: false)
 *                          -> Only People that are in the arena will be used
 *  #_TIMEOUT: [long] Optional (default: 8000)
 *                          -> Timeout in ms
 *
 * Slots:
 *  CrowdSlot: [Crowd] [Write]
 *      -> Crowd of recognized people
 *
 * ExitTokens:
 *  success.noPeople -> robot has not seen any people
 *  success.peopleFound -> robot has seen any amount of people != 0. Crowd saved to memory
 *  error.timeout -> actuator did not return before timeout
 *  fatal -> a hard error occurred e.g. Slot communication error
 *
 * Actuators:
 *  GetCrowdAttributesActuator:    [GetCrowdAttributesActuator]
 *      -> Recognize gestures und postures people are making
 *
 * Sensors:
 *  PositionSensor: [PositionData]
 *      -> Read in current robot position
 *
 * </pre>
 *
 * @author jsimmering
 */
public class GatherCrowdInformation extends AbstractSkill {

    private final static String KEY_CHECK_IN_ARENA = "#_CHECK_IN_ARENA";
    private final static String KEY_TIMEOUT = "#_TIMEOUT";

    private boolean checkInArena = false;
    private long timeout = 60000;

    private final static LengthUnit m = LengthUnit.METER;

    private ExitToken tokenSuccessNoPeople;
    private ExitToken tokenSuccessPeopleFound;
    private ExitToken tokenErrorTimeout;
    private ExitToken tokenErrorNotInArena;

    private MemorySlotWriter<Crowd> crowdSlot;

    private KBaseActuator kBaseActuator;
    private DetectPeopleActuator peopleActuator;
    private Sensor<PositionData> positionSensor;
    private PositionData robotPos;

    private Future<PersonDataList> peopleFuture;

    private Crowd crowd;

    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {
        checkInArena = configurator.requestOptionalBool(KEY_CHECK_IN_ARENA, checkInArena);
        timeout = configurator.requestOptionalInt(KEY_TIMEOUT, (int)timeout);

        tokenSuccessNoPeople = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("noPeople"));
        tokenSuccessPeopleFound = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("peopleFound"));
        tokenErrorTimeout = configurator.requestExitToken(ExitStatus.ERROR().withProcessingStatus("timeout"));
        tokenErrorNotInArena = configurator.requestExitToken(ExitStatus.ERROR().withProcessingStatus("NotInArena"));

        crowdSlot = configurator.getWriteSlot("CrowdSlot", Crowd.class);

        peopleActuator = configurator.getActuator("PeopleActuator", DetectPeopleActuator.class);
        positionSensor = configurator.getSensor("PositionSensor", PositionData.class);

        kBaseActuator = configurator.getActuator("KBaseActuator", KBaseActuator.class);
    }

    @Override
    public boolean init() {
        // Look for legs in the current room
        try {
            robotPos = positionSensor.readLast(1000);
        } catch (IOException | InterruptedException ex) {
            Logger.getLogger(SearchForPerson.class.getName()).log(Level.SEVERE, null, ex);
        }
        logger.debug("Detecting Persons");
        try {
            peopleFuture = peopleActuator.getPeople(true, true, 10.0f);
            timeout += Time.currentTimeMillis();
        } catch (InterruptedException | ExecutionException e) {
            logger.error(e);
            return false;
        }
        return true;
    }

    @Override
    public ExitToken execute() {

        if(!peopleFuture.isDone()){
            if(timeout<Time.currentTimeMillis()){
                return tokenErrorTimeout;
            }
            return ExitToken.loop(50);
        }
        List<PersonData> persons;
        try {
            persons = peopleFuture.get();
        } catch (InterruptedException | ExecutionException e) {
            logger.error("cant access people actuator");
            return ExitToken.fatal();
        }

        if (persons.isEmpty()) {
            return tokenSuccessNoPeople;
        }

        crowd = new Crowd();
        if (checkInArena) {
            Arena arena = kBaseActuator.getArena();
            List<PersonData> personsInArena = new PersonDataList();
            for (PersonData p : persons) {

                PositionData localPersonPos = p.getPosition();
                PositionData globalPersonPos = CoordinateSystemConverter.localToGlobal(localPersonPos, robotPos);
                try{
                    if(Double.isNaN(globalPersonPos.getX(LengthUnit.METER)) || Double.isNaN(globalPersonPos.getY(LengthUnit.METER))){
                        logger.debug("Person has invalid Pose");
                        continue;
                    }
                }catch (Exception e){
                    logger.error(e);
                    continue;
                }
                logger.info("Checking if person is inside arena; Got room: " + arena.getCurrentRoom(globalPersonPos)  +  " and position: " + globalPersonPos.toString());
                if (!arena.getCurrentRoom(globalPersonPos).equals("outside")) {
                    logger.debug("Person in arena");
                    personsInArena.add(p);
                }
            }
            if (personsInArena.isEmpty()) {
                return tokenErrorNotInArena;
            } else {
                crowd.setPersons(personsInArena);
            }
        } else {
            crowd.setPersons(persons);
        }

        return tokenSuccessPeopleFound;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.getExitStatus().isSuccess()) {
            if (crowd != null) {
                try {
                    crowdSlot.memorize(crowd);
                } catch (CommunicationException e) {
                    logger.fatal("Unable to write to memory: " + e.getMessage());
                    return ExitToken.fatal();
                }
            }
        }
        return curToken;
    }
}
