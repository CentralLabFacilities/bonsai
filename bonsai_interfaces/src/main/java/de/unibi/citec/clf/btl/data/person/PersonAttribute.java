package de.unibi.citec.clf.btl.data.person;

import de.unibi.citec.clf.btl.Type;
import org.apache.log4j.Logger;

import java.util.List;

/**
 * The Body class stores information about Body hypothesis coming from openpose.
 *
 * @author jkummert
 * @author rfeldhans
 */
public class PersonAttribute extends Type {

    private List<Gesture> gestures;
    private Posture posture;
    private Gender gender;
    private Shirtcolor shirtcolor;
    private String age;

    public enum Posture {
        SITTING(1, "sitting"),
        STANDING(2, "standing"),
        LYING(3, "lying");

        private final int poseId;
        private final String postureName;

        Posture(int value, String name) {
            this.postureName = name;
            this.poseId = value;
        }

        public String getPostureName() {
            return postureName;
        }

        public static Posture fromString(String postureName){
            String postureLowerCase = postureName.toLowerCase();

            switch (postureLowerCase) {
                case "sitting":
                    return SITTING;
                case "standing":
                    return STANDING;
                case "lying":
                    return LYING;
            }
            return null;
        }

        public static Posture fromInteger(int x) {
            switch(x) {
                case 1:
                    return SITTING;
                case 2:
                    return STANDING;
                case 3:
                    return LYING;
            }
            return null;
        }
    }

    public enum Gesture {
        POINTING_LEFT(1, "pointing left"),
        POINTING_RIGHT(2, "pointing right"),
        RAISING_LEFT_ARM(3, "raising left arm"),
        RAISING_RIGHT_ARM(4, "raising right arm"),
        WAVING(5, "waving"),
        NEUTRAL(6, "neutral"),
        POINTING_LEFT_DOWN(7, "pointing_left_down"),
        POINTING_RIGHT_DOWN(8, "pointing_right_down");

        private final int gestureId;
        private final String gestureName;

        Gesture(int value, String name) {
            this.gestureName = name;
            this.gestureId = value;
        }

        public String getGestureName() {
            return gestureName;
        }

        public static Gesture fromString(String gestureName){

            String gestureLowercase = gestureName.toLowerCase();

            switch (gestureLowercase) {
                case "pointing left": case "pointing to the left":
                    return POINTING_LEFT;
                case "pointing right": case "pointing to the right":
                    return POINTING_RIGHT;
                case "raising left arm":
                    return RAISING_LEFT_ARM;
                case "raising right arm":
                    return RAISING_RIGHT_ARM;
                case "waving":
                    return WAVING;
                case "neutral":
                    return NEUTRAL;
            }
            return null;
        }

        public static Gesture fromInteger(int x) {
            switch(x) {
                case 1:
                    return POINTING_LEFT;
                case 2:
                    return POINTING_RIGHT;
                case 3:
                    return RAISING_LEFT_ARM;
                case 4:
                    return RAISING_RIGHT_ARM;
                case 5:
                    return WAVING;
                case 6:
                    return NEUTRAL;
            }
            return null;
        }
    }

    public enum Gender {
        MALE(1, "male"),
        FEMALE(2, "female"),
        UNKNOWN(3, "unknown");

        private final int genderId;
        private final String genderName;

        Gender(int value, String name) {
            this.genderName = name;
            this.genderId = value;
        }

        public String getGenderName() {
            return genderName;
        }

        public static Gender fromString(String genderName){

            String genderLowerCase = genderName.toLowerCase();

            switch (genderLowerCase) {
                case "male":
                    return MALE;
                case "female":
                    return FEMALE;
                case "unknown":
                    return UNKNOWN;
            }
            return null;
        }

        public static Gender fromInteger(int x) {
            switch(x) {
                case 1:
                    return MALE;
                case 2:
                    return FEMALE;
                case 3:
                    return UNKNOWN;
            }
            return null;
        }
    }
    public enum Shirtcolor {
        RED(1, "red"),
        BLUE(2, "blue"),
        ORANGE(3, "orange"),
        YELLOW(4, "yellow"),
        GREEN(5, "green"),
        PURPLE(6, "purple"),
        BLACK(7, "black"),
        WHITE(8, "white"),
        GREY(9, "grey");

        private final int colorId;
        private final String colorName;

        Shirtcolor(int value, String name) {
            this.colorName = name;
            this.colorId = value;
        }

        public String getColorName() {
            return colorName;
        }
        public static Shirtcolor fromString(String colorName){

            String colorLowerCase = colorName.toLowerCase();

            switch (colorLowerCase) {
                case "red":
                    return RED;
                case "blue":
                    return BLUE;
                case "orange":
                    return ORANGE;
                case "yellow":
                    return YELLOW;
                case "green":
                    return GREEN;
                case "purple":
                    return PURPLE;
                case "black":
                    return BLACK;
                case "white":
                    return WHITE;
                case "grey":
                    return GREY;
            }
            return null;
        }

        public static Shirtcolor fromInteger(int x) {
            switch(x) {
                case 1:
                    return RED;
                case 2:
                    return BLUE;
                case 3:
                    return ORANGE;
                case 4:
                    return YELLOW;
                case 5:
                    return GREEN;
                case 6:
                    return PURPLE;
                case 7:
                    return BLACK;
                case 8:
                    return WHITE;
                case 9:
                    return GREY;
            }
            return null;
        }
    }

    protected Logger logger = Logger.getLogger(this.getClass());

    public Gesture getMostCharacteristicGesture(){
        if(gestures.size()>0) {
            if (gestures.contains(Gesture.WAVING)) {
                return Gesture.WAVING;
            } else if (gestures.contains(Gesture.RAISING_LEFT_ARM)) {
                return Gesture.RAISING_LEFT_ARM;
            } else if (gestures.contains(Gesture.RAISING_RIGHT_ARM)) {
                return Gesture.RAISING_RIGHT_ARM;
            } else if (gestures.contains(Gesture.POINTING_LEFT)) {
                return Gesture.POINTING_LEFT;
            } else if (gestures.contains(Gesture.POINTING_RIGHT)) {
                return Gesture.POINTING_RIGHT;
            }
        }
        return Gesture.NEUTRAL;
    }

    public List<Gesture> getGestures() {
        return gestures;
    }
    public void setGestures(List<Gesture> gestures) {
        this.gestures = gestures;
    }

    public Posture getPosture() {
        return posture;
    }
    public void setPosture(Posture posture) {
        this.posture = posture;
    }

    public Gender getGender() {
        return gender;
    }
    public void setGender(Gender gender) {
        this.gender = gender;
    }

    public Shirtcolor getShirtcolor() {
        return shirtcolor;
    }
    public void setShirtcolor(Shirtcolor shirtcolor) {
        this.shirtcolor = shirtcolor;
    }

    public String getAge() {
        return age;
    }
    public void setAge(String age) {
        this.age = age;
    }

    public int getAgeFrom() {
        if(age.equals("")){
            return 0;
        }else if(age.contains("-")){
            return Integer.parseInt(age.split("-")[0]);
        }else{
            return Integer.parseInt(age);
        }
    }
    public int getAgeTo() {
        if(age.equals("")){
            return 100;
        }else if(age.contains("-")){
            return Integer.parseInt(age.split("-")[1]);
        }else{
            return Integer.parseInt(age);
        }
    }


}
