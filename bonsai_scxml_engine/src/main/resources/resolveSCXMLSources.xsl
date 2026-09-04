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
        <!-- Globals already defined by parent SCXMLs -->
        <xsl:param name="ancestorGlobalIds"
                   tunnel="yes"
                   select="()"/>
        <!-- Globals defined by THIS state machine -->
        <xsl:variable name="currentGlobalIds"
                      select="root(.)/scxml/datamodel/data[
                          (starts-with(@id, '#') or starts-with(@id, '_'))
                          and @id != '#_SLOTS'
                      ]/@id"/>
        <xsl:variable name="full" select="."/>
        <xsl:variable name="stateid" select="../@id"/>
        <xsl:variable name="inheritSlots"
                      select="root(.)/scxml/datamodel/data/slots"/>
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
                    <!-- Suffix dieser neu eingebundenen SCXML -->
                    <xsl:with-param name="suffix"
                                    select="concat('#', $stateid, $suffix)"
                                    tunnel="yes"/>

                    <!-- Suffix der SCXML, die uns eingebunden hat -->
                    <xsl:with-param name="parentSuffix"
                                    select="$suffix"
                                    tunnel="yes"/>

                    <xsl:with-param name="inheritSlots"
                                    select="$inheritSlots"
                                    tunnel="yes"/>

                    <xsl:with-param name="prefix"
                                    select="concat($stateid, '.')"
                                    tunnel="yes"/>
                    <xsl:with-param name="ancestorGlobalIds"
                                    select="distinct-values(($ancestorGlobalIds, $currentGlobalIds))"
                                    tunnel="yes"/>
                </xsl:apply-templates>
            </xsl:matching-substring>
        </xsl:analyze-string>
    </xsl:template>

    <!--
    Global data that already exists in a parent SCXML is omitted.

    A global introduced in this SCXML is retained.
    -->
    <xsl:template match="scxml/datamodel/data[
        (starts-with(@id, '#') or starts-with(@id, '_'))
        and @id != '#_SLOTS'
    ]">
        <xsl:param name="ancestorGlobalIds"
                   tunnel="yes"
                   select="()"/>

        <xsl:if test="not(@id = $ancestorGlobalIds)">
            <xsl:copy>
                <xsl:apply-templates select="@* | node()"/>
            </xsl:copy>
        </xsl:if>
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
    <xsl:template match="
    data/slots/slot/@state |
    data/slots/inheritSlot/@state">

        <xsl:param name="suffix" tunnel="yes"/>

        <xsl:attribute name="state">
            <xsl:value-of select="concat(., $suffix)"/>
        </xsl:attribute>
    </xsl:template>

    <!-- Normal slot: belongs to the current sourced state machine -->
    <xsl:template match="data/slots/slot/@xpath">
        <xsl:param name="suffix" tunnel="yes"/>

        <xsl:attribute name="xpath">
            <xsl:value-of select="concat(., $suffix)"/>
        </xsl:attribute>
    </xsl:template>

    <xsl:template match="data/slots/inheritSlot/@xpath">

        <xsl:param name="inheritSlots" tunnel="yes"/>
        <xsl:param name="parentSuffix" tunnel="yes"/>

        <xsl:variable name="xpath" select="."/>

        <!-- Find the parent's slot referring to the same path -->
        <xsl:variable name="inheritSlot"
                      select="$inheritSlots/*
                          [@xpath = $xpath][1]"/>

        <xsl:attribute name="xpath">
            <xsl:choose>

                <!-- Parent is a normal slot:
                     its xpath belongs to the parent scope -->
                <xsl:when test="$inheritSlot[self::slot]">
                    <xsl:value-of
                            select="concat($inheritSlot/@xpath, $parentSuffix)"/>
                </xsl:when>

                <!-- Parent is itself slotIn / slotOut -->
                <xsl:when test="$inheritSlot[self::slotIn or self::slotOut]">
                    <xsl:value-of select="$inheritSlot/@xpath"/>
                </xsl:when>

                <!-- No parent binding -->
                <xsl:otherwise>
                    <xsl:value-of select="."/>
                </xsl:otherwise>

            </xsl:choose>
        </xsl:attribute>
    </xsl:template>

    <xsl:template match="data/slots/inheritSlot">
        <xsl:element name="slot"
                     namespace="http://www.w3.org/2005/07/scxml">
            <xsl:apply-templates select="@* | node()"/>
        </xsl:element>
    </xsl:template>

    <xsl:template match="scxml/datamodel/data/@id">
        <xsl:param name="suffix" tunnel="yes"/>

        <xsl:variable name="dataSuffix"
                      select="replace($suffix, '#', '_')"/>

        <xsl:attribute name="id">
            <xsl:choose>
                <!-- Global data and SLOTS remain unchanged-->
                <xsl:when test="starts-with(., '#_SLOTS') or starts-with(., '_')">
                    <xsl:value-of select="."/>
                </xsl:when>
                <!-- Local data -->
                <xsl:otherwise>
                    <xsl:value-of select="concat(., $dataSuffix)"/>
                </xsl:otherwise>
            </xsl:choose>
        </xsl:attribute>
    </xsl:template>

    <xsl:template match="state/datamodel/data/@expr[contains(., '@')]">
        <xsl:param name="suffix" tunnel="yes"/>

        <xsl:variable name="dataSuffix"
                      select="replace($suffix, '#', '_')"/>

        <xsl:attribute name="expr">
            <xsl:analyze-string select="."
                                regex="@([A-Za-z_][A-Za-z0-9_]*)">

                <xsl:matching-substring>
                    <xsl:variable name="name" select="regex-group(1)"/>

                    <xsl:choose>
                        <!-- Global variable: keep unchanged -->
                        <xsl:when test="starts-with($name, '_')">
                            <xsl:value-of select="concat('@', $name)"/>
                        </xsl:when>

                        <!-- Local variable: suffix referenced variable -->
                        <xsl:otherwise>
                            <xsl:value-of
                                    select="concat('@', $name, $dataSuffix)"/>
                        </xsl:otherwise>
                    </xsl:choose>
                </xsl:matching-substring>

                <xsl:non-matching-substring>
                    <xsl:value-of select="."/>
                </xsl:non-matching-substring>

            </xsl:analyze-string>
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

    <!-- assign in a state with src -> reference child scope -->
    <xsl:template match="
    state[@src]/onentry//assign/@location |
    state[@src]/onexit//assign/@location">

        <xsl:param name="suffix" tunnel="yes"/>

        <xsl:variable name="dataSuffix"
                      select="replace($suffix, '#', '_')"/>

        <xsl:variable name="stateid"
                      select="ancestor::state[@src][1]/@id"/>

        <xsl:attribute name="location">
            <xsl:choose>
                <xsl:when test="starts-with(., '#')">
                    <xsl:value-of select="."/>
                </xsl:when>
                <xsl:otherwise>
                    <xsl:value-of
                            select="concat(., '_', $stateid, $dataSuffix)"/>
                </xsl:otherwise>
            </xsl:choose>
        </xsl:attribute>
    </xsl:template>

    <!-- assign in normal states -> current scope -->
    <xsl:template match="
    onentry//assign[not(ancestor::state[@src])]/@location |
    onexit//assign[not(ancestor::state[@src])]/@location  |
    transition//assign/@location">

        <xsl:param name="suffix" tunnel="yes"/>

        <xsl:variable name="dataSuffix"
                      select="replace($suffix, '#', '_')"/>

        <xsl:attribute name="location">
            <xsl:choose>
                <xsl:when test="starts-with(., '#')">
                    <xsl:value-of select="."/>
                </xsl:when>
                <xsl:otherwise>
                    <xsl:value-of select="concat(., $dataSuffix)"/>
                </xsl:otherwise>
            </xsl:choose>
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


    <xsl:template match="
    state[@src]/onentry//assign/@expr |
    state[@src]/onexit//assign/@expr">

        <xsl:param name="suffix" tunnel="yes"/>

        <xsl:variable name="dataSuffix"
                      select="replace($suffix, '#', '_')"/>

        <!-- Variables defined in the current SCXML -->
        <xsl:variable name="dataIds"
                      select="root(.)/scxml/datamodel/data/@id"/>

        <xsl:attribute name="expr">
            <xsl:choose>

                <!-- Existing special syntax -->
                <xsl:when test="starts-with(., '#')">
                    <xsl:value-of select="substring(., 2)"/>
                </xsl:when>

                <!-- Global variable -->
                <xsl:when test="starts-with(., '_')">
                    <xsl:value-of select="."/>
                </xsl:when>

                <!-- Actual local datamodel variable -->
                <xsl:when test=". = $dataIds">
                    <xsl:value-of select="concat(., $dataSuffix)"/>
                </xsl:when>

                <!-- Literal: 2, 3.14, true, 'foo', etc. -->
                <xsl:otherwise>
                    <xsl:value-of select="."/>
                </xsl:otherwise>

            </xsl:choose>
        </xsl:attribute>
    </xsl:template>


    <xsl:template match="
    transition/@cond |
    transition//assign/@expr |
    onentry//assign[not(ancestor::state[@src])]/@expr |
    onexit//assign[not(ancestor::state[@src])]/@expr">

        <xsl:param name="suffix" tunnel="yes"/>

        <xsl:variable name="dataSuffix"
                      select="replace($suffix, '#', '_')"/>

        <xsl:variable name="dataIds"
                      select="root(.)//datamodel/data/@id"/>

        <xsl:attribute name="{name()}">
            <xsl:analyze-string select="."
                                regex="[A-Za-z_][A-Za-z0-9_]*">

                <xsl:matching-substring>
                    <xsl:variable name="name" select="."/>

                    <xsl:choose>
                        <xsl:when test="$name = $dataIds">
                            <xsl:value-of select="concat($name, $dataSuffix)"/>
                        </xsl:when>
                        <xsl:otherwise>
                            <xsl:value-of select="$name"/>
                        </xsl:otherwise>
                    </xsl:choose>
                </xsl:matching-substring>

                <xsl:non-matching-substring>
                    <xsl:value-of select="."/>
                </xsl:non-matching-substring>

            </xsl:analyze-string>
        </xsl:attribute>
    </xsl:template>

</xsl:stylesheet>
