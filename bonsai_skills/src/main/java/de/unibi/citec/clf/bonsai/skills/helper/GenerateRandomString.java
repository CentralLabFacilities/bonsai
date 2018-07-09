/*
 * To change this license header, choose License Headers in Project Properties.
 * To change this template file, choose Tools | Templates
 * and open the template in the editor.
 */
package de.unibi.citec.clf.bonsai.skills.helper;

/*
 * #LICENSE%
 * Robocup@Home Tasks
 * ---
 * Copyright (C) 2009 - 2016 Frederic Siepmann
 * ---
 * This file is part of Bielefeld Sensor Actuator Interface (BonSAI).
 * 
 * http://opensource.cit-ec.de/projects/bonsai
 * 
 * This file may be licensed under the terms of of the
 * GNU Lesser General Public License Version 3 (the ``LGPL''),
 * or (at your option) any later version.
 * 
 * Software distributed under the License is distributed
 * on an ``AS IS'' basis, WITHOUT WARRANTY OF ANY KIND, either
 * express or implied. See the LGPL for the specific language
 * governing rights and limitations.
 * 
 * You should have received a copy of the LGPL along with this
 * program. If not, go to http://www.gnu.org/licenses/lgpl.html
 * or write to the Free Software Foundation, Inc.,
 * 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301, USA.
 * 
 * The development of this software was supported by the
 * Excellence Cluster EXC 277 Cognitive Interaction Technology.
 * The Excellence Cluster EXC 277 is a grant of the Deutsche
 * Forschungsgemeinschaft (DFG) in the context of the German
 * Excellence Initiative.
 * 
 * Contributors: Florian Lier, Frederic Siepmann, Leon Ziegler,
 * Matthias Schoepfer, Adriana-Victoria Dreyer, Agnes Swadzba,
 * Andreas Kipp, Birte Carlmeyer, Christian Ascheberg, Daniel Nacke,
 * Dennis Wigand, Günes Minareci, Hendrik ter Horst, Ingo Killmann,
 * Jan Pöppel, Lukas Kettenbach, Michael Zeunert, Patrick Renner,
 * Philipp Dresselhaus, Sebastian Meyer zu Borgsen, Soufian Jebbara,
 * Tobias Röhlig, Torben Toeniges, Viktor Losing, Viktor Richter
 * %LICENSE#
 */
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;

import java.util.Random;

/**
 * Generates a random String and writes it in the StringSlot
 * choose kind of string by mode
 *
 * </pre>
 * @author pvonneumanncosel
 */

public class GenerateRandomString extends AbstractSkill {
    private static final String MODE = "#_MODE";
    private static final String mode_default = "yes";

    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    private MemorySlotWriter<String> stringSlot;

    private String string;
    private String mode;

    String[] noList = {"No", "Nope", "Nah", "Nah", "Nooo",
            "Nooope", "Nop", "Nay", "No no", "Nopy Dopy"};

    String[] yesList = {"Yes", "Yeah", "Yeh", "Ye", "Yap",
            "Yas", "Aye", "Yea"};

    String[] okList = {"Ok", "Okay", "Oke", "Okey", "Okay Dokay",
            "Alright", "Alrigthy", "Ok cool"};

    @Override
    public void configure(ISkillConfigurator configurator) {
        mode = configurator.requestOptionalValue(MODE, mode_default);

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        stringSlot = configurator.getWriteSlot("StringSlot", String.class);
    }

    @Override
    public boolean init() {
        string = "";
        return true;
    }

    @Override
    public ExitToken execute() {
        Random random = new Random();
        logger.debug("checking mode " + mode);
        switch(mode.toLowerCase()){
            case "ok":
                string = okList[random.nextInt(okList.length)];
                logger.debug("picking random string " + string);
                break;
            case "yes":
                string = yesList[random.nextInt(yesList.length)];
                logger.debug("picking random string " + string);
                break;
            case "no":
            default:
                string = noList[random.nextInt(noList.length)];
                logger.debug("picking random string " + string);
                break;
        }
        if (string == null){
            string = "default";
        }
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken){
        if (curToken.getExitStatus().isSuccess()) {
            try {
                if(string != null){
                    stringSlot.memorize(string);
                }
            } catch (CommunicationException ex) {
                logger.error("Could not memorize string");
                return tokenError;
            }
        }
        return curToken;
    }
}
