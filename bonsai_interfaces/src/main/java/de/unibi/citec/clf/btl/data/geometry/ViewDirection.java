
/*
 * ViewDirection.java
 * 
 * Copyright (C) 2010 Bielefeld University Copyright (C) 2010 Patrick Holthaus
 * 
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the GNU General Public License for more
 * details.
 * 
 * You should have received a copy of the GNU General Public License along with
 * this program. If not, see <http://www.gnu.org/licenses/>.
 */
package de.unibi.citec.clf.btl.data.geometry;



import de.unibi.citec.clf.bonsai.core.time.Time;
import de.unibi.citec.clf.btl.Type;



/**
 * Parameterized view angles for the control of a robot head or a pan/tilt
 * camera. <viewangle type="relative" reference="1224498541412"
 * purpose="interact" unit="degrees" pan="-2" tilt="10" inertia="strong" />
 * <viewangle type="absolute" reference="1224498541412" purpose="interact"
 * unit="real" x="1232.2" y="5123.1" z="34.2" inertia="strong" />
 * 
 * @author pholthau
 */
public class ViewDirection extends Type {

	public enum Purpose {
		// scan the environment in a saccadic manner
		scan,
		// focus on something/someone for interaction
		interact
	}

	public enum Inertia {
		// Restrict movement as much as possible, i.e. try to avoid head
		// movement
		strong,
		// Allow other parts like the head to be moved, too
		weak,
		// Every joint can be moved to reach the target
		none
	}

	public enum Type {
		relative, absolute
	}

	public enum Unit {
		degrees, pixels, percentage, real
	}

	public Type type;
	public Unit unit;
	public Inertia inertia;
	public Purpose purpose;
	public float pan, tilt;
	public long reference;
	
	/**
	 * Creates a view direction with default values.
	 * <ul>
	 * <li>{@link Unit#degrees}</li>
	 * <li>{@link Type#absolute}</li>
	 * <li>{@link Inertia#none}</li>
	 * <li>{@link Purpose#interact}</li>
	 * <li>{@link System#currentTimeMillis()}</li>
	 * <li>pan: 0</li>
	 * <li>tilt: 0</li>
	 * @see ViewDirection#ViewDirection(Unit, Type, Inertia, Purpose, long,
	 *      float, float)
	 */
	public ViewDirection(){
		this(Unit.degrees,
			Type.absolute,
			Inertia.none,
			Purpose.interact,
			Time.currentTimeMillis(),
			0,
			0);
	}

	/**
	 * Creates a view direction that is parameterized by several attributes.
	 * 
	 * @param type
	 *            Whether the direction is absolute or relative
	 * @param inertia
	 *            Specifies whether as few or as many joints as possible shall
	 *            be used for the movement
	 * @param purpose
	 *            Specifies the intention of the gaze (e.g. scanning around or
	 *            showing attention)
	 * @param reference
	 *            the reference time stamp of the gaze
	 * @param unit
	 *            The view direction's unit (e.g. degrees or pixels)
	 * @param pan
	 *            Horizontal direction
	 * @param tilt
	 *            Vertical direction
	 */
	public ViewDirection(Unit unit, Type type, Inertia inertia,
			Purpose purpose, long reference, float pan, float tilt) {
		this.unit = unit;
		this.type = type;
		this.inertia = inertia;
		this.pan = pan;
		this.tilt = tilt;
		this.purpose = purpose;
		this.reference = reference;
	}

	/**
	 * Creates a view direction in the specified units. All other parameters
	 * fall back to default ones:
	 * <ul>
	 * <li>{@link Type#absolute}</li>
	 * <li>{@link Inertia#none}</li>
	 * <li>{@link Purpose#interact}</li>
	 * <li>{@link System#currentTimeMillis()}</li>
	 * 
	 * @param unit
	 *            The view direction's unit (e.g. degrees or pixels)
	 * @param pan
	 *            Horizontal direction
	 * @param tilt
	 *            Vertical direction
	 * @see ViewDirection#ViewDirection(Unit, Type, Inertia, Purpose, long,
	 *      float, float)
	 */
	public ViewDirection(Unit unit, float pan, float tilt) {
		this(unit, Type.absolute, Inertia.none, Purpose.interact, System
				.currentTimeMillis(), pan, tilt);
	}
	
	/**
	 * Creates a view direction by copying the values from the given instance.
	 */
	public ViewDirection(ViewDirection other) {
		this.unit = other.unit;
		this.type = other.type;
		this.inertia = other.inertia;
		this.pan = other.pan;
		this.tilt = other.tilt;
		this.purpose = other.purpose;
		this.reference = other.reference;
	}

	@Override
	public String toString() {
		return "ViewDirection[" + "type=" + type + ", " + "pan=" + pan + ", "
				+ "tilt=" + tilt + ", " + "unit=" + unit + ", " + "inertia="
				+ inertia + ", " + "purpose=" + purpose + ", " + "reference="
				+ reference + "]";
	}

	@Override
	public boolean equals(Object o) {
		if (super.equals(o)) {
			if (o instanceof ViewDirection) {
				ViewDirection vd = (ViewDirection) o;
				return this.unit == vd.unit && this.type == vd.type
						&& this.inertia == vd.inertia && this.pan == vd.pan
						&& this.tilt == vd.tilt;
			}
		}
		return false;
	}

	@Override
	public int hashCode() {
		int hash = 7;
		hash = 73 * hash + (this.type != null ? this.type.hashCode() : 0);
		hash = 73 * hash + (this.unit != null ? this.unit.hashCode() : 0);
		hash = 73 * hash + (this.inertia != null ? this.inertia.hashCode() : 0);
		hash = 73 * hash + (this.purpose != null ? this.purpose.hashCode() : 0);
		hash = 73 * hash + Float.floatToIntBits(this.pan);
		hash = 73 * hash + Float.floatToIntBits(this.tilt);
		hash = 73 * hash + (int) (this.reference ^ (this.reference >>> 32));
		return hash;
	}

}
