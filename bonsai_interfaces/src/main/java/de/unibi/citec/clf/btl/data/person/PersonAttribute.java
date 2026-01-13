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

            return switch (postureLowerCase) {
                case "sitting" -> SITTING;
                case "standing" -> STANDING;
                case "lying" -> LYING;
                default -> null;
            };
        }

        public static Posture fromInteger(int x) {
            return switch (x) {
                case 1 -> SITTING;
                case 2 -> STANDING;
                case 3 -> LYING;
                default -> null;
            };
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
            gestureLowercase = gestureLowercase.replaceAll(" +", " ");

            return switch (gestureLowercase) {
                case "pointing left", "pointing to the left", "pointing_left", "1" -> POINTING_LEFT;
                case "pointing right", "pointing to the right", "pointing_right", "2" -> POINTING_RIGHT;
                case "raising left arm", "raising_left_arm", "3" -> RAISING_LEFT_ARM;
                case "raising right arm", "raising_right_arm", "4" -> RAISING_RIGHT_ARM;
                case "waving", "5" -> WAVING;
                case "neutral", "6" -> NEUTRAL;
                default -> null;
            };
        }

        public static Gesture fromInteger(int x) {
            return switch (x) {
                case 1 -> POINTING_LEFT;
                case 2 -> POINTING_RIGHT;
                case 3 -> RAISING_LEFT_ARM;
                case 4 -> RAISING_RIGHT_ARM;
                case 5 -> WAVING;
                case 6 -> NEUTRAL;
                default -> null;
            };
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

            return switch (genderLowerCase) {
                case "male" -> MALE;
                case "female" -> FEMALE;
                case "unknown" -> UNKNOWN;
                default -> null;
            };
        }

        public static Gender fromInteger(int x) {
            return switch (x) {
                case 1 -> MALE;
                case 2 -> FEMALE;
                case 3 -> UNKNOWN;
                default -> null;
            };
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

            return switch (colorLowerCase) {
                case "red" -> RED;
                case "blue" -> BLUE;
                case "orange" -> ORANGE;
                case "yellow" -> YELLOW;
                case "green" -> GREEN;
                case "purple" -> PURPLE;
                case "black" -> BLACK;
                case "white" -> WHITE;
                case "grey" -> GREY;
                default -> null;
            };
        }

        public static Shirtcolor fromInteger(int x) {
            return switch (x) {
                case 1 -> RED;
                case 2 -> BLUE;
                case 3 -> ORANGE;
                case 4 -> YELLOW;
                case 5 -> GREEN;
                case 6 -> PURPLE;
                case 7 -> BLACK;
                case 8 -> WHITE;
                case 9 -> GREY;
                default -> null;
            };
        }
    }

    protected Logger logger = Logger.getLogger(this.getClass());

    public Gesture getMostCharacteristicGesture(){
        if (!gestures.isEmpty()) {
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
        if (age.isEmpty()) {
            return 0;
        }else if(age.contains("-")){
            return Integer.parseInt(age.split("-")[0]);
        }else{
            return Integer.parseInt(age);
        }
    }
    public int getAgeTo() {
        if (age.isEmpty()) {
            return 100;
        }else if(age.contains("-")){
            return Integer.parseInt(age.split("-")[1]);
        }else{
            return Integer.parseInt(age);
        }
    }


}
