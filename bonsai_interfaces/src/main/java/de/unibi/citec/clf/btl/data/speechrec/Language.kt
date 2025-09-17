package de.unibi.citec.clf.btl.data.speechrec

import de.unibi.citec.clf.btl.Type

data class LanguageType(val value : Language) : Type()

enum class Language(val value: Byte) {
    // From Whisper Language codes
    EN(0.toByte()),
    ZH(1.toByte()),
    DE(2.toByte()),
    ES(3.toByte()),
    RU(4.toByte()),
    KO(5.toByte()),
    FR(6.toByte()),
    JA(7.toByte()),
    PT(8.toByte()),
    TR(9.toByte()),
    PL(10.toByte()),
    CA(11.toByte()),
    NL(12.toByte()),
    AR(13.toByte()),
    SV(14.toByte()),
    IT(15.toByte()),
    ID(16.toByte()),
    HI(17.toByte()),
    FI(18.toByte()),
    VI(19.toByte()),
    HE(20.toByte()),
    UK(21.toByte()),
    EL(22.toByte()),
    MS(23.toByte()),
    CS(24.toByte()),
    RO(25.toByte()),
    DA(26.toByte()),
    HU(27.toByte()),
    TA(28.toByte()),
    NO(29.toByte()),
    TH(30.toByte()),
    UR(31.toByte()),
    HR(32.toByte()),
    BG(33.toByte()),
    LT(34.toByte()),
    LA(35.toByte()),
    MI(36.toByte()),
    ML(37.toByte()),
    CY(38.toByte()),
    SK(39.toByte()),
    TE(40.toByte()),
    FA(41.toByte()),
    LV(42.toByte()),
    BN(43.toByte()),
    SR(44.toByte()),
    AZ(45.toByte()),
    SL(46.toByte()),
    KN(47.toByte()),
    ET(48.toByte()),
    MK(49.toByte()),
    BR(50.toByte()),
    EU(51.toByte()),
    IS(52.toByte()),
    HY(53.toByte()),
    NE(54.toByte()),
    MN(55.toByte()),
    BS(56.toByte()),
    KK(57.toByte()),
    SQ(58.toByte()),
    SW(59.toByte()),
    GL(60.toByte()),
    MR(61.toByte()),
    PA(62.toByte()),
    SI(63.toByte()),
    KM(64.toByte()),
    SN(65.toByte()),
    YO(66.toByte()),
    SO(67.toByte()),
    AF(68.toByte()),
    OC(69.toByte()),
    KA(70.toByte()),
    BE(71.toByte()),
    TG(72.toByte()),
    SD(73.toByte()),
    GU(74.toByte()),
    AM(75.toByte()),
    YI(76.toByte()),
    LO(77.toByte()),
    UZ(78.toByte()),
    FO(79.toByte()),
    HT(80.toByte()),
    PS(81.toByte()),
    TK(82.toByte()),
    NN(83.toByte()),
    MT(84.toByte()),
    SA(85.toByte()),
    LB(86.toByte()),
    MY(87.toByte()),
    BO(88.toByte()),
    TL(89.toByte()),
    MG(90.toByte()),
    AS(91.toByte()),
    TT(92.toByte()),
    HAW(93.toByte()),
    LN(94.toByte()),
    HA(95.toByte()),
    BA(96.toByte()),
    JW(97.toByte()),
    SU(98.toByte()),
    YUE(99.toByte());

    companion object {
        private val BY_BYTE: MutableMap<Byte, Language> = HashMap()

        init {
            for (e in entries) {
                BY_BYTE[e.value] = e
            }
        }

        fun valueOf(b: Byte): Language {
            return BY_BYTE[b] ?: EN
        }
    }
}
