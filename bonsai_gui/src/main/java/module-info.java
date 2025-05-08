module de.unibi.citec.clf.bonsai.gui {
    requires javafx.controls;
    requires javafx.fxml;
    requires kotlin.stdlib;


    opens de.unibi.citec.clf.bonsai.gui to javafx.fxml;
    exports de.unibi.citec.clf.bonsai.gui;
}