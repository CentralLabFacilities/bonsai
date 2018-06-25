package de.unibi.citec.clf.bonsai.skills.deprecated.nav.unsupported;



import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill; 
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.data.person.PersonData;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;
import java.io.IOException;

public class ReadRefPosition extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    private MemorySlot<NavigationGoalData> navigationGoalDataSlot;
    private Sensor<PersonData> personSensor;
    /**
     * How long to wait for new data?
     */
    private static final int TIMEOUT = 3000;
    /**
     * Tolerances.
     */
    private static final double COORDINATE_TOLERANCE = 0.5;
    private static final double ANGLE_TOLERANCE = Math.PI / 8;

    private NavigationGoalData refPosition;
    
    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());
        navigationGoalDataSlot = configurator.getSlot("NavigationGoalDataSlot", NavigationGoalData.class);
        personSensor = configurator.getSensor(
                "RefereePersonDataSensor", PersonData.class);
    }

    @Override
    public boolean init() {
        return true;
    }

    @Override
    public ExitToken execute() {
        
        PersonData pD;
        try {
            pD = personSensor.readLast(TIMEOUT);
            logger.info("personData " + pD);
            if (pD != null) {
                PositionData posD = pD.getPosition();

                logger.info("positionData " + posD);
                if (posD != null) {
                    refPosition = new NavigationGoalData(posD);
                    refPosition.setYawTolerance(ANGLE_TOLERANCE,
                            AngleUnit.RADIAN);
                    refPosition.setCoordinateTolerance(COORDINATE_TOLERANCE,
                            LengthUnit.METER);
                } else {
                    return tokenError;
                }
            } else {
                return tokenError;
            }
        } catch (IOException | InterruptedException e) {
            // TODO Auto-generated catch block
            e.printStackTrace();
        }
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        try {
            navigationGoalDataSlot.memorize(refPosition);
            return tokenSuccess;
        } catch (CommunicationException ex) {
            logger.error("Could not memorize refPosition");
            return tokenError;
        }
    }
}
