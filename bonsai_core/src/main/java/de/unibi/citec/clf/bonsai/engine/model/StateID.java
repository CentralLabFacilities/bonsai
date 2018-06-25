package de.unibi.citec.clf.bonsai.engine.model;

import de.unibi.citec.clf.bonsai.core.exception.StateIDException;

import java.util.Arrays;
import java.util.LinkedList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * This class represents the semantics of a state id
 *
 * @author lruegeme
 *
 */
public class StateID {

    public static final String DEFAULT_SPLIT = "#";
    public static final String PACKAGE_SPLIT = ".";

    private String prefix;
    private String name;
    private List<String> hashes = new LinkedList<>();

    /**
     * Constructs a new instance.
     *
     * @param fullID The full id including full package prefix, skill class name and hashes.
     * @throws StateIDException
     */
    public StateID(String fullID) throws StateIDException {
        this.prefix = "";
        parseNameAndHashes(fullID);
    }

    /**
     * Constructs a new instance.
     *
     * @param prefix A package prefix.
     * @param canonicalID A canonical id including (partly) package prefix, skill class name and hashes.
     * @throws StateIDException
     */
    public StateID(String prefix, String canonicalID) throws StateIDException {

        setPrefix(prefix);
        parseNameAndHashes(canonicalID);
    }

    public StateID(Class<? extends AbstractSkill> skillClass, String name) {
        this.prefix = "";
        this.name = skillClass.getName();
        hashes.add(name);
    }

    /**
     * Constructs a new instance.
     *
     * @param prefix A package prefix.
     * @param skill A canonical skill name optionally including (partly) package prefix.
     * @param hashes The hashes.
     * @throws StateIDException
     */
    public StateID(String prefix, String skill, List<String> hashes)
            throws StateIDException {
        setPrefix(prefix);
        parseName(skill);
        this.hashes = hashes;
    }

    private void parseName(String name) throws StateIDException {
        if (name.startsWith(PACKAGE_SPLIT)) {
            throw new StateIDException("Name must not start with '.' "
                    + "(received: \"" + name + "\")");
        }

        if (name.contains(PACKAGE_SPLIT)) {
            int split = name.lastIndexOf(PACKAGE_SPLIT) + 1;
            setName(name.substring(split));
            setPrefix(prefix + name.substring(0, split));
        } else {
            setName(name);
        }
    }

    private void parseNameAndHashes(String id) throws StateIDException {

        String[] hparts = id.split(DEFAULT_SPLIT);
        String first = hparts[0];
        hashes.addAll(Arrays.asList(hparts).subList(1, hparts.length));

        parseName(first);
    }

    private void setPrefix(String prefix) throws StateIDException {
        if (!prefix.isEmpty()
                && (!prefix.endsWith(PACKAGE_SPLIT) || prefix
                .startsWith(PACKAGE_SPLIT))) {
            throw new StateIDException("prefix must not start, but "
                    + "must end with \'" + PACKAGE_SPLIT + "\'");
        }
        if (!prefix.isEmpty() && !prefix.matches("^[a-zA-Z0-9.]*$")) {
            throw new StateIDException("prefix must be a java package "
                    + "ending with \'" + PACKAGE_SPLIT + "\' (received: \""
                    + prefix + "\")");
        }
        this.prefix = prefix;
    }

    private void setName(String name) throws StateIDException {
        if (name.isEmpty() || !name.matches("^[a-zA-Z0-9]*$")) {
            throw new StateIDException("name must be a canonical class "
                    + "name (received: \"" + name + "\")");
        }
        this.name = name;
    }

    /**
     * Getter for the full id including skill class name and hashes.
     *
     * @return The full id including skill class name and hashes.
     */
    public String getFullID() {
        return prefix + getCanonicalID();
    }

    /**
     * Getter for the full class name of the skill WITHOUT hashes.
     *
     * @return The full class name of the skill without hashes.
     */
    public String getFullSkill() {
        return prefix + getCanonicalSkill();
    }

    /**
     * Getter for the canonical id including canonical class name and hashes.
     *
     * @return The canonical id including canonical class name and hashes.
     */
    public String getCanonicalID() {
        StringBuilder canonical = new StringBuilder(name);
        for (String hash : hashes) {
            canonical.append(DEFAULT_SPLIT).append(hash);
        }
        return canonical.toString();
    }

    /**
     * Getter for the canonical class name of the skill WITHOUT hashes.
     *
     * @return The canonical class name of the skill WITHOUT hashes.
     */
    public String getCanonicalSkill() {
        return name;
    }

    /**
     * Getter for the java package where the skill implementation resides.
     *
     * @return The java package where the skill implementation resides.
     */
    public String getPackagePrefix() {
        return prefix;
    }

    /**
     * Getter for a list of the hashes that are added to this id.
     *
     * @return A list of the hashes that are added to this id.
     */
    public List<String> getHashes() {
        return hashes;
    }

    public String getName() {
        return hashes.stream().collect(Collectors.joining(DEFAULT_SPLIT));
    }

    @Override
    public String toString() {
        return getFullID();
    }

    @Override
    public boolean equals(Object obj) {
        if (obj instanceof StateID) {
            StateID other = (StateID) obj;
            return other.getFullID().equals(this.getFullID());
        }
        return false;
    }

    @Override
    public int hashCode() {
        int hash = 7;
        hash = 47 * hash + (this.prefix != null ? this.prefix.hashCode() : 0);
        hash = 47 * hash + (this.name != null ? this.name.hashCode() : 0);
        hash = 47 * hash + (this.hashes != null ? this.hashes.hashCode() : 0);
        return hash;
    }

    public static StateID getUnknownState() {
        try {
            return new StateID("unknown");
        } catch (StateIDException e) {
            return null;
        }
    }
}
