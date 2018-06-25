package de.unibi.citec.clf.bonsai.util;


import java.awt.image.BufferedImage;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.logging.Level;
import javax.imageio.ImageIO;
import org.apache.log4j.Logger;

/**
 * Class provides methods to create an emergency report.
 *
 * @author ikillman, kharmening, llach
 */
public class PdfWriter {
/*
    private static Logger logger = Logger.getLogger(PdfWriter.class);

    /**
     * Creates a new LaTex-file to write the report if the file already exists,
     * we skip it.
     *
     * @param path The path, where the file is created.
     * @return true, if file successfully created or already exists.
     * /
    public static boolean createTexFile(String path, String headline) {

        File emergencyReport = new File(path);
        if (!emergencyReport.exists()) {
            try {
                emergencyReport.createNewFile();
            } catch (IOException ex) {
                ex.printStackTrace();
                return false;
            }
        }

        try (FileWriter writer = new FileWriter(emergencyReport)) {
            writer.write("\\documentclass{article}\n"
                    + "\\usepackage[english]{babel}\n"
                    + "\\usepackage{fancyhdr}\n"
                    + "\\pagestyle{fancy}\n"
                    + "\\fancyhead{}\n"
                    + "\\fancyhead[L]{\\small{" + headline + "}}\n"
                    + "\\fancyhead[R]{\\small{Team ToBI}}\n"
                    + "\\renewcommand{\\headrulewidth}{0pt}\n"
                    + "\\usepackage{anysize}\n"
                    + "\\usepackage{tikz,pgfplots}\n"
                    + "\\usetikzlibrary{calc}\n"
                    + "\\pgfplotsset{compat=1.3}\n"
                    + "\\newlength\\imagewidth\n"
                    + "\\newlength\\imagescale\n"
                    + "\\marginsize{25mm}{25mm}{15mm}{15mm}\n"
                    + "\\usepackage{graphicx}\n"
                    + "\\setlength{\\parindent}{0pt}\n"
                    + "\\begin{document}\n");
            writer.flush();
            writer.close();
        } catch (IOException ex) {
            ex.printStackTrace();
            return false;
        }
        return true;

    }

    public static boolean createTexFileCourier(String path) {

        File emergencyReport = new File(path);
        if (!emergencyReport.exists()) {
            try {
                emergencyReport.createNewFile();
            } catch (IOException ex) {
                ex.printStackTrace();
                return false;
            }
        }

        try (FileWriter writer = new FileWriter(emergencyReport)) {
            writer.write("\\documentclass{article}\n"
                    + "\\usepackage[ngerman]{babel}\n"
                    + "\\usepackage[T1]{fontenc}\n"
                    + "\\usepackage[utf8x]{inputenc}"
                    + "\\renewcommand{\\headrulewidth}{0pt}\n"
                    + "\\usepackage{anysize}\n"
                    + "\\marginsize{25mm}{25mm}{15mm}{15mm}\n"
                    + "\\usepackage{graphicx}\n"
                    + "\\setlength\\parindent{0pt}\n"
                    + "\\begin{document}\n"
                    + "\\tt\n");
            writer.flush();
            writer.close();
        } catch (IOException ex) {
            ex.printStackTrace();
            return false;
        }
        return true;

    }

    /**
     * Closes the LaTex-file, converts it to a PDF and copies it to USB. Copying
     * to USB was moved here and is made relative (no hardcoded paths anymore!).
     * If there are many devices pugged in, its copied to the first.
     *
     * Also, the unnecessary files are deleted after writing the PDF.
     *
     * @param path The LaTex-file.
     * @param outputPath Where the PDF is created.
     * @return true, if PDF successfully created.
     * /
    public static boolean createPDFFile(String path, String outputPath) {

        String command = "cp " + path + " " + path + "2";

        if (systemExecute(command, false).equals("0")) {
            return false;
        }

        File report = new File(path + "2");
        File nwe = new File(path);

        try (FileWriter writer = new FileWriter(report, true)) {
            writer.append("\n\\end{document}\n");
            writer.flush();
            writer.close();
        } catch (IOException ex) {
            ex.printStackTrace();
            return false;
        }

        String pathToPDF = path.replace("tex", "pdf");
        String pathToTempPDF = pathToPDF.replace(".pdf", System.currentTimeMillis() + ".pdf");
        File pdfMain = new File(pathToPDF);
        if (pdfMain.exists() && pdfMain.getTotalSpace() > 0) {
            try {
                Runtime.getRuntime().exec("cp " + pathToPDF + " "
                        + pathToTempPDF);
            } catch (IOException ex) {
                ex.printStackTrace();
            }
        }

        command = "pdflatex -halt-on-error -output-directory=" + outputPath + " " + path + "2";
        Process proc;
        Runtime run = Runtime.getRuntime();
        logger.trace("executed command: " + command);
        try {
            proc = run.exec(command);
        } catch (IOException ex) {
            ex.printStackTrace();
            return false;
        }
        InputStream inStr = proc.getInputStream();
        BufferedReader buff = new BufferedReader(new InputStreamReader(inStr));
        String str;
        try {
            while ((str = buff.readLine()) != null) {
                logger.trace(str);
            }
        } catch (IOException ex) {
            ex.printStackTrace();
        }
        try {
            proc.waitFor();
        } catch (InterruptedException ex) {
            java.util.logging.Logger.getLogger(PdfWriter.class.getName()).log(Level.SEVERE, null, ex);
        }

        Path p1 = Paths.get(pathToTempPDF);
        Path p2 = Paths.get(path + "2");

        logger.debug("############### beginning to clean ################");
        try {
            logger.debug("cleaning now ...");
            Files.deleteIfExists(p1);
            Files.deleteIfExists(p2);
            System.out.println("Deleting " + p2.toFile().getAbsolutePath());
            //Runtime.getRuntime().exec(new String[]{"sh", "-c", "rm /tmp/*.png"});
            Runtime.getRuntime().exec(new String[]{"sh", "-c", "rm /tmp/*.ppm"});
            //      System.out.println("############ rm: " + systemExecute("/bin/sh -c rm /tmp/*.png", true));
            //    System.out.println("############ rm: " + systemExecute("/bin/sh -c rm /tmp/*.png", true));
        } catch (IOException ex) {
            logger.debug("cleaning failed");
            java.util.logging.Logger.getLogger(PdfWriter.class.getName()).log(Level.SEVERE, null, ex);
        }

        String username = System.getProperty("user.name");
        String ret = systemExecute("ls /media/" + username + "/", true).split("\n")[0];

        String untouchedFileName = path.replaceAll(".*\\/(.*).tex", "$1.pdf");
        String newPath = "/media/" + username + "/" + ret + "/" + untouchedFileName;
        // String newPath = "/media/" + username + "/" + ret + "/ToBi_Manipulation_Report_" + System.currentTimeMillis() + ".pdf";
        if ("".equals(ret)) {
            logger.debug("No USB device found, therefore nothing will be copied.");
        } else {
            try {
                logger.debug("trying to copy now");
                Files.copy(Paths.get(pathToPDF), Paths.get(newPath), StandardCopyOption.REPLACE_EXISTING);
            } catch (IOException ex) {
                logger.debug("copying to USB failed");
                java.util.logging.Logger.getLogger(PdfWriter.class.getName()).log(Level.SEVERE, null, ex);
            }
        }

        return true;
    }

    /**
     * Writes in the existing LaTex-file
     *
     * @param text this text
     * @return true, if written successfully.
     * /
    public static boolean writeTextInFile(String inputpath, String text) {
        File report = new File(inputpath);

        try (FileWriter writer = new FileWriter(report, true)) {
            writer.write(text);
            writer.write("\n\n");
            writer.flush();
            writer.close();
        } catch (IOException ex) {
            ex.printStackTrace();
            return false;
        }

        return true;
    }

    public static boolean writeTitleInFile(String inputpath, String text) {
        File report = new File(inputpath);

        try (FileWriter writer = new FileWriter(report, true)) {
            writer.write("\\section*{" + text + "}");
            writer.write("\n\n");
            writer.flush();
            writer.close();
        } catch (IOException ex) {
            ex.printStackTrace();
            return false;
        }

        return true;
    }

    public static boolean writeTextInFileWithoutNewline(String inputpath, String text) {
        File report = new File(inputpath);

        try (FileWriter writer = new FileWriter(report, true)) {
            writer.write(text);
            writer.write("\n");
            writer.flush();
            writer.close();
        } catch (IOException ex) {
            ex.printStackTrace();
            return false;
        }

        return true;
    }

    public static boolean addHeadline(String inputpath, String title) {
        File report = new File(inputpath);
        try (FileWriter writer = new FileWriter(report, true)) {
            writer.write("\\section*{" + title + "}\n");
            writer.flush();
            writer.close();
        } catch (IOException ex) {
            ex.printStackTrace();
            return false;
        }
        return true;
    }

    public static boolean addImage(String inputpath, String name) {
        File report = new File(inputpath);

        try (FileWriter writer = new FileWriter(report, true)) {
            writer.write("\\includegraphics[width=\\textwidth]{" + name + "}\n");
            writer.flush();
        } catch (IOException ex) {
            ex.printStackTrace();
            return false;
        }
        return true;
    }


    public static boolean addImageWithPolygon(String inputpath, String name, Polygon poly, String label, double scale) {
        File report = new File(inputpath);
        BufferedImage bimg;
        int imgWidth = 640;
        try {
            bimg = ImageIO.read(new File(name));
            imgWidth = bimg.getWidth();
        } catch (IOException e) {
            e.printStackTrace();
            return false;
        }

        logger.debug("Poly: " + poly + " " + poly.getAwtPolygon().npoints);

        try (FileWriter writer = new FileWriter(report, true)) {
            writer.write("\\pgfmathsetlength{\\imagewidth}{" + scale + "\\textwidth}\n");
            writer.write("\\pgfmathsetlength{\\imagescale}{\\imagewidth/" + imgWidth + "}\n");
            writer.write("\\begin{tikzpicture}[x=\\imagescale,y=-\\imagescale]\n");
            writer.write("\\node[anchor=north west,inner sep=0] at (0,0) {\\includegraphics[width=\\imagewidth]{" + name + "}};\n");

            int xBegin = poly.getAwtPolygon().xpoints[0];
            int yBegin = poly.getAwtPolygon().ypoints[0];
            for (int i = 0; i < poly.getAwtPolygon().npoints; i++) {
                int xFrom = poly.getAwtPolygon().xpoints[i];
                int yFrom = poly.getAwtPolygon().ypoints[i];
                int xTo = xBegin;
                int yTo = yBegin;
                if (i != poly.getAwtPolygon().npoints - 1) {
                    xTo = poly.getAwtPolygon().xpoints[i + 1];
                    yTo = poly.getAwtPolygon().ypoints[i + 1];
                }
                writer.write("\\draw[red,thick] (" + xFrom + "," + yFrom + ") -- (" + xTo + "," + yTo + ");\n");
            }
            writer.write("\\node[anchor=south west,draw,red,thick,align=left,inner sep=2pt,font=\\bfseries] at (" + xBegin + "," + yBegin + ") {" + label + "};\n");
            writer.write("\\end{tikzpicture}\n");
            writer.write("\n\n");
            writer.flush();
        } catch (IOException ex) {
            ex.printStackTrace();
            return false;
        }
        return true;
    }

    public static String getImageWithPolygonString(String name, Polygon poly, String label, double scale) {
        BufferedImage bimg;
        int imgWidth = 640;
        try {
            bimg = ImageIO.read(new File(name));
            imgWidth = bimg.getWidth();
        } catch (IOException e) {
            e.printStackTrace();
            return "";
        }

        logger.debug("Poly: " + poly + " " + poly.getAwtPolygon().npoints);

        String texStr = "";
        texStr = texStr + ("\\pgfmathsetlength{\\imagewidth}{" + scale + "\\textwidth}\n");
        texStr = texStr + ("\\pgfmathsetlength{\\imagescale}{\\imagewidth/" + imgWidth + "}\n");
        texStr = texStr + ("\\begin{tikzpicture}[x=\\imagescale,y=-\\imagescale]\n");
        texStr = texStr + ("\\node[anchor=north west,inner sep=0] at (0,0) {\\includegraphics[width=\\imagewidth]{" + name + "}};\n");

        int xBegin = poly.getAwtPolygon().xpoints[0];
        int yBegin = poly.getAwtPolygon().ypoints[0];
        for (int i = 0; i < poly.getAwtPolygon().npoints; i++) {
            int xFrom = poly.getAwtPolygon().xpoints[i];
            int yFrom = poly.getAwtPolygon().ypoints[i];
            int xTo = xBegin;
            int yTo = yBegin;
            if (i != poly.getAwtPolygon().npoints - 1) {
                xTo = poly.getAwtPolygon().xpoints[i + 1];
                yTo = poly.getAwtPolygon().ypoints[i + 1];
            }
            texStr = texStr + ("\\draw[red,thick] (" + xFrom + "," + yFrom + ") -- (" + xTo + "," + yTo + ");\n");
        }
        texStr = texStr + ("\\node[anchor=south west,draw,red,thick,align=left,inner sep=2pt,font=\\bfseries] at (" + xBegin + "," + yBegin + ") {" + label + "};\n");
        texStr = texStr + ("\\end{tikzpicture}\n");
        texStr = texStr + ("\n\n");

        return texStr;
    }

    /**
     * Removes a section from a given file
     *
     * @param inputpath path to LaTeX-File
     * @param beginSection String that marks the beginning of the section to be
     * removed
     * @param endSection String that marks the end of the section to be removed
     * @return the removed part in between the begin an end-section
     * /
    public static String removeSection(String inputpath, String beginSection, String endSection) {
        File report = new File(inputpath);
        File tmp_report = new File(inputpath + "_tmp");
        String ret = "";
        try {
            BufferedReader reader = new BufferedReader(new FileReader(report));
            FileWriter writer = new FileWriter(tmp_report, true);

            String line;
            int mode = 0; // 0=searching for beginning, 1=searching for end, 2=done
            while ((line = reader.readLine()) != null) {
                switch (mode) {
                    case 0:
                        if (line.contains(beginSection)) {
                            mode = 1;
                            if (!line.startsWith(beginSection)) {
                                // WRITE THE PART BEFORE THE SECTION
                                writer.write(line.substring(0, line.indexOf(beginSection)) + "\n");
                                writer.flush();
                            }
                            if (!line.endsWith(beginSection)) {
                                ret = ret.concat(line.substring(line.indexOf(beginSection) + beginSection.length()) + "\n");
                            }
                        } else {
                            writer.write(line + "\n");
                            writer.flush();
                        }
                        break;
                    case 1:
                        if (line.contains(endSection)) {
                            mode = 2;
                            if (!line.endsWith(endSection)) {
                                //WRITE THE PART BEFORE THE SECTION
                                writer.write(line.substring(line.indexOf(endSection) + endSection.length()) + "\n");
                                writer.flush();
                            }
                            if (!line.startsWith(endSection)) {
                                ret = ret.concat(line.substring(0, line.indexOf(endSection)) + "\n");
                            }
                        } else {
                            ret = ret.concat(line + "\n");
                        }
                        break;
                    case 2:
                        writer.write(line + "\n");
                        writer.flush();
                        break;
                }
            }

            writer.close();
            reader.close();

            if (!(report.delete() && tmp_report.renameTo(report))) {
                throw new IOException("Error while modifiying '" + inputpath + "'");
            }

        } catch (FileNotFoundException ex) {
            java.util.logging.Logger.getLogger(PdfWriter.class.getName()).log(Level.SEVERE, null, ex);
            ex.printStackTrace();
            return "";
        } catch (IOException ex) {
            java.util.logging.Logger.getLogger(PdfWriter.class.getName()).log(Level.SEVERE, null, ex);
            ex.printStackTrace();
            return "";
        }

        return ret;
    }

    public static boolean addImageWithPolygonsAndLegend(String inputpath, String name, List<Polygon> polygonList) {
        File report = new File(inputpath);
        BufferedImage bimg;
        int imgWidth = 640;
        try {
            bimg = ImageIO.read(new File(name));
            imgWidth = bimg.getWidth();
        } catch (IOException e) {
            e.printStackTrace();
            return false;
        }

        int OBJECT_REF = 0;
        try (FileWriter writer = new FileWriter(report, true)) {

            writer.write("\\begin{minipage}[h]{0.7\\columnwidth}\n");
            
            writer.write("\\pgfmathsetlength{\\imagewidth}{\\textwidth}\n");
            writer.write("\\pgfmathsetlength{\\imagescale}{\\imagewidth/" + imgWidth + "}\n");
            writer.write("\\begin{tikzpicture}[x=\\imagescale,y=-\\imagescale]\n");
            writer.write("\\node[anchor=north west,inner sep=0] at (0,0) {\\includegraphics[width=\\imagewidth]{" + name + "}};\n");
            for (Polygon poly : polygonList) {
                OBJECT_REF++;
                String color = poly.getColor().toString();
                int xBegin = poly.getAwtPolygon().xpoints[0];
                int yBegin = poly.getAwtPolygon().ypoints[0];
                for (int i = 0; i < poly.getAwtPolygon().npoints; i++) {
                    int xFrom = poly.getAwtPolygon().xpoints[i];
                    int yFrom = poly.getAwtPolygon().ypoints[i];
                    int xTo = xBegin;
                    int yTo = yBegin;
                    if (i != poly.getAwtPolygon().npoints - 1) {
                        xTo = poly.getAwtPolygon().xpoints[i + 1];
                        yTo = poly.getAwtPolygon().ypoints[i + 1];
                    }
                    writer.write("\\draw[" + color + ",thick] (" + xFrom + "," + yFrom + ") -- (" + xTo + "," + yTo + ");\n");
                }
                writer.write("\\node[anchor=south west,draw," + color + ",thick,align=left,inner sep=2pt, fill=white, font=\\bfseries] at (" + xBegin + "," + yBegin + ") {" + String.valueOf(OBJECT_REF) + "};\n");
            }
            writer.write("\\end{tikzpicture}\n");
            writer.write("\n\n");
            
            
            
            writer.write("\\end{minipage}\\hspace*{0.01\\columnwidth}\n");
            writer.write("\\begin{minipage}[h]{0.3\\columnwidth}\n");
            writer.write("        \\begin{itemize}\n");
            OBJECT_REF=0;
            for (Polygon poly : polygonList) {
                OBJECT_REF++;
            writer.write("          \\item "+OBJECT_REF+": "+poly.getLabel()+"\n");
            }
            writer.write("        \\end{itemize}\n");
            writer.write("\\end{minipage}\\vspace{1.3ex}");

            writer.flush();
        } catch (IOException ex) {
            ex.printStackTrace();
            return false;
        }
        return true;

    }

    public static boolean addImageWithMultiplePolygon(String inputpath, String name, List<Polygon> polygonList, double scale) {
        File report = new File(inputpath);
        BufferedImage bimg;
        int imgWidth = 640;
        try {
            bimg = ImageIO.read(new File(name));
            imgWidth = bimg.getWidth();
        } catch (IOException e) {
            e.printStackTrace();
            return false;
        }

        try (FileWriter writer = new FileWriter(report, true)) {
            writer.write("\\pgfmathsetlength{\\imagewidth}{" + scale + "\\textwidth}\n");
            writer.write("\\pgfmathsetlength{\\imagescale}{\\imagewidth/" + imgWidth + "}\n");
            writer.write("\\begin{tikzpicture}[x=\\imagescale,y=-\\imagescale]\n");
            writer.write("\\node[anchor=north west,inner sep=0] at (0,0) {\\includegraphics[width=\\imagewidth]{" + name + "}};\n");
            for (Polygon poly : polygonList) {
                String color = poly.getColor().toString();
                int xBegin = poly.getAwtPolygon().xpoints[0];
                int yBegin = poly.getAwtPolygon().ypoints[0];
                for (int i = 0; i < poly.getAwtPolygon().npoints; i++) {
                    int xFrom = poly.getAwtPolygon().xpoints[i];
                    int yFrom = poly.getAwtPolygon().ypoints[i];
                    int xTo = xBegin;
                    int yTo = yBegin;
                    if (i != poly.getAwtPolygon().npoints - 1) {
                        xTo = poly.getAwtPolygon().xpoints[i + 1];
                        yTo = poly.getAwtPolygon().ypoints[i + 1];
                    }
                    writer.write("\\draw[" + color + ",thick] (" + xFrom + "," + yFrom + ") -- (" + xTo + "," + yTo + ");\n");
                }
                writer.write("\\node[anchor=south west,draw," + color + ",thick,align=left,inner sep=2pt,font=\\bfseries] at (" + xBegin + "," + yBegin + ") {" + poly.getLabel() + "};\n");
            }
            writer.write("\\end{tikzpicture}\n");
            writer.write("\n\n");
            writer.flush();
        } catch (IOException ex) {
            ex.printStackTrace();
            return false;
        }
        return true;
    }

    public static boolean addImage(String inputpath, String name, double scale) {
        File report = new File(inputpath);
        try (FileWriter writer = new FileWriter(report, true)) {
            writer.write("\\includegraphics[scale=" + scale + "]{" + name + "}\n");
            writer.flush();
            writer.close();
        } catch (IOException ex) {
            ex.printStackTrace();
            return false;
        }
        return true;
    }

    /**
     * Returns the path to a folder in home (which is created, too). Made things
     * like the homepath relative, so testing is easier. Copying to USB is moved
     * to createPDF.
     *
     * @return the Path where to write the Report.
     * /
    public static String getReportPath() {
        String pathDefault = System.getProperty("user.home") + "/";   //gets user.home; maybe wont work under DOS

        logger.debug("creating reportDir in home");
        pathDefault = pathDefault + "report";
        systemExecute("mkdir " + pathDefault, false);
        pathDefault = pathDefault + "/";
        return pathDefault;

    }

    /**
     * When the report is ready, we have to unmount the USB-Stick.
     *
     * @param inputpath The Path to the USB-Stick.
     * @return true, if unmounted correctly.
     */
    public static boolean unMountUSB(String inputpath) {

        Process proc;
        if (inputpath.equals("/home/biron/Desktop/Stick/")) {
            return true;
        }
        String command = "umount -l " + inputpath;

        Runtime run = Runtime.getRuntime();
        try {
            proc = run.exec(command);
            proc.waitFor();
        } catch (IOException | InterruptedException ex) {
            ex.printStackTrace();
            return false;
        }

        return true;
    }

    /**
     * This Method executes a command on the prompt in the current directory.
     *
     * @param command this command.
     * @param withReturnString true, return answer of prompt.
     * @return if true, returns the return value of prompt as string if false,
     * returns 1 for goal reached and 0 for error, as string.
     */
    public static String systemExecute(String command, boolean withReturnString) {

        Process proc;

        try {
            proc = Runtime.getRuntime().exec(command);
            proc.waitFor();
        } catch (IOException | InterruptedException ex) {
            ex.printStackTrace();
            return "0";
        }

        if (withReturnString) {
            InputStream inStr = proc.getInputStream();
            BufferedReader buff = new BufferedReader(new InputStreamReader(inStr));
            String str, output = "";
            try {
                while ((str = buff.readLine()) != null) {
                    if (output.equals("")) {
                        output = str;
                    } else {
                        output = output.concat("\n" + str);
                    }
                }
            } catch (IOException ex) {
                ex.printStackTrace();
                return "0";
            }
            return output;
        } else {
            return "1";
        }
    }

    /**
     * Takes a photo with the 5D Camera and saves it to given path.
     *
     * @param id name of the photo. Automatically concats .jpg at the end.
     * @param path the absolute path to destination.
     * @return
     */
    public static boolean takePhotoWith5D(String id, String path) {

        if (systemExecute("5dreceiveimage", false).equals("0")) {
            return false;
        }
        if (systemExecute("mv myfile.jpg " + path
                + id + ".jpg", false).equals("0")) {
            return false;
        }
        return true;

    }
}
