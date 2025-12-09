package de.unibi.citec.clf.bonsai.engine;

import de.unibi.citec.clf.bonsai.core.BonsaiManager;
import de.unibi.citec.clf.bonsai.core.configuration.ConfigurationParser;
import de.unibi.citec.clf.bonsai.core.configuration.ConfigurationResults;
import de.unibi.citec.clf.bonsai.core.configuration.XmlConfigurationParser;
import de.unibi.citec.clf.bonsai.core.exception.StateIDException;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.StateID;
import de.unibi.citec.clf.bonsai.skills.WriteReadStringSlotSkill;
import org.apache.log4j.BasicConfigurator;
import org.apache.log4j.PropertyConfigurator;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;

/**
 * @author lruegeme
 */
public class MemorySlotSkillTest {

    private final String PATH_TO_LOGGING_PROPERTIES = getClass().getResource("/testLogging.properties").getPath();
    private final String PATH_TO_TESTCONFIG = getClass().getResource("/TestConfig.xml").getPath();
    private org.apache.log4j.Logger logger = org.apache.log4j.Logger.getLogger(getClass());

    public MemorySlotSkillTest() {
        try {
            PropertyConfigurator.configure(PATH_TO_LOGGING_PROPERTIES);
        } catch (Exception e) {
            BasicConfigurator.configure();
        }
    }

    private ExitStatus executeSkill(Class a) throws StateIDException, ClassNotFoundException {
        SkillRunner runner = new SkillRunner(new StateID(a.getName()));
        SkillConfigurator.Config config = SkillConfigurator.getDefaultConf();
        runner.configure(config);
        return runner.execute();
    }

    @Test
    public void WriteReadStringSlotSkillTest() {
        ConfigurationParser parser = new XmlConfigurationParser();
        ConfigurationResults configure = BonsaiManager.getInstance().configure(PATH_TO_TESTCONFIG, parser, true);

        try {
            ExitStatus execute = executeSkill(WriteReadStringSlotSkill.class);
            assertEquals(execute.getFullStatus(), "success");
        } catch (StateIDException | ClassNotFoundException e) {
            e.printStackTrace();
            fail(e.getMessage());
        }

    }

}
