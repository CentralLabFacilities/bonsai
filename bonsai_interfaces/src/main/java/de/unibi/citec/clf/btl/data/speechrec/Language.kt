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
    JA(6.toByte()),
    PT(7.toByte()),
    TR(8.toByte()),
    PL(9.toByte()),
    CA(10.toByte()),
    NL(11.toByte()),
    AR(12.toByte()),
    SV(13.toByte()),
    IT(14.toByte()),
    ID(15.toByte()),
    HI(16.toByte()),
    FI(17.toByte()),
    VI(18.toByte()),
    HE(19.toByte()),
    UK(20.toByte()),
    EL(21.toByte()),
    MS(22.toByte()),
    CS(23.toByte()),
    RO(24.toByte()),
    DA(25.toByte()),
    HU(26.toByte()),
    TA(27.toByte()),
    NO(28.toByte()),
    TH(29.toByte()),
    UR(30.toByte()),
    HR(31.toByte()),
    BG(32.toByte()),
    LT(33.toByte()),
    LA(34.toByte()),
    MI(35.toByte()),
    ML(36.toByte()),
    CY(37.toByte()),
    SK(38.toByte()),
    TE(39.toByte()),
    FA(40.toByte()),
    LV(41.toByte()),
    BN(42.toByte()),
    SR(43.toByte()),
    AZ(44.toByte()),
    SL(45.toByte()),
    KN(46.toByte()),
    ET(47.toByte()),
    MK(48.toByte()),
    BR(49.toByte()),
    EU(50.toByte()),
    IS(51.toByte()),
    HY(52.toByte()),
    NE(53.toByte()),
    MN(54.toByte()),
    BS(55.toByte()),
    KK(56.toByte()),
    SQ(57.toByte()),
    SW(58.toByte()),
    GL(59.toByte()),
    MR(60.toByte()),
    PA(61.toByte()),
    SI(62.toByte()),
    KM(63.toByte()),
    SN(64.toByte()),
    YO(65.toByte()),
    SO(66.toByte()),
    AF(67.toByte()),
    OC(68.toByte()),
    KA(69.toByte()),
    BE(70.toByte()),
    TG(71.toByte()),
    SD(72.toByte()),
    GU(73.toByte()),
    AM(74.toByte()),
    YI(75.toByte()),
    LO(76.toByte()),
    UZ(77.toByte()),
    FO(78.toByte()),
    HT(79.toByte()),
    PS(80.toByte()),
    TK(81.toByte()),
    NN(82.toByte()),
    MT(83.toByte()),
    SA(84.toByte()),
    LB(85.toByte()),
    MY(86.toByte()),
    BO(87.toByte()),
    TL(88.toByte()),
    MG(89.toByte()),
    AS(90.toByte()),
    TT(91.toByte()),
    HAW(92.toByte()),
    LN(93.toByte()),
    HA(94.toByte()),
    BA(95.toByte()),
    JW(96.toByte()),
    SU(97.toByte()),
    YUE(98.toByte());

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
