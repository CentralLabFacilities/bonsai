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
import de.unibi.citec.clf.bonsai.actuators.deprecated.KBaseActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.data.knowledgebase.Location;
import de.unibi.citec.clf.btl.data.knowledgebase.Arena;
import de.unibi.citec.clf.btl.data.knowledgebase.Door;
import de.unibi.citec.clf.btl.data.knowledgebase.Room;
import de.unibi.citec.clf.btl.data.map.Viewpoint;

import java.util.LinkedList;

/**
 * This Skill reads the personInfoSlot and writes info in the matching slot
 * The slots can be used by a filter people skill for exmaple.
 * furthermore the exit token tells us 3 cases
 * 1. we search for a generic person
 * 2. we search for a person with a specific name
 * 3. we search for the operator
 *
 * <pre>
 *
 * TODO DOKU
 *
 * </pre>
 * @author jkummert
 */

public class LoadAllAnnotations extends AbstractSkill {
    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    private KBaseActuator kBaseActuator;

    private MemorySlotWriter<String> annotationListSlot;
    private MemorySlotWriter<String> viewpointListSlot;

    private String annotationList;
    private String viewpointList;

    @Override
    public void configure(ISkillConfigurator configurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        annotationListSlot = configurator.getWriteSlot("AnnotationListSlot", String.class);
        viewpointListSlot = configurator.getWriteSlot("ViewpointListSlot", String.class);

        kBaseActuator = configurator.getActuator("KBaseActuator", KBaseActuator.class);
    }

    @Override
    public boolean init() {
        annotationList ="";
        viewpointList ="";
        return true;
    }

    @Override
    public ExitToken execute() {
        Arena arena = kBaseActuator.getArena();
        LinkedList<Room> rooms = arena.getRooms();
        for(Room room : rooms) {
            extendByRoom(room);
            handleRoom(room.getName());
        }
        // NO DOORS!
        /*
        LinkedList<Door> doors = arena.getDoors();
        for(Door door : doors) {
            extendByDoor(door);
        }
        */
        return tokenSuccess;
    }

    private void handleRoom(String roomName){
        //LOOPS OVER ALL PLACEMENTS IN THE ROOM
        try {
            List<Location> tmpLocationList = kBaseActuator.getBDOByAttribute(Location.class, "room", roomName);
            logger.debug("LOCATION LIST LENGTH: " + tmpLocationList.size());
            if(tmpLocationList != null){
                for(Location location : tmpLocationList) {
                    logger.debug("CURRENT LOCATION: " + location.getName());
                    extendByLocation(location);
                }
            }
        } catch (KBaseActuator.BDONotFoundException e) {
            logger.error(roomName + "THERE ARE NO LOCATIONS FOR THIS ROOM!!! THIS SHOULD NEVER OCCUR!!! " + e.getMessage());
        }
    }

    @Override
    public ExitToken end(ExitToken curToken){
        if (curToken.getExitStatus().isSuccess()) {
            try {
                if(annotationList != null){
                    annotationListSlot.memorize(annotationList);
                }
                if(viewpointList != null){
                    viewpointListSlot.memorize(viewpointList);
                }
            } catch (CommunicationException ex) {
                logger.error("Could not memorize annotations infos");
                return tokenError;
            }
        }
        return curToken;
    }

    private void extendByLocation(Location location){
        logger.debug("extend by location");
        LinkedList<Viewpoint> tmpViewpointList = location.getAnnotation().getViewpoints();
        if(tmpViewpointList != null){
            for(Viewpoint viewpoint: tmpViewpointList){
                annotationList += location.getName() + ";";
                viewpointList += viewpoint.getLabel() + ";";
            }
        }
    }

    private void extendByRoom(Room room){
        logger.debug("extend by room");
        LinkedList<Viewpoint> tmpViewpointList = room.getAnnotation().getViewpoints();
        if(tmpViewpointList != null){
            for(Viewpoint viewpoint: tmpViewpointList){
                annotationList += room.getName() + ";";
                viewpointList += viewpoint.getLabel() + ";";

            }
        }
    }

    private void extendByDoor(Door door){
        logger.debug("extend by door");
        LinkedList<Viewpoint> tmpViewpointList = door.getAnnotation().getViewpoints();
        if(tmpViewpointList != null){
            for(Viewpoint viewpoint: tmpViewpointList){
                annotationList += door.getRoomOne() + ";";
                viewpointList += viewpoint.getLabel() + ";";

            }
        }
    }

}
