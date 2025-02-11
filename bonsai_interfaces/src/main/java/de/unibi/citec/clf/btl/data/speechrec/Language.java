package de.unibi.citec.clf.btl.data.speechrec;


import java.util.HashMap;
import java.util.Map;

public enum Language {
    // From Whisper Language codes
    EN((byte) 0),
    ZH((byte) 1),
    DE((byte) 2),
    ES((byte) 3),
    RU((byte) 4),
    KO((byte) 5),
    FR((byte) 6),
    JA((byte) 6),
    PT((byte) 7),
    TR((byte) 8),
    PL((byte) 9),
    CA((byte) 10),
    NL((byte) 11),
    AR((byte) 12),
    SV((byte) 13),
    IT((byte) 14),
    ID((byte) 15),
    HI((byte) 16),
    FI((byte) 17),
    VI((byte) 18),
    HE((byte) 19),
    UK((byte) 20),
    EL((byte) 21),
    MS((byte) 22),
    CS((byte) 23),
    RO((byte) 24),
    DA((byte) 25),
    HU((byte) 26),
    TA((byte) 27),
    NO((byte) 28),
    TH((byte) 29),
    UR((byte) 30),
    HR((byte) 31),
    BG((byte) 32),
    LT((byte) 33),
    LA((byte) 34),
    MI((byte) 35),
    ML((byte) 36),
    CY((byte) 37),
    SK((byte) 38),
    TE((byte) 39),
    FA((byte) 40),
    LV((byte) 41),
    BN((byte) 42),
    SR((byte) 43),
    AZ((byte) 44),
    SL((byte) 45),
    KN((byte) 46),
    ET((byte) 47),
    MK((byte) 48),
    BR((byte) 49),
    EU((byte) 50),
    IS((byte) 51),
    HY((byte) 52),
    NE((byte) 53),
    MN((byte) 54),
    BS((byte) 55),
    KK((byte) 56),
    SQ((byte) 57),
    SW((byte) 58),
    GL((byte) 59),
    MR((byte) 60),
    PA((byte) 61),
    SI((byte) 62),
    KM((byte) 63),
    SN((byte) 64),
    YO((byte) 65),
    SO((byte) 66),
    AF((byte) 67),
    OC((byte) 68),
    KA((byte) 69),
    BE((byte) 70),
    TG((byte) 71),
    SD((byte) 72),
    GU((byte) 73),
    AM((byte) 74),
    YI((byte) 75),
    LO((byte) 76),
    UZ((byte) 77),
    FO((byte) 78),
    HT((byte) 79),
    PS((byte) 80),
    TK((byte) 81),
    NN((byte) 82),
    MT((byte) 83),
    SA((byte) 84),
    LB((byte) 85),
    MY((byte) 86),
    BO((byte) 87),
    TL((byte) 88),
    MG((byte) 89),
    AS((byte) 90),
    TT((byte) 91),
    HAW((byte) 92),
    LN((byte) 93),
    HA((byte) 94),
    BA((byte) 95),
    JW((byte) 96),
    SU((byte) 97),
    YUE((byte) 98);

    private static final Map<Byte, Language> BY_BYTE = new HashMap<>();

    public final Byte value;

    static {
        for (Language e : values()) {
            BY_BYTE.put(e.value, e);
        }
    }

    Language(byte i) {
        this.value = i;
    }

    public static Language valueOf(Byte b) {
        return BY_BYTE.get(b);
    }
}
