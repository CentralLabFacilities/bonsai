/*
 * This file is part of Bielefeld Sensor Actuator Interface (BonSAI).
 *
 * Copyright(c) Frederic Siepmann
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
 * Contributors: Florian Lier, Frederic Siepmann, Leon Ziegler, Matthias 
 * Schoepfer, Adriana-Victoria Dreyer, Agnes Swadzba, Andreas Kipp, Birte 
 * Carlmeyer, Christian Ascheberg, Daniel Nacke, Dennis Wigand, Günes Minareci, 
 * Hendrik ter Horst, Ingo Killmann, Jan Pöppel, Lukas Kettenbach, Michael 
 * Zeunert, Patrick Renner, Philipp Dresselhaus, Robin Schiewer, Sebastian 
 * Meyer zu Borgsen, Soufian Jebbara, Tobias Röhlig, Torben Toeniges, Tristan 
 * Walter, Viktor Losing, Viktor Richter
 */
package de.unibi.citec.clf.bonsai.actuators;

import java.util.concurrent.Future;



public interface SpeechActuatorListener {
    void newUtterance(String text, Future<Void> result);
}
