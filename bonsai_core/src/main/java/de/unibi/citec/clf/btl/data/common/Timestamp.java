package de.unibi.citec.clf.btl.data.common;



import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Objects;

import de.unibi.citec.clf.btl.units.TimeUnit;
import de.unibi.citec.clf.btl.units.UnitConverter;

/**
 * Domain class representing a timestamp with several parsing methods.
 * 
 * @author jwienke
 * @author unknown
 */
public class Timestamp {

	protected Date created;
	protected Date updated;

	protected TimeUnit iTU = TimeUnit.MILLISECONDS;

	/**
	 * Creates a timestamp with the current system time as updated and created.
	 */
	public Timestamp() {
		final long currentTime = System.currentTimeMillis();
		this.created = new Date(currentTime);
		this.updated = new Date(currentTime);
	}

	/**
	 * Uses the given time for update and creation time.
	 * 
	 * @param created
	 *            unix timestamp in milliseconds
	 */
	public Timestamp(long created, TimeUnit unit) {
		this.created = new Date(UnitConverter.convert(created, unit, iTU));
		this.updated = new Date(UnitConverter.convert(created, unit, iTU));
	}

	public Timestamp(long created, long updated, TimeUnit unit) {
		this.created = new Date(UnitConverter.convert(created, unit, iTU));
		this.updated = new Date(UnitConverter.convert(updated, unit, iTU));
	}

	public Timestamp(Timestamp t) {
		this.created = t.created;
		this.updated = t.updated;
	}

	/**
	 * Uses the given time value for last updated time.
	 * 
	 * @param updated
	 *            unix timestamp in milliseconds
	 */
	public void setUpdated(long updated, TimeUnit unit) {
		this.updated = new Date(UnitConverter.convert(updated, unit, iTU));
	}

	public Date getUpdated() {
		return updated;
	}

	public long getUpdated(TimeUnit unit) {
		return UnitConverter.convert(updated.getTime(), iTU, unit);
	}

	/**
	 * Uses the given time value for creation time.
	 * 
	 * @param created
	 *            unix timestamp in milliseconds
	 */
	public void setCreated(long created, TimeUnit unit) {
		this.created = new Date(UnitConverter.convert(created, unit, iTU));
	}

	public Date getCreated() {
		return created;
	}

	public long getCreated(TimeUnit unit) {
		return UnitConverter.convert(created.getTime(), iTU, unit);
	}

	@Override
	public String toString() {
		SimpleDateFormat fmt = new SimpleDateFormat("HH:mm:ss.SSS d.M.y");
		return "created = " + fmt.format(created) + " [" + created.getTime()
				+ "], updated = " + fmt.format(updated) + " ["
				+ updated.getTime() + "]";
	}

	@Override
	public int hashCode() {

		return Objects.hash(created, updated, iTU);
	}

	@Override

	public boolean equals(Object other) {

		if (!(other instanceof Timestamp)) {
			return false;
		}
		Timestamp otherTimestamp = (Timestamp) other;

		return (created.equals(otherTimestamp.created))
				&& (updated.equals(otherTimestamp.updated));

	}

}
