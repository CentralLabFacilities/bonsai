package de.unibi.citec.clf.bonsai.skills;

import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;

/**
 * @author lruegeme
 */
public class ParameterSkill extends AbstractSkill {

    private ExitToken tokenSuccess;

    public static final String KEY_INTEGER = "VALINT";
    public static final String KEY_BOOL = "VALBOOL";
    public static final String KEY_DOUBLE = "VALDBL";
    public static final String KEY_VALUE = "VALUE";

    public static final String KEY_OPT_INTEGER = "OPTINT";
    public static final String KEY_OPT_BOOL = "OPTBOOL";
    public static final String KEY_OPT_DOUBLE = "OPTDBL";
    public static final String KEY_OPT_VALUE = "OPTIONAL";

    public int valInt;
    public double valDouble;
    public boolean valBool;
    public String valString;

    public int optInt;
    public double optDouble;
    public boolean optBool;
    public String optString;


    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());

        valString = configurator.requestValue(KEY_VALUE);
        valBool = configurator.requestBool(KEY_BOOL);
        valDouble = configurator.requestDouble(KEY_DOUBLE);
        valInt = configurator.requestInt(KEY_INTEGER);

        optString = configurator.requestOptionalValue(KEY_OPT_VALUE, valString);
        optBool = configurator.requestOptionalBool(KEY_OPT_BOOL, valBool);
        optDouble = configurator.requestOptionalDouble(KEY_OPT_DOUBLE, valDouble);
        optInt = configurator.requestOptionalInt(KEY_OPT_INTEGER, valInt);
    }

    @Override
    public boolean init() {
        return true;
    }

    @Override
    public ExitToken execute() {
        return ExitToken.fatal();
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }

}
