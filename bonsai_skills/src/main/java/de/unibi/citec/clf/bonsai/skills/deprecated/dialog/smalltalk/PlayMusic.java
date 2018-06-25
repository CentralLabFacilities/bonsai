package de.unibi.citec.clf.bonsai.skills.deprecated.dialog.smalltalk;

import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;

/**
 * Play a sound file.
 *
 * <pre>
 *
 * Options:
 *  #_BLOCKING: [Boolean] Optional (default: true)
 *                      -> If true return after file is finished playing
 *  #_PLAYER:   [String] Optional (default: mplayer)
 *                      -> The player used to play the sound file from the command line
 *  #_PATH:     [STRING] Required
 *                      -> Path to sound file
 *
 * Slots:
 *
 * ExitTokens:
 *  success:    File played successfully
 *  error:      Could not play sound file 
 *
 * Sensors:
 *
 * Actuators:
 *
 * TODO: needs soundactuator to specify hardware on which to play
 * </pre>
 *
 * @author climberg, jkummert
 */
public class PlayMusic extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    private static final String KEY_BLOCKING = "#_BLOCKING";
    private static final String KEY_PLAYER = "#_PLAYER";
    private static final String KEY_PATH = "#_PATH";

    private static String path = "";
    private static boolean blocking = true;
    private boolean waited = false;
    private String player = "mplayer";

    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        player = configurator.requestOptionalValue(KEY_PLAYER, player);

        path = configurator.requestValue(KEY_PATH);
        blocking = configurator.requestOptionalBool(KEY_BLOCKING, blocking);
    }

    @Override
    public boolean init() {

        return true;
    }

    @Override
    public ExitToken execute() {

        double length = 10.0;

        logger.debug("playing song " + path);

        if (!waited) {
            try {
                String line;
                Process p = Runtime.getRuntime().exec(player + " -identify " + path + " 2>/dev/null");

                BufferedReader in = new BufferedReader(
                        new InputStreamReader(p.getInputStream()));
                while ((line = in.readLine()) != null) {
                    if (!line.startsWith("ID_LENGTH=")) {
                        continue;
                    }
                    int ind = line.indexOf("=");
                    length = Double.valueOf(line.substring(ind + 1));
                    logger.debug("detected song length: " + length);
                    break;
                }
                in.close();
            } catch (Exception e) {
                logger.warn("detecting song length failed");
                return tokenError;
            }

            try {
                Runtime.getRuntime().exec(player + " -quiet " + path);
            } catch (IOException ex) {
                logger.warn("could not play song" + path);
                return tokenError;
            }

            if (blocking) {
                waited = true;
                return ExitToken.loop((int) (length * 1000));
            } else {
                return tokenSuccess;
            }
        } else {
            return tokenSuccess;
        }
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }
}
