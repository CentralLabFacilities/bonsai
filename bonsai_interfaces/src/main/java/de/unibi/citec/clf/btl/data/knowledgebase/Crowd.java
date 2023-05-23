package de.unibi.citec.clf.btl.data.knowledgebase;

import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.Type;

import java.util.Objects;

import de.unibi.citec.clf.btl.data.person.PersonAttribute;
import de.unibi.citec.clf.btl.data.person.PersonData;


/**
 *
 * @author rfeldhans
 */
@Deprecated
public class Crowd extends Type {

    private List<PersonData> persons;

    public List<PersonData> getPersons() {
        return persons;
    }

    public void setPersons(List<PersonData> persons) {
        this.persons = persons;
    }

    public List<PersonData> getPersonsWithSpecificShirtColor(PersonAttribute.Shirtcolor color, List<PersonData> toFilter) {
        List<PersonData> list = new List<>(PersonData.class);
        for (PersonData pers : toFilter) {
            if (color == pers.getPersonAttribute().getShirtcolor()) {
                list.add(pers);
            }
        }
        return list;
    }
    
    public int getMaleCount(List<PersonData> toFilter) {
        List<PersonData> list = new List<>(PersonData.class);
        for (PersonData pers : toFilter) {
            if (pers.getPersonAttribute().getGender() == PersonAttribute.Gender.MALE) {
                list.add(pers);
            }
        }
        return list.size();
    }
    public int getFemaleCount(List<PersonData> toFilter) {
        List<PersonData> list = new List<>(PersonData.class);
        for (PersonData pers : toFilter) {
            if (pers.getPersonAttribute().getGender() == PersonAttribute.Gender.FEMALE) {
                list.add(pers);
            }
        }
        return list.size();
    }
    

    public List<PersonData> getPersonsWithSpecificPose(PersonAttribute.Posture posture, List<PersonData> toFilter) {
        List<PersonData> list = new List<>(PersonData.class);
        for (PersonData pers : toFilter) {
            if (posture == pers.getPersonAttribute().getPosture()) {
                list.add(pers);
            }
        }
        return list;
    }

    public List<PersonData> getPersonsWithSpecificGesture(PersonAttribute.Gesture gesture, List<PersonData> toFilter) {
        List<PersonData> list = new List<>(PersonData.class);
        for (PersonData pers : toFilter) {
            if (pers.getPersonAttribute().getGestures().contains(gesture)) {
                list.add(pers);
            }
        }
        return list;
    }

    public List<PersonData> filterSpecificPersons(String kind, List<PersonData> toFilter) {
        List<PersonData> list = new List<>(PersonData.class);
        int agemin = 10000;
        int agemax = -1;
        PersonAttribute.Gender gender = PersonAttribute.Gender.UNKNOWN;
        switch (kind) {
            case "children":
                agemax = 16;
                break;
            case "adults":
                agemin = 17;
                agemax = 55;
                break;
            case "elders":
                agemin = 56;
                break;
            case "male":
            case "males":
                gender = PersonAttribute.Gender.MALE;
                break;
            case "female":
            case "females":
                gender = PersonAttribute.Gender.FEMALE;
                break;
            case "man":
            case "men":
                gender = PersonAttribute.Gender.MALE;
                break;
            case "woman":
            case "women":
                gender = PersonAttribute.Gender.FEMALE;
                break;
            case "boy":
            case "boys":
                gender = PersonAttribute.Gender.MALE;
                agemax = 16;
                break;
            case "girl":
            case "girls":
                gender = PersonAttribute.Gender.FEMALE;
                agemax = 16;
                break;
            default:
                break;
        }
        for (PersonData pers : toFilter) {
            if(agemax > -1  || agemin < 10000){
                try{
                    if(pers.getPersonAttribute().getAgeFrom() > agemax || pers.getPersonAttribute().getAgeTo() < agemin){
                        continue;
                    }
                }catch(NumberFormatException e){
                    continue;
                }
            }
            if ((gender == PersonAttribute.Gender.UNKNOWN || pers.getPersonAttribute().getGender() == gender)) {
                list.add(pers);
            }
        }

        return list;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Crowd)) return false;
        if (!super.equals(o)) return false;
        Crowd crowd = (Crowd) o;
        return Objects.equals(persons, crowd.persons);
    }

    @Override
    public int hashCode() {
        int hash = 7;
        hash = 11 * hash + Objects.hashCode(this.persons);
        return hash;
    }

}
