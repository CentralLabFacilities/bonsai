<?xml version="1.0" encoding="UTF-8"?>

<!-- Document : resolveSCXMLSources.xsl Created on : October 30, 2012, 4:10 
	PM Author : lkettenb Description: - Takes a SCXML file as input and resolves 
	the 'src' attribute of states. - Appends a suffix to all sourced 'id' and 
	'target' attributes to ensure their uniqueness. -->

<xsl:stylesheet xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
                version="2.0">

    <xsl:output method="xml" encoding="UTF-8" indent="yes"/>

    <!-- Copy entire document and apply templates. -->
    <xsl:template match="node()|@*" name="main">
        <xsl:copy>
            <xsl:apply-templates select="node()|@*"/>
        </xsl:copy>
    </xsl:template>

    <xsl:template match="Sensors">
        <xsl:copy-of select="document(@src)/BonsaiConfiguration/Sensor"/>
    </xsl:template>

    <xsl:template match="Actuators">
        <xsl:copy-of select="document(@src)/BonsaiConfiguration/Actuator"/>
    </xsl:template>

    <xsl:template match="WorkingMemories">
        <xsl:copy-of select="document(@src)/BonsaiConfiguration/WorkingMemory"/>
    </xsl:template>
</xsl:stylesheet>
