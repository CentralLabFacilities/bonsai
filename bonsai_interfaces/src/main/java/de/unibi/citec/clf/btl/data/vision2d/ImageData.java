package de.unibi.citec.clf.btl.data.vision2d;


import de.unibi.citec.clf.btl.Type;
import java.io.BufferedWriter;
import java.io.File;
import java.io.FileWriter;
import java.io.IOException;

/**
 *
 * @author lruegme
 */
public class ImageData extends Type {

    private void writePPM(File file) throws IOException {

        // if file doesnt exists, then create it
        if (!file.exists()) {
            file.createNewFile();
        }

        FileWriter fw = new FileWriter(file.getAbsoluteFile());
        try (BufferedWriter bw = new BufferedWriter(fw)) {
            bw.write("P3");
            bw.newLine();
            bw.write("" + width + " " + height);
            bw.newLine();
            bw.write("" + (255));
            bw.newLine();
            switch (colorMode) {
                case BGR:
                    for (int i = 0; i < data.length; i = i + 3) {
                        int r = 0, g = 0, b = 0;
                        r = data[i + 2] & 0xFF; // masked because parsed to int and java cant speak bytep
                        g = data[i + 1] & 0xFF;
                        b = data[i] & 0xFF;
                        bw.write("" + r + " " + g + " " + b);
                        bw.newLine();
                    }
                    System.out.println("BGR DONE");
                    break;
                case RGB:
                    for (int i = 0; i < data.length; i = i + 3) {
                        int r = 0, g = 0, b = 0;
                        r = data[i] & 0xFF;
                        g = data[i + 1] & 0xFF;
                        b = data[i + 2] & 0xFF;
                        bw.write("" + r + " " + g + " " + b);
                        bw.newLine();
                    }
                    System.out.println("RGB DONE");
                    break;
            }

            bw.close();
        }
    }

    public enum ColorMode {

        RGB,
        BGR
    }

    private byte[] data;
    private int width;
    private int height;
    private int depth;
    private ColorMode colorMode;

    /**
     * Cosntructor.
     */
    public ImageData() {
    }

    public int getWidth() {
        return width;
    }

    public void setWidth(int width) {
        this.width = width;
    }

    public int getHeight() {
        return height;
    }

    public void setHeight(int height) {
        this.height = height;
    }

    public void setDepth(int depth) {
        this.depth = depth;
    }

    public void setColorMode(ColorMode colorMode) {
        this.colorMode = colorMode;
    }

    public void setData(byte[] data) {
        this.data = data;
    }

    public byte[] getData() {
        return data;
    }

    public int getDepth() {
        return depth;
    }

    public ColorMode getColorMode() {
        return colorMode;
    }

    public void writeImage(File file) throws Exception {
        if (depth == 8) {
            writePPM(file);
        } else {
            throw new Exception("image format not supported \n"
                    + "depth: " + depth
                    + "\ncolorMode:" + colorMode.toString());
        }
    }
}
