<?xml version="1.0" encoding="UTF-8"?>

<!-- Document : resolveSCXMLSources.xsl Created on : October 30, 2012, 4:10 
PM Author : lkettenb Description: - Takes a SCXML file as input and resolves 
the 'src' attribute of states. - Appends a suffix to all sourced 'id' and 
'target' attributes to ensure their uniqueness. -->

<xsl:stylesheet xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
                version="2.0" xpath-default-namespace="http://www.w3.org/2005/07/scxml"
                xmlns:map="xalan://java.util.Map"
                extension-element-prefixes="map">

    <xsl:output method="xml" encoding="UTF-8" indent="yes"/>

    <!-- Copy entire document and apply templates. -->
    <xsl:template match="*|@*" name="main">
        <xsl:copy>
            <xsl:apply-templates select="node()|@*"/>
        </xsl:copy>
    </xsl:template>

    <!-- Special template for states with 'src' attribute. -->
    <xsl:template match="@src">
        <xsl:param name="suffix" tunnel="yes"/>
        <xsl:param name="prefix" tunnel="yes"/>
        <xsl:variable name="full" select="."/>
        <xsl:variable name="stateid" select="../@id"/>
        <xsl:analyze-string select="$full" regex="\{{(.*)\}}">
            <xsl:matching-substring>
                <xsl:variable name="part" select="regex-group(1)"/>
                <xsl:variable name="replaceme" select="concat('\$\{', $part, '\}')"/>
                <xsl:variable name="uri" select="concat('map://',$part)"/>
                <xsl:variable name="value" select="document($uri)"/>
                <xsl:variable name="finish" select="replace($full,$replaceme,$value)"/>
                <xsl:attribute name="initial">
                    <!-- Set 'initial' attribute for sub-state and consider the suffix. -->
                    <xsl:value-of
                            select="concat(document($finish)/scxml/@initial, '#', $stateid,  $suffix)"/>
                </xsl:attribute>
                <xsl:apply-templates select="document($finish)/scxml/*">
                    <xsl:with-param name="suffix"
                                    select="concat('#', $stateid, $suffix)" tunnel="yes"/>
                    <xsl:with-param name="prefix" select="concat($stateid, '.')"
                                    tunnel="yes"/>
                </xsl:apply-templates>
            </xsl:matching-substring>
        </xsl:analyze-string>
    </xsl:template>

    <!-- Change the 'id' attribute of all <state>, <final> and <parallel> nodes. -->
    <xsl:template match="state/@id | final/@id | parallel/@id">
        <xsl:param name="suffix" tunnel="yes"/>
        <xsl:attribute name="id">
            <xsl:value-of select="concat(., $suffix)"/>
        </xsl:attribute>
    </xsl:template>

    <!-- Change the 'initial' attribute of all <state>, <final> and <parallel> 
    nodes. -->
    <xsl:template match="state/@initial | final/@initial | parallel/@initial">
        <xsl:param name="suffix" tunnel="yes"/>
        <xsl:attribute name="initial">
            <xsl:value-of select="concat(., $suffix)"/>
        </xsl:attribute>
    </xsl:template>

    <!-- Change the 'state' attribute of all <slot> nodes. -->
    <xsl:template match="data/slots/slot/@state">
        <xsl:param name="suffix" tunnel="yes"/>
        <xsl:attribute name="state">
            <xsl:value-of select="concat(., $suffix)"/>
        </xsl:attribute>
    </xsl:template>

    <!-- TODO: May more attributes must be changed. -->

    <!-- Change the 'target' attribute of <transition> nodes. -->
    <xsl:template match="transition/@target">
        <xsl:param name="suffix" tunnel="yes"/>
        <xsl:attribute name="target">
            <xsl:if test=".!=''">
                <xsl:value-of select="concat(., $suffix)"/>
            </xsl:if>
        </xsl:attribute>
    </xsl:template>

    <!-- Change the 'events' attribute of <transition nodes. -->
    <xsl:template match="send/@event">
        <xsl:param name="prefix" tunnel="yes"/>
        <xsl:attribute name="event">
            <xsl:choose>
                <xsl:when test="starts-with(current(), 'success') or starts-with(current(), 'error') or starts-with(current(), 'fatal')">
                    <xsl:value-of
                            select="concat($prefix , current())"/>
                </xsl:when>
                <xsl:otherwise>
                    <xsl:value-of
                        select="current()"/>
                </xsl:otherwise>
            </xsl:choose>
        </xsl:attribute>
    </xsl:template>

</xsl:stylesheet>
